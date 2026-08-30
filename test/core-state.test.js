"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPONENT_HEALTH_STATES,
  COMMUNICATION_STATES,
  MAINTENANCE_STATES,
  OPERATIONAL_STATES,
} = require("../src/core/state-contracts");
const { normalizeComponentHealthSnapshot } = require("../src/core/component-health");
const {
  NOTIFICATION_CATEGORIES,
  normalizeMaintenance,
  notificationDecision,
} = require("../src/core/maintenance");
const {
  deriveCommunicationState,
  deriveDeviceStateSnapshot,
} = require("../src/core/device-state");

test("four state dimensions remain independent", () => {
  const state = {
    operational_state: OPERATIONAL_STATES.CRITICAL,
    component_health: COMPONENT_HEALTH_STATES.HEALTHY,
    communication_state: COMMUNICATION_STATES.ONLINE,
    maintenance_state: MAINTENANCE_STATES.INACTIVE,
  };
  assert.deepEqual(state, {
    operational_state: "CRITICAL",
    component_health: "HEALTHY",
    communication_state: "ONLINE",
    maintenance_state: "INACTIVE",
  });
});

test("passive button and buzzer are unknown, not healthy", () => {
  const snapshot = normalizeComponentHealthSnapshot({
    components: {
      rgb_button: { ok: true, configured: true },
      buzzer: { ok: true, enabled: true },
    },
  }, {}, new Date("2026-08-30T12:00:00Z"));
  assert.equal(snapshot.components.rgb_button.health_state, "UNKNOWN");
  assert.equal(snapshot.components.buzzer.health_state, "UNKNOWN");
  assert.equal(snapshot.components.buzzer.ok, false);
  assert.equal(snapshot.health_state, "UNKNOWN");
});

test("sensor failures degrade before becoming a fault", () => {
  const degraded = normalizeComponentHealthSnapshot({
    components: { dht22_interior: { ok: false, consecutive_errors: 1 } },
  });
  const fault = normalizeComponentHealthSnapshot({
    components: { dht22_interior: { ok: false, consecutive_errors: 3 } },
  });
  assert.equal(degraded.components.dht22_interior.health_state, "DEGRADED");
  assert.equal(fault.components.dht22_interior.health_state, "FAULT");
});

test("TFT initialization evidence does not claim physical display health", () => {
  const snapshot = normalizeComponentHealthSnapshot({
    components: { tft_st7789: { ok: true, initialized: true } },
  });
  assert.equal(snapshot.components.tft_st7789.health_state, "UNKNOWN");
  assert.equal(snapshot.components.tft_st7789.diagnostic_confidence, "OBSERVED");
  assert.equal(snapshot.components.tft_st7789.diagnostic_scope, "interface_initialization_only");
});

test("maintenance lifecycle normalizes legacy active_until", () => {
  const maintenance = normalizeMaintenance(
    {
      active_until: "2026-08-30T13:00:00Z",
      started_at: "2026-08-30T12:00:00Z",
      reason: "Sensor inspection",
    },
    new Date("2026-08-30T12:30:00Z")
  );
  assert.equal(maintenance.maintenance_state, "ACTIVE");
  assert.equal(maintenance.reason, "Sensor inspection");
});

test("maintenance suppresses configured process notifications only", () => {
  const maintenance = { active_until: "2026-08-30T13:00:00Z" };
  const now = new Date("2026-08-30T12:30:00Z");
  assert.equal(notificationDecision({ category: NOTIFICATION_CATEGORIES.PROCESS_ALARM, maintenance, now }).suppress, true);
  assert.equal(notificationDecision({ category: NOTIFICATION_CATEGORIES.COMMUNICATION, maintenance, now }).suppress, false);
  assert.equal(notificationDecision({ category: NOTIFICATION_CATEGORIES.SECURITY, maintenance, now }).suppress, false);
  assert.equal(notificationDecision({ category: NOTIFICATION_CATEGORIES.PROCESS_ALARM, severity: "critical", maintenance, now }).suppress, false);
});

test("communication remains offline during maintenance", () => {
  const snapshot = deriveDeviceStateSnapshot({
    operationalStatus: "NORMAL",
    componentHealth: { health_state: "HEALTHY" },
    communication: { online: false },
    maintenance: { maintenance_state: "ACTIVE" },
    observedAt: new Date("2026-08-30T12:30:00Z"),
  });
  assert.equal(snapshot.operational_state, "NORMAL");
  assert.equal(snapshot.component_health_state, "HEALTHY");
  assert.equal(snapshot.communication_state, "OFFLINE");
  assert.equal(snapshot.maintenance_state, "ACTIVE");
});

test("weak or failing communication is degraded independently", () => {
  assert.equal(deriveCommunicationState({ online: true, wifi_rssi: -82 }), "DEGRADED");
  assert.equal(
    deriveCommunicationState({ online: true, wifi_rssi: -60, post_ok_count: 10, post_fail_count: 1 }),
    "ONLINE"
  );
});
