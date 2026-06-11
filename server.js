require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const cors = require("cors");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;

const API_TOKEN = process.env.API_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEMP_LIMIT = parseFloat(process.env.TEMP_LIMIT || "25");
const COOLDOWN_MIN = parseInt(process.env.ALERT_COOLDOWN_MIN || "30", 10);

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL;

const OFFLINE_ALERT_SECONDS = parseInt(
  process.env.OFFLINE_ALERT_SECONDS || "180",
  10
);
const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(
  process.env.HEALTH_CHECK_INTERVAL_SECONDS || "60",
  10
);
const READING_MIN_INTERVAL_FACTOR = clamp(
  Number(process.env.READING_MIN_INTERVAL_FACTOR || "0.5"),
  0.5,
  1
);

const FRONTEND_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://app.ar3dparts.com",
  process.env.DASHBOARD_URL,
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);

app.use(express.json());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS não permitido"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------------- HELPERS --------------------
function getAuthToken(req) {
  return req.headers["authorization"];
}

function isAuthorized(req) {
  return getAuthToken(req) === API_TOKEN;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateTimePt(dateValue, withSeconds = false) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

function formatNumber(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function formatDurationCompact(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "-";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function sanitizeDeviceName(value, fallback) {
  const v = String(value || "").trim();
  return v || fallback;
}

function sanitizeLocation(value) {
  const v = String(value || "").trim();
  return v || "Localização por definir";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values, digits = 1) {
  if (!Array.isArray(values) || !values.length) return null;
  const avgValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(avgValue.toFixed(digits));
}

function getReportPeriodRange(period = "24h") {
  const normalized = String(period || "24h").toLowerCase();

  const map = {
    "1h": { hours: 1, label: "1 hora" },
    "6h": { hours: 6, label: "6 horas" },
    "12h": { hours: 12, label: "12 horas" },
    "24h": { hours: 24, label: "24 horas" },
    "7d": { hours: 24 * 7, label: "7 dias" },
  };

  const selected = map[normalized] || map["24h"];
  const sinceIso = new Date(
    Date.now() - selected.hours * 60 * 60 * 1000
  ).toISOString();

  return {
    key: normalized in map ? normalized : "24h",
    label: selected.label,
    hours: selected.hours,
    sinceIso,
  };
}

function formatPeriodLabelForFilename(periodKey = "24h") {
  return String(periodKey || "24h").replace(/[^a-zA-Z0-9_-]/g, "");
}

function getAlarmMaskLabel(mask) {
  const value = Number(mask) || 0;
  const labels = [];

  if (value & 0x01) labels.push("Temp. alta");
  if (value & 0x02) labels.push("Temp. baixa");
  if (value & 0x04) labels.push("Hum. alta");
  if (value & 0x08) labels.push("Hum. baixa");

  return labels.length ? labels.join(" + ") : "Alerta";
}

function getReadingAlarmMask(row, cfg) {
  const explicitMask = toOptionalNumber(row?.alarm_mask);
  if (explicitMask && explicitMask > 0) return explicitMask;

  const temperature = toOptionalNumber(row?.temperature);
  const humidity = toOptionalNumber(row?.humidity);
  let mask = 0;

  if (temperature !== null && temperature >= cfg.temp_high_c) mask |= 0x01;
  if (temperature !== null && temperature <= cfg.temp_low_c) mask |= 0x02;
  if (humidity !== null && humidity >= cfg.hum_high) mask |= 0x04;
  if (humidity !== null && humidity <= cfg.hum_low) mask |= 0x08;

  return mask;
}

function getEventTimeFromAge(createdAt, ageSeconds) {
  const createdTs = new Date(createdAt).getTime();
  const age = toOptionalNumber(ageSeconds);

  if (!Number.isFinite(createdTs) || age === null || age < 0) return createdAt;

  return new Date(createdTs - age * 1000).toISOString();
}

function buildReportAlertHistory(rows, cfg, sinceIso = null) {
  const events = [];
  let previousMask = 0;
  let lastAlarmEventCount = null;
  let lastAckCount = null;
  let ackWasActive = false;
  const sinceTs = sinceIso ? new Date(sinceIso).getTime() : null;

  const pushEvent = (event) => {
    const eventTs = new Date(event.when).getTime();
    if (Number.isFinite(sinceTs) && Number.isFinite(eventTs) && eventTs < sinceTs) {
      return;
    }
    events.push(event);
  };

  (rows || []).forEach((row) => {
    const currentMask = getReadingAlarmMask(row, cfg);
    const createdAt = row?.created_at;
    const temperature = toOptionalNumber(row?.temperature);
    const humidity = toOptionalNumber(row?.humidity);
    const valueText = [
      temperature !== null ? `${formatNumber(temperature, 1)} \u00b0C` : null,
      humidity !== null ? `${formatNumber(humidity, 0)} %` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const alarmEventCount = toOptionalNumber(row?.alarm_event_count);
    const alarmCounterAdvanced =
      currentMask > 0 &&
      alarmEventCount !== null &&
      alarmEventCount > 0 &&
      (lastAlarmEventCount === null
        ? previousMask === 0
        : alarmEventCount > lastAlarmEventCount);
    const maskChangedWithoutCounter =
      currentMask > 0 &&
      alarmEventCount === null &&
      (previousMask === 0 || currentMask !== previousMask);

    if (alarmCounterAdvanced || maskChangedWithoutCounter) {
      pushEvent({
        kind: "alert",
        color: "#fee2e2",
        stroke: "#fecaca",
        title: row?.alarm_reason || getAlarmMaskLabel(currentMask),
        when: getEventTimeFromAge(createdAt, row?.alarm_event_age_s),
        deviceTime: row?.alarm_event_time || null,
        detail: valueText || "-",
      });
    }

    const ackCount = toOptionalNumber(row?.alarm_ack_count) || 0;
    const ackActive =
      row?.alarm_ack === true ||
      String(row?.alarm_ack || "").toLowerCase() === "true" ||
      String(row?.device_status || "").toLowerCase().includes("ack");
    const ackCounterAdvanced =
      ackCount > 0 &&
      (lastAckCount === null
        ? ackActive || row?.alarm_ack_time || row?.alarm_ack_age_s !== null
        : ackCount > lastAckCount);

    if (ackCounterAdvanced || (ackCount === 0 && ackActive && !ackWasActive)) {
      pushEvent({
        kind: "ack",
        color: "#dbeafe",
        stroke: "#bfdbfe",
        title: "ACK confirmado",
        when: getEventTimeFromAge(createdAt, row?.alarm_ack_age_s),
        deviceTime: row?.alarm_ack_time || null,
        detail: valueText || "Alerta reconhecido no dispositivo",
      });
    }

    if (currentMask === 0 && previousMask > 0) {
      pushEvent({
        kind: "normal",
        color: "#dcfce7",
        stroke: "#bbf7d0",
        title: "Normalizado",
        when: createdAt,
        deviceTime: null,
        detail: valueText || "Valores novamente dentro dos limites",
      });
    }

    if (alarmEventCount !== null) lastAlarmEventCount = alarmEventCount;
    if (ackCount !== null) lastAckCount = Math.max(lastAckCount || 0, ackCount);
    ackWasActive = ackActive;
    previousMask = currentMask;
  });

  return events;
}

function formatReportAlertTime(event) {
  const deviceTime = String(event?.deviceTime || "").trim();
  if (deviceTime && deviceTime !== "-") return deviceTime;
  return formatDateTimePt(event?.when, true);
}

function formatReportAlertDate(event) {
  const d = new Date(event?.when);
  if (Number.isNaN(d.getTime())) return "Data por confirmar";

  return d.toLocaleDateString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getReportEventKind(row) {
  const event = String(row?.event || row?.kind || "").toLowerCase();
  const title = String(row?.title || "").toLowerCase();

  if (event.includes("ack") || title.includes("ack")) return "ack";
  if (event.includes("resolved") || event.includes("normal")) return "normal";
  return "alert";
}

function getReportEventStyle(kind) {
  if (kind === "ack") {
    return { color: "#dbeafe", stroke: "#bfdbfe" };
  }

  if (kind === "normal") {
    return { color: "#dcfce7", stroke: "#bbf7d0" };
  }

  return { color: "#fee2e2", stroke: "#fecaca" };
}

function getReportEventType(event) {
  const text = `${event?.type || ""} ${event?.title || ""} ${event?.detail || ""}`.toLowerCase();
  if (text.includes("temp")) return "temperature";
  if (text.includes("hum")) return "humidity";
  if (text.includes("offline") || text.includes("online")) return "offline";
  if (text.includes("ack")) return "system";
  return "";
}

function buildStoredReportAlertHistory(alertRows) {
  return (alertRows || [])
    .map((row, index) => {
      const kind = getReportEventKind(row);
      const style = getReportEventStyle(kind);
      const temperature = toOptionalNumber(row?.temperature);
      const humidity = toOptionalNumber(row?.humidity);
      const valueText = [
        temperature !== null ? `${formatNumber(temperature, 1)} \u00b0C` : null,
        humidity !== null ? `${formatNumber(humidity, 0)} %` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return {
        id: row?.id || `stored-${index}`,
        kind,
        color: style.color,
        stroke: style.stroke,
        title: row?.title || (kind === "ack" ? "ACK confirmado" : "Evento registado"),
        when: row?.sent_at || row?.created_at,
        deviceTime: null,
        detail: row?.message || valueText || "-",
        source: "alerts",
      };
    })
    .filter((event) => {
      const ts = new Date(event.when).getTime();
      return Number.isFinite(ts);
    });
}

function mergeReportAlertHistory(storedEvents, derivedEvents) {
  const merged = [...(storedEvents || [])];
  const storedSourceEvents = storedEvents || [];

  (derivedEvents || []).forEach((event) => {
    const eventTs = new Date(event.when).getTime();
    const alreadyStored = storedSourceEvents.some((storedEvent) => {
      const storedTs = new Date(storedEvent.when).getTime();
      if (!Number.isFinite(eventTs) || !Number.isFinite(storedTs)) return false;
      if (storedEvent.kind !== event.kind) return false;
      if (Math.abs(storedTs - eventTs) > 90000) return false;
      const storedType = getReportEventType(storedEvent);
      const eventType = getReportEventType(event);
      if (storedType && eventType && storedType !== eventType) return false;

      return (
        storedEvent.title === event.title ||
        storedEvent.kind === "ack" ||
        storedEvent.kind === "normal" ||
        storedEvent.kind === "alert"
      );
    });

    if (!alreadyStored) {
      merged.push({ ...event, source: event.source || "readings" });
    }
  });

  return merged.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
}

function validateConfigNumbers(payload) {
  const errors = [];

  const tempLow =
    payload.temp_low_c !== undefined ? Number(payload.temp_low_c) : undefined;
  const tempHigh =
    payload.temp_high_c !== undefined ? Number(payload.temp_high_c) : undefined;
  const humLow =
    payload.hum_low !== undefined ? Number(payload.hum_low) : undefined;
  const humHigh =
    payload.hum_high !== undefined ? Number(payload.hum_high) : undefined;
  const hyst =
    payload.hyst_c !== undefined ? Number(payload.hyst_c) : undefined;
  const hystHum =
    payload.hyst_hum !== undefined ? Number(payload.hyst_hum) : undefined;
  const sendInterval =
    payload.send_interval_s !== undefined
      ? Number(payload.send_interval_s)
      : undefined;
  const standby =
    payload.display_standby_min !== undefined
      ? Number(payload.display_standby_min)
      : undefined;

  if (tempLow !== undefined && !Number.isFinite(tempLow)) {
    errors.push("temp_low_c inválido");
  }

  if (tempHigh !== undefined && !Number.isFinite(tempHigh)) {
    errors.push("temp_high_c inválido");
  }

  if (
    tempLow !== undefined &&
    tempHigh !== undefined &&
    Number.isFinite(tempLow) &&
    Number.isFinite(tempHigh) &&
    tempLow >= tempHigh
  ) {
    errors.push("temp_low_c deve ser inferior a temp_high_c");
  }

  if (humLow !== undefined && !Number.isFinite(humLow)) {
    errors.push("hum_low inválido");
  }

  if (humHigh !== undefined && !Number.isFinite(humHigh)) {
    errors.push("hum_high inválido");
  }

  if (
    humLow !== undefined &&
    humHigh !== undefined &&
    Number.isFinite(humLow) &&
    Number.isFinite(humHigh) &&
    humLow >= humHigh
  ) {
    errors.push("hum_low deve ser inferior a hum_high");
  }

  if (hyst !== undefined && (!Number.isFinite(hyst) || hyst < 0)) {
    errors.push("hyst_c inválido");
  }

  if (hystHum !== undefined && (!Number.isFinite(hystHum) || hystHum < 0)) {
    errors.push("hyst_hum inválido");
  }

  if (
    sendInterval !== undefined &&
    (!Number.isFinite(sendInterval) || sendInterval < 5)
  ) {
    errors.push("send_interval_s deve ser pelo menos 5");
  }

  if (standby !== undefined && (!Number.isFinite(standby) || standby < 0)) {
    errors.push("display_standby_min inválido");
  }

  return errors;
}

function getDeviceConfig(deviceRow) {
  const cfg = deviceRow?.config || {};
  const alertState = cfg.alert_state || {};

  return {
    temp_low_c: toNumberOrDefault(cfg.temp_low_c, 18),
    temp_high_c: toNumberOrDefault(cfg.temp_high_c, TEMP_LIMIT),
    hum_low: toNumberOrDefault(cfg.hum_low, 30),
    hum_high: toNumberOrDefault(cfg.hum_high, 60),
    hyst_c: toNumberOrDefault(cfg.hyst_c, 0.5),
    hyst_hum: toNumberOrDefault(cfg.hyst_hum, 2),
    send_interval_s: toNumberOrDefault(cfg.send_interval_s, 30),
    display_standby_min: toNumberOrDefault(cfg.display_standby_min, 10),
    alert_state: {
      temp_active: Boolean(alertState.temp_active),
      hum_active: Boolean(alertState.hum_active),
      offline_active: Boolean(alertState.offline_active),
      temp_last_sent_at: alertState.temp_last_sent_at || null,
      hum_last_sent_at: alertState.hum_last_sent_at || null,
      offline_last_sent_at: alertState.offline_last_sent_at || null,
      temp_last_email_attempt_at: alertState.temp_last_email_attempt_at || null,
      hum_last_email_attempt_at: alertState.hum_last_email_attempt_at || null,
      offline_last_email_attempt_at: alertState.offline_last_email_attempt_at || null,
      temp_last_email_error: alertState.temp_last_email_error || null,
      hum_last_email_error: alertState.hum_last_email_error || null,
      offline_last_email_error: alertState.offline_last_email_error || null,
      temp_last_email_status: toOptionalNumber(alertState.temp_last_email_status),
      hum_last_email_status: toOptionalNumber(alertState.hum_last_email_status),
      offline_last_email_status: toOptionalNumber(alertState.offline_last_email_status),
      temp_last_email_message: alertState.temp_last_email_message || null,
      hum_last_email_message: alertState.hum_last_email_message || null,
      offline_last_email_message: alertState.offline_last_email_message || null,
      temp_last_resolved_at: alertState.temp_last_resolved_at || null,
      hum_last_resolved_at: alertState.hum_last_resolved_at || null,
      offline_last_resolved_at: alertState.offline_last_resolved_at || null,
      alarm_last_ack_count: toOptionalNumber(alertState.alarm_last_ack_count) || 0,
    },
  };
}

function shouldStoreReading({ latestReading, cfg, incoming }) {
  const sampleAgeS = toOptionalNumber(incoming.sample_age_s);
  const sampleEpoch = toOptionalNumber(incoming.sample_epoch);
  const incomingTs =
    sampleEpoch !== null && sampleEpoch > 1700000000
      ? sampleEpoch * 1000
      : sampleAgeS !== null && sampleAgeS >= 0
      ? Date.now() - sampleAgeS * 1000
      : Date.now();

  const expectedMs =
    Number.isFinite(Number(cfg?.send_interval_s)) && Number(cfg.send_interval_s) > 0
      ? Number(cfg.send_interval_s) * 1000
      : 30 * 1000;
  const minIntervalMs = expectedMs * READING_MIN_INTERVAL_FACTOR;
  const isBackfill = isOfflineCapturedReading(incoming, cfg);

  if (!latestReading?.created_at) return true;

  const latestTs = new Date(latestReading.created_at).getTime();
  if (!Number.isFinite(latestTs)) return true;

  const latestAlarmMask = toOptionalNumber(latestReading.alarm_mask) || 0;
  const incomingAlarmMask = toOptionalNumber(incoming.alarm_mask) || 0;
  if (incomingAlarmMask !== latestAlarmMask) return true;

  const latestAlarmEventCount = toOptionalNumber(latestReading.alarm_event_count) || 0;
  const incomingAlarmEventCount = toOptionalNumber(incoming.alarm_event_count) || 0;
  if (incomingAlarmEventCount > latestAlarmEventCount) return true;

  const latestAckCount = toOptionalNumber(latestReading.alarm_ack_count) || 0;
  const incomingAckCount = toOptionalNumber(incoming.alarm_ack_count) || 0;
  if (incomingAckCount > latestAckCount) return true;

  const elapsedMs = incomingTs - latestTs;

  if (isBackfill && Number.isFinite(elapsedMs) && elapsedMs <= -minIntervalMs) {
    return true;
  }

  if (!Number.isFinite(elapsedMs) || elapsedMs >= minIntervalMs) return true;

  return false;
}

function getIncomingReadingCreatedAt(sampleAgeS, sampleEpoch) {
  const epoch = toOptionalNumber(sampleEpoch);
  if (epoch !== null && epoch > 1700000000) {
    const timestamp = epoch * 1000;
    const now = Date.now();
    const maxBackfillMs = 60 * 60 * 24 * 30 * 1000;

    if (timestamp <= now + 5 * 60 * 1000 && timestamp >= now - maxBackfillMs) {
      return new Date(timestamp).toISOString();
    }
  }

  const age = toOptionalNumber(sampleAgeS);
  if (age === null || age < 0) return nowIso();

  const maxBackfillAgeSeconds = 60 * 60 * 24 * 30;
  const safeAge = Math.min(age, maxBackfillAgeSeconds);
  return new Date(Date.now() - safeAge * 1000).toISOString();
}

function isOfflineCapturedReading(incoming, cfg) {
  const deliveryAttempts = toOptionalNumber(incoming.delivery_attempts) || 0;
  const sampleAgeS = toOptionalNumber(incoming.sample_age_s);
  const sampleEpoch = toOptionalNumber(incoming.sample_epoch);
  const expectedMs =
    Number.isFinite(Number(cfg?.send_interval_s)) && Number(cfg.send_interval_s) > 0
      ? Number(cfg.send_interval_s) * 1000
      : 30 * 1000;

  if (deliveryAttempts > 1) return true;
  if (sampleAgeS !== null && sampleAgeS * 1000 > Math.max(expectedMs, 60 * 1000)) {
    return true;
  }

  if (sampleEpoch !== null && sampleEpoch > 1700000000) {
    const ageMs = Date.now() - sampleEpoch * 1000;
    return ageMs > Math.max(expectedMs, 60 * 1000);
  }

  return false;
}

function isMissingReadingTelemetryColumnError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return (
    text.includes("PGRST204") ||
    text.includes("42703") ||
    /column .*telemetry_seq/i.test(text) ||
    /column .*sample_age_s/i.test(text) ||
    /column .*sample_epoch/i.test(text) ||
    /column .*delivery_attempts/i.test(text) ||
    /column .*offline_captured/i.test(text)
  );
}

function isMissingDeviceContactColumnError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return (
    text.includes("PGRST204") ||
    text.includes("42703") ||
    /column .*last_contact_at/i.test(text)
  );
}

function mergeAlertStateIntoConfig(deviceRow, nextAlertState) {
  const currentConfig = deviceRow?.config || {};
  const currentAlertState = currentConfig.alert_state || {};

  return {
    ...currentConfig,
    alert_state: {
      ...currentAlertState,
      ...nextAlertState,
    },
  };
}

function getDeviceStatus({
  online,
  temperature,
  humidity,
  temp_low_c,
  temp_high_c,
  hum_low,
  hum_high,
}) {
  if (!online) return "offline";

  const tempCritical =
    temperature > temp_high_c + 2 || temperature < temp_low_c - 2;
  const humCritical = humidity > hum_high + 5 || humidity < hum_low - 5;

  if (tempCritical || humCritical) return "alarm";

  const tempAlert = temperature > temp_high_c || temperature < temp_low_c;
  const humAlert = humidity > hum_high || humidity < hum_low;

  if (tempAlert || humAlert) return "alert";

  return "normal";
}

function getOfflineThresholdMs(sendIntervalS) {
  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 30 * 1000;

  return Math.max(OFFLINE_ALERT_SECONDS * 1000, expectedMs * 6);
}

function getTemperatureAlertDirection(temperature, cfg) {
  if (temperature > cfg.temp_high_c) {
    return {
      breached: true,
      side: "high",
      limit: cfg.temp_high_c,
      label: "acima do limite",
    };
  }

  if (temperature < cfg.temp_low_c) {
    return {
      breached: true,
      side: "low",
      limit: cfg.temp_low_c,
      label: "abaixo do limite",
    };
  }

  return {
    breached: false,
    side: "normal",
    limit: null,
    label: "normal",
  };
}

function getHumidityAlertDirection(humidity, cfg) {
  if (humidity > cfg.hum_high) {
    return {
      breached: true,
      side: "high",
      limit: cfg.hum_high,
      label: "acima do limite",
    };
  }

  if (humidity < cfg.hum_low) {
    return {
      breached: true,
      side: "low",
      limit: cfg.hum_low,
      label: "abaixo do limite",
    };
  }

  return {
    breached: false,
    side: "normal",
    limit: null,
    label: "normal",
  };
}

function statusToDbLabel(status) {
  const normalizedStatus = normalizeDeviceStatus(status);
  const map = {
    normal: "NORMAL",
    alert: "ALERT",
    alarm: "ALARM",
    alarm_ack: "ALARM_ACK",
    offline: "OFFLINE",
    sensor_fail: "SENSOR_FAIL",
    setup_wifi: "SETUP_WIFI",
  };
  return map[normalizedStatus] || "NORMAL";
}

function statusToApiLabel(status) {
  const normalizedStatus = normalizeDeviceStatus(status);
  const map = {
    normal: "normal",
    alert: "alert",
    alarm: "alarm",
    alarm_ack: "alarm_ack",
    offline: "offline",
    sensor_fail: "sensor_fail",
    setup_wifi: "setup_wifi",
  };
  return map[normalizedStatus] || "normal";
}

function normalizeDeviceStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!value) return "normal";
  if (value.includes("ack")) return "alarm_ack";
  if (value.includes("sensor")) return "sensor_fail";
  if (value.includes("setup")) return "setup_wifi";
  if (value.includes("offline") || value.includes("no_wifi")) return "offline";
  if (value.includes("alarm") || value.includes("critical")) return "alarm";
  if (value.includes("alert") || value.includes("warning")) return "alert";
  if (value.includes("normal") || value.includes("online") || value.includes("ok")) {
    return "normal";
  }

  return "normal";
}

function resolveTelemetryStatus({
  online = true,
  incomingStatus,
  alarmAck = false,
  alarmMask = null,
  computedStatus = "normal",
}) {
  if (!online) return "offline";

  const normalizedIncoming = normalizeDeviceStatus(incomingStatus);
  const normalizedComputed = normalizeDeviceStatus(computedStatus);
  const numericAlarmMask = toOptionalNumber(alarmMask);
  const hasActiveAlarmMask = numericAlarmMask !== null && numericAlarmMask > 0;
  const computedHasBreach =
    normalizedComputed === "alarm" || normalizedComputed === "alert";

  if (
    normalizedIncoming === "alarm_ack" ||
    (toBoolean(alarmAck) && (hasActiveAlarmMask || computedHasBreach))
  ) {
    return "alarm_ack";
  }

  if (
    normalizedIncoming === "sensor_fail" ||
    normalizedIncoming === "setup_wifi" ||
    normalizedIncoming === "offline"
  ) {
    return normalizedIncoming;
  }

  if (hasActiveAlarmMask) return "alarm";

  if (normalizedIncoming === "alarm" && computedHasBreach) return "alarm";
  if (normalizedIncoming === "alert" && computedHasBreach) return "alert";

  return normalizedComputed;
}

function canSendByCooldown(lastSentAt) {
  if (!lastSentAt) return true;
  const diffMs = Date.now() - new Date(lastSentAt).getTime();
  return diffMs >= COOLDOWN_MIN * 60 * 1000;
}

function getCommunicationHealth({
  readings,
  sendIntervalS,
  deviceLastSeen,
  periodHours = 24,
}) {
  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 30 * 1000;

  const offlineThresholdMs = getOfflineThresholdMs(sendIntervalS);
  const periodMs = periodHours * 60 * 60 * 1000;
  const expectedReadings = Math.max(1, Math.round(periodMs / expectedMs));

  const sorted = [...(readings || [])]
    .map((item) => ({
      timestamp: new Date(item.created_at).getTime(),
    }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const receivedReadings = sorted.length;
  const deliveryPct = Math.max(
    0,
    Math.min(100, Math.round((receivedReadings / expectedReadings) * 100))
  );

  const lastDelayMs = deviceLastSeen
    ? Date.now() - new Date(deviceLastSeen).getTime()
    : null;

  if (!sorted.length) {
    return {
      score: 0,
      label: "Sem dados",
      tone: "neutral",
      summary: "Sem leituras suficientes para avaliar.",
      delivery_pct: deliveryPct,
      regularity_pct: 0,
      expected_readings: expectedReadings,
      received_readings: receivedReadings,
      expected_interval_ms: expectedMs,
      offline_threshold_ms: offlineThresholdMs,
      last_delay_ms: lastDelayMs,
      max_gap_ms: null,
      relevant_gap_count: 0,
      severe_gap_count: 0,
    };
  }

  const relevantGapThresholdMs = Math.max(expectedMs * 3.5, 150 * 1000);
  const severeGapThresholdMs = Math.max(expectedMs * 6, 5 * 60 * 1000);

  let maxGapMs = 0;
  let relevantGapCount = 0;
  let severeGapCount = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const delta = sorted[i].timestamp - sorted[i - 1].timestamp;
    if (!Number.isFinite(delta) || delta <= 0) continue;

    if (delta > maxGapMs) maxGapMs = delta;
    if (delta >= relevantGapThresholdMs) relevantGapCount += 1;
    if (delta >= severeGapThresholdMs) severeGapCount += 1;
  }

  let penalty = 0;
  penalty += relevantGapCount * 2;
  penalty += severeGapCount * 8;

  if (lastDelayMs !== null) {
    if (lastDelayMs > Math.max(expectedMs * 4, 2 * 60 * 1000)) penalty += 6;
    if (lastDelayMs > Math.max(expectedMs * 6, offlineThresholdMs * 0.7)) {
      penalty += 10;
    }
  }

  const regularityPct = Math.max(0, Math.min(100, Math.round(deliveryPct - penalty)));

  let label = "Estável";
  let tone = "good";
  let summary = "Boa cobertura com apenas pequenas falhas pontuais.";

  const isOffline = lastDelayMs !== null && lastDelayMs > offlineThresholdMs;

  if (isOffline) {
    label = "Offline";
    tone = "bad";
    summary = "Sem comunicação recente do dispositivo.";
  } else if (
    deliveryPct >= 98 &&
    relevantGapCount <= 1 &&
    severeGapCount === 0
  ) {
    label = "Excelente";
    tone = "good";
    summary = "Cobertura muito alta e comunicação muito consistente.";
  } else if (
    deliveryPct >= 90 &&
    severeGapCount === 0
  ) {
    label = "Estável";
    tone = "good";
    summary = "Boa cobertura com apenas pequenas falhas pontuais.";
  } else if (deliveryPct >= 80 && severeGapCount <= 2) {
    label = "Com falhas";
    tone = "warn";
    summary = "Existem falhas pontuais, mas a comunicação continua aceitável.";
  } else {
    label = "Instável";
    tone = "bad";
    summary = "Perdas ou gaps relevantes na comunicação.";
  }

  return {
    score: regularityPct,
    label,
    tone,
    summary,
    delivery_pct: deliveryPct,
    regularity_pct: regularityPct,
    expected_readings: expectedReadings,
    received_readings: receivedReadings,
    expected_interval_ms: expectedMs,
    offline_threshold_ms: offlineThresholdMs,
    last_delay_ms: lastDelayMs,
    max_gap_ms: maxGapMs || null,
    relevant_gap_count: relevantGapCount,
    severe_gap_count: severeGapCount,
  };
}

// -------------------- HEALTH / PREDICTIVE ENGINE --------------------
function getMinutesDiff(a, b) {
  const diffMs = new Date(b).getTime() - new Date(a).getTime();
  return diffMs / 60000;
}

function getTrendDirectionLabel(direction, type) {
  if (direction === "up") {
    return type === "temperature"
      ? "Temperatura a subir de forma consistente"
      : "Humidade a subir de forma consistente";
  }

  if (direction === "down") {
    return type === "temperature"
      ? "Temperatura a descer de forma consistente"
      : "Humidade a descer de forma consistente";
  }

  return "Sem tendência relevante";
}

function getMetricLabel(type) {
  return type === "temperature" ? "Temperatura" : "Humidade";
}

function getDeviationBand(type, deviation) {
  const mild = type === "temperature" ? 0.8 : 5;
  const moderate = type === "temperature" ? 2 : 12;

  if (deviation >= moderate) return "grave";
  if (deviation >= mild) return "moderado";
  return "ligeiro";
}

function getConsecutiveBreachMinutes(clean, side, limit) {
  if (!clean.length || !side || !Number.isFinite(limit)) return 0;

  let first = clean[clean.length - 1];
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    const row = clean[i];
    const breached = side === "high" ? row.value > limit : row.value < limit;
    if (!breached) break;
    first = row;
  }

  return Math.max(
    0,
    Math.round(getMinutesDiff(first.created_at, clean[clean.length - 1].created_at))
  );
}

function getTrustedBreachMinutes(clean, type, side) {
  if (!clean.length || !side) return null;

  const latest = clean[clean.length - 1];
  const ageSeconds = toOptionalNumber(latest?.alarm_event_age_s);
  const mask = toOptionalNumber(latest?.alarm_mask);

  if (ageSeconds === null || ageSeconds < 0 || mask === null || mask <= 0) {
    return null;
  }

  const expectedMask =
    type === "temperature"
      ? side === "high"
        ? 0x01
        : 0x02
      : side === "high"
      ? 0x04
      : 0x08;

  if ((mask & expectedMask) === 0) return null;

  return Math.max(0, Math.round(ageSeconds / 60));
}

function buildRiskNarrative({ type, side, deviation, durationMin, direction, etaMinutes }) {
  const metric = getMetricLabel(type);
  const isHigh = side === "high";
  const band = getDeviationBand(type, deviation);
  const hasTrustedDuration = Number.isFinite(durationMin);
  const persistent = hasTrustedDuration && durationMin >= 30;
  const short = hasTrustedDuration && durationMin > 0 && durationMin < 15 && band === "ligeiro";
  const trendText = getTrendDirectionLabel(direction, type).toLowerCase();

  if (side) {
    const title =
      band === "grave"
        ? "Risco elevado"
        : band === "moderado" || persistent
        ? "Risco moderado"
        : "Risco ligeiro";

    const detail = short
      ? `${metric} ${isHigh ? "acima" : "abaixo"} do limite, mas ainda por curta duração.`
      : persistent
      ? `${metric} ${isHigh ? "acima" : "abaixo"} do limite há ~${durationMin} min.`
      : !hasTrustedDuration
      ? `${metric} ${isHigh ? "acima" : "abaixo"} do limite na leitura atual.`
      : `${metric} ${isHigh ? "acima" : "abaixo"} do limite com desvio ${band}.`;

    let cause = `${metric} fora do limite definido.`;
    let action = "Confirmar condições do equipamento e acompanhar a próxima leitura.";

    if (type === "temperature" && isHigh) {
      cause = direction === "up"
        ? "Subida gradual compatível com abertura prolongada, carga recente ou refrigeração insuficiente."
        : "Valor acima do limite sem subida forte; pode ser exposição curta ou recuperação lenta.";
      action = persistent || band !== "ligeiro"
        ? "Verificar porta, ventilação e carga; reduzir aberturas até normalizar."
        : "Confirmar fecho da porta e aguardar a próxima leitura.";
    } else if (type === "temperature" && !isHigh) {
      cause = direction === "down"
        ? "Descida gradual compatível com regulação demasiado baixa ou zona fria."
        : "Valor abaixo do limite sem tendência forte; pode ser oscilação curta.";
      action = persistent || band !== "ligeiro"
        ? "Confirmar setpoint e posição do sensor; ajustar refrigeração se necessário."
        : "Acompanhar a próxima leitura antes de alterar configuração.";
    } else if (type === "humidity" && isHigh) {
      cause = direction === "up"
        ? "Humidade a subir, compatível com entrada de ar húmido, porta aberta ou condensação."
        : "Humidade acima do limite, possivelmente por condensação ou ventilação reduzida.";
      action = persistent || band !== "ligeiro"
        ? "Verificar vedação, condensação e tempo de porta aberta."
        : "Confirmar fecho e observar se baixa nas próximas leituras.";
    } else if (type === "humidity" && !isHigh) {
      cause = direction === "down"
        ? "Humidade a descer, compatível com secagem excessiva ou circulação intensa."
        : "Humidade abaixo do limite sem tendência forte; pode ser variação pontual.";
      action = persistent || band !== "ligeiro"
        ? "Rever ventilação e exposição do produto; confirmar posição do sensor."
        : "Acompanhar sem intervenção imediata se recuperar.";
    }

    return { title, detail, cause, action, band, persistent, short };
  }

  if (Number.isFinite(etaMinutes)) {
    return {
      title: etaMinutes <= 45 ? "Risco elevado" : "Risco moderado",
      detail: `${metric} aproxima-se do limite; possível alerta em ~${Math.max(1, Math.round(etaMinutes))} min.`,
      cause: `${trendText}; ainda dentro do limite, mas com aproximação consistente.`,
      action: type === "temperature"
        ? "Reduzir aberturas e confirmar se a refrigeração está estável."
        : "Confirmar porta, condensação e circulação de ar.",
      band: etaMinutes <= 45 ? "grave" : "moderado",
      persistent: false,
      short: false,
    };
  }

  return {
    title: "Risco baixo",
    detail: "Sem tendência relevante nas últimas leituras recentes.",
    cause: "Dados dentro do comportamento esperado.",
    action: "Manter monitorização normal.",
    band: "baixo",
    persistent: false,
    short: false,
  };
}

function buildNearLimitSignal({ latest, lowLimit, highLimit, type }) {
  if (!latest) return null;

  const margin = type === "temperature" ? 1.0 : 6;
  const metric = getMetricLabel(type);
  const candidates = [];

  if (Number.isFinite(highLimit) && latest.value <= highLimit) {
    candidates.push({
      side: "high",
      limit: highLimit,
      distance: highLimit - latest.value,
    });
  }

  if (Number.isFinite(lowLimit) && latest.value >= lowLimit) {
    candidates.push({
      side: "low",
      limit: lowLimit,
      distance: latest.value - lowLimit,
    });
  }

  const nearest = candidates
    .filter((candidate) => candidate.distance >= 0 && candidate.distance <= margin)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) return null;

  const isHigh = nearest.side === "high";

  return {
    active: true,
    severity: "medium",
    eta_minutes: null,
    title: "Atenção preventiva",
    detail: `${metric} muito próxima do limite ${isHigh ? "máximo" : "mínimo"} (${formatMetricValue(nearest.limit, type)}).`,
    cause: "Valor ainda dentro do intervalo, mas com margem curta face ao limite configurado.",
    action: type === "temperature"
      ? "Confirmar porta, carga e estabilidade da refrigeração antes de atingir o limite."
      : "Confirmar porta, condensação e circulação de ar antes de atingir o limite.",
    source: type,
    score: 60,
    current_value: latest.value,
    limit: nearest.limit,
    deviation: nearest.distance,
    state: nearest.side,
  };
}

function buildPredictiveSignal({
  readings,
  valueKey,
  lowLimit,
  highLimit,
  type,
}) {
  const clean = (readings || [])
    .map((r) => ({
      created_at: r.created_at,
      value: Number(r?.[valueKey]),
      alarm_mask: toOptionalNumber(r?.alarm_mask),
      alarm_event_age_s: toOptionalNumber(r?.alarm_event_age_s),
    }))
    .filter((r) => r.created_at && Number.isFinite(r.value))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const latest = clean[clean.length - 1] || null;
  const latestSide =
    latest && Number.isFinite(highLimit) && latest.value > highLimit
      ? "high"
      : latest && Number.isFinite(lowLimit) && latest.value < lowLimit
      ? "low"
      : null;

  if (latestSide) {
    const latestLimit = latestSide === "high" ? highLimit : lowLimit;
    const latestDeviation = Math.abs(latest.value - latestLimit);
    const latestDurationMin = getTrustedBreachMinutes(clean, type, latestSide);
    const narrative = buildRiskNarrative({
      type,
      side: latestSide,
      deviation: latestDeviation,
      durationMin: latestDurationMin,
      direction: "flat",
      etaMinutes: 0,
    });
    const severity =
      narrative.band === "grave" || narrative.persistent
        ? "high"
        : narrative.band === "moderado"
        ? "medium"
        : "low";

    return {
      active: true,
      severity,
      eta_minutes: 0,
      title: narrative.title,
      detail: narrative.detail,
      cause: narrative.cause,
      action: narrative.action,
      source: type,
      score: severity === "high" ? 100 : severity === "medium" ? 78 : 55,
      current_value: latest.value,
      limit: latestLimit,
      deviation: latestDeviation,
      duration_minutes: latestDurationMin,
      state: latestSide,
    };
  }

  const nearLimitSignal = buildNearLimitSignal({
    latest,
    lowLimit,
    highLimit,
    type,
  });

  if (nearLimitSignal) return nearLimitSignal;

  if (clean.length < 6) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  const recent = clean.slice(-6);
  const current = recent[recent.length - 1];
  const deltas = [];
  const slopes = [];

  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const delta = curr.value - prev.value;
    const minutes = getMinutesDiff(prev.created_at, curr.created_at);

    if (!Number.isFinite(delta) || !Number.isFinite(minutes) || minutes <= 0) {
      continue;
    }

    deltas.push(delta);
    slopes.push(delta / minutes);
  }

  if (deltas.length < 5 || slopes.length < 5) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  const upCount = deltas.filter((d) => d > 0).length;
  const downCount = deltas.filter((d) => d < 0).length;

  let direction = "flat";
  if (upCount >= 5) direction = "up";
  if (downCount >= 5) direction = "down";

  const immediateSide =
    Number.isFinite(highLimit) && current.value > highLimit
      ? "high"
      : Number.isFinite(lowLimit) && current.value < lowLimit
      ? "low"
      : null;

  if (immediateSide) {
    const immediateLimit = immediateSide === "high" ? highLimit : lowLimit;
    const immediateDeviation = Math.abs(current.value - immediateLimit);
    const immediateDurationMin = getTrustedBreachMinutes(clean, type, immediateSide);
    const narrative = buildRiskNarrative({
      type,
      side: immediateSide,
      deviation: immediateDeviation,
      durationMin: immediateDurationMin,
      direction,
      etaMinutes: 0,
    });
    const severity =
      narrative.band === "grave" || narrative.persistent
        ? "high"
        : narrative.band === "moderado"
        ? "medium"
        : "low";

    return {
      active: true,
      severity,
      eta_minutes: 0,
      title: narrative.title,
      detail: narrative.detail,
      cause: narrative.cause,
      action: narrative.action,
      source: type,
      score: severity === "high" ? 100 : severity === "medium" ? 78 : 55,
      current_value: current.value,
      limit: immediateLimit,
      deviation: immediateDeviation,
      duration_minutes: immediateDurationMin,
      state: immediateSide,
    };
  }

  if (direction === "flat") {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  const avgSlope =
    slopes.reduce((sum, value) => sum + value, 0) / slopes.length;
  const absAvgSlope = Math.abs(avgSlope);

  const targetLimit =
    direction === "up" ? highLimit : direction === "down" ? lowLimit : null;

  if (!Number.isFinite(targetLimit)) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  const currentSide =
    Number.isFinite(highLimit) && current.value > highLimit
      ? "high"
      : Number.isFinite(lowLimit) && current.value < lowLimit
      ? "low"
      : null;
  const currentLimit =
    currentSide === "high" ? highLimit : currentSide === "low" ? lowLimit : targetLimit;
  const currentDeviation = currentSide ? Math.abs(current.value - currentLimit) : 0;
  const durationMin = getTrustedBreachMinutes(clean, type, currentSide);
  const distance = Math.abs(targetLimit - current.value);
  const speedThreshold = type === "temperature" ? 0.03 : 0.18;

  if (currentSide) {
    const narrative = buildRiskNarrative({
      type,
      side: currentSide,
      deviation: currentDeviation,
      durationMin,
      direction,
      etaMinutes: 0,
    });
    const severity =
      narrative.band === "grave" || narrative.persistent
        ? "high"
        : narrative.band === "moderado"
        ? "medium"
        : "low";

    return {
      active: true,
      severity,
      eta_minutes: 0,
      title: narrative.title,
      detail: narrative.detail,
      cause: narrative.cause,
      action: narrative.action,
      source: type,
      score: severity === "high" ? 100 : severity === "medium" ? 78 : 55,
      current_value: current.value,
      limit: currentLimit,
      deviation: currentDeviation,
      duration_minutes: durationMin,
      state: currentSide,
    };
  }

  if (absAvgSlope < speedThreshold) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  if (distance <= 0) {
    return {
      active: true,
      severity: "high",
      eta_minutes: 0,
      title: "Risco elevado",
      detail: getTrendDirectionLabel(direction, type),
      source: type,
      score: 100,
    };
  }

  const etaMinutes = distance / absAvgSlope;
  if (!Number.isFinite(etaMinutes)) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem tendência relevante",
      source: type,
      score: 0,
    };
  }

  const closeMargin = type === "temperature" ? 1.2 : 8;
  const closeToLimit = distance <= closeMargin;

  if (etaMinutes <= 45 && closeToLimit) {
    const narrative = buildRiskNarrative({
      type,
      side: null,
      deviation: 0,
      durationMin: 0,
      direction,
      etaMinutes,
    });

    return {
      active: true,
      severity: "high",
      eta_minutes: Math.max(1, Math.round(etaMinutes)),
      title: "Risco elevado",
      detail: `${getTrendDirectionLabel(direction, type)} · possível alerta em ~${Math.max(
        1,
        Math.round(etaMinutes)
      )} min`,
      cause: narrative.cause,
      action: narrative.action,
      source: type,
      score: 90,
    };
  }

  if (etaMinutes <= 120 && closeToLimit) {
    const narrative = buildRiskNarrative({
      type,
      side: null,
      deviation: 0,
      durationMin: 0,
      direction,
      etaMinutes,
    });

    return {
      active: true,
      severity: "medium",
      eta_minutes: Math.max(1, Math.round(etaMinutes)),
      title: "Risco moderado",
      detail: `${getTrendDirectionLabel(direction, type)} · aproximação ao limite`,
      cause: narrative.cause,
      action: narrative.action,
      source: type,
      score: 65,
    };
  }

  return {
    active: false,
    severity: "none",
    eta_minutes: null,
    title: "Risco baixo",
    detail: "Sem tendência relevante",
    source: type,
    score: 0,
  };
}

