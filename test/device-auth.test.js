"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDeviceAuthenticator,
  hashDeviceToken,
} = require("../src/core/device-auth");
const { assertSafeRuntimeEnvironment } = require("../src/core/staging-environment");

const DEVICE_A = "STS-COLD-STAGING-BENCH-01";
const DEVICE_B = "STS-COLD-STAGING-BENCH-02";
const TOKEN_A = "test-only-token-a-with-sufficient-entropy-00000001";
const TOKEN_B = "test-only-token-b-with-sufficient-entropy-00000002";

function makeAuthenticator(overrides = {}) {
  const credentials = [
    { id: "credential-a", deviceId: DEVICE_A, token: TOKEN_A, active: true },
    { id: "credential-b", deviceId: DEVICE_B, token: TOKEN_B, active: true },
    { id: "credential-revoked", deviceId: DEVICE_A, token: "revoked-token", active: false, revoked_at: "2026-01-01T00:00:00Z" },
  ];
  return createDeviceAuthenticator({
    findCredential: async ({ deviceId, tokenHash }) => {
      const found = credentials.find(
        (item) => item.deviceId === deviceId && hashDeviceToken(item.token) === tokenHash
      );
      return found || null;
    },
    ...overrides,
  });
}

test("token A authenticates only Device A", async () => {
  const authenticate = makeAuthenticator();
  assert.equal((await authenticate({ authorization: TOKEN_A, deviceId: DEVICE_A })).authorized, true);
  assert.equal((await authenticate({ authorization: TOKEN_A, deviceId: DEVICE_B })).authorized, false);
});

test("token B cannot authenticate Device A", async () => {
  const authenticate = makeAuthenticator();
  assert.equal((await authenticate({ authorization: `Bearer ${TOKEN_B}`, deviceId: DEVICE_A })).authorized, false);
});

test("revoked, invalid, missing-token and missing-device requests fail closed", async () => {
  const authenticate = makeAuthenticator();
  assert.equal((await authenticate({ authorization: "revoked-token", deviceId: DEVICE_A })).authorized, false);
  assert.equal((await authenticate({ authorization: "invalid-token", deviceId: DEVICE_A })).authorized, false);
  assert.equal((await authenticate({ authorization: "", deviceId: DEVICE_A })).authorized, false);
  assert.equal((await authenticate({ authorization: TOKEN_A, deviceId: "STS-MISSING" })).authorized, false);
});

test("legacy token is opt-in and temporary", async () => {
  const disabled = makeAuthenticator({ legacyToken: "legacy-test-token", allowLegacy: false });
  const enabled = makeAuthenticator({ legacyToken: "legacy-test-token", allowLegacy: true });
  assert.equal((await disabled({ authorization: "legacy-test-token", deviceId: DEVICE_A })).authorized, false);
  assert.equal((await enabled({ authorization: "legacy-test-token", deviceId: DEVICE_A })).method, "legacy");
});

test("staging guard pins project and credential fingerprints", () => {
  const serviceRole = "test-service-role";
  const apiToken = "test-api-token";
  const safe = {
    STS_ENV: "staging",
    STS_STAGING_PROJECT_REF: "stagingref",
    STS_PRODUCTION_PROJECT_REF: "productionref",
    SUPABASE_URL: "https://stagingref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    STS_STAGING_SERVICE_ROLE_KEY_SHA256: hashDeviceToken(serviceRole),
    API_TOKEN: apiToken,
    STS_STAGING_LEGACY_API_TOKEN_SHA256: hashDeviceToken(apiToken),
  };
  assert.equal(assertSafeRuntimeEnvironment(safe).staging, true);
  assert.throws(
    () => assertSafeRuntimeEnvironment({ ...safe, SUPABASE_URL: "https://productionref.supabase.co" }),
    /staging_guard_supabase_ref_mismatch/
  );
  assert.throws(
    () => assertSafeRuntimeEnvironment({ ...safe, SUPABASE_SERVICE_ROLE_KEY: "wrong" }),
    /staging_guard_service_role_mismatch/
  );
});
