"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveColdSensorSnapshot,
  deriveColdOperationalStatus,
} = require("../src/core/cold-sensor-semantics");
const { buildMeasurementCandidates } = require("../src/core/measurement-contract");
const { normalizeComponentHealthSnapshot } = require("../src/core/component-health");
const { deriveDeviceStateSnapshot } = require("../src/core/device-state");

const limits = { temp_low_c: 2, temp_high_c: 8, hum_low: 40, hum_high: 80 };
const observed = {
  components: {
    sht30_ambient: { health_state: "HEALTHY", diagnostic_confidence: "OBSERVED" },
    dht22_interior: { health_state: "HEALTHY", diagnostic_confidence: "OBSERVED" },
  },
};

function payload(overrides = {}) {
  return {
    sensor_semantics_version: 2,
    temperature: 5,
    humidity: 60,
    sensor_ok: true,
    internal_temperature: 24,
    internal_humidity: 45,
    internal_sensor_ok: true,
    ...overrides,
  };
}

test("SHT30 is primary and DHT22 is internal under sensor semantics v2", () => {
  const snapshot = resolveColdSensorSnapshot(payload());
  assert.equal(snapshot.primary.componentKey, "sht30_ambient");
  assert.equal(snapshot.primary.temperature, 5);
  assert.equal(snapshot.internal.componentKey, "dht22_interior");
  assert.equal(snapshot.internal.temperature, 24);
  assert.equal(deriveColdOperationalStatus({ snapshot, limits }), "normal");
});

test("DHT22 failure degrades component health without changing operational state", () => {
  const coldSnapshot = resolveColdSensorSnapshot(payload({
    internal_temperature: null,
    internal_humidity: null,
    internal_sensor_ok: false,
  }));
  const componentHealth = normalizeComponentHealthSnapshot({
    components: {
      sht30_ambient: { ok: true, consecutive_errors: 0 },
      dht22_interior: { ok: false, consecutive_errors: 3 },
    },
  });
  const state = deriveDeviceStateSnapshot({
    operationalStatus: deriveColdOperationalStatus({ snapshot: coldSnapshot, limits }),
    componentHealth,
    communication: { online: true },
    maintenance: {},
  });
  assert.equal(state.operational_state, "NORMAL");
  assert.equal(componentHealth.components.dht22_interior.health_state, "FAULT");
  assert.equal(state.component_health_state, "FAULT");
});

test("only SHT30 primary values drive alert and critical states", () => {
  const internalOutOfRange = resolveColdSensorSnapshot(payload({
    internal_temperature: 50,
    internal_humidity: 99,
  }));
  assert.equal(
    deriveColdOperationalStatus({ snapshot: internalOutOfRange, limits }),
    "normal"
  );

  const alert = resolveColdSensorSnapshot(payload({ temperature: 8.5 }));
  const critical = resolveColdSensorSnapshot(payload({ temperature: 10.5 }));
  assert.equal(deriveColdOperationalStatus({ snapshot: alert, limits }), "alert");
  assert.equal(deriveColdOperationalStatus({ snapshot: critical, limits }), "alarm");
});

test("missing SHT30 remains null and produces sensor failure, never zero", () => {
  const snapshot = resolveColdSensorSnapshot(payload({
    temperature: null,
    humidity: null,
    sensor_ok: false,
  }));
  assert.equal(snapshot.primary.temperature, null);
  assert.equal(snapshot.primary.humidity, null);
  assert.equal(deriveColdOperationalStatus({ snapshot, limits }), "sensor_fail");
});

test("normalized v2 measurements bind main fields to SHT30 and internal fields to DHT22", () => {
  const candidates = buildMeasurementCandidates({
    payload: payload(),
    componentHealth: observed,
    eventTime: "2026-09-02T10:00:00Z",
    ingestedAt: "2026-09-02T10:00:01Z",
  });
  assert.equal(candidates.find((item) => item.sensorKey === "ambient_temperature").value, 5);
  assert.equal(candidates.find((item) => item.sensorKey === "interior_temperature").value, 24);
});

test("legacy payloads retain their original field mapping", () => {
  const candidates = buildMeasurementCandidates({
    payload: { temperature: 23, humidity: 50, exterior_temperature: 5, exterior_humidity: 70 },
    componentHealth: observed,
    eventTime: "2026-09-02T10:00:00Z",
    ingestedAt: "2026-09-02T10:00:01Z",
  });
  assert.equal(candidates.find((item) => item.sensorKey === "interior_temperature").value, 23);
  assert.equal(candidates.find((item) => item.sensorKey === "ambient_temperature").value, 5);
});
