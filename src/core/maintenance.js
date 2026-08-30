"use strict";

const { MAINTENANCE_STATES } = require("./state-contracts");

const NOTIFICATION_CATEGORIES = Object.freeze({
  PROCESS_ALARM: "PROCESS_ALARM",
  COMMUNICATION: "COMMUNICATION",
  COMPONENT_HEALTH: "COMPONENT_HEALTH",
  SECURITY: "SECURITY",
  INTEGRITY: "INTEGRITY",
  SYSTEM_CRITICAL: "SYSTEM_CRITICAL",
});

const DEFAULT_NOTIFICATION_POLICY = Object.freeze({
  suppress_process_alarms: true,
  suppress_communication: false,
  suppress_component_health: false,
});

function normalizeMaintenance(value = {}, now = new Date()) {
  const source = value && typeof value === "object" ? value : {};
  const currentMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const until = source.active_until || source.scheduled_end_at || null;
  const untilMs = until ? new Date(until).getTime() : NaN;
  const explicitlyActive = String(source.maintenance_state || source.state || "").toUpperCase() === "ACTIVE";
  const active = Number.isFinite(untilMs) ? untilMs > currentMs : explicitlyActive;

  return {
    maintenance_state: active ? MAINTENANCE_STATES.ACTIVE : MAINTENANCE_STATES.INACTIVE,
    started_at: source.started_at || null,
    ended_at: active ? null : source.ended_at || null,
    active_until: active ? until : null,
    duration_min: Number.isFinite(Number(source.duration_min)) ? Number(source.duration_min) : null,
    reason: source.reason ? String(source.reason).slice(0, 500) : null,
    started_by: source.started_by || null,
    ended_by: source.ended_by || null,
    source: source.source || "legacy_config",
    audit_event_id: source.audit_event_id || null,
    notification_policy: {
      ...DEFAULT_NOTIFICATION_POLICY,
      ...(source.notification_policy || {}),
    },
  };
}

function isMaintenanceActive(value, now = new Date()) {
  return normalizeMaintenance(value?.maintenance || value, now).maintenance_state === MAINTENANCE_STATES.ACTIVE;
}

function notificationDecision({ category, severity = "warning", maintenance, now = new Date() }) {
  const normalized = normalizeMaintenance(maintenance, now);
  if (normalized.maintenance_state !== MAINTENANCE_STATES.ACTIVE) {
    return { suppress: false, reason: "maintenance_inactive", maintenance: normalized };
  }

  const safeCategory = String(category || "").toUpperCase();
  const safeSeverity = String(severity || "").toLowerCase();
  if (
    safeSeverity === "critical" ||
    [NOTIFICATION_CATEGORIES.SECURITY, NOTIFICATION_CATEGORIES.INTEGRITY, NOTIFICATION_CATEGORIES.SYSTEM_CRITICAL].includes(safeCategory)
  ) {
    return { suppress: false, reason: "critical_notification_never_suppressed", maintenance: normalized };
  }

  const policyKey = {
    [NOTIFICATION_CATEGORIES.PROCESS_ALARM]: "suppress_process_alarms",
    [NOTIFICATION_CATEGORIES.COMMUNICATION]: "suppress_communication",
    [NOTIFICATION_CATEGORIES.COMPONENT_HEALTH]: "suppress_component_health",
  }[safeCategory];
  const suppress = policyKey ? normalized.notification_policy[policyKey] === true : false;
  return {
    suppress,
    reason: suppress ? `maintenance_policy:${policyKey}` : "maintenance_policy_allows",
    maintenance: normalized,
  };
}

module.exports = {
  NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_POLICY,
  normalizeMaintenance,
  isMaintenanceActive,
  notificationDecision,
};