function getPredictiveStatus(readings, cfg) {
  const tempSignal = buildPredictiveSignal({
    readings,
    valueKey: "temperature",
    lowLimit: Number(cfg.temp_low_c),
    highLimit: Number(cfg.temp_high_c),
    type: "temperature",
  });

  const humSignal = buildPredictiveSignal({
    readings,
    valueKey: "humidity",
    lowLimit: Number(cfg.hum_low),
    highLimit: Number(cfg.hum_high),
    type: "humidity",
  });

  const best = [tempSignal, humSignal].sort((a, b) => b.score - a.score)[0];

  if (!best || best.score <= 0) {
    return {
      level: "low",
      title: "Risco baixo",
      detail: "Sem tendência relevante nas últimas leituras",
      cause: "Valores dentro do comportamento esperado face aos limites definidos.",
      action: "Manter monitorização normal.",
      chip: "Baixo",
      source: "none",
      source_label: "Sem variável crítica",
      eta_minutes: null,
      score: 0,
    };
  }

  const isTemperature = best.source === "temperature";

  if (best.severity === "high") {
    return {
      level: "high",
      title: best.title,
      detail: best.detail,
      cause: best.cause,
      action: best.action,
      chip: "Elevado",
      source: best.source,
      source_label: isTemperature
        ? "Variável crítica: Temperatura"
        : "Variável crítica: Humidade",
      eta_minutes: best.eta_minutes,
      score: best.score,
    };
  }

  return {
    level: "medium",
    title: best.title,
    detail: best.detail,
    cause: best.cause,
    action: best.action,
    chip: "Moderado",
    source: best.source,
    source_label: isTemperature
      ? "Variável crítica: Temperatura"
      : "Variável crítica: Humidade",
    eta_minutes: best.eta_minutes,
    score: best.score,
  };
}

