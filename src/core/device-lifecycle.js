"use strict";

const DEVICE_LIFECYCLE = Object.freeze({
  PROVISIONED: "PROVISIONED",
  ONBOARDING: "ONBOARDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  RETIRED: "RETIRED",
});

const TRANSITIONS = Object.freeze({
  PROVISIONED: new Set(["ONBOARDING", "SUSPENDED", "RETIRED"]),
  ONBOARDING: new Set(["ACTIVE", "SUSPENDED", "RETIRED"]),
  ACTIVE: new Set(["SUSPENDED", "RETIRED"]),
  SUSPENDED: new Set(["ONBOARDING", "ACTIVE", "RETIRED"]),
  RETIRED: new Set(),
});

function normalizeLifecycle(value) {
  const state = String(value || "").trim().toUpperCase();
  return Object.values(DEVICE_LIFECYCLE).includes(state)
    ? state
    : DEVICE_LIFECYCLE.PROVISIONED;
}

function isLifecycleState(value) {
  return Object.values(DEVICE_LIFECYCLE).includes(
    String(value || "").trim().toUpperCase()
  );
}

function canTransition(from, to, { administrativeRestore = false } = {}) {
  if ((from !== null && from !== undefined && !isLifecycleState(from)) || !isLifecycleState(to)) {
    return false;
  }
  const current = normalizeLifecycle(from);
  const next = normalizeLifecycle(to);
  if (current === next) return false;
  if (current === DEVICE_LIFECYCLE.RETIRED) {
    return administrativeRestore && next === DEVICE_LIFECYCLE.ONBOARDING;
  }
  return TRANSITIONS[current].has(next);
}

function validateTransition({ from, to, reason, administrativeRestore = false }) {
  const current = normalizeLifecycle(from);
  const next = normalizeLifecycle(to);
  const normalizedReason = String(reason || "").trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    return { ok: false, error: "invalid_reason", from: current, to: next };
  }
  if (!canTransition(current, next, { administrativeRestore })) {
    return { ok: false, error: "transition_not_allowed", from: current, to: next };
  }
  return { ok: true, from: current, to: next, reason: normalizedReason };
}

module.exports = {
  DEVICE_LIFECYCLE,
  TRANSITIONS,
  isLifecycleState,
  normalizeLifecycle,
  canTransition,
  validateTransition,
};
