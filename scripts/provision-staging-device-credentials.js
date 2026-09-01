"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { hashDeviceToken } = require("../src/core/device-auth");

const root = path.resolve(__dirname, "..");
const DEVICE_A = "STS-COLD-STAGING-BENCH-01";
const DEVICE_B = "STS-COLD-STAGING-BENCH-02";
const BACKEND_URL = "https://sts-cold-backend-staging.onrender.com";

function readDotEnv(filePath) {
  const values = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function token() {
  return `sts_${crypto.randomBytes(32).toString("base64url")}`;
}

function cString(value) {
  return JSON.stringify(String(value));
}

function pemMacro(pem) {
  const lines = pem.trim().split(/\r?\n/);
  return lines
    .map((line, index) => `${cString(`${line}\\n`)}${index < lines.length - 1 ? " \\" : ""}`)
    .join("\n");
}

async function downloadRootCa() {
  const response = await fetch("https://pki.goog/roots.pem");
  if (!response.ok) throw new Error(`root_ca_download_http_${response.status}`);
  const bundle = await response.text();
  const pemCertificates = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const selectedPem = pemCertificates.find((pem) => {
    const candidate = new crypto.X509Certificate(pem);
    return candidate.subject.includes("GTS Root R4");
  });
  if (!selectedPem) throw new Error("gts_root_r4_not_found");
  const certificate = new crypto.X509Certificate(selectedPem);
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
    throw new Error("root_ca_not_currently_valid");
  }
  return selectedPem;
}