async function getRecentReadingsForAnalysis(deviceId, hours = 24) {
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("readings")
    .select("temperature, humidity, created_at, alarm_mask, alarm_event_age_s")
    .eq("device_id", deviceId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchAllReadingsSince(deviceId, sinceIso) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from("readings")
      .select("created_at, temperature, humidity")
      .eq("device_id", deviceId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const chunk = data || [];
    allRows = allRows.concat(chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

// -------------------- RECIPIENTS / EMAIL --------------------
function isAlertTypeEnabled(row, alertType) {
  if (!row?.is_active) return false;
  if (alertType === "temperature") return row.temp_alerts === true;
  if (alertType === "humidity") return row.humidity_alerts === true;
  if (alertType === "offline") return row.offline_alerts === true;
  if (alertType === "predictive") return row.predictive_alerts === true;
  return true;
}

async function getDeviceAccessRecipients(deviceId, excludeUserIds = new Set()) {
  const { data: accessRows, error: accessError } = await supabase
    .from("device_access")
    .select("user_id, can_view")
    .eq("device_id", deviceId)
    .eq("can_view", true);

  if (accessError) {
    console.error("Erro ao obter acessos do dispositivo para alertas:", accessError);
    return [];
  }

  const userIds = (accessRows || [])
    .map((row) => row.user_id)
    .filter((userId) => userId && !excludeUserIds.has(userId));

  if (!userIds.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_active")
    .in("id", userIds)
    .eq("is_active", true);

  if (profilesError) {
    console.error("Erro ao obter perfis para alertas:", profilesError);
    return [];
  }

  return (profiles || [])
    .map((profile) => ({
      email: String(profile.email || "").trim(),
      name: String(profile.full_name || "").trim() || undefined,
    }))
    .filter((row) => row.email);
}

async function getSuperAdminRecipients(excludeUserIds = new Set()) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_active, role")
    .eq("role", "super_admin")
    .eq("is_active", true);

  if (error) {
    console.error("Erro ao obter super_admins para alertas:", error);
    return [];
  }

  return (profiles || [])
    .filter((profile) => profile.id && !excludeUserIds.has(profile.id))
    .map((profile) => ({
      email: String(profile.email || "").trim(),
      name: String(profile.full_name || "").trim() || undefined,
    }))
    .filter((row) => row.email);
}

function mergeEmailRecipients(...recipientGroups) {
  const uniqueMap = new Map();

  for (const group of recipientGroups) {
    for (const row of group || []) {
      const email = String(row.email || "").trim();
      const key = email.toLowerCase();
      if (!email || uniqueMap.has(key)) continue;
      uniqueMap.set(key, {
        email,
        ...(row.name ? { name: row.name } : {}),
      });
    }
  }

  return Array.from(uniqueMap.values());
}

async function getDeviceAlertRecipients(deviceId, alertType = "general") {
  const { data, error } = await supabase
    .from("device_alert_recipients")
    .select("user_id, email, name, is_active, temp_alerts, humidity_alerts, offline_alerts, predictive_alerts")
    .eq("device_id", deviceId);

  if (error) {
    console.error("Erro ao obter recipients do dispositivo:", error);
    const accessRecipients = await getDeviceAccessRecipients(deviceId);
    const superAdminRecipients = await getSuperAdminRecipients();
    const fallbackRecipients = ALERT_TO_EMAIL ? [{ email: ALERT_TO_EMAIL }] : [];
    return mergeEmailRecipients(
      accessRecipients,
      superAdminRecipients,
      fallbackRecipients
    );
  }

  const recipients = (data || [])
    .filter((row) => isAlertTypeEnabled(row, alertType))
    .map((row) => ({
      email: String(row.email || "").trim(),
      name: String(row.name || "").trim() || undefined,
    }))
    .filter((row) => row.email);

  const configuredUserIds = new Set(
    (data || []).map((row) => row.user_id).filter(Boolean)
  );
  const accessRecipients = await getDeviceAccessRecipients(deviceId, configuredUserIds);
  const superAdminRecipients = await getSuperAdminRecipients(configuredUserIds);
  const fallbackRecipients = ALERT_TO_EMAIL ? [{ email: ALERT_TO_EMAIL }] : [];

  return mergeEmailRecipients(
    recipients,
    accessRecipients,
    superAdminRecipients,
    fallbackRecipients
  );
}

async function getWeeklyReportRecipients() {
  const { data, error } = await supabase
    .from("device_alert_recipients")
    .select("email, name")
    .eq("is_active", true);

  if (error) {
    console.error("Erro ao obter recipients do resumo semanal:", error);
    return ALERT_TO_EMAIL ? [{ email: ALERT_TO_EMAIL }] : [];
  }

  const uniqueMap = new Map();

  for (const row of data || []) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!uniqueMap.has(email)) {
      uniqueMap.set(email, {
        email,
        name: String(row.name || "").trim() || undefined,
      });
    }
  }

  const recipients = Array.from(uniqueMap.values());
  if (recipients.length > 0) return recipients;

  return ALERT_TO_EMAIL ? [{ email: ALERT_TO_EMAIL }] : [];
}

async function sendEmail({ to, subject, htmlContent, attachment = [] }) {
  if (!BREVO_API_KEY || !ALERT_FROM_EMAIL) {
    console.warn("Brevo/email nao configurado. Email nao enviado.");
    return { ok: false, reason: "missing_email_config" };
  }

  const normalizedTo = (to || [])
    .map((row) => ({
      email: String(row.email || "").trim(),
      ...(row.name ? { name: row.name } : {}),
    }))
    .filter((row) => row.email);

  if (!normalizedTo.length) {
    console.warn("Sem destinatarios para envio de email.");
    return { ok: false, reason: "missing_recipients" };
  }

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: ALERT_FROM_EMAIL, name: "SmartTempSystems" },
        to: normalizedTo,
        subject,
        htmlContent,
        attachment: attachment || [],
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    return { ok: true, messageId: response?.data?.messageId || null };
  } catch (error) {
    const status = error?.response?.status || null;
    const providerMessage =
      error?.response?.data?.message ||
      error?.response?.data?.code ||
      error?.message ||
      "send_failed";
    const reason =
      status === 401 && String(providerMessage).toLowerCase().includes("ip")
        ? "brevo_ip_not_authorized"
        : status === 401
        ? "brevo_unauthorized"
        : "send_failed";

    console.error("Erro ao enviar email:", {
      subject,
      status,
      data: error?.response?.data,
      message: error?.message,
    });
    return {
      ok: false,
      reason,
      status,
      message: String(providerMessage).slice(0, 240),
    };
  }
}

