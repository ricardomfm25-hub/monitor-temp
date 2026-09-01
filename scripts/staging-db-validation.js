"use strict";

const fs = require("fs");
const path = require("path");
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

function knownProductionRefs() {
  const refs = new Set();
  for (const relativePath of [".env", "smart-dashboard/.env.local"]) {
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) continue;
    for (const value of Object.values(readDotEnv(filePath))) {
      const match = String(value).match(
        /^https:\/\/([a-z0-9]{15,30})\.supabase\.co/i
      );
      if (match) refs.add(match[1]);
    }
  }
  return refs;
}

function loadAndGuardStaging() {
  const envPath = path.join(root, ".env.staging.local");
  const config = readDotEnv(envPath);
  const required = [
    "STS_ENV",
    "STS_STAGING_PROJECT_REF",
    "STS_STAGING_SUPABASE_URL",
    "STS_STAGING_DATABASE_URL",
    "STS_STAGING_SERVICE_ROLE_KEY",
  ];
  if (required.some((key) => !config[key])) {
    throw new Error("staging_guard_required_field_missing");
  }
  const projectRef = config.STS_STAGING_PROJECT_REF;
  const apiUrl = new URL(config.STS_STAGING_SUPABASE_URL);
  const databaseUrl = new URL(config.STS_STAGING_DATABASE_URL);
  const databaseIdentity = `${databaseUrl.hostname} ${decodeURIComponent(
    databaseUrl.username
  )}`;
  const productionRefs = knownProductionRefs();
  if (config.STS_ENV !== "staging") throw new Error("staging_guard_env_failed");
  if (apiUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error("staging_guard_api_ref_failed");
  }
  if (!databaseIdentity.includes(projectRef)) {
    throw new Error("staging_guard_database_ref_failed");
  }
  if (!productionRefs.size || productionRefs.has(projectRef)) {
    throw new Error("staging_guard_production_separation_failed");
  }
  return config;
}

async function connect(config) {
  const caPath = process.env.STS_STAGING_CA_CERT;
  const ssl = caPath
    ? { rejectUnauthorized: true, ca: fs.readFileSync(caPath, "utf8") }
    : { rejectUnauthorized: true };
  const client = new Client({
    connectionString: config.STS_STAGING_DATABASE_URL,
    ssl,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
  await client.connect();
  return client;
}

async function preflight(client) {
  const result = await client.query(`
    select
      current_database() = 'postgres' as expected_database,
      current_setting('server_version') as server_version,
      count(*)::integer as public_table_count
    from information_schema.tables
    where table_schema = 'public'
  `);
  const authUsers = await client.query(`
    select case when to_regclass('auth.users') is null then null
      else (select count(*)::integer from auth.users) end as auth_user_count
  `);
  console.log("staging_database_connection: PASS");
  console.log(
    `database_name_check: ${result.rows[0].expected_database ? "PASS" : "FAIL"}`
  );
  console.log(`server_major_version: ${result.rows[0].server_version.split(".")[0]}`);
  console.log(`public_table_count_before_migrations: ${result.rows[0].public_table_count}`);
  console.log(`auth_user_count_before_tests: ${authUsers.rows[0].auth_user_count}`);
  if (!result.rows[0].expected_database) throw new Error("unexpected_database_name");
}

async function runSqlFiles(client, directory, filenames) {
  for (const filename of filenames) {
    const filePath = path.join(root, directory, filename);
    const sql = fs.readFileSync(filePath, "utf8");
    try {
      await client.query(sql);
      console.log(`${filename}: PASS`);
    } catch (error) {
      console.error(`${filename}: FAIL`);
      console.error(`sql_error_code: ${error.code || "unknown"}`);
      console.error(`sql_error_message: ${error.message || "unknown"}`);
      throw error;
    }
  }
}

async function main() {
  const action = process.argv[2];
  const config = loadAndGuardStaging();
  console.log("staging_destination_guard: PASS");
  if (action === "connection-shape") {
    const databaseUrl = new URL(config.STS_STAGING_DATABASE_URL);
    const projectRef = config.STS_STAGING_PROJECT_REF;
    const username = decodeURIComponent(databaseUrl.username);
    const port = databaseUrl.port || "5432";
    const mode = databaseUrl.hostname.startsWith("db.")
      ? "direct"
      : databaseUrl.hostname.includes("pooler.supabase.com")
        ? port === "6543"
          ? "transaction_pooler"
          : "session_pooler"
        : "unknown";
    console.log(
      `database_password_present: ${databaseUrl.password ? "PASS" : "FAIL"}`
    );
    console.log(
      `database_username_matches_ref: ${username.includes(projectRef) ? "PASS" : "FAIL"}`
    );
    console.log(
      `database_port_expected: ${["5432", "6543"].includes(port) ? "PASS" : "FAIL"}`
    );
    console.log(`database_connection_mode: ${mode}`);
    console.log(
      `database_name_expected: ${databaseUrl.pathname === "/postgres" ? "PASS" : "FAIL"}`
    );
    return;
  }
  const client = await connect(config);
  try {
    if (action === "preflight") {
      await preflight(client);
      return;
    }
    if (action === "migrate") {
      const migrations = fs
        .readdirSync(path.join(root, "supabase", "migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort();
      await runSqlFiles(client, "supabase/migrations", migrations);
      return;
    }
    if (action === "migration-file") {
      const filename = path.basename(String(process.argv[3] || ""));
      if (!/^\d{8}_\d{2}_[a-z0-9_]+\.sql$/.test(filename)) {
        throw new Error("invalid_migration_filename");
      }
      await runSqlFiles(client, "supabase/migrations", [filename]);
      return;
    }
    if (action === "sql-tests") {
      const tests = [
        "preflight_schema_check.sql",
        "core_state_foundation_test.sql",
        "data_architecture_test.sql",
        "profile_authorization_guard_test.sql",
      ];
      await runSqlFiles(client, "supabase/tests", tests);
      return;
    }
    throw new Error("unknown_validation_action");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`staging_validation_error: ${error.code || error.message}`);
  process.exitCode = 1;
});
