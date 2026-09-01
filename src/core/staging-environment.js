"use strict";

const { constantTimeEqual, hashDeviceToken } = require("./device-auth");

function requireValue(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`staging_guard_missing_${name}`);
  return normalized;
}

function assertSafeRuntimeEnvironment(env) {
  const environment = String(env.STS_ENV || "production").trim().toLowerCase();
  if (environment !== "staging") return { environment, staging: false };

  const stagingRef = requireValue(env.STS_STAGING_PROJECT_REF, "project_ref");
  const productionRef = requireValue(
    env.STS_PRODUCTION_PROJECT_REF,
    "production_project_ref"
  );
  if (stagingRef === productionRef) throw new Error("staging_guard_project_ref_collision");

  let supabaseUrl;
  try {
    supabaseUrl = new URL(requireValue(env.SUPABASE_URL, "supabase_url"));
  } catch {
    throw new Error("staging_guard_invalid_supabase_url");
  }
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${stagingRef}.supabase.co`) {
    throw new Error("staging_guard_supabase_ref_mismatch");
  }

  const serviceRoleFingerprint = hashDeviceToken(
    requireValue(env.SUPABASE_SERVICE_ROLE_KEY, "service_role")
  );
  if (
    !constantTimeEqual(
      serviceRoleFingerprint,
      requireValue(env.STS_STAGING_SERVICE_ROLE_KEY_SHA256, "service_role_fingerprint")
    )
  ) {
    throw new Error("staging_guard_service_role_mismatch");
  }

  const apiTokenFingerprint = hashDeviceToken(requireValue(env.API_TOKEN, "api_token"));
  if (
    !constantTimeEqual(
      apiTokenFingerprint,
      requireValue(env.STS_STAGING_LEGACY_API_TOKEN_SHA256, "legacy_token_fingerprint")
    )
  ) {
    throw new Error("staging_guard_legacy_token_mismatch");
  }

  return { environment, staging: true, stagingRef };
}

module.exports = { assertSafeRuntimeEnvironment };
