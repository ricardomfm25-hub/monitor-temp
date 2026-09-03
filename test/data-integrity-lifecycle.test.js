"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assessMeasurementQuality,
  buildIdempotencyKey,
  buildMeasurementCandidates,
  classifyDelivery,
  compareLegacyAndCore,
} = require("../src/core/measurement-contract");
const {
  canTransition,
  validateTransition,
} = require("../src/core/device-lifecycle");
const {
  incrementCoreMetric,
  getCoreMetricsSnapshot,
  resetCoreMetricsForTests,
} = require("../src/core/observability");

test("numeric values are not automatically valid", () => {
  const result = assessMeasurementQuality({
    value: 4.2,
    metricType: "temperature",
    sensorEvidence: null,
    eventTime: "2026-08-30T10:00:00Z",
    ingestedAt: "2026-08-30T10:00:01Z",
  });
  assert.equal(result.quality, "unknown");
  assert.ok(result.reasons.includes("component_health_unknown"));
});

test("component fault invalidates a numeric measurement", () => {
  const result = assessMeasurementQuality({
    value: 4.2,
    metricType: "temperature",
    sensorEvidence: { health_state: "FAULT", diagnostic_confidence: "OBSERVED" },
    eventTime: "2026-08-30T10:00:00Z",
    ingestedAt: "2026-08-30T10:00:01Z",
  });
  assert.equal(result.quality, "invalid");
  assert.ok(result.reasons.includes("component_fault"));
});

test("missing measurements are explicit and value-less", () => {
  const candidates = buildMeasurementCandidates({
    payload: { temperature: 4.2 },
    componentHealth: null,
    eventTime: "2026-08-30T10:00:00Z",
    ingestedAt: "2026-08-30T10:00:01Z",
  });
  const humidity = candidates.find(
    (item) => item.sensorKey === "interior_humidity"
  );
  assert.equal(humidity.value, null);
  assert.equal(humidity.quality, "missing");
});

test("retry and offline backlog are retransmitted", () => {
  assert.equal(classifyDelivery({ delivery_attempts: 2 }), "retransmitted");
  assert.equal(classifyDelivery({ captured_offline: true }), "retransmitted");
  assert.equal(classifyDelivery({ sample_age_s: 180 }), "delayed");
});

test("idempotency remains stable across delivery retry metadata", () => {
  const base = {
    deviceId: "STS-001",
    eventTime: "2026-08-30T10:00:00Z",
    payload: { temperature: 4.2, humidity: 60, delivery_attempts: 0 },
  };
  const retry = {
    ...base,
    payload: { ...base.payload, delivery_attempts: 3, queued_backfill: true },
  };
  assert.equal(buildIdempotencyKey(base), buildIdempotencyKey(retry));
  assert.equal(buildIdempotencyKey({ ...base, telemetrySeq: 42 }), "seq:42");
});

test("v2 internal sensor values participate in fallback identity", () => {
  const base = {
    deviceId: "STS-001",
    eventTime: "2026-09-02T10:00:00Z",
    payload: {
      sensor_semantics_version: 2,
      temperature: 5,
      humidity: 60,
      internal_temperature: 22,
      internal_humidity: 45,
    },
  };
  const changedInternal = {
    ...base,
    payload: { ...base.payload, internal_temperature: 23 },
  };
  assert.notEqual(buildIdempotencyKey(base), buildIdempotencyKey(changedInternal));
});

test("event time remains part of legacy fallback identity", () => {
  const common = {
    deviceId: "STS-001",
    payload: { temperature: 4.2, humidity: 60 },
  };
  const older = buildIdempotencyKey({
    ...common,
    eventTime: "2026-08-30T09:59:00Z",
  });
  const newer = buildIdempotencyKey({
    ...common,
    eventTime: "2026-08-30T10:00:00Z",
  });
  assert.notEqual(older, newer);
});

test("legacy and normalized values have measurable parity", () => {
  const payload = { temperature: 3.5, humidity: 71 };
  const candidates = buildMeasurementCandidates({
    payload,
    componentHealth: {
      components: {
        dht22_interior: { health_state: "HEALTHY", diagnostic_confidence: "OBSERVED" },
      },
    },
    eventTime: "2026-08-30T10:00:00Z",
    ingestedAt: "2026-08-30T10:00:01Z",
  }).filter((item) => item.value !== null);
  assert.equal(compareLegacyAndCore({ legacy: payload, measurements: candidates }).parity, true);
  candidates[0].value = 99;
  assert.equal(compareLegacyAndCore({ legacy: payload, measurements: candidates }).parity, false);
});

test("device lifecycle excludes maintenance and health states", () => {
  assert.equal(canTransition("PROVISIONED", "ONBOARDING"), true);
  assert.equal(canTransition("ACTIVE", "MAINTENANCE"), false);
  assert.equal(canTransition("ACTIVE", "FAULT"), false);
  assert.equal(canTransition("FAULT", "ONBOARDING"), false);
});

test("retired device requires explicit administrative restore", () => {
  assert.equal(canTransition("RETIRED", "ACTIVE"), false);
  assert.equal(canTransition("RETIRED", "ONBOARDING"), false);
  assert.equal(canTransition("RETIRED", "ONBOARDING", { administrativeRestore: true }), true);
  assert.equal(
    validateTransition({
      from: "RETIRED",
      to: "ONBOARDING",
      reason: "Approved replacement reversal",
      administrativeRestore: true,
    }).ok,
    true
  );
});

test("Core observability counters aggregate without payload secrets", () => {
  resetCoreMetricsForTests();
  incrementCoreMetric("dual_write.failed", { reason: "schema_missing" });
  incrementCoreMetric("dual_write.failed", { reason: "schema_missing" });
  assert.deepEqual(getCoreMetricsSnapshot(), [
    { name: "dual_write.failed", labels: { reason: "schema_missing" }, value: 2 },
  ]);
});
