"use strict";

const crypto = require("crypto");

const DATA_QUALITY = Object.freeze({
  VALID: "valid",
  SUSPECT: "suspect",
  INVALID: "invalid",
  MISSING: "missing",
  UNKNOWN: "unknown",
});

const DELIVERY_CLASS = Object.freeze({
  ORIGINAL: "original",
  DELAYED: "delayed",
  RETRANSMITTED: "retransmitted",
});

const SENSOR_SEMANTICS = Object.freeze({ LEGACY: 1, SHT30_PRIMARY: 2 });

// Stable sensor catalogue. Payload bindings are versioned below so stored legacy
// telemetry remains DHT22=interior/SHT30=ambient while v2 makes SHT30 primary.
const METRICS = Object.freeze([
  { sensorKey: "interior_temperature", metricType: "temperature", unit: "degC" },
  { sensorKey: "interior_humidity", metricType: "humidity", unit: "%RH" },
  { sensorKey: "ambient_temperature", metricType: "temperature", unit: "degC" },
  { sensorKey: "ambient_humidity", metricType: "humidity", unit: "%RH" },
]);

const LEGACY_BINDINGS = Object.freeze([
  { ...METRICS[0], payloadKey: "temperature", componentKey: "dht22_interior" },
  { ...METRICS[1], payloadKey: "humidity", componentKey: "dht22_interior" },
  { ...METRICS[2], payloadKey: "exterior_temperature", componentKey: "sht30_ambient" },
  { ...METRICS[3], payloadKey: "exterior_humidity", componentKey: "sht30_ambient" },
]);

const SHT30_PRIMARY_BINDINGS = Object.freeze([
  { ...METRICS[0], payloadKey: "internal_temperature", componentKey: "dht22_interior" },
  { ...METRICS[1], payloadKey: "internal_humidity", componentKey: "dht22_interior" },
  { ...METRICS[2], payloadKey: "temperature", componentKey: "sht30_ambient" },
  { ...METRICS[3], payloadKey: "humidity", componentKey: "sht30_ambient" },
]);

function getSensorSemanticsVersion(payload = {}) {
  return Number(payload.sensor_semantics_version) >= SENSOR_SEMANTICS.SHT30_PRIMARY
    ? SENSOR_SEMANTICS.SHT30_PRIMARY
    : SENSOR_SEMANTICS.LEGACY;
}

