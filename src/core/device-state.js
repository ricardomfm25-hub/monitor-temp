"use strict";

const {
  COMPONENT_HEALTH_STATES,
  COMMUNICATION_STATES,
  MAINTENANCE_STATES,
  OPERATIONAL_STATES,
  normalizeComponentHealthState,
  normalizeMaintenanceState,
  normalizeOperationalState,
} = require("./state-contracts");
const { normalizeMaintenance } = require("./maintenance");

function deriveOperationalState(value) {
  const direct = normalizeOperationalState(value);
  if (direct !== OPERATIONAL_STATES.UNKNOWN) return direct;
  const text = String(value || "").toUpperCase();
  if (/CRITICAL|CRITICO|ALARM|ALARME/.test(text)) return OPERATIONAL_STATES.CRITICAL;
  if (/WARNING|WARN|ALERT|ATENCAO/.test(text)) return OPERATIONAL_STATES.WARNING;
  if (/NORMAL|OK|ACK/.test(text)) return OPERATIONAL_STATES.NORMAL;
  return OPERATIONAL_STATES.UNKNOWN;
}

function deriveCommunicationState(evidence = {}) {
  if (evidence.online === false) return COMMUNICATION_STATES.OFFLINE;
  if (evidence.online !== true) return COMMUNICATION_STATES.UNKNOWN;
  const rssi = Number(evidence.wifi_rssi ?? evidence.rssi_dbm);
  const failures = Number(evidence.post_fail_count || 0);
  const successes = Number(evidence.post_ok_count || 0);
  const lastHttpStatus = Number(evidence.last_http_status || 0);
  if (
    (Number.isFinite(rssi) && rssi < -75) ||
    (failures > 0 && failures >= successes) ||
    (lastHttpStatus > 0 && (lastHttpStatus < 200 || lastHttpStatus >= 500))
  ) {
    return COMMUNICATION_STATES.DEGRADED;
  }
  return COMMUNICATION_STATES.ONLINE;
}

function deriveDeviceStateSnapshot({
  operationalStatus,
  componentHealth,
  communication,
  maintenance,
  observedAt = new Date(),
}) {
  const maintenanceContract = normalizeMaintenance(maintenance, observedAt);
  return {
    operational_state: deriveOperationalState(operationalStatus),
    component_health_state: normalizeComponentHealthState(
      componentHealth?.health_state || COMPONENT_HEALTH_STATES.UNKNOWN
    ),
    communication_state: deriveCommunicationState(communication),
    maintenance_state: normalizeMaintenanceState(
      maintenanceContract.maintenance_state || MAINTENANCE_STATES.INACTIVE
    ),
    observed_at:
      observedAt instanceof Date ? observedAt.toISOString() : new Date(observedAt).toISOString(),
  };
}

module.exports = {
  deriveOperationalState,
  deriveCommunicationState,
  deriveDeviceStateSnapshot,
};
