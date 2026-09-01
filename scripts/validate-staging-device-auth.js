"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");

function readDotEnv(filePath) {
  const values = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function assert(condition, name) {
  if (!condition) throw new Error(name);
  console.log(`${name}: PASS`);
}

async function request(baseUrl, token, method, endpoint, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = token;
  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function waitForBackend(baseUrl, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error("local_backend_exited");
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("local_backend_timeout");
}

async function main() {
  const staging = readDotEnv(path.join(root, ".env.staging.local"));
  const production = readDotEnv(path.join(root, ".env.production-schema-readonly.local"));
  const hardware = readDotEnv(path.join(root, ".env.hardware-staging.local"));
  const dbCaPath = process.env.STS_STAGING_CA_CERT;
  if (!dbCaPath) throw new Error("staging_database_ca_missing");

  const deviceA = hardware.STS_STAGING_DEVICE_A_ID;
  const deviceB = hardware.STS_STAGING_DEVICE_B_ID;
  const tokenA = hardware.STS_STAGING_DEVICE_A_TOKEN;
  const tokenB = hardware.STS_STAGING_DEVICE_B_TOKEN;
  const revokedToken = hardware.STS_STAGING_REVOKED_TOKEN;
  const legacyToken = hardware.STS_STAGING_LEGACY_API_TOKEN;
  if (![deviceA, deviceB, tokenA, tokenB, revokedToken, legacyToken].every(Boolean)) {
    throw new Error("local_staging_credentials_incomplete");
  }

  const database = new Client({
    connectionString: staging.STS_STAGING_DATABASE_URL,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(dbCaPath, "utf8") },
    statement_timeout: 120000,
  });
  await database.connect();
  const port = 3201;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      STS_ENV: "staging",
      STS_STAGING_PROJECT_REF: staging.STS_STAGING_PROJECT_REF,
      STS_PRODUCTION_PROJECT_REF: production.STS_PRODUCTION_PROJECT_REF,
      STS_STAGING_SERVICE_ROLE_KEY_SHA256: hardware.STS_STAGING_SERVICE_ROLE_KEY_SHA256,
      STS_STAGING_LEGACY_API_TOKEN_SHA256: hardware.STS_STAGING_LEGACY_API_TOKEN_SHA256,
      STS_ALLOW_LEGACY_DEVICE_API_TOKEN: "true",
      API_TOKEN: legacyToken,
      SUPABASE_URL: staging.STS_STAGING_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: staging.STS_STAGING_SERVICE_ROLE_KEY,
      BREVO_API_KEY: "",
      ALERT_FROM_EMAIL: "",
      ALERT_TO_EMAIL: "",
      HEALTH_CHECK_INTERVAL_SECONDS: "3600",
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });

  try {
    await waitForBackend(baseUrl, child);
    assert(true, "staging_runtime_guard");

    const configA = `/api/device/${encodeURIComponent(deviceA)}/config`;
    const configB = `/api/device/${encodeURIComponent(deviceB)}/config`;
    assert((await request(baseUrl, tokenA, "GET", configA)).status === 200, "token_a_device_a");
    assert((await request(baseUrl, tokenB, "GET", configB)).status === 200, "token_b_device_b");
    assert((await request(baseUrl, tokenA, "GET", configB)).status === 401, "token_a_device_b_denied");
    assert((await request(baseUrl, tokenB, "GET", configA)).status === 401, "token_b_device_a_denied");
    assert((await request(baseUrl, revokedToken, "GET", configA)).status === 401, "revoked_token_denied");
    assert((await request(baseUrl, "invalid-staging-token", "GET", configA)).status === 401, "invalid_token_denied");
    assert((await request(baseUrl, "", "GET", configA)).status === 401, "missing_token_denied");
    assert((await request(baseUrl, tokenA, "GET", "/api/device/STS-COLD-STAGING-MISSING/config")).status === 401, "missing_device_denied");
    assert((await request(baseUrl, legacyToken, "GET", configB)).status === 200, "legacy_staging_compatibility");

    const before = await database.query(
      "select count(*)::int as count from public.readings where device_id=$1",
      [deviceA]
    );
    const now = Math.floor(Date.now() / 1000);
    const ingestion = await request(baseUrl, tokenA, "POST", "/api/temperature", {
      device_id: deviceA,
      temperature: 4.2,
      humidity: 65,
      exterior_temperature: 18.5,
      exterior_humidity: 55,
      exterior_sensor_ok: true,
      device_status: "normal",
      telemetry_seq: Date.now(),
      sample_epoch: now,
      delivery_attempts: 0,
      firmware_version: "2.9.0-STAGING-PREFLASH",
      hardware_diagnostics: { components: { dht22_interior: { ok: true }, sht30_ambient: { ok: true } } },
      communication_diagnostics: { wifi_rssi: -55, post_ok_count: 1 },
    });
    assert(ingestion.status === 200, "valid_device_ingestion_http");
    const after = await database.query(
      "select count(*)::int as count from public.readings where device_id=$1",
      [deviceA]
    );
    assert(after.rows[0].count === before.rows[0].count + 1, "valid_device_ingestion_persisted");

    const credentialEvidence = await database.query(
      `select count(*)::int as active_count,
              count(*) filter (where last_used_at is not null)::int as used_count,
              bool_and(length(secret_hash)=64)::boolean as hashes_only
       from public.device_credentials dc
       join public.devices d on d.id=dc.device_id
       where d.device_id in ($1,$2) and dc.status='active'`,
      [deviceA, deviceB]
    );
    assert(credentialEvidence.rows[0].active_count === 2, "two_active_device_credentials");
    assert(credentialEvidence.rows[0].used_count === 2, "credential_last_used_recorded");
    assert(credentialEvidence.rows[0].hashes_only === true, "database_hashes_only");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await database.end();
  }
}

main().catch((error) => {
  console.error(`staging_device_auth_validation: FAIL (${error.message})`);
  process.exitCode = 1;
});