function buildEmailAlertStatePatch(prefix, emailResult) {
  const now = nowIso();
  const patch = {
    [`${prefix}_last_email_attempt_at`]: now,
  };

  if (emailResult?.ok) {
    patch[`${prefix}_last_sent_at`] = now;
    patch[`${prefix}_last_email_error`] = null;
    patch[`${prefix}_last_email_status`] = null;
    patch[`${prefix}_last_email_message`] = null;
    return patch;
  }

  patch[`${prefix}_last_email_error`] = emailResult?.reason || "send_failed";
  patch[`${prefix}_last_email_status`] = emailResult?.status || null;
  patch[`${prefix}_last_email_message`] = emailResult?.message || null;
  return patch;
}
async function insertAlertHistory({
  device_id,
  type,
  event,
  title,
  message,
  temperature = null,
  humidity = null,
}) {
  const payload = {
    device_id,
    type,
    event,
    title,
    message,
    temperature,
    humidity,
    sent_at: nowIso(),
  };

  const { error } = await supabase.from("alerts").insert([payload]);

  if (error) {
    console.error("Erro ao inserir histórico de alerta:", error);
  }
}

function buildEmailShell({ heading, intro, blocks, footer }) {
  const blocksHtml = (blocks || [])
    .map(
      (block) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;width:220px;">
            ${escapeHtml(block.label)}
          </td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:700;">
            ${escapeHtml(block.value)}
          </td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:#0f172a;color:#ffffff;padding:20px 24px;">
          <h2 style="margin:0;font-size:22px;">${escapeHtml(heading)}</h2>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 18px 0;color:#334155;font-size:15px;line-height:1.6;">
            ${escapeHtml(intro)}
          </p>
          <table style="width:100%;border-collapse:collapse;">
            ${blocksHtml}
          </table>
          <p style="margin:22px 0 0 0;color:#64748b;font-size:13px;line-height:1.6;">
            ${escapeHtml(
              footer || "Enviado automaticamente pelo SmartTempSystems."
            )}
          </p>
        </div>
      </div>
    </div>
  `;
}

// -------------------- ALERT EMAILS --------------------
async function sendTemperatureTriggeredEmail({
  device,
  temperature,
  humidity,
  direction,
  cfg,
}) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const subject = `[STS] Temperatura fora do limite — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(
    device.device_id,
    "temperature"
  );

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Alerta de temperatura",
      intro: `Foi detetada uma temperatura ${direction.label} no dispositivo ${deviceName}.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Temperatura atual",
          value: `${formatNumber(temperature, 1)} °C`,
        },
        {
          label: "Humidade atual",
          value: `${formatNumber(humidity, 0)} %`,
        },
        {
          label: "Intervalo configurado",
          value: `${formatNumber(cfg.temp_low_c, 1)} °C a ${formatNumber(
            cfg.temp_high_c,
            1
          )} °C`,
        },
        {
          label: "Limite ultrapassado",
          value: `${formatNumber(direction.limit, 1)} °C`,
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
    }),
  });
}

async function sendTemperatureResolvedEmail({
  device,
  temperature,
  humidity,
  cfg,
}) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const subject = `[STS] Temperatura normalizada — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(
    device.device_id,
    "temperature"
  );

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Temperatura normalizada",
      intro: `A temperatura voltou ao intervalo normal no dispositivo ${deviceName}.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Temperatura atual",
          value: `${formatNumber(temperature, 1)} °C`,
        },
        {
          label: "Humidade atual",
          value: `${formatNumber(humidity, 0)} %`,
        },
        {
          label: "Intervalo configurado",
          value: `${formatNumber(cfg.temp_low_c, 1)} °C a ${formatNumber(
            cfg.temp_high_c,
            1
          )} °C`,
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
    }),
  });
}

async function sendHumidityTriggeredEmail({
  device,
  temperature,
  humidity,
  direction,
  cfg,
}) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const subject = `[STS] Humidade fora do limite — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(
    device.device_id,
    "humidity"
  );

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Alerta de humidade",
      intro: `Foi detetada uma humidade ${direction.label} no dispositivo ${deviceName}.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Temperatura atual",
          value: `${formatNumber(temperature, 1)} °C`,
        },
        {
          label: "Humidade atual",
          value: `${formatNumber(humidity, 0)} %`,
        },
        {
          label: "Intervalo configurado",
          value: `${formatNumber(cfg.hum_low, 0)} % a ${formatNumber(
            cfg.hum_high,
            0
          )} %`,
        },
        {
          label: "Limite ultrapassado",
          value: `${formatNumber(direction.limit, 0)} %`,
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
    }),
  });
}

async function sendHumidityResolvedEmail({
  device,
  temperature,
  humidity,
  cfg,
}) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const subject = `[STS] Humidade normalizada — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(
    device.device_id,
    "humidity"
  );

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Humidade normalizada",
      intro: `A humidade voltou ao intervalo normal no dispositivo ${deviceName}.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Temperatura atual",
          value: `${formatNumber(temperature, 1)} °C`,
        },
        {
          label: "Humidade atual",
          value: `${formatNumber(humidity, 0)} %`,
        },
        {
          label: "Intervalo configurado",
          value: `${formatNumber(cfg.hum_low, 0)} % a ${formatNumber(
            cfg.hum_high,
            0
          )} %`,
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
    }),
  });
}

async function sendOfflineTriggeredEmail({ device, cfg }) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const thresholdMs = getOfflineThresholdMs(cfg.send_interval_s);
  const subject = `[STS] Dispositivo offline — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(device.device_id, "offline");

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Dispositivo offline",
      intro: `O dispositivo ${deviceName} deixou de comunicar com o backend.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Última comunicação",
          value: formatDateTimePt(device.last_seen || new Date(), true),
        },
        {
          label: "Última temperatura",
          value:
            device.last_temperature !== null &&
            device.last_temperature !== undefined
              ? `${formatNumber(device.last_temperature, 1)} °C`
              : "-",
        },
        {
          label: "Última humidade",
          value:
            device.last_humidity !== null && device.last_humidity !== undefined
              ? `${formatNumber(device.last_humidity, 0)} %`
              : "-",
        },
        {
          label: "Limite para offline",
          value: `${Math.round(thresholdMs / 1000)} s sem leituras`,
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
      footer:
        "Verificar alimentação, Wi-Fi, cobertura de rede e estado do dispositivo.",
    }),
  });
}

async function sendOnlineRecoveredEmail({ device }) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "Localização por definir";
  const subject = `[STS] Dispositivo novamente online — ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(device.device_id, "offline");

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "Dispositivo novamente online",
      intro: `O dispositivo ${deviceName} voltou a comunicar normalmente com o backend.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "Localização", value: location },
        {
          label: "Temperatura atual",
          value:
            device.last_temperature !== null &&
            device.last_temperature !== undefined
              ? `${formatNumber(device.last_temperature, 1)} °C`
              : "-",
        },
        {
          label: "Humidade atual",
          value:
            device.last_humidity !== null && device.last_humidity !== undefined
              ? `${formatNumber(device.last_humidity, 0)} %`
              : "-",
        },
        { label: "Hora", value: formatDateTimePt(new Date(), true) },
      ],
    }),
  });
}

async function sendAckConfirmedEmail({
  device,
  temperature,
  humidity,
  alarmAckTime = null,
}) {
  const deviceName = device?.name || device?.device_id;
  const location = device?.location || "LocalizaÃ§Ã£o por definir";
  const subject = `[STS] ACK confirmado â€” ${deviceName}`;
  const recipients = await getDeviceAlertRecipients(device.device_id, "general");

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: buildEmailShell({
      heading: "ACK confirmado",
      intro: `Foi confirmado ACK de alarme no dispositivo ${deviceName}.`,
      blocks: [
        { label: "Dispositivo", value: deviceName },
        { label: "Device ID", value: device.device_id },
        { label: "LocalizaÃ§Ã£o", value: location },
        {
          label: "Hora do ACK",
          value: alarmAckTime || "Reportada pelo dispositivo",
        },
        {
          label: "Temperatura atual",
          value:
            temperature !== null && temperature !== undefined
              ? `${formatNumber(temperature, 1)} Â°C`
              : "-",
        },
        {
          label: "Humidade atual",
          value:
            humidity !== null && humidity !== undefined
              ? `${formatNumber(humidity, 0)} %`
              : "-",
        },
        { label: "Recebido no backend", value: formatDateTimePt(new Date(), true) },
      ],
      footer:
        "ACK significa que o alerta foi reconhecido no dispositivo. A condiÃ§Ã£o deve continuar a ser acompanhada atÃ© normalizar.",
    }),
  });
}

// -------------------- DEVICE UPDATE --------------------
async function updateDeviceConfigAndStatus(
  deviceRow,
  {
    configPatch = null,
    status = null,
    last_seen = undefined,
    last_temperature = undefined,
    last_humidity = undefined,
  }
) {
  const payload = {
    updated_at: nowIso(),
  };

  if (configPatch) payload.config = configPatch;
  if (status !== null) payload.status = status;
  if (last_seen !== undefined) payload.last_seen = last_seen;
  if (last_temperature !== undefined) payload.last_temperature = last_temperature;
  if (last_humidity !== undefined) payload.last_humidity = last_humidity;

  const { error } = await supabase
    .from("devices")
    .update(payload)
    .eq("device_id", deviceRow.device_id);

  if (error) {
    console.error("Erro ao atualizar devices:", error);
  }
}

async function processTriggeredAndResolvedAlerts({
  deviceRow,
  numericTemperature,
  numericHumidity,
  cfg,
}) {
  const alertState = cfg.alert_state;
  const tempInfo = getTemperatureAlertDirection(numericTemperature, cfg);
  const humInfo = getHumidityAlertDirection(numericHumidity, cfg);

  let nextAlertState = { ...alertState };

  if (tempInfo.breached && !alertState.temp_active) {
    nextAlertState.temp_last_sent_at = null;
    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "temperature",
      event: "triggered",
      title: "Temperatura fora do limite",
      message: `Temperatura ${tempInfo.label}. Valor atual: ${formatNumber(
        numericTemperature,
        1
      )} °C.`,
      temperature: numericTemperature,
      humidity: numericHumidity,
    });

    nextAlertState.temp_active = true;

    if (canSendByCooldown(alertState.temp_last_email_attempt_at)) {
      const emailResult = await sendTemperatureTriggeredEmail({
        device: deviceRow,
        temperature: numericTemperature,
        humidity: numericHumidity,
        direction: tempInfo,
        cfg,
      });

      nextAlertState = {
        ...nextAlertState,
        ...buildEmailAlertStatePatch("temp", emailResult),
      };
    }
  }

  if (tempInfo.breached && alertState.temp_active && !alertState.temp_last_sent_at) {
    if (canSendByCooldown(alertState.temp_last_email_attempt_at)) {
      const emailResult = await sendTemperatureTriggeredEmail({
        device: deviceRow,
        temperature: numericTemperature,
        humidity: numericHumidity,
        direction: tempInfo,
        cfg,
      });

      nextAlertState = {
        ...nextAlertState,
        ...buildEmailAlertStatePatch("temp", emailResult),
      };
    }
  }

  if (!tempInfo.breached && alertState.temp_active) {
    await sendTemperatureResolvedEmail({
      device: deviceRow,
      temperature: numericTemperature,
      humidity: numericHumidity,
      cfg,
    });

    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "temperature",
      event: "resolved",
      title: "Temperatura normalizada",
      message: `Temperatura voltou ao intervalo normal. Valor atual: ${formatNumber(
        numericTemperature,
        1
      )} °C.`,
      temperature: numericTemperature,
      humidity: numericHumidity,
    });

    nextAlertState.temp_active = false;
    nextAlertState.temp_last_resolved_at = nowIso();
  }

  if (humInfo.breached && !alertState.hum_active) {
    nextAlertState.hum_last_sent_at = null;
    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "humidity",
      event: "triggered",
      title: "Humidade fora do limite",
      message: `Humidade ${humInfo.label}. Valor atual: ${formatNumber(
        numericHumidity,
        0
      )} %.`,
      temperature: numericTemperature,
      humidity: numericHumidity,
    });

    nextAlertState.hum_active = true;

    if (canSendByCooldown(alertState.hum_last_email_attempt_at)) {
      const emailResult = await sendHumidityTriggeredEmail({
        device: deviceRow,
        temperature: numericTemperature,
        humidity: numericHumidity,
        direction: humInfo,
        cfg,
      });

      nextAlertState = {
        ...nextAlertState,
        ...buildEmailAlertStatePatch("hum", emailResult),
      };
    }
  }

  if (humInfo.breached && alertState.hum_active && !alertState.hum_last_sent_at) {
    if (canSendByCooldown(alertState.hum_last_email_attempt_at)) {
      const emailResult = await sendHumidityTriggeredEmail({
        device: deviceRow,
        temperature: numericTemperature,
        humidity: numericHumidity,
        direction: humInfo,
        cfg,
      });

      nextAlertState = {
        ...nextAlertState,
        ...buildEmailAlertStatePatch("hum", emailResult),
      };
    }
  }

  if (!humInfo.breached && alertState.hum_active) {
    await sendHumidityResolvedEmail({
      device: deviceRow,
      temperature: numericTemperature,
      humidity: numericHumidity,
      cfg,
    });

    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "humidity",
      event: "resolved",
      title: "Humidade normalizada",
      message: `Humidade voltou ao intervalo normal. Valor atual: ${formatNumber(
        numericHumidity,
        0
      )} %.`,
      temperature: numericTemperature,
      humidity: numericHumidity,
    });

    nextAlertState.hum_active = false;
    nextAlertState.hum_last_resolved_at = nowIso();
  }

  if (alertState.offline_active) {
    await sendOnlineRecoveredEmail({
      device: {
        ...deviceRow,
        last_temperature: numericTemperature,
        last_humidity: numericHumidity,
      },
    });

    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "offline",
      event: "resolved",
      title: "Dispositivo novamente online",
      message: "O dispositivo voltou a comunicar com o backend.",
      temperature: numericTemperature,
      humidity: numericHumidity,
    });

    nextAlertState.offline_active = false;
    nextAlertState.offline_last_resolved_at = nowIso();
  }

  return nextAlertState;
}

async function checkDevicesHealthAndSendOfflineAlerts() {
  const { data: devices, error } = await supabase
    .from("devices")
    .select("*")
    .order("device_id", { ascending: true });

  if (error) {
    console.error("Erro ao verificar saúde dos dispositivos:", error);
    throw error;
  }

  let processed = 0;
  let offlineTriggered = 0;

  for (const deviceRow of devices || []) {
    processed += 1;

    const cfg = getDeviceConfig(deviceRow);
    const alertState = cfg.alert_state;
    const lastSeenTs = deviceRow?.last_seen
      ? new Date(deviceRow.last_seen).getTime()
      : null;
    const thresholdMs = getOfflineThresholdMs(cfg.send_interval_s);
    const isOffline = !lastSeenTs || Date.now() - lastSeenTs > thresholdMs;

    if (!isOffline) continue;
    if (alertState.offline_active) {
      if (
        !alertState.offline_last_sent_at &&
        canSendByCooldown(alertState.offline_last_email_attempt_at)
      ) {
        const retryResult = await sendOfflineTriggeredEmail({ device: deviceRow, cfg });
        const retryConfig = mergeAlertStateIntoConfig(deviceRow, {
          ...buildEmailAlertStatePatch("offline", retryResult),
        });

        await updateDeviceConfigAndStatus(deviceRow, {
          configPatch: retryConfig,
          status: "OFFLINE",
        });
      }
      continue;
    }
    if (!canSendByCooldown(alertState.offline_last_email_attempt_at)) continue;

    const emailResult = await sendOfflineTriggeredEmail({ device: deviceRow, cfg });

    await insertAlertHistory({
      device_id: deviceRow.device_id,
      type: "offline",
      event: "triggered",
      title: "Dispositivo offline",
      message: `O dispositivo deixou de comunicar há mais de ${Math.round(
        thresholdMs / 1000
      )} segundos.`,
      temperature: deviceRow?.last_temperature ?? null,
      humidity: deviceRow?.last_humidity ?? null,
    });

    const nextConfig = mergeAlertStateIntoConfig(deviceRow, {
      offline_active: true,
      offline_last_sent_at: null,
      ...buildEmailAlertStatePatch("offline", emailResult),
    });

    await updateDeviceConfigAndStatus(deviceRow, {
      configPatch: nextConfig,
      status: "OFFLINE",
    });

    offlineTriggered += 1;
  }

  return { processed, offlineTriggered };
}

// -------------------- WEEKLY REPORT --------------------
async function sendWeeklyReport() {
  const sinceIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: readings, error: readingsError },
    { data: alerts, error: alertsError },
    { data: devicesData, error: devicesError },
  ] = await Promise.all([
    supabase
      .from("readings")
      .select("device_id, temperature, humidity, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true }),

    supabase
      .from("alerts")
      .select("device_id,type,event,sent_at")
      .gte("sent_at", sinceIso)
      .order("sent_at", { ascending: true }),

    supabase.from("devices").select("device_id,name,location"),
  ]);

  if (readingsError) {
    console.error("Erro no resumo semanal / readings:", readingsError);
    throw readingsError;
  }

  if (alertsError) {
    console.error("Erro no resumo semanal / alerts:", alertsError);
    throw alertsError;
  }

  if (devicesError) {
    console.error("Erro no resumo semanal / devices:", devicesError);
    throw devicesError;
  }

  if (!readings || readings.length === 0) return;

  const recipients = await getWeeklyReportRecipients();
  if (!recipients.length) {
    console.warn("Sem recipients para resumo semanal.");
    return;
  }

  const deviceMetaMap = new Map(
    (devicesData || []).map((d) => [
      d.device_id,
      {
        name: d.name || d.device_id,
        location: d.location || "Localização por definir",
      },
    ])
  );

  const perDeviceDaily = {};
  const perDeviceWeekly = {};
  const alertCounters = {};

  for (const row of readings) {
    const temp = Number(row.temperature);
    const hum = Number(row.humidity);
    const d = new Date(row.created_at);
    const dayKey = d.toLocaleDateString("pt-PT", {
      timeZone: "Europe/Lisbon",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

    if (!perDeviceDaily[row.device_id]) perDeviceDaily[row.device_id] = {};
    if (!perDeviceWeekly[row.device_id]) {
      perDeviceWeekly[row.device_id] = {
        tempSum: 0,
        tempCount: 0,
        humSum: 0,
        humCount: 0,
        tempMin: null,
        tempMax: null,
        humMin: null,
        humMax: null,
        readingsCount: 0,
      };
    }

    if (!perDeviceDaily[row.device_id][dayKey]) {
      perDeviceDaily[row.device_id][dayKey] = {
        tempSum: 0,
        tempCount: 0,
        humSum: 0,
        humCount: 0,
        tempMin: null,
        tempMax: null,
        humMin: null,
        humMax: null,
        readingsCount: 0,
      };
    }

    const daily = perDeviceDaily[row.device_id][dayKey];
    const weekly = perDeviceWeekly[row.device_id];

    if (Number.isFinite(temp)) {
      daily.tempSum += temp;
      daily.tempCount += 1;
      daily.tempMin = daily.tempMin === null ? temp : Math.min(daily.tempMin, temp);
      daily.tempMax = daily.tempMax === null ? temp : Math.max(daily.tempMax, temp);

      weekly.tempSum += temp;
      weekly.tempCount += 1;
      weekly.tempMin = weekly.tempMin === null ? temp : Math.min(weekly.tempMin, temp);
      weekly.tempMax = weekly.tempMax === null ? temp : Math.max(weekly.tempMax, temp);
    }

    if (Number.isFinite(hum)) {
      daily.humSum += hum;
      daily.humCount += 1;
      daily.humMin = daily.humMin === null ? hum : Math.min(daily.humMin, hum);
      daily.humMax = daily.humMax === null ? hum : Math.max(daily.humMax, hum);

      weekly.humSum += hum;
      weekly.humCount += 1;
      weekly.humMin = weekly.humMin === null ? hum : Math.min(weekly.humMin, hum);
      weekly.humMax = weekly.humMax === null ? hum : Math.max(weekly.humMax, hum);
    }

    daily.readingsCount += 1;
    weekly.readingsCount += 1;
  }

  for (const row of alerts || []) {
    if (!alertCounters[row.device_id]) {
      alertCounters[row.device_id] = {
        temperature_triggered: 0,
        temperature_resolved: 0,
        humidity_triggered: 0,
        humidity_resolved: 0,
        offline_triggered: 0,
        offline_resolved: 0,
      };
    }

    const key = `${row.type}_${row.event}`;
    if (key in alertCounters[row.device_id]) {
      alertCounters[row.device_id][key] += 1;
    }
  }

  let html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:900px;margin:0 auto;">
        <div style="background:#0f172a;color:#ffffff;padding:22px 24px;border-radius:18px 18px 0 0;">
          <h2 style="margin:0;font-size:24px;">Resumo Semanal SmartTempSystems</h2>
          <p style="margin:8px 0 0 0;font-size:14px;color:#cbd5e1;">
            Inclui mínimos, máximos, médias semanais e indicadores de alerta.
          </p>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 18px 18px;padding:24px;">
  `;

  for (const deviceId of Object.keys(perDeviceWeekly)) {
    const meta = deviceMetaMap.get(deviceId) || {
      name: deviceId,
      location: "Localização por definir",
    };

    const weekly = perDeviceWeekly[deviceId];
    const counts = alertCounters[deviceId] || {
      temperature_triggered: 0,
      temperature_resolved: 0,
      humidity_triggered: 0,
      humidity_resolved: 0,
      offline_triggered: 0,
      offline_resolved: 0,
    };

    const avgTemp = weekly.tempCount > 0 ? weekly.tempSum / weekly.tempCount : null;
    const avgHum = weekly.humCount > 0 ? weekly.humSum / weekly.humCount : null;

    html += `
      <div style="margin-bottom:34px;">
        <h3 style="margin:0 0 8px 0;color:#0f172a;font-size:20px;">${escapeHtml(
          meta.name
        )}</h3>
        <p style="margin:0 0 18px 0;color:#64748b;font-size:14px;">
          Device ID: ${escapeHtml(deviceId)} · Localização: ${escapeHtml(
      meta.location
    )}
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Indicador</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Valor</th>
          </tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Leituras da semana</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${weekly.readingsCount}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Temperatura mínima</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            weekly.tempMin !== null ? `${formatNumber(weekly.tempMin, 1)} °C` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Temperatura máxima</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            weekly.tempMax !== null ? `${formatNumber(weekly.tempMax, 1)} °C` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Temperatura média</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            avgTemp !== null ? `${formatNumber(avgTemp, 1)} °C` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Humidade mínima</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            weekly.humMin !== null ? `${formatNumber(weekly.humMin, 0)} %` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Humidade máxima</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            weekly.humMax !== null ? `${formatNumber(weekly.humMax, 0)} %` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Humidade média</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            avgHum !== null ? `${formatNumber(avgHum, 0)} %` : "-"
          }</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Alertas temperatura</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.temperature_triggered}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Recuperações temperatura</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.temperature_resolved}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Alertas humidade</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.humidity_triggered}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Recuperações humidade</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.humidity_resolved}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Alertas offline</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.offline_triggered}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;">Recuperações online</td><td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${counts.offline_resolved}</td></tr>
        </table>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Dia</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Temp. mín</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Temp. máx</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Temp. média</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Hum. mín</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Hum. máx</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Hum. média</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Leituras</th>
          </tr>
    `;

    for (const day of Object.keys(perDeviceDaily[deviceId]).sort()) {
      const d = perDeviceDaily[deviceId][day];
      const dayAvgTemp = d.tempCount > 0 ? d.tempSum / d.tempCount : null;
      const dayAvgHum = d.humCount > 0 ? d.humSum / d.humCount : null;

      html += `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escapeHtml(day)}</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            d.tempMin !== null ? `${formatNumber(d.tempMin, 1)} °C` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            d.tempMax !== null ? `${formatNumber(d.tempMax, 1)} °C` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            dayAvgTemp !== null ? `${formatNumber(dayAvgTemp, 1)} °C` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            d.humMin !== null ? `${formatNumber(d.humMin, 0)} %` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            d.humMax !== null ? `${formatNumber(d.humMax, 0)} %` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${
            dayAvgHum !== null ? `${formatNumber(dayAvgHum, 0)} %` : "-"
          }</td>
          <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">${d.readingsCount}</td>
        </tr>
      `;
    }

    html += `</table></div>`;
  }

  html += `
        </div>
      </div>
    </div>
  `;

  await sendEmail({
    to: recipients,
    subject: "Resumo Semanal SmartTempSystems",
    htmlContent: html,
  });
}

// -------------------- ROOT --------------------
app.get("/", (req, res) => {
  res.send("Servidor SmartTempSystems ativo!");
});

// -------------------- WEEKLY REPORT --------------------
app.post("/api/weekly-report", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    await sendWeeklyReport();
    res.json({ message: "Resumo semanal enviado com sucesso" });
  } catch (error) {
    console.error("Erro em /api/weekly-report:", error);
    res.status(500).json({ error: "Erro ao enviar resumo semanal" });
  }
});

