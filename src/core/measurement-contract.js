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

const METRICS = Object.freeze([
  { sensorKey: "interior_temperature", payloadKey: "temperature", metricType: "temperature", unit: "degC", componentKey: "dht22_interior" },
  { sensorKey: "interior_humidity", payloadKey: "humidity", metricType: "humidity", unit: "%RH", componentKey: "dht22_interior" },
  { sensorKey: "ambient_temperature", payloadKey: "exterior_temperature", metricType: "temperature", unit: "degC", componentKey: "sht30_ambient" },
  { sensorKey: "ambient_humidity", payloadKey: "exterior_humidity", metricType: "humidity", unit: "%RH", componentKey: "sht30_ambient" },
]);

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
    alarm_event_count: numericOrNull(payload.alarm_event_count),
  };
  return `hash:${crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex")}`;
}

function buildMeasurementCandidates({ payload, componentHealth, eventTime, ingestedAt }) {
  return METRICS.map((metric) => {
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
  const expected = new Map([
    ["interior_temperature", numericOrNull(legacy?.temperature)],
    ["interior_humidity", numericOrNull(legacy?.humidity)],
    ["ambient_temperature", numericOrNull(legacy?.exterior_temperature)],
    ["ambient_humidity", numericOrNull(legacy?.exterior_humidity)],
  ]);
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
  METRICS,
  numericOrNull,
  classifyDelivery,
  assessMeasurementQuality,
  buildIdempotencyKey,
  buildMeasurementCandidates,
  compareLegacyAndCore,
};
