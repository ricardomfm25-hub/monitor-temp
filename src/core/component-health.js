"use strict";

const {
  COMPONENT_HEALTH_STATES,
  DIAGNOSTIC_CONFIDENCE,
  normalizeComponentHealthState,
  normalizeDiagnosticConfidence,
} = require("./state-contracts");

const PASSIVE_UNVERIFIABLE_COMPONENTS = new Set(["rgb_button", "button", "buzzer"]);
const INTERFACE_ONLY_COMPONENTS = new Set(["tft_st7789", "display", "tft"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deriveLegacyState(componentKey, evidence) {
  if (PASSIVE_UNVERIFIABLE_COMPONENTS.has(componentKey)) {
    return COMPONENT_HEALTH_STATES.UNKNOWN;
  }
  if (INTERFACE_ONLY_COMPONENTS.has(componentKey) && evidence.ok === true) {
    return COMPONENT_HEALTH_STATES.UNKNOWN;
  }
  if (evidence.ok === false) {
    const consecutiveErrors = finiteNumber(
      evidence.consecutive_errors,
      finiteNumber(evidence.fail_count, 0)
    );
    return consecutiveErrors >= 3
      ? COMPONENT_HEALTH_STATES.FAULT
      : COMPONENT_HEALTH_STATES.DEGRADED;
  }
  if (evidence.ok === true) return COMPONENT_HEALTH_STATES.HEALTHY;
  return COMPONENT_HEALTH_STATES.UNKNOWN;
}

function deriveLegacyConfidence(componentKey, evidence) {
  if (PASSIVE_UNVERIFIABLE_COMPONENTS.has(componentKey)) {
    return DIAGNOSTIC_CONFIDENCE.UNKNOWN;
  }
  if (INTERFACE_ONLY_COMPONENTS.has(componentKey)) {
    return evidence.ok === undefined
      ? DIAGNOSTIC_CONFIDENCE.UNKNOWN
      : DIAGNOSTIC_CONFIDENCE.OBSERVED;
  }
  if (evidence.ok !== undefined) return DIAGNOSTIC_CONFIDENCE.OBSERVED;
  return DIAGNOSTIC_CONFIDENCE.UNKNOWN;
}

function normalizeComponent(componentKey, value, observedAt) {
  const evidence = value && typeof value === "object" ? value : {};
  const explicitState = evidence.health_state || evidence.state;
  const healthState = explicitState
    ? normalizeComponentHealthState(explicitState)
    : deriveLegacyState(componentKey, evidence);
  const confidence = evidence.diagnostic_confidence
    ? normalizeDiagnosticConfidence(evidence.diagnostic_confidence)
    : deriveLegacyConfidence(componentKey, evidence);

  return {
    ...evidence,
    component_id: evidence.component_id || componentKey,
    component_type: evidence.component_type || componentKey,
    health_state: healthState,
    diagnostic_confidence: confidence,
    diagnostic_source: evidence.diagnostic_source || "device_telemetry",
    diagnostic_scope:
      evidence.diagnostic_scope ||
      (PASSIVE_UNVERIFIABLE_COMPONENTS.has(componentKey)
        ? "configured_only"
        : INTERFACE_ONLY_COMPONENTS.has(componentKey)
          ? "interface_initialization_only"
          : "runtime_observation"),
    error_count: finiteNumber(evidence.error_count, finiteNumber(evidence.fail_count, 0)),
    consecutive_errors: finiteNumber(
      evidence.consecutive_errors,
      finiteNumber(evidence.fail_count, 0)
    ),
    updated_at: evidence.updated_at || observedAt,
    // Compatibility for existing Cold dashboard consumers.
    ok: healthState === COMPONENT_HEALTH_STATES.HEALTHY,
  };
}

function summarizeComponents(components) {
  const values = Object.values(components || {});
  const counts = Object.fromEntries(
    Object.values(COMPONENT_HEALTH_STATES).map((state) => [state, 0])
  );
  for (const component of values) counts[component.health_state] += 1;

  let healthState = COMPONENT_HEALTH_STATES.UNKNOWN;
  if (counts.FAULT > 0) healthState = COMPONENT_HEALTH_STATES.FAULT;
  else if (counts.DEGRADED > 0) healthState = COMPONENT_HEALTH_STATES.DEGRADED;
  else if (counts.HEALTHY > 0) healthState = COMPONENT_HEALTH_STATES.HEALTHY;

  return { health_state: healthState, counts, component_count: values.length };
}

function normalizeComponentHealthSnapshot(value, fallback = {}, now = new Date()) {
  const source = value && typeof value === "object" ? value : {};
  const previous = fallback && typeof fallback === "object" ? fallback : {};
  const observedAt = now instanceof Date ? now.toISOString() : String(now);
  const rawComponents = {
    ...(previous.components || {}),
    ...(source.components || {}),
  };
  const components = Object.fromEntries(
    Object.entries(rawComponents).map(([key, component]) => [
      key,
      normalizeComponent(key, component, observedAt),
    ])
  );
  const summary = summarizeComponents(components);

  return {
    schema_version: 1,
    updated_at: observedAt,
    health_state: summary.health_state,
    counts: summary.counts,
    component_count: summary.component_count,
    components,
    // Legacy summary remains available but no longer treats UNKNOWN as healthy.
    overall_ok:
      summary.health_state === COMPONENT_HEALTH_STATES.HEALTHY &&
      summary.counts.UNKNOWN === 0,
  };
}

module.exports = {
  normalizeComponent,
  normalizeComponentHealthSnapshot,
  summarizeComponents,
};