async function main() {
  const staging = readDotEnv(path.join(root, ".env.staging.local"));
  const production = readDotEnv(path.join(root, ".env.production-schema-readonly.local"));
  const dbCaPath = process.env.STS_STAGING_CA_CERT;
  if (!dbCaPath) throw new Error("staging_database_ca_missing");
  if (staging.STS_ENV !== "staging") throw new Error("staging_environment_guard_failed");
  if (!staging.STS_STAGING_PROJECT_REF || staging.STS_STAGING_PROJECT_REF === production.STS_PRODUCTION_PROJECT_REF) {
    throw new Error("staging_project_ref_guard_failed");
  }
  const apiUrl = new URL(staging.STS_STAGING_SUPABASE_URL);
  if (apiUrl.hostname !== `${staging.STS_STAGING_PROJECT_REF}.supabase.co`) {
    throw new Error("staging_supabase_url_guard_failed");
  }

  const tokenA = token();
  const tokenB = token();
  const revokedToken = token();
  const legacyToken = token();
  const portalPassword = crypto.randomBytes(12).toString("base64url");
  const otaPassword = crypto.randomBytes(24).toString("base64url");
  const rootCa = await downloadRootCa();
  const database = new Client({
    connectionString: staging.STS_STAGING_DATABASE_URL,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(dbCaPath, "utf8") },
    statement_timeout: 120000,
  });
  await database.connect();

  try {
    await database.query("begin");
    const devices = await database.query(
      `insert into public.devices (device_id, name, location, status, config, product_model_id)
       values
       ($1, 'STS Cold Staging Bench 01', 'Staging bench', 'NORMAL', $3,
        (select pm.id from public.product_models pm join public.products p on p.id=pm.product_id where p.code='COLD' and pm.code='COLD-LEGACY' limit 1)),
       ($2, 'STS Cold Staging Bench 02', 'Staging auth isolation', 'NORMAL', $3,
        (select pm.id from public.product_models pm join public.products p on p.id=pm.product_id where p.code='COLD' and pm.code='COLD-LEGACY' limit 1))
       on conflict (device_id) do update set updated_at=now()
       returning id, device_id`,
      [DEVICE_A, DEVICE_B, { temp_low_c: -50, temp_high_c: 50, hum_low: 0, hum_high: 100, send_interval_s: 30, display_standby_min: 10 }]
    );
    const byCode = Object.fromEntries(devices.rows.map((row) => [row.device_id, row.id]));
    for (const deviceId of Object.values(byCode)) {
      await database.query(
        `update public.device_credentials
         set status='revoked', revoked_at=coalesce(revoked_at, now())
         where device_id=$1 and status='active'`,
        [deviceId]
      );
    }
    for (const [deviceCode, deviceToken] of [[DEVICE_A, tokenA], [DEVICE_B, tokenB]]) {
      const digest = hashDeviceToken(deviceToken);
      await database.query(
        `insert into public.device_credentials
         (device_id, credential_prefix, secret_hash, status, metadata)
         values ($1, $2, $3, 'active', $4)`,
        [byCode[deviceCode], digest.slice(0, 16), digest, { environment: "staging", device_code: deviceCode }]
      );
    }
    const revokedDigest = hashDeviceToken(revokedToken);
    const revoked = await database.query(
      `insert into public.device_credentials
       (device_id, credential_prefix, secret_hash, status, metadata)
       values ($1, $2, $3, 'pending', $4) returning id`,
      [byCode[DEVICE_A], revokedDigest.slice(0, 16), revokedDigest, { environment: "staging", purpose: "revocation-test" }]
    );
    await database.query(
      `update public.device_credentials set status='revoked', revoked_at=now() where id=$1`,
      [revoked.rows[0].id]
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    await database.end();
  }

  const firmwareDir = path.join(root, "firmware", "sts-cold");
  const caPath = path.join(firmwareDir, "sts_tls_ca.pem");
  fs.writeFileSync(caPath, `${rootCa.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  const header = `#pragma once

// Local STAGING-only secrets. This file is ignored by Git.
#define STS_DEVICE_ID ${cString(DEVICE_A)}
#define STS_BACKEND_BASE_URL ${cString(BACKEND_URL)}
#define STS_DASHBOARD_URL ${cString(`${BACKEND_URL}/`)}
#define STS_DASHBOARD_QR_TEXT ${cString("sts-cold-backend-staging.onrender.com")}
#define STS_DEVICE_API_TOKEN ${cString(tokenA)}
#define STS_OTA_PASSWORD ${cString(otaPassword)}
#define STS_WIFI_AP_PASSWORD ${cString(portalPassword)}
#define STS_TLS_ROOT_CA \\
${pemMacro(rootCa)}
#define STS_ALLOW_INSECURE_TLS 0
#define STS_ENABLE_OTA 0
`;
  fs.writeFileSync(path.join(firmwareDir, "sts_secrets.h"), header, { encoding: "utf8", mode: 0o600 });

  const localEnvironment = [
    "# Generated locally for STAGING. Ignored by Git. Never paste values into chat.",
    `STS_ENV=staging`,
    `STS_STAGING_BACKEND_URL=${BACKEND_URL}`,
    `STS_STAGING_DEVICE_A_ID=${DEVICE_A}`,
    `STS_STAGING_DEVICE_A_TOKEN=${tokenA}`,
    `STS_STAGING_DEVICE_B_ID=${DEVICE_B}`,
    `STS_STAGING_DEVICE_B_TOKEN=${tokenB}`,
    `STS_STAGING_REVOKED_TOKEN=${revokedToken}`,
    `STS_STAGING_LEGACY_API_TOKEN=${legacyToken}`,
    `STS_STAGING_SERVICE_ROLE_KEY_SHA256=${hashDeviceToken(staging.STS_STAGING_SERVICE_ROLE_KEY)}`,
    `STS_STAGING_LEGACY_API_TOKEN_SHA256=${hashDeviceToken(legacyToken)}`,
    `STS_STAGING_TLS_CA_PATH=${caPath}`,
    "STS_ALLOW_LEGACY_DEVICE_API_TOKEN=true",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, ".env.hardware-staging.local"), localEnvironment, { encoding: "utf8", mode: 0o600 });
  console.log("staging_device_credentials: PROVISIONED");
  console.log("plaintext_database_storage: NONE");
  console.log("local_firmware_secrets: READY");
  console.log("render_root_ca: GTS Root R4");
}

main().catch((error) => {
  console.error(`staging_device_provision_error: ${error.message}`);
  process.exitCode = 1;
});
