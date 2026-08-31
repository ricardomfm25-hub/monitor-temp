"use strict";

const fs = require("fs");
const path = require("path");
const { X509Certificate } = require("crypto");

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

function walk(directory, depth = 0) {
  if (depth > 4) return [];
  const ignored = new Set(["node_modules", ".git", ".next", ".npm-cache"]);
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath, depth + 1));
    else files.push(fullPath);
  }
  return files;
}

function pass(name, condition) {
  console.log(`${name}: ${condition ? "PASS" : "FAIL"}`);
  return condition;
}

function main() {
  const productionPath = path.join(root, ".env.production-schema-readonly.local");
  const production = readDotEnv(productionPath);
  const staging = readDotEnv(path.join(root, ".env.staging.local"));
  const legacy = readDotEnv(path.join(root, ".env"));
  const projectRef = production.STS_PRODUCTION_PROJECT_REF;
  const databaseUrl = new URL(production.STS_PRODUCTION_DATABASE_URL);
  const databaseIdentity = `${databaseUrl.hostname} ${decodeURIComponent(
    databaseUrl.username
  )}`;
  const legacyRef = new URL(legacy.SUPABASE_URL).hostname.split(".")[0];
  const certificate = new X509Certificate(
    fs.readFileSync(production.STS_PRODUCTION_CA_CERT_PATH)
  );
  const now = Date.now();
  const checks = [
    pass("source_env_is_production", production.STS_SCHEMA_SOURCE_ENV === "production"),
    pass("production_ref_matches_legacy_config", projectRef === legacyRef),
    pass("production_differs_from_staging", projectRef !== staging.STS_STAGING_PROJECT_REF),
    pass("database_url_matches_production_ref", databaseIdentity.includes(projectRef)),
    pass("database_password_present", Boolean(databaseUrl.password)),
    pass(
      "ca_certificate_current",
      now >= Date.parse(certificate.validFrom) && now <= Date.parse(certificate.validTo)
    ),
    pass("ca_certificate_is_supabase", certificate.subject.includes("Supabase")),
  ];
  if (checks.includes(false)) throw new Error("production_schema_export_guard_failed");
  console.log("PRODUCTION_SCHEMA_EXPORT_GUARD: PASS");

  const databaseUrlPattern = /postgres(?:ql)?:\/\/[^\s"']+/gi;
  const oldReferences = [];
  for (const filePath of walk(root)) {
    if (path.resolve(filePath) === path.resolve(productionPath)) continue;
    const name = path.basename(filePath);
    if (!name.startsWith(".env") && !/(supabase|database|postgres|connection)/i.test(name)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(databaseUrlPattern)) {
      try {
        const candidate = new URL(match[0]);
        const identity = `${candidate.hostname} ${decodeURIComponent(candidate.username)}`;
        if (identity.includes(projectRef)) oldReferences.push(filePath);
      } catch {}
    }
  }
  console.log(
    `OLD_CONNECTION_STRING_REFERENCED: ${oldReferences.length ? "YES" : "NO"}`
  );
  for (const filePath of [...new Set(oldReferences)]) {
    console.log(`OLD_CONNECTION_STRING_FILE: ${filePath}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`production_schema_guard_error: ${error.message}`);
  process.exitCode = 1;
}
