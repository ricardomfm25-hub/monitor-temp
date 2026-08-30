"use strict";

const OPERATIONAL_STATES = Object.freeze({
  NORMAL: "NORMAL",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  UNKNOWN: "UNKNOWN",
});

const COMPONENT_HEALTH_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  FAULT: "FAULT",
  UNKNOWN: "UNKNOWN",
});

const COMMUNICATION_STATES = Object.freeze({
  ONLINE: "ONLINE",
  DEGRADED: "DEGRADED",
  OFFLINE: "OFFLINE",
  UNKNOWN: "UNKNOWN",
});

const MAINTENANCE_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});

const DIAGNOSTIC_CONFIDENCE = Object.freeze({
  CONFIRMED: "CONFIRMED",
  OBSERVED: "OBSERVED",
  INFERRED: "INFERRED",
  UNKNOWN: "UNKNOWN",
});

function enumValue(values, value, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(values).includes(normalized) ? normalized : fallback;
}

function normalizeOperationalState(value) {
  return enumValue(OPERATIONAL_STATES, value, OPERATIONAL_STATES.UNKNOWN);
}

function normalizeComponentHealthState(value) {
  return enumValue(
    COMPONENT_HEALTH_STATES,
    value,
    COMPONENT_HEALTH_STATES.UNKNOWN
  );
}

function normalizeCommunicationState(value) {
  return enumValue(COMMUNICATION_STATES, value, COMMUNICATION_STATES.UNKNOWN);
}

function normalizeMaintenanceState(value) {
  return enumValue(MAINTENANCE_STATES, value, MAINTENANCE_STATES.INACTIVE);
}

function normalizeDiagnosticConfidence(value) {
  return enumValue(DIAGNOSTIC_CONFIDENCE, value, DIAGNOSTIC_CONFIDENCE.UNKNOWN);
}

module.exports = {
  OPERATIONAL_STATES,
  COMPONENT_HEALTH_STATES,
  COMMUNICATION_STATES,
  MAINTENANCE_STATES,
  DIAGNOSTIC_CONFIDENCE,
  normalizeOperationalState,
  normalizeComponentHealthState,
  normalizeCommunicationState,
  normalizeMaintenanceState,
  normalizeDiagnosticConfidence,
};