// -------------------- HEALTH CHECK / OFFLINE ALERTS --------------------
app.post("/api/check-devices-health", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const result = await checkDevicesHealthAndSendOfflineAlerts();
    res.json({
      message: "Verificação concluída",
      ...result,
    });
  } catch (error) {
    console.error("Erro em /api/check-devices-health:", error);
    res.status(500).json({ error: "Erro ao verificar saúde dos dispositivos" });
  }
});

// -------------------- API TEMPERATURA --------------------
app.post("/api/temperature", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const {
      device_id,
      temperature,
      humidity,
      device_status,
      alarm_ack,
      alarm_ack_count,
      alarm_ack_time,
      alarm_ack_age_s,
      alarm_event_count,
      alarm_event_time,
      alarm_event_age_s,
      alarm_started_age_s,
      alarm_mask,
      alarm_reason,
      telemetry_seq,
      sample_age_s,
      sample_epoch,
      delivery_attempts,
    } = req.body;

    if (!device_id || temperature === undefined || humidity === undefined) {
      return res.status(400).json({
        error: "device_id, temperature e humidity são obrigatórios",
      });
    }

    const numericTemperature = Number(temperature);
    const numericHumidity = Number(humidity);

    if (
      !Number.isFinite(numericTemperature) ||
      !Number.isFinite(numericHumidity)
    ) {
      return res
        .status(400)
        .json({ error: "temperature e humidity devem ser numéricos" });
    }

    const { data: existingDeviceRow, error: deviceFetchError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", device_id)
      .maybeSingle();

    if (deviceFetchError) {
      console.error("Erro ao ler device:", deviceFetchError);
      return res.status(500).json({ error: "Erro ao ler dispositivo" });
    }

    const baseDeviceRow =
      existingDeviceRow || {
        device_id,
        name: device_id,
        location: "Localização por definir",
        config: {},
        config_version: 1,
      };

    const cfg = getDeviceConfig(baseDeviceRow);
    const readingCreatedAt = getIncomingReadingCreatedAt(sample_age_s, sample_epoch);
    const readingPayload = {
      device_id,
      temperature: numericTemperature,
      humidity: numericHumidity,
      created_at: readingCreatedAt,
      device_status: device_status || null,
      alarm_ack: toBoolean(alarm_ack),
      alarm_ack_count: toOptionalNumber(alarm_ack_count) || 0,
      alarm_ack_time: alarm_ack_time || null,
      alarm_ack_age_s: toOptionalNumber(alarm_ack_age_s),
      alarm_event_count: toOptionalNumber(alarm_event_count) || 0,
      alarm_event_time: alarm_event_time || null,
      alarm_event_age_s:
        toOptionalNumber(alarm_event_age_s) ?? toOptionalNumber(alarm_started_age_s),
      alarm_mask: toOptionalNumber(alarm_mask) || 0,
      alarm_reason: alarm_reason || null,
    };
    const incomingReadingMeta = {
      telemetry_seq: toOptionalNumber(telemetry_seq),
      sample_age_s: toOptionalNumber(sample_age_s),
      sample_epoch: toOptionalNumber(sample_epoch),
      delivery_attempts: toOptionalNumber(delivery_attempts) || 0,
    };
    const enrichedReadingPayload = {
      ...readingPayload,
      ...incomingReadingMeta,
      offline_captured: isOfflineCapturedReading(incomingReadingMeta, cfg),
    };
    const isHistoricalBackfill =
      enrichedReadingPayload.offline_captured && Boolean(existingDeviceRow);

    const { data: latestReadingForRate, error: latestReadingForRateError } =
      await supabase
        .from("readings")
        .select("created_at, alarm_ack_count, alarm_event_count, alarm_mask")
        .eq("device_id", device_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestReadingForRateError) {
      console.error("Erro ao validar cadÃªncia de leituras:", latestReadingForRateError);
      return res.status(500).json({ error: "Erro ao validar leitura" });
    }

    const storedReading = shouldStoreReading({
      latestReading: latestReadingForRate,
      cfg,
      incoming: { ...readingPayload, ...incomingReadingMeta },
    });

    if (storedReading) {
      const insertReadingsResult = await supabase.from("readings").insert([
        enrichedReadingPayload,
      ]);

      if (insertReadingsResult.error) {
        if (isMissingReadingTelemetryColumnError(insertReadingsResult.error)) {
          const fallbackInsertResult = await supabase.from("readings").insert([
            readingPayload,
          ]);

          if (fallbackInsertResult.error) {
            console.error("Erro ao inserir reading:", fallbackInsertResult.error);
            return res.status(500).json({ error: "Erro ao guardar leitura" });
          }
        } else {
          console.error("Erro ao inserir reading:", insertReadingsResult.error);
          return res.status(500).json({ error: "Erro ao guardar leitura" });
        }
      }
    }

    const computedStatus = getDeviceStatus({
      online: true,
      temperature: numericTemperature,
      humidity: numericHumidity,
      temp_low_c: cfg.temp_low_c,
      temp_high_c: cfg.temp_high_c,
      hum_low: cfg.hum_low,
      hum_high: cfg.hum_high,
    });
    const telemetryStatus = resolveTelemetryStatus({
      online: true,
      incomingStatus: device_status,
      alarmAck: readingPayload.alarm_ack,
      alarmMask: readingPayload.alarm_mask,
      computedStatus,
    });

    const currentNowIso = nowIso();

    const upsertPayload = {
      device_id,
      name: sanitizeDeviceName(baseDeviceRow.name, device_id),
      location: sanitizeLocation(baseDeviceRow.location),
      config: baseDeviceRow.config || {},
      config_version: baseDeviceRow.config_version || 1,
      last_seen: currentNowIso,
      updated_at: currentNowIso,
    };

    if (!isHistoricalBackfill) {
      upsertPayload.last_temperature = numericTemperature;
      upsertPayload.last_humidity = numericHumidity;
      upsertPayload.status = statusToDbLabel(telemetryStatus);
    }

    const { error: upsertError } = await supabase
      .from("devices")
      .upsert([upsertPayload], { onConflict: "device_id" });

    if (upsertError) {
      console.error("Erro ao atualizar device por upsert:", upsertError);
      return res.status(500).json({ error: "Erro ao atualizar dispositivo" });
    }

    const { data: freshDeviceRow, error: freshDeviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", device_id)
      .maybeSingle();

    if (freshDeviceError || !freshDeviceRow) {
      console.error("Erro ao obter device atualizado:", freshDeviceError);
      return res
        .status(500)
        .json({ error: "Erro ao obter dispositivo atualizado" });
    }

    const refreshedCfg = getDeviceConfig(freshDeviceRow);

    const nextAlertState = isHistoricalBackfill
      ? { ...refreshedCfg.alert_state }
      : await processTriggeredAndResolvedAlerts({
          deviceRow: freshDeviceRow,
          numericTemperature,
          numericHumidity,
          cfg: refreshedCfg,
        });

    const incomingAckCount = toOptionalNumber(alarm_ack_count) || 0;
    const lastStoredAckCount =
      toOptionalNumber(refreshedCfg.alert_state.alarm_last_ack_count) || 0;
    const ackReceived =
      toBoolean(alarm_ack) ||
      String(device_status || "").toLowerCase().includes("ack");

    if (ackReceived && incomingAckCount > lastStoredAckCount) {
      await insertAlertHistory({
        device_id,
        type: "system",
        event: "ack",
        title: "ACK confirmado",
        message: alarm_ack_time
          ? `Alerta reconhecido no dispositivo às ${alarm_ack_time}.`
          : "Alerta reconhecido no dispositivo.",
        temperature: numericTemperature,
        humidity: numericHumidity,
      });

      await sendAckConfirmedEmail({
        device: freshDeviceRow,
        temperature: numericTemperature,
        humidity: numericHumidity,
        alarmAckTime: alarm_ack_time || null,
      });

      nextAlertState.alarm_last_ack_count = incomingAckCount;
    }

    const finalConfig = mergeAlertStateIntoConfig(freshDeviceRow, nextAlertState);

    await updateDeviceConfigAndStatus(freshDeviceRow, {
      configPatch: finalConfig,
      status: isHistoricalBackfill ? null : statusToDbLabel(telemetryStatus),
      last_seen: currentNowIso,
      last_temperature: isHistoricalBackfill ? undefined : numericTemperature,
      last_humidity: isHistoricalBackfill ? undefined : numericHumidity,
    });

    const last24hReadings = await getRecentReadingsForAnalysis(device_id, 24);
    const communicationHealth = getCommunicationHealth({
      readings: last24hReadings,
      sendIntervalS: refreshedCfg.send_interval_s,
      deviceLastSeen: currentNowIso,
      periodHours: 24,
    });

    const predictiveStatus = getPredictiveStatus(last24hReadings, refreshedCfg);

    res.json({
      message: "OK",
      stored_reading: storedReading,
      current_updated: !isHistoricalBackfill,
      applied_config: getDeviceConfig({ config: finalConfig }),
      status: statusToApiLabel(telemetryStatus),
      communication_health: communicationHealth,
      predictive_status: predictiveStatus,
    });
  } catch (error) {
    console.error("Erro em /api/temperature:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- DASHBOARD: DEVICE OVERVIEW --------------------
app.get("/api/dashboard/device/:id", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;

    const { data: deviceRow, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceError) {
      console.error("Erro ao ler devices:", deviceError);
      return res.status(500).json({ error: "Erro ao obter dispositivo" });
    }

    const { data: latestReading, error: latestError } = await supabase
      .from("readings")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.error("Erro ao ler última leitura:", latestError);
      return res.status(500).json({ error: "Erro ao obter última leitura" });
    }

    if (!deviceRow && !latestReading) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    const cfg = getDeviceConfig(deviceRow);
    const { temp_low_c, temp_high_c, hum_low, hum_high, alert_state } = cfg;
    const currentReading = latestReading || null;

    const temperature =
      currentReading?.temperature ?? deviceRow?.last_temperature ?? latestReading?.temperature ?? null;
    const humidity =
      currentReading?.humidity ?? deviceRow?.last_humidity ?? latestReading?.humidity ?? null;

    const contactTimes = [
      deviceRow?.last_contact_at,
      deviceRow?.updated_at,
      deviceRow?.last_seen,
      currentReading?.created_at,
    ]
      .map((value) => (value ? new Date(value).getTime() : null))
      .filter((value) => Number.isFinite(value));
    const lastSeenIso = contactTimes.length
      ? new Date(Math.max(...contactTimes)).toISOString()
      : null;
    const lastReadingAt = currentReading?.created_at || null;
    const lastSeenSeconds = lastSeenIso
      ? Math.floor((Date.now() - new Date(lastSeenIso).getTime()) / 1000)
      : 999999;

    const online =
      lastSeenSeconds <=
      Math.floor(getOfflineThresholdMs(cfg.send_interval_s) / 1000);

    const computedStatus =
      temperature !== null && humidity !== null
        ? getDeviceStatus({
            online,
            temperature: Number(temperature),
            humidity: Number(humidity),
            temp_low_c,
            temp_high_c,
            hum_low,
            hum_high,
          })
        : online
        ? "normal"
        : "offline";
    const normalizedStatus = resolveTelemetryStatus({
      online,
      incomingStatus: deviceRow?.status || currentReading?.device_status,
      alarmAck: currentReading?.alarm_ack,
      alarmMask: currentReading?.alarm_mask,
      computedStatus,
    });

    const since24hIso = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const readings24hRows = await fetchAllReadingsSince(deviceId, since24hIso);

    const communicationHealth = getCommunicationHealth({
      readings: readings24hRows,
      sendIntervalS: cfg.send_interval_s,
      deviceLastSeen: lastSeenIso,
      periodHours: 24,
    });

    const predictiveStatus = getPredictiveStatus(readings24hRows, cfg);

    const [
      { count: alerts24hCount, error: alertsCountError },
      { count: readings24hCount, error: readingsCountError },
    ] = await Promise.all([
      supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("device_id", deviceId)
        .eq("event", "triggered")
        .gte("sent_at", since24hIso),

      supabase
        .from("readings")
        .select("*", { count: "exact", head: true })
        .eq("device_id", deviceId)
        .gte("created_at", since24hIso),
    ]);

    if (alertsCountError) {
      console.error("Erro ao contar alertas:", alertsCountError);
      return res.status(500).json({ error: "Erro ao contar alertas" });
    }

    if (readingsCountError) {
      console.error("Erro ao contar leituras:", readingsCountError);
      return res.status(500).json({ error: "Erro ao contar leituras" });
    }

    res.json({
      device_id: deviceId,
      name: deviceRow?.name || deviceId,
      location: deviceRow?.location || "Local não definido",
      temperature: temperature !== null ? Number(temperature) : null,
      humidity: humidity !== null ? Number(humidity) : null,
      temp_low_c,
      temp_high_c,
      hum_low,
      hum_high,
      status: statusToApiLabel(normalizedStatus),
      online,
      last_seen: lastSeenIso,
      last_contact_at: lastSeenIso,
      last_reading_at: lastReadingAt,
      last_seen_seconds: lastSeenSeconds,
      alerts_24h: alerts24hCount || 0,
      total_readings_24h: readings24hCount || 0,
      backend_status: "connected",
      updated_at: deviceRow?.updated_at || latestReading?.created_at || null,
      alert_state,
      communication_health: communicationHealth,
      predictive_status: predictiveStatus,
    });
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- DASHBOARD: DEVICE HEALTH --------------------
app.get("/api/dashboard/device/:id/health", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 7);

    const { data: deviceRow, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceError) {
      console.error("Erro ao obter device em /health:", deviceError);
      return res.status(500).json({ error: "Erro ao obter dispositivo" });
    }

    if (!deviceRow) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    const cfg = getDeviceConfig(deviceRow);
    const readings = await getRecentReadingsForAnalysis(deviceId, hours);

    const communicationHealth = getCommunicationHealth({
      readings,
      sendIntervalS: cfg.send_interval_s,
      deviceLastSeen: deviceRow.last_seen,
      periodHours: hours,
    });

    const predictiveStatus = getPredictiveStatus(readings, cfg);

    return res.json({
      device_id: deviceId,
      hours,
      communication_health: communicationHealth,
      predictive_status: predictiveStatus,
    });
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id/health:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- DASHBOARD: DEVICE HISTORY --------------------
app.get("/api/dashboard/device/:id/history", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);

    const { data, error } = await supabase
      .from("readings")
      .select(
        "temperature, humidity, created_at, device_status, alarm_ack, alarm_ack_count, alarm_ack_time, alarm_ack_age_s, alarm_event_count, alarm_event_time, alarm_event_age_s, alarm_mask, alarm_reason"
      )
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Erro ao obter histórico:", error);
      return res.status(500).json({ error: "Erro ao obter histórico" });
    }

    const history = (data || []).reverse().map((row) => ({
      time: new Date(row.created_at).toLocaleTimeString("pt-PT", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit",
      }),
      temperature: Number(row.temperature),
      humidity: Number(row.humidity),
      created_at: row.created_at,
      device_status: row.device_status,
      alarm_ack: row.alarm_ack,
      alarm_ack_count: row.alarm_ack_count,
      alarm_ack_time: row.alarm_ack_time,
      alarm_ack_age_s: row.alarm_ack_age_s,
      alarm_event_count: row.alarm_event_count,
      alarm_event_time: row.alarm_event_time,
      alarm_event_age_s: row.alarm_event_age_s,
      alarm_mask: row.alarm_mask,
      alarm_reason: row.alarm_reason,
    }));

    res.json(history);
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id/history:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- DASHBOARD: DEVICE ALERTS --------------------
app.get("/api/dashboard/device/:id/alerts", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 30);
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("device_id", deviceId)
      .or(`sent_at.gte.${sinceIso},created_at.gte.${sinceIso}`)
      .order("sent_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Erro ao obter alertas:", error);
      return res.status(500).json({ error: "Erro ao obter alertas" });
    }

    const alerts = (data || []).map((row, index) => {
      const type = row.type || "system";
      const event = row.event || "triggered";

      let level = "normal";
      if (type === "offline" && event === "triggered") level = "alarm";
      else if (event === "triggered") level = "alert";
      else level = "normal";

      return {
        id: row.id || index + 1,
        type,
        event,
        level,
        title: row.title || "Evento registado",
        message: row.message || "Sem detalhe adicional.",
        created_at: formatDateTimePt(row.sent_at, true),
        sent_at: row.sent_at,
        temperature:
          row.temperature !== null && row.temperature !== undefined
            ? Number(row.temperature)
            : null,
        humidity:
          row.humidity !== null && row.humidity !== undefined
            ? Number(row.humidity)
            : null,
      };
    });

    if (alerts.length === 0) {
      return res.json([
        {
          id: 1,
          type: "system",
          event: "resolved",
          level: "normal",
          title: "Sistema estável",
          message: "Sem alertas registados para este dispositivo.",
          created_at: formatDateTimePt(new Date(), true),
          sent_at: new Date().toISOString(),
        },
      ]);
    }

    res.json(alerts);
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id/alerts:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- DASHBOARD: DEVICE SUMMARY --------------------
app.get("/api/dashboard/device/:id/summary", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 30);
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: readings, error: readingsError } = await supabase
      .from("readings")
      .select("temperature, humidity, created_at")
      .eq("device_id", deviceId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true });

    if (readingsError) {
      console.error("Erro ao obter summary:", readingsError);
      return res.status(500).json({ error: "Erro ao obter resumo" });
    }

    const temps = [];
    const hums = [];

    for (const row of readings || []) {
      const temp = Number(row.temperature);
      const hum = Number(row.humidity);

      if (Number.isFinite(temp)) temps.push(temp);
      if (Number.isFinite(hum)) hums.push(hum);
    }

    const avg = (arr, digits = 2) =>
      arr.length
        ? Number((arr.reduce((sum, v) => sum + v, 0) / arr.length).toFixed(digits))
        : null;

    res.json({
      hours,
      total_readings: (readings || []).length,
      temperature: {
        min: temps.length ? Math.min(...temps) : null,
        max: temps.length ? Math.max(...temps) : null,
        avg: avg(temps, 2),
      },
      humidity: {
        min: hums.length ? Math.min(...hums) : null,
        max: hums.length ? Math.max(...hums) : null,
        avg: avg(hums, 2),
      },
    });
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id/summary:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- PDF REPORT --------------------
app.get(["/api/device/:id/report", "/api/dashboard/device/:id/report"], async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const period = req.query.period || "24h";
    const sendEmailCopy =
      String(req.query.email || "false").toLowerCase() === "true";

    const { key: periodKey, label: periodLabel, hours: periodHours, sinceIso } =
      getReportPeriodRange(period);

    const [
      { data: deviceRow, error: deviceError },
      { data: readings, error: readingsError },
      { data: storedAlerts, error: storedAlertsError },
    ] = await Promise.all([
      supabase
        .from("devices")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle(),

      supabase
        .from("readings")
        .select(
          "temperature, humidity, created_at, device_status, alarm_ack, alarm_ack_count, alarm_ack_time, alarm_ack_age_s, alarm_event_count, alarm_event_time, alarm_event_age_s, alarm_mask, alarm_reason"
        )
        .eq("device_id", deviceId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }),

      supabase
        .from("alerts")
        .select("*")
        .eq("device_id", deviceId)
        .or(`sent_at.gte.${sinceIso},created_at.gte.${sinceIso}`)
        .order("sent_at", { ascending: true }),
    ]);

    if (deviceError) {
      console.error("Erro ao obter dispositivo para PDF:", deviceError);
      return res.status(500).json({ error: "Erro ao obter dispositivo" });
    }

    if (!deviceRow) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    if (storedAlertsError) {
      console.error("Erro ao obter alertas para PDF:", storedAlertsError);
    }

    let rows = readings || [];

    if (readingsError) {
      const { data: fallbackReadings, error: fallbackReadingsError } =
        await supabase
          .from("readings")
          .select("temperature, humidity, created_at")
          .eq("device_id", deviceId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true });

      if (fallbackReadingsError) {
        console.error("Erro ao obter leituras para PDF:", readingsError);
        return res.status(500).json({ error: "Erro ao obter leituras" });
      }

      rows = fallbackReadings || [];
    }

    if (!rows.length) {
      return res.status(404).json({ error: "Sem dados para relatório" });
    }

    const cfg = getDeviceConfig(deviceRow);
    const communicationHealth = getCommunicationHealth({
      readings: rows,
      sendIntervalS: cfg.send_interval_s,
      deviceLastSeen: deviceRow?.last_seen || rows[rows.length - 1]?.created_at || null,
      periodHours,
    });
    const alertHistory = mergeReportAlertHistory(
      buildStoredReportAlertHistory(storedAlerts || []),
      buildReportAlertHistory(rows, cfg, sinceIso)
    );

    const temperatures = rows
      .map((row) => Number(row.temperature))
      .filter((value) => Number.isFinite(value));

    const humidities = rows
      .map((row) => Number(row.humidity))
      .filter((value) => Number.isFinite(value));

    const tempMin = temperatures.length ? Math.min(...temperatures) : null;
    const tempAvg = average(temperatures, 1);
    const tempMax = temperatures.length ? Math.max(...temperatures) : null;

    const humMin = humidities.length ? Math.min(...humidities) : null;
    const humAvg = average(humidities, 0);
    const humMax = humidities.length ? Math.max(...humidities) : null;

    const firstReadingAt = rows[0]?.created_at || null;
    const lastReadingAt = rows[rows.length - 1]?.created_at || null;

    const safeFilenameName = sanitizeDeviceName(
      deviceRow?.name,
      deviceId
    ).replace(/[^a-zA-Z0-9_-]/g, "_");

    const filePeriod = formatPeriodLabelForFilename(periodKey);

    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Relatório ${sanitizeDeviceName(deviceRow?.name, deviceId)}`,
        Author: "SmartTempSystems",
        Subject: "Resumo de leituras",
      },
    });

    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));

    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);

      if (sendEmailCopy) {
        try {
          const recipients = await getDeviceAlertRecipients(deviceId);

          if (recipients.length) {
            await sendEmail({
              to: recipients,
              subject: `Relatório STS — ${sanitizeDeviceName(
                deviceRow?.name,
                deviceId
              )}`,
              htmlContent: buildEmailShell({
                heading: "Relatório de leituras",
                intro: `Segue em anexo o relatório do dispositivo ${sanitizeDeviceName(
                  deviceRow?.name,
                  deviceId
                )}, referente ao período de ${periodLabel}.`,
                blocks: [
                  { label: "Dispositivo", value: sanitizeDeviceName(deviceRow?.name, deviceId) },
                  { label: "Device ID", value: deviceId },
                  { label: "Localização", value: sanitizeLocation(deviceRow?.location) },
                  { label: "Período", value: periodLabel },
                  {
                    label: "Cobertura de leituras",
                    value: `${communicationHealth.received_readings} de ${communicationHealth.expected_readings} esperadas (${communicationHealth.delivery_pct}%)`,
                  },
                  { label: "Eventos de alerta", value: String(alertHistory.length) },
                ],
              }),
              attachment: [
                {
                  name: `${safeFilenameName}_relatorio_${filePeriod}.pdf`,
                  content: pdfBuffer.toString("base64"),
                },
              ],
            });
          }
        } catch (emailError) {
          console.error("Erro ao enviar PDF por email:", emailError);
        }
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFilenameName}_relatorio_${filePeriod}.pdf"`
      );

      return res.send(pdfBuffer);
    });

    doc
      .fillColor("#0f172a")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("SmartTempSystems", 42, 42);

    doc
      .fillColor("#0f766e")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Monitorizar Hoje. Proteger Amanhã.", 42, 72);

    doc
      .fillColor("#475569")
      .fontSize(12)
      .font("Helvetica")
      .text("Relatório de leituras", 42, 92);

    doc
      .roundedRect(42, 108, 511, 110, 12)
      .fillAndStroke("#f8fafc", "#dbe4ee");

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11);
    doc.text("Dispositivo", 58, 126);
    doc.text("Device ID", 58, 151);
    doc.text("Localização", 58, 176);

    doc.text("Período", 320, 126);
    doc.text("Cobertura", 320, 151);
    doc.text("Gerado em", 320, 176);

    doc.fillColor("#334155").font("Helvetica").fontSize(11);
    doc.text(sanitizeDeviceName(deviceRow?.name, deviceId), 140, 126);
    doc.text(deviceId, 140, 151);
    doc.text(sanitizeLocation(deviceRow?.location), 140, 176);

    doc.text(periodLabel, 390, 126);
    doc.text(`${communicationHealth.delivery_pct}%`, 390, 151);
    doc.text(formatDateTimePt(new Date(), true), 390, 176);

    let y = 246;

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(15)
      .text("Resumo de temperatura", 42, y);

    y += 26;

    doc
      .roundedRect(42, y, 511, 68, 10)
      .fillAndStroke("#ffffff", "#e2e8f0");

    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(10);
    doc.text("MÍNIMA", 62, y + 14);
    doc.text("MÉDIA", 234, y + 14);
    doc.text("MÁXIMA", 406, y + 14);

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(17);
    doc.text(tempMin !== null ? `${formatNumber(tempMin, 1)} °C` : "-", 62, y + 31);
    doc.text(tempAvg !== null ? `${formatNumber(tempAvg, 1)} °C` : "-", 234, y + 31);
    doc.text(tempMax !== null ? `${formatNumber(tempMax, 1)} °C` : "-", 406, y + 31);

    y += 98;

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(15)
      .text("Resumo de humidade", 42, y);

    y += 26;

    doc
      .roundedRect(42, y, 511, 68, 10)
      .fillAndStroke("#ffffff", "#e2e8f0");

    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(10);
    doc.text("MÍNIMA", 62, y + 14);
    doc.text("MÉDIA", 234, y + 14);
    doc.text("MÁXIMA", 406, y + 14);

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(17);
    doc.text(humMin !== null ? `${formatNumber(humMin, 0)} %` : "-", 62, y + 31);
    doc.text(humAvg !== null ? `${formatNumber(humAvg, 0)} %` : "-", 234, y + 31);
    doc.text(humMax !== null ? `${formatNumber(humMax, 0)} %` : "-", 406, y + 31);

    y += 102;

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(15)
      .text("Janela temporal analisada", 42, y);

    y += 26;

    doc
      .roundedRect(42, y, 511, 122, 10)
      .fillAndStroke("#ffffff", "#e2e8f0");

    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(10);
    doc.text("Primeira leitura", 62, y + 16);
    doc.text("Última leitura", 62, y + 46);
    doc.text("Leituras recebidas", 62, y + 76);
    doc.text("Cobertura", 320, y + 76);
    doc.text("Intervalo esperado", 62, y + 100);

    doc.fillColor("#0f172a").font("Helvetica").fontSize(11);
    doc.text(
      firstReadingAt ? formatDateTimePt(firstReadingAt, true) : "-",
      190,
      y + 16
    );
    doc.text(
      lastReadingAt ? formatDateTimePt(lastReadingAt, true) : "-",
      190,
      y + 46
    );
    doc.text(
      `${communicationHealth.received_readings} de ${communicationHealth.expected_readings}`,
      190,
      y + 76
    );
    doc.text(`${communicationHealth.delivery_pct}%`, 448, y + 76);
    doc.text(formatDurationCompact(communicationHealth.expected_interval_ms), 190, y + 100);

    y += 150;

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(15)
      .text("Limites configurados", 42, y);

    y += 26;

    doc
      .roundedRect(42, y, 511, 54, 10)
      .fillAndStroke("#ffffff", "#e2e8f0");

    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(10);
    doc.text("Intervalos configurados", 62, y + 20, { width: 180 });

    doc.fillColor("#0f172a").font("Helvetica").fontSize(11);
    doc.text(
      `Temp: ${formatNumber(cfg.temp_low_c, 1)} °C a ${formatNumber(
        cfg.temp_high_c,
        1
      )} °C | Hum: ${formatNumber(cfg.hum_low, 0)} % a ${formatNumber(
        cfg.hum_high,
        0
      )} %`,
      242,
      y + 18,
      {
        width: 285,
        align: "right",
      }
    );

    const drawFooter = () => {
      doc
        .fillColor("#64748b")
        .font("Helvetica")
        .fontSize(9)
        .text(
          "Documento gerado automaticamente pela plataforma SmartTempSystems.",
          42,
          785,
          {
            width: 511,
            align: "center",
          }
        );
    };

    if (alertHistory.length) {
      drawFooter();
      doc.addPage();

      const groupedAlertHistory = alertHistory.reduce((groups, event) => {
        const dateLabel = formatReportAlertDate(event);
        const lastGroup = groups[groups.length - 1];

        if (lastGroup?.dateLabel === dateLabel) {
          lastGroup.events.push(event);
        } else {
          groups.push({ dateLabel, events: [event] });
        }

        return groups;
      }, []);

      let alertY = 54;
      const startAlertHistoryPage = (showIntro = false) => {
        alertY = 54;
        doc
          .fillColor("#0f172a")
          .font("Helvetica-Bold")
          .fontSize(18)
          .text("Histórico de alertas", 42, alertY);

        alertY += 24;

        if (showIntro) {
          doc
            .fillColor("#64748b")
            .font("Helvetica")
            .fontSize(10)
            .text("Todos os eventos registados no período analisado.", 42, alertY);

          alertY += 30;
        } else {
          alertY += 14;
        }
      };

      const ensureAlertSpace = (height) => {
        if (alertY + height <= 760) return;
        drawFooter();
        doc.addPage();
        startAlertHistoryPage(false);
      };

      startAlertHistoryPage(true);

      groupedAlertHistory.forEach((group) => {
        ensureAlertSpace(32);

        doc
          .fillColor("#0f172a")
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(group.dateLabel, 42, alertY);

        alertY += 20;

        group.events.forEach((event) => {
          ensureAlertSpace(56);

          doc
            .roundedRect(42, alertY, 511, 46, 8)
            .fillAndStroke(event.color, event.stroke);

          doc
            .fillColor("#0f172a")
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(event.title, 58, alertY + 10, { width: 260 });

          doc
            .fillColor("#334155")
            .font("Helvetica")
            .fontSize(10)
            .text(event.detail, 58, alertY + 27, { width: 330 });

          doc
            .fillColor("#475569")
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(formatReportAlertTime(event), 410, alertY + 10, {
              width: 120,
              align: "right",
            });

          alertY += 56;
        });
      });

      drawFooter();
    } else {
      drawFooter();
    }

    doc.end();
  } catch (error) {
    console.error("Erro em /api/device/:id/report:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "Erro ao gerar PDF" });
    }
  }
});

