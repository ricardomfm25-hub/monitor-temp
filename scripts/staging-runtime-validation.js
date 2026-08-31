"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");

function readDotEnv(filePath) {
  const values = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function assert(condition, name, evidence) {
  if (!condition) throw new Error(`${name}:${evidence}`);
  console.log(`${name}: PASS (${evidence})`);
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) throw new Error("staging_backend_exited_early");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const diagnostic = logs.slice(-4).join(" | ").slice(0, 800);
  throw new Error(`staging_backend_start_timeout:${diagnostic}`);
}

function sanitizeLog(value) {
  return String(value)
    .replace(/https:\/\/[^\s]+/gi, "[URL_REDACTED]")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[JWT_REDACTED]")
    .replace(/(password|token|secret|key)\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]")
    .trim();
}

async function postJson(baseUrl, token, endpoint, payload) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${endpoint}_http_${response.status}:${body.stage || body.error}`);
  }
  return body;
}

async function main() {
  const staging = readDotEnv(path.join(root, ".env.staging.local"));
  const production = readDotEnv(
    path.join(root, ".env.production-schema-readonly.local")
  );
  const apiUrl = new URL(staging.STS_STAGING_SUPABASE_URL);
  const databaseUrl = new URL(staging.STS_STAGING_DATABASE_URL);
  const databaseIdentity = `${databaseUrl.hostname} ${decodeURIComponent(
    databaseUrl.username
  )}`;
  assert(staging.STS_ENV === "staging", "runtime_staging_env", "explicit staging");
  assert(
    apiUrl.hostname === `${staging.STS_STAGING_PROJECT_REF}.supabase.co`,
    "runtime_api_ref",
    "API matches staging ref"
  );
  assert(
    databaseIdentity.includes(staging.STS_STAGING_PROJECT_REF) &&
      staging.STS_STAGING_PROJECT_REF !== production.STS_PRODUCTION_PROJECT_REF,
    "runtime_database_ref",
    "DB is staging and differs from production"
  );

  const caPath = process.env.STS_STAGING_CA_CERT;
  if (!caPath) throw new Error("staging_ca_missing");
  const database = new Client({
    connectionString: staging.STS_STAGING_DATABASE_URL,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(caPath, "utf8") },
    statement_timeout: 120000,
  });
  await database.connect();

  const suffix = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const codeSuffix = suffix.replace(/[^A-Za-z0-9]/g, "").slice(-18).toUpperCase();
  const deviceCode = `STS-RUNTIME-${codeSuffix}`;
  const unknownDeviceCode = `STS-UNKNOWN-${codeSuffix}`;
  const token = `staging-validation-${crypto.randomBytes(24).toString("hex")}`;
  const port = 3199;
  const baseUrl = `http://127.0.0.1:${port}`;
  let backend;
  const backendErrors = [];
  const backendLogs = [];

  try {
    const productModel = await database.query(`
      select pm.id from public.product_models pm
      join public.products p on p.id = pm.product_id
      where p.code = 'COLD' and pm.code = 'COLD-LEGACY'
      limit 1
    `);
    assert(productModel.rowCount === 1, "runtime_product_model", "COLD-LEGACY exists");

    const client = await database.query(
      `insert into public.clients (code, name, slug, active, is_active)
       values ($1, $2, $3, true, true) returning id`,
      [`RUNTIME_${codeSuffix}`, "STS Runtime Validation", `runtime-${suffix}`]
    );
    const site = await database.query(
      `insert into public.sites (client_id, code, name)
       values ($1, $2, 'Runtime Site') returning id`,
      [client.rows[0].id, `SITE_${codeSuffix}`]
    );
    const space = await database.query(
      `insert into public.spaces (site_id, code, name, space_type)
       values ($1, $2, 'Runtime Cold Room', 'cold_room') returning id`,
      [site.rows[0].id, `SPACE_${codeSuffix}`]
    );
    const config = {
      send_interval_s: 1,
      temp_low_c: -100,
      temp_high_c: 200,
      hum_low: 0,
      hum_high: 200,
      alert_state: {},
    };
    const devices = await database.query(
      `insert into public.devices
       (device_id, name, location, product_model_id, space_id, config, config_version, status)
       values
       ($1, 'Runtime Device', 'Staging', $3, $4, $5, 1, 'NORMAL'),
       ($2, 'Unknown Evidence Device', 'Staging', $3, $4, $5, 1, 'NORMAL')
       returning id, device_id`,
      [
        deviceCode,
        unknownDeviceCode,
        productModel.rows[0].id,
        space.rows[0].id,
        config,
      ]
    );
    const deviceId = devices.rows.find((row) => row.device_id === deviceCode).id;
    const unknownDeviceId = devices.rows.find(
      (row) => row.device_id === unknownDeviceCode
    ).id;
    await database.query("notify pgrst, 'reload schema'");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    backend = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        API_TOKEN: token,
        SUPABASE_URL: staging.STS_STAGING_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: staging.STS_STAGING_SERVICE_ROLE_KEY,
        BREVO_API_KEY: "",
        ALERT_FROM_EMAIL: "",
        ALERT_TO_EMAIL: "",
        HEALTH_CHECK_INTERVAL_SECONDS: "3600",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    backend.stdout.on("data", (chunk) => {
      backendLogs.push(sanitizeLog(chunk));
    });
    backend.stderr.on("data", (chunk) => {
      const line = sanitizeLog(chunk);
      backendLogs.push(line);
      if (/erro|error|falha/i.test(line)) backendErrors.push(line.slice(0, 500));
    });
    backend.on("error", (error) => backendLogs.push(sanitizeLog(error.message)));
    await waitForServer(`${baseUrl}/`, backend, backendLogs);
    assert(true, "runtime_backend", "local backend connected only to staging");

    const nowEpoch = Math.floor(Date.now() / 1000);
    const healthyDiagnostics = {
      components: {
        dht22_interior: { ok: true },
        sht30_ambient: { ok: true },
      },
    };
    const basePayload = {
      device_id: deviceCode,
      temperature: 4.2,
      humidity: 65,
      exterior_temperature: 18.5,
      exterior_humidity: 55,
      exterior_sensor_ok: true,
      device_status: "normal",
      sample_epoch: nowEpoch - 60,
      telemetry_seq: 1001,
      delivery_attempts: 0,
      hardware_diagnostics: healthyDiagnostics,
      communication_diagnostics: { wifi_rssi: -54, post_ok_count: 10 },
      firmware_version: "2.7.18",
    };
    const normal = await postJson(baseUrl, token, "/api/temperature", basePayload);
    assert(
      normal.normalized_ingestion?.stored && normal.normalized_ingestion?.parity?.parity,
      "runtime_normal_ingestion",
      "legacy/Core parity true"
    );
    assert(
      normal.normalized_ingestion.delivery_class === "original",
      "runtime_original_delivery",
      "delivery=original"
    );

    const duplicate = await postJson(baseUrl, token, "/api/temperature", basePayload);
    assert(
      duplicate.normalized_ingestion?.batch_id === normal.normalized_ingestion?.batch_id,
      "runtime_duplicate_sequence",
      "same telemetry_seq reused batch"
    );

    const offline = await postJson(baseUrl, token, "/api/temperature", {
      ...basePayload,
      telemetry_seq: 1002,
      sample_epoch: nowEpoch - 600,
      temperature: 4.4,
      delivery_attempts: 2,
      captured_offline: true,
      queued_backfill: true,
    });
    assert(
      offline.normalized_ingestion?.delivery_class === "retransmitted" &&
        offline.current_updated === false,
      "runtime_offline_resend",
      "retransmitted historical reading"
    );

    const outOfOrder = await postJson(baseUrl, token, "/api/temperature", {
      ...basePayload,
      telemetry_seq: 1003,
      sample_epoch: nowEpoch - 300,
      temperature: 4.3,
      delivery_attempts: 1,
      captured_offline: true,
    });
    assert(
      outOfOrder.normalized_ingestion?.stored,
      "runtime_out_of_order",
      "event time preserved"
    );

    const fallbackPayload = {
      ...basePayload,
      telemetry_seq: undefined,
      sample_epoch: nowEpoch - 180,
      temperature: 4.25,
      delivery_attempts: 1,
      captured_offline: true,
    };
    const fallbackFirst = await postJson(
      baseUrl,
      token,
      "/api/temperature",
      fallbackPayload
    );
    const fallbackRetry = await postJson(baseUrl, token, "/api/temperature", {
      ...fallbackPayload,
      delivery_attempts: 3,
      queued_backfill: true,
    });
    assert(
      fallbackFirst.normalized_ingestion?.batch_id ===
        fallbackRetry.normalized_ingestion?.batch_id,
      "runtime_payload_idempotency",
      "stable fallback idempotency key"
    );

    const partialEpoch = nowEpoch - 120;
    const partialPayload = {
      ...basePayload,
      telemetry_seq: 2001,
      sample_epoch: partialEpoch,
      temperature: 4.35,
      delivery_attempts: 1,
      captured_offline: true,
    };
    const partialBatch = await database.query(
      `insert into public.ingestion_batches
       (device_id, telemetry_seq, recorded_at, raw_payload, delivery_class,
        schema_version, idempotency_key)
       values ($1, 2001, to_timestamp($2), $3::jsonb, 'retransmitted', 1,
        'seq:2001')
       returning id`,
      [deviceId, partialEpoch, JSON.stringify(partialPayload)]
    );
    const partialRetry = await postJson(
      baseUrl,
      token,
      "/api/temperature",
      partialPayload
    );
    assert(
      partialRetry.normalized_ingestion?.batch_id === partialBatch.rows[0].id,
      "runtime_partial_retry",
      "pre-existing batch completed without duplicate"
    );

    await postJson(baseUrl, token, "/api/temperature", {
      ...basePayload,
      telemetry_seq: 3001,
      sample_epoch: nowEpoch - 30,
      humidity: 120,
    });
    await postJson(baseUrl, token, "/api/temperature", {
      ...basePayload,
      telemetry_seq: 3002,
      sample_epoch: nowEpoch - 20,
      temperature: 151,
    });
    await postJson(baseUrl, token, "/api/temperature", {
      device_id: unknownDeviceCode,
      temperature: 5.1,
      humidity: 60,
      telemetry_seq: 4001,
      sample_epoch: nowEpoch - 10,
      device_status: "normal",
    });

    const heartbeat = await postJson(baseUrl, token, "/api/device/heartbeat", {
      device_id: deviceCode,
      device_status: "normal",
      wifi_connected: true,
      firmware_version: "2.7.18",
      hardware_diagnostics: healthyDiagnostics,
      communication_diagnostics: { wifi_rssi: -51, post_ok_count: 20 },
    });
    assert(
      heartbeat.ok && heartbeat.core_state?.stored,
      "runtime_heartbeat",
      "heartbeat and Core state persisted"
    );

    const metricsResponse = await fetch(`${baseUrl}/api/core/health`, {
      headers: { authorization: token },
    });
    const metrics = await metricsResponse.json();
    const dualWriteSuccess = (metrics.metrics || [])
      .filter((metric) => metric.name === "dual_write.success")
      .reduce((sum, metric) => sum + metric.value, 0);
    assert(
      metricsResponse.ok && dualWriteSuccess >= 9,
      "runtime_observability",
      `dual_write.success=${dualWriteSuccess}`
    );

    const evidence = await database.query(
      `select
        (select count(*)::int from public.readings where device_id = $1) legacy_readings,
        (select count(*)::int from public.ingestion_batches where device_id = $2) core_batches,
        (select count(*)::int from public.ingestion_batches where device_id = $2 and telemetry_seq = 1001) duplicate_seq_batches,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id = $2) core_measurements,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id in ($2,$3) and sr.quality='valid') quality_valid,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id in ($2,$3) and sr.quality='suspect') quality_suspect,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id in ($2,$3) and sr.quality='invalid') quality_invalid,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id in ($2,$3) and sr.quality='missing') quality_missing,
        (select count(*)::int from public.sensor_readings sr join public.sensors s on s.id=sr.sensor_id where s.device_id in ($2,$3) and sr.quality='unknown') quality_unknown,
        (select count(*)::int from public.component_health_events che join public.device_components dc on dc.id=che.component_id where dc.device_id=$2) component_events,
        (select count(*)::int from public.device_state_snapshots where device_id=$2) state_snapshots,
        (select count(*)::int from public.ingestion_batches ib where ib.device_id=$2 and ib.received_at < ib.recorded_at) invalid_timestamp_order,
        (select count(*)::int from public.sensor_readings sr
          join public.sensors s on s.id=sr.sensor_id
          join public.ingestion_batches ib on ib.id=sr.ingestion_batch_id
          where s.device_id=$2 and s.sensor_key='interior_temperature'
            and sr.value_numeric is distinct from (ib.raw_payload->>'temperature')::double precision
        ) temperature_parity_mismatches`,
      [deviceCode, deviceId, unknownDeviceId]
    );
    const row = evidence.rows[0];
    assert(row.duplicate_seq_batches === 1, "db_idempotency", "one batch for seq=1001");
    assert(row.core_batches === 7, "db_core_batches", `batches=${row.core_batches}`);
    assert(row.core_measurements === 28, "db_measurements", `rows=${row.core_measurements}`);
    assert(
      row.quality_valid > 0 &&
        row.quality_suspect > 0 &&
        row.quality_invalid > 0 &&
        row.quality_missing > 0 &&
        row.quality_unknown > 0,
      "db_data_quality",
      `valid=${row.quality_valid},suspect=${row.quality_suspect},invalid=${row.quality_invalid},missing=${row.quality_missing},unknown=${row.quality_unknown}`
    );
    assert(row.component_events > 0, "db_component_health", `events=${row.component_events}`);
    assert(row.state_snapshots > 0, "db_state_snapshots", `snapshots=${row.state_snapshots}`);
    assert(row.invalid_timestamp_order === 0, "db_timestamps", "ingested_at >= event_time");
    assert(
      Number(row.temperature_parity_mismatches) === 0,
      "db_value_parity",
      "interior temperature mismatches=0"
    );
    if (row.legacy_readings !== 7) {
      const legacyGroups = await database.query(
        `select coalesce(telemetry_seq::text, 'no-sequence') sequence_class,
                count(*)::int row_count
         from public.readings where device_id=$1
         group by telemetry_seq order by telemetry_seq nulls last`,
        [deviceCode]
      );
      for (const group of legacyGroups.rows) {
        console.log(
          `legacy_sequence_count: ${group.sequence_class}=${group.row_count}`
        );
      }
    }
    assert(
      row.legacy_readings === 7,
      "db_cold_compatibility",
      `legacy readings=${row.legacy_readings}, Core batches=${row.core_batches}`
    );
    console.log(`runtime_backend_error_count: ${backendErrors.length}`);
    for (const error of backendErrors.slice(0, 5)) {
      console.log(`runtime_backend_error_sample: ${sanitizeLog(error)}`);
    }
    assert(backendErrors.length === 0, "runtime_backend_errors", "critical errors=0");
  } finally {
    if (backend && backend.exitCode === null) {
      backend.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (backend.exitCode === null) backend.kill("SIGKILL");
    }
    await database.end();
  }
}

main().catch((error) => {
  console.error(`staging_runtime_validation_error: ${error.message}`);
  process.exitCode = 1;
});