function getMetricBindings(payload = {}) {
  return getSensorSemanticsVersion(payload) === SENSOR_SEMANTICS.SHT30_PRIMARY
    ? SHT30_PRIMARY_BINDINGS
    : LEGACY_BINDINGS;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function classifyDelivery(payload = {}) {
  if (
    payload.queued_backfill === true ||
    payload.captured_offline === true ||
    Number(payload.delivery_attempts || 0) > 0
  ) {
    return DELIVERY_CLASS.RETRANSMITTED;
  }
  if (Number(payload.sample_age_s || 0) > 120) return DELIVERY_CLASS.DELAYED;
  return DELIVERY_CLASS.ORIGINAL;
}

function assessMeasurementQuality({
  value,
  metricType,
  sensorEvidence,
  eventTime,
  ingestedAt,
}) {
  const reasons = [];
  const numeric = numericOrNull(value);
  if (value === null || value === undefined || value === "") {
    return { quality: DATA_QUALITY.MISSING, confidence: "CONFIRMED", reasons: ["value_missing"] };
  }
  if (numeric === null) {
    return { quality: DATA_QUALITY.INVALID, confidence: "CONFIRMED", reasons: ["value_not_numeric"] };
  }

  const eventMs = new Date(eventTime).getTime();
  const ingestMs = new Date(ingestedAt).getTime();
  if (!Number.isFinite(eventMs)) reasons.push("event_time_invalid");
  if (Number.isFinite(eventMs) && Number.isFinite(ingestMs) && eventMs > ingestMs + 5 * 60 * 1000) {
    reasons.push("event_time_in_future");
  }
  if (metricType === "humidity" && (numeric < 0 || numeric > 100)) {
    return { quality: DATA_QUALITY.INVALID, confidence: "CONFIRMED", reasons: [...reasons, "outside_physical_range"] };
  }
  if (metricType === "temperature" && (numeric < -100 || numeric > 150)) {
    reasons.push("outside_plausible_range");
  }

  const healthState = String(sensorEvidence?.health_state || "UNKNOWN").toUpperCase();
  const diagnosticConfidence = String(
    sensorEvidence?.diagnostic_confidence || "UNKNOWN"
  ).toUpperCase();
  if (healthState === "FAULT") {
    return { quality: DATA_QUALITY.INVALID, confidence: diagnosticConfidence, reasons: [...reasons, "component_fault"] };
  }
  if (healthState === "DEGRADED") reasons.push("component_degraded");
  if (healthState === "UNKNOWN") reasons.push("component_health_unknown");

  if (reasons.some((reason) => reason !== "component_health_unknown")) {
    return { quality: DATA_QUALITY.SUSPECT, confidence: diagnosticConfidence, reasons };
  }
  if (healthState === "HEALTHY") {
    return { quality: DATA_QUALITY.VALID, confidence: diagnosticConfidence, reasons };
  }
  return { quality: DATA_QUALITY.UNKNOWN, confidence: diagnosticConfidence, reasons };
}

function buildIdempotencyKey({ deviceId, telemetrySeq, eventTime, payload = {} }) {
  const sequence = numericOrNull(telemetrySeq);
  if (sequence !== null) return `seq:${sequence}`;
  const stablePayload = {
    device_id: deviceId,
    event_time: eventTime,
    temperature: numericOrNull(payload.temperature),
    humidity: numericOrNull(payload.humidity),
    exterior_temperature: numericOrNull(payload.exterior_temperature),
    exterior_humidity: numericOrNull(payload.exterior_humidity),
    internal_temperature: numericOrNull(payload.internal_temperature),
    internal_humidity: numericOrNull(payload.internal_humidity),
    sensor_semantics_version: getSensorSemanticsVersion(payload),
    alarm_event_count: numericOrNull(payload.alarm_event_count),
  };
  return `hash:${crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex")}`;
}

function buildMeasurementCandidates({ payload, componentHealth, eventTime, ingestedAt }) {
  return getMetricBindings(payload).map((metric) => {
    const quality = assessMeasurementQuality({
      value: payload?.[metric.payloadKey],
      metricType: metric.metricType,
      sensorEvidence: componentHealth?.components?.[metric.componentKey],
      eventTime,
      ingestedAt,
    });
    return {
      ...metric,
      value: numericOrNull(payload?.[metric.payloadKey]),
      ...quality,
    };
  });
}

function compareLegacyAndCore({ legacy, measurements }) {
  const expected = new Map(
    getMetricBindings(legacy).map((metric) => [
      metric.sensorKey,
      numericOrNull(legacy?.[metric.payloadKey]),
    ])
  );
  const actual = new Map((measurements || []).map((item) => [item.sensor_key || item.sensorKey, numericOrNull(item.value_numeric ?? item.value)]));
  const mismatches = [];
  for (const [sensorKey, expectedValue] of expected) {
    if (expectedValue === null) continue;
    const actualValue = actual.get(sensorKey);
    if (actualValue === null || actualValue === undefined || Math.abs(actualValue - expectedValue) > 1e-9) {
      mismatches.push({ sensor_key: sensorKey, reason: "value_mismatch" });
    }
  }
  return { parity: mismatches.length === 0, mismatches };
}

module.exports = {
  DATA_QUALITY,
  DELIVERY_CLASS,
  SENSOR_SEMANTICS,
  METRICS,
  getSensorSemanticsVersion,
  getMetricBindings,
  numericOrNull,
  classifyDelivery,
  assessMeasurementQuality,
  buildIdempotencyKey,
  buildMeasurementCandidates,
  compareLegacyAndCore,
};