// -------------------- ATUALIZAR CONFIG DISPOSITIVO --------------------
app.post("/api/device/:id/config", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;
    const {
      temp_low_c,
      temp_high_c,
      hum_low,
      hum_high,
      hyst_c,
      hyst_hum,
      send_interval_s,
      display_standby_min,
      name,
      location,
    } = req.body;

    const validationErrors = validateConfigNumbers({
      temp_low_c,
      temp_high_c,
      hum_low,
      hum_high,
      hyst_c,
      hyst_hum,
      send_interval_s,
      display_standby_min,
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(" | ") });
    }

    const { data: deviceRow, error: fetchError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!deviceRow) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    const currentConfig = deviceRow?.config || {};
    const nextVersion = (deviceRow?.config_version || 0) + 1;

    const updatedConfig = {
      ...currentConfig,
      ...(temp_low_c !== undefined ? { temp_low_c: Number(temp_low_c) } : {}),
      ...(temp_high_c !== undefined ? { temp_high_c: Number(temp_high_c) } : {}),
      ...(hum_low !== undefined ? { hum_low: Number(hum_low) } : {}),
      ...(hum_high !== undefined ? { hum_high: Number(hum_high) } : {}),
      ...(hyst_c !== undefined ? { hyst_c: Number(hyst_c) } : {}),
      ...(hyst_hum !== undefined ? { hyst_hum: Number(hyst_hum) } : {}),
      ...(send_interval_s !== undefined
        ? { send_interval_s: Number(send_interval_s) }
        : {}),
      ...(display_standby_min !== undefined
        ? { display_standby_min: Number(display_standby_min) }
        : {}),
      alert_state: currentConfig.alert_state || {
        temp_active: false,
        hum_active: false,
        offline_active: false,
      },
    };

    const payload = {
      config: updatedConfig,
      config_version: nextVersion,
      updated_at: nowIso(),
    };

    if (name !== undefined) {
      payload.name = sanitizeDeviceName(name, deviceId);
    }

    if (location !== undefined) {
      payload.location = sanitizeLocation(location);
    }

    const { data: updatedRow, error } = await supabase
      .from("devices")
      .update(payload)
      .eq("device_id", deviceId)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      message: "Configuração atualizada com sucesso",
      config_version: updatedRow.config_version,
      config: updatedRow.config,
      name: updatedRow.name,
      location: updatedRow.location,
      updated_at: updatedRow.updated_at,
    });
  } catch (error) {
    console.error("Erro em /api/device/:id/config [POST]:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// -------------------- OBTER CONFIG DISPOSITIVO --------------------
app.get("/api/device/:id/config", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const deviceId = req.params.id;

    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    const config = getDeviceConfig(data);
    const contactAt = nowIso();
    const contactUpdate = await supabase
      .from("devices")
      .update({
        last_contact_at: contactAt,
        last_seen: contactAt,
        updated_at: contactAt,
      })
      .eq("device_id", deviceId);

    if (contactUpdate.error) {
      if (isMissingDeviceContactColumnError(contactUpdate.error)) {
        const fallbackContactUpdate = await supabase
          .from("devices")
          .update({ last_seen: contactAt, updated_at: contactAt })
          .eq("device_id", deviceId);

        if (fallbackContactUpdate.error) {
          console.error("Erro ao atualizar contacto do dispositivo:", fallbackContactUpdate.error);
        }
      } else {
        console.error("Erro ao atualizar contacto do dispositivo:", contactUpdate.error);
      }
    }

    res.json({
      device_id: deviceId,
      name: data.name || deviceId,
      location: data.location || "Localização por definir",
      config_version: data.config_version || 1,
      updated_at: contactAt,
      last_contact_at: contactAt,
      config,
    });
  } catch (error) {
    console.error("Erro em /api/device/:id/config [GET]:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

function startHealthCheckScheduler() {
  if (
    !Number.isFinite(HEALTH_CHECK_INTERVAL_SECONDS) ||
    HEALTH_CHECK_INTERVAL_SECONDS <= 0
  ) {
    console.log("Verificacao automatica de offline desativada.");
    return;
  }

  const intervalMs = HEALTH_CHECK_INTERVAL_SECONDS * 1000;
  const runHealthCheck = async () => {
    try {
      const result = await checkDevicesHealthAndSendOfflineAlerts();
      if (result.offlineTriggered > 0) {
        console.log(
          `Alertas offline processados: ${result.offlineTriggered}/${result.processed}`
        );
      }
    } catch (error) {
      console.error("Erro na verificacao automatica de offline:", error);
    }
  };

  setTimeout(runHealthCheck, 5000);
  setInterval(runHealthCheck, intervalMs);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor SmartTempSystems ativo na porta " + PORT);
  if (!BREVO_API_KEY || !ALERT_FROM_EMAIL) {
    console.warn(
      "Email de alertas incompleto: configurar BREVO_API_KEY e ALERT_FROM_EMAIL."
    );
  }
  startHealthCheckScheduler();
});
