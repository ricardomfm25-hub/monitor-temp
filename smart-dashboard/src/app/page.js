"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

const DEFAULT_DEVICE_ID = "SmartTempSystems_01";
const AUTO_REFRESH_MS = 15000;
const MAX_HISTORY_HOURS = 24 * 7;
const DEVICE_STORAGE_KEY = "sts_selected_device_id";

const STS_PRODUCT = {
  family: "STS",
  product: "STS Cold",
  domain: "stsapp.pt",
};
const STS_TAGLINE = "Monitorizar Hoje. Proteger Amanhã.";
const STS_LOGO_SRC = "/sts-logo.png";

const STS_STATES = {
  ONLINE: "ONLINE",
  WARNING: "WARNING",
  ALERT: "ALERT",
  CRITICAL: "CRITICAL",
  OFFLINE: "OFFLINE",
  SETUP: "SETUP",
  MAINTENANCE: "MAINTENANCE",
  SENSOR_FAIL: "SENSOR_FAIL",
  RECOVERY: "RECOVERY",
};

const PERIODS = [
  { key: "1h", label: "1H", hours: 1, bucketMs: 5 * 60 * 1000, tickMs: 10 * 60 * 1000 },
  { key: "6h", label: "6H", hours: 6, bucketMs: 15 * 60 * 1000, tickMs: 60 * 60 * 1000 },
  { key: "12h", label: "12H", hours: 12, bucketMs: 30 * 60 * 1000, tickMs: 2 * 60 * 60 * 1000 },
  { key: "24h", label: "24H", hours: 24, bucketMs: 60 * 60 * 1000, tickMs: 4 * 60 * 60 * 1000 },
  { key: "7d", label: "7D", hours: 24 * 7, bucketMs: 24 * 60 * 60 * 1000, tickMs: 24 * 60 * 60 * 1000 },
];

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatShortTime(value, periodKey = "24h") {
  if (value === null || value === undefined) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  if (periodKey === "7d") {
    return d.toLocaleDateString("pt-PT", {
      timeZone: "Europe/Lisbon",
      day: "2-digit",
      month: "2-digit",
    });
  }

  return d.toLocaleTimeString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(value, suffix = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function formatRelativeTime(value) {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "-";

  const diff = Date.now() - ts;
  if (diff < 0) return "agora";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "agora";
  if (seconds < 60) return `há ${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function formatDurationCompact(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "-";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function toInputValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return String(value);
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).replace(",", ".");
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric;
}

function getOfflineLimitMs(sendIntervalS) {
  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 30 * 1000;

  return Math.max(expectedMs * 6, 180 * 1000);
}

function getEffectiveStatus(device, sendIntervalS) {
  const lastSeen = device?.last_seen ? new Date(device.last_seen).getTime() : null;
  const now = Date.now();
  const offlineLimitMs = getOfflineLimitMs(sendIntervalS);

  if (!lastSeen || now - lastSeen > offlineLimitMs) {
    return "OFFLINE";
  }

  return device?.status || "SEM DADOS";
}

function getStatusInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("ack")) {
    return {
      label: "ACK",
      color: "#60a5fa",
      soft: "#172554",
      border: "#1d4ed8",
      glow: "0 0 0 1px rgba(96,165,250,0.12)",
      priority: 1,
      dot: "#60a5fa",
      panel: "#101a2d",
    };
  }

  if (s.includes("offline")) {
    return {
      label: "OFFLINE",
      color: "#ef4444",
      soft: "#2a1316",
      border: "#4b1f24",
      glow: "0 0 0 1px rgba(239,68,68,0.12)",
      priority: 3,
      dot: "#ef4444",
      panel: "#15131a",
    };
  }

  if (s.includes("alarm") || s.includes("critical")) {
    return {
      label: "ALARME",
      color: "#ef4444",
      soft: "#2a1316",
      border: "#4b1f24",
      glow: "0 0 0 1px rgba(239,68,68,0.12)",
      priority: 0,
      dot: "#ef4444",
      panel: "#15131a",
    };
  }

  if (s.includes("alert")) {
    return {
      label: "ALERTA",
      color: "#f59e0b",
      soft: "#2a2112",
      border: "#4b3a1d",
      glow: "0 0 0 1px rgba(245,158,11,0.10)",
      priority: 1,
      dot: "#f59e0b",
      panel: "#15131a",
    };
  }

  if (s.includes("normal") || s.includes("ok")) {
    return {
      label: "NORMAL",
      color: "#22c55e",
      soft: "#132219",
      border: "#1f3b2a",
      glow: "0 0 0 1px rgba(34,197,94,0.10)",
      priority: 2,
      dot: "#22c55e",
      panel: "#151c27",
    };
  }

  return {
    label: status || "SEM DADOS",
    color: "#94a3b8",
    soft: "#161b22",
    border: "#293241",
    glow: "0 0 0 1px rgba(148,163,184,0.08)",
    priority: 4,
    dot: "#94a3b8",
    panel: "#151c27",
  };
}

function getAlertLevelInfo(level) {
  const s = String(level || "").toLowerCase();

  if (s.includes("ack") || s.includes("acknowledged")) {
    return {
      label: "ACK",
      color: "#60a5fa",
      bg: "#172554",
      border: "#1d4ed8",
    };
  }

  if (s.includes("alarm") || s.includes("critical")) {
    return {
      label: "ALARME",
      color: "#ef4444",
      bg: "#2a1316",
      border: "#4b1f24",
    };
  }

  if (s.includes("alert")) {
    return {
      label: "ALERTA",
      color: "#f59e0b",
      bg: "#2a2112",
      border: "#4b3a1d",
    };
  }

  if (s.includes("normal") || s.includes("recover") || s.includes("resolved")) {
    return {
      label: "NORMALIZADO",
      color: "#22c55e",
      bg: "#132219",
      border: "#1f3b2a",
    };
  }

  return {
    label: "NORMALIZADO",
    color: "#22c55e",
    bg: "#132219",
    border: "#1f3b2a",
  };
}

function getSeriesMinMax(data, key) {
  const values = data
    .map((item) => parseNumber(item?.[key]))
    .filter((v) => v !== null);

  if (!values.length) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getChartDomain(data, key, thresholds = []) {
  const values = data
    .map((item) => parseNumber(item?.[key]))
    .filter((v) => v !== null);

  const thresholdValues = thresholds
    .map((v) => parseNumber(v))
    .filter((v) => v !== null);

  const combined = [...values, ...thresholdValues];

  if (!combined.length) return ["auto", "auto"];

  let min = Math.min(...combined);
  let max = Math.max(...combined);

  if (min === max) {
    const pad =
      key === "humidity"
        ? Math.max(Math.abs(min) * 0.02, 1)
        : Math.max(Math.abs(min) * 0.03, 0.6);

    return [
      Number((min - pad).toFixed(2)),
      Number((max + pad).toFixed(2)),
    ];
  }

  const range = max - min;
  const pad =
    key === "humidity"
      ? Math.max(range * 0.15, 1)
      : Math.max(range * 0.18, 0.3);

  return [
    Number((min - pad).toFixed(2)),
    Number((max + pad).toFixed(2)),
  ];
}

function getReferencePoints(data, key) {
  const points = data
    .map((item) => ({
      value: parseNumber(item?.[key]),
      created_at: item?.created_at,
      timestamp: item?.timestamp,
    }))
    .filter(
      (item) =>
        item.value !== null &&
        item.created_at &&
        Number.isFinite(item.timestamp)
    );

  if (!points.length) {
    return { minPoint: null, maxPoint: null };
  }

  let minPoint = points[0];
  let maxPoint = points[0];

  for (const point of points) {
    if (point.value < minPoint.value) minPoint = point;
    if (point.value > maxPoint.value) maxPoint = point;
  }

  return { minPoint, maxPoint };
}

function getNiceTemperatureTicks(domain) {
  if (!Array.isArray(domain) || domain.length !== 2) return undefined;

  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;

  const range = max - min;
  if (range <= 0) return [Number(min.toFixed(1)), Number(max.toFixed(1))];

  const steps = 5;
  const rawStep = range / steps;

  let step = 0.1;
  if (rawStep > 5) step = 2;
  else if (rawStep > 2) step = 1;
  else if (rawStep > 1) step = 0.5;
  else if (rawStep > 0.5) step = 0.2;

  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Number(v.toFixed(1)));
  }

  return ticks;
}

function getPeriodConfig(periodKey) {
  return PERIODS.find((p) => p.key === periodKey) || PERIODS[3];
}

function floorToBucket(timestamp, bucketMs) {
  return Math.floor(timestamp / bucketMs) * bucketMs;
}

function getPeriodWindow(periodKey) {
  const cfg = getPeriodConfig(periodKey);
  const end = Date.now();

  if (periodKey === "7d") {
    const now = new Date();
    const endDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
    const startDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
      0,
      0,
      0,
      0
    ).getTime();

    return { start: startDay, end: endDay, bucketMs: cfg.bucketMs, tickMs: cfg.tickMs };
  }

  return {
    start: end - cfg.hours * 60 * 60 * 1000,
    end,
    bucketMs: cfg.bucketMs,
    tickMs: cfg.tickMs,
  };
}

function buildTimeSeries(readings, periodKey) {
  const { start, end, bucketMs } = getPeriodWindow(periodKey);

  const filtered = (readings || [])
    .filter((item) => Number.isFinite(item?.timestamp))
    .filter((item) => item.timestamp >= start && item.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);

  const buckets = new Map();

  for (let t = floorToBucket(start, bucketMs); t <= end; t += bucketMs) {
    const d = new Date(t);
    const bucketTime =
      periodKey === "7d"
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
        : t;

    if (bucketTime >= start && !buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        timestamp: bucketTime,
        created_at: new Date(bucketTime).toISOString(),
        temperature: null,
        humidity: null,
        tempSum: 0,
        tempCount: 0,
        humSum: 0,
        humCount: 0,
        hasData: false,
      });
    }
  }

  for (const item of filtered) {
    let bucketTime;

    if (periodKey === "7d") {
      const d = new Date(item.timestamp);
      bucketTime = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        0,
        0,
        0,
        0
      ).getTime();
    } else {
      bucketTime = floorToBucket(item.timestamp, bucketMs);
    }

    if (!buckets.has(bucketTime)) continue;
    const bucket = buckets.get(bucketTime);

    const temp = parseNumber(item.temperature);
    const hum = parseNumber(item.humidity);

    if (temp !== null) {
      bucket.tempSum += temp;
      bucket.tempCount += 1;
      bucket.hasData = true;
    }

    if (hum !== null) {
      bucket.humSum += hum;
      bucket.humCount += 1;
      bucket.hasData = true;
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      timestamp: bucket.timestamp,
      created_at: bucket.created_at,
      temperature:
        bucket.tempCount > 0
          ? Number((bucket.tempSum / bucket.tempCount).toFixed(2))
          : null,
      humidity:
        bucket.humCount > 0
          ? Number((bucket.humSum / bucket.humCount).toFixed(2))
          : null,
      hasData: bucket.hasData,
    }))
    .filter((item) => item.timestamp >= start && item.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getXAxisTicks(periodKey) {
  const { start, end, tickMs } = getPeriodWindow(periodKey);
  const ticks = [];

  if (periodKey === "7d") {
    for (let t = start; t <= end; t += tickMs) {
      ticks.push(t);
    }
    return ticks;
  }

  ticks.push(start);
  let current = Math.ceil(start / tickMs) * tickMs;

  while (current < end) {
    ticks.push(current);
    current += tickMs;
  }

  ticks.push(end);
  return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

function getCommunicationHealth({
  rawReadings,
  sendIntervalS,
  deviceLastSeen,
  periodKey,
}) {
  const { start, end } = getPeriodWindow(periodKey);

  const sorted = [...(rawReadings || [])]
    .filter((item) => Number.isFinite(item?.timestamp))
    .filter((item) => item.timestamp >= start && item.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);

  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 30 * 1000;

  const offlineThresholdMs = getOfflineLimitMs(sendIntervalS);
  const periodMs = Math.max(end - start, expectedMs);
  const expectedReadings = Math.max(1, Math.round(periodMs / expectedMs));
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

  const regularityPct = Math.max(
    0,
    Math.min(100, Math.round(deliveryPct - penalty))
  );

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

function formatMetricValue(value, type) {
  if (!Number.isFinite(Number(value))) return "-";
  return type === "temperature"
    ? `${Number(value).toFixed(1)} °C`
    : `${Math.round(Number(value))}%`;
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
  const ageSeconds = parseNumber(latest?.alarm_event_age_s);
  const mask = parseNumber(latest?.alarm_mask);

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
      value: parseNumber(r?.[valueKey]),
      alarm_mask: parseNumber(r?.alarm_mask),
      alarm_event_age_s: parseNumber(r?.alarm_event_age_s),
    }))
    .filter((r) => r.created_at && r.value !== null)
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

  if (clean.length < 6) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Sem leituras suficientes para avaliar tendência.",
      cause: "A amostra recente ainda é curta.",
      action: "Aguardar novas leituras antes de concluir.",
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
      detail: "Sem leituras suficientes para avaliar tendência.",
      cause: "Intervalos de leitura insuficientes para cálculo fiável.",
      action: "Aguardar novas leituras antes de concluir.",
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
      detail: "Sem tendência relevante nas últimas leituras recentes.",
      cause: "Valores sem direção consistente.",
      action: "Manter monitorização normal.",
      source: type,
      score: 0,
    };
  }

  const avgSlope =
    slopes.reduce((sum, value) => sum + value, 0) / slopes.length;
  const absAvgSlope = Math.abs(avgSlope);

  const targetLimit =
    direction === "up" ? highLimit : direction === "down" ? lowLimit : null;

  if (targetLimit === null || targetLimit === undefined) {
    return {
      active: false,
      severity: "none",
      eta_minutes: null,
      title: "Risco baixo",
      detail: "Limites de referência incompletos.",
      cause: "A configuração de limites não está completa.",
      action: "Confirmar limites definidos para o dispositivo.",
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
  const currentLimit = currentSide === "high" ? highLimit : currentSide === "low" ? lowLimit : targetLimit;
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
      narrative.band === "grave" || narrative.persistent ? "high" : narrative.band === "moderado" ? "medium" : "low";

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
      detail: "Sem tendência relevante nas últimas leituras recentes.",
      cause: "Valores estáveis face aos limites definidos.",
      action: "Manter monitorização normal.",
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
      cause: "Limite atingido.",
      action: "Verificar o equipamento e reduzir fatores de instabilidade.",
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
      detail: "Sem tendência relevante nas últimas leituras recentes.",
      cause: "Cálculo de aproximação inconclusivo.",
      action: "Manter monitorização normal.",
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
      title: narrative.title,
      detail: narrative.detail,
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
      title: narrative.title,
      detail: narrative.detail,
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
    detail: "Sem tendência relevante nas últimas leituras recentes.",
    cause: "Valores dentro do comportamento esperado.",
    action: "Manter monitorização normal.",
    source: type,
    score: 0,
  };
}

function getPredictiveStatus(readings, config) {
  const tempSignal = buildPredictiveSignal({
    readings,
    valueKey: "temperature",
    lowLimit: parseNumber(config?.temp_low_c),
    highLimit: parseNumber(config?.temp_high_c),
    type: "temperature",
  });

  const humSignal = buildPredictiveSignal({
    readings,
    valueKey: "humidity",
    lowLimit: parseNumber(config?.hum_low),
    highLimit: parseNumber(config?.hum_high),
    type: "humidity",
  });

  const best = [tempSignal, humSignal].sort((a, b) => b.score - a.score)[0];

  if (!readings?.length) {
  return {
    level: "unknown",
    title: "Predição indisponível",
    detail: "Sem leituras recentes suficientes para calcular tendência.",
    cause: "A dashboard ainda não recebeu dados suficientes.",
    action: "Confirmar comunicação e aguardar novas leituras.",
    chip: "Sem dados",
    source: "none",
    source_label: "Sem dados recentes",
    eta_minutes: null,
    score: 0,
  };
}

if (!best || best.score <= 0) {
  return {
    level: "low",
    title: "Risco baixo",
    detail: "Sem tendência relevante nas últimas leituras recentes.",
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

function getOperationalInsights({
  device,
  config,
  communicationHealth,
  predictiveStatus,
}) {
  const insights = [];

  const lastSeenSeconds = Number(device?.last_seen_seconds ?? 999999);
  const isOnline = device?.online === true;
  const isLongOffline = !isOnline || lastSeenSeconds > 3600;

  if (isLongOffline) {
    insights.push({
      title: "Comunicação interrompida",
      detail:
        lastSeenSeconds > 86400
          ? `Sem comunicação há ${Math.floor(lastSeenSeconds / 86400)} dias.`
          : "Sem comunicação recente com o equipamento.",
      tone: "bad",
    });

    insights.push({
      title: "Tempo real suspenso",
      detail: "Últimos valores disponíveis apenas como histórico.",
      tone: "warn",
    });

    return insights.slice(0, 3);
  }

  const temp = parseNumber(device?.last_temperature);
  const hum = parseNumber(device?.last_humidity);
  const tempLow = parseNumber(config?.temp_low_c);
  const tempHigh = parseNumber(config?.temp_high_c);
  const humLow = parseNumber(config?.hum_low);
  const humHigh = parseNumber(config?.hum_high);

  if (Number.isFinite(temp) && Number.isFinite(tempHigh) && temp > tempHigh) {
    insights.push({
      title: "Temperatura acima do limite",
      detail: `Valor atual ${formatValue(temp, " °C")} face ao máximo configurado de ${formatValue(tempHigh, " °C")}.`,
      tone: "warn",
    });
  } else if (Number.isFinite(temp) && Number.isFinite(tempLow) && temp < tempLow) {
    insights.push({
      title: "Temperatura abaixo do limite",
      detail: `Valor atual ${formatValue(temp, " °C")} face ao mínimo configurado de ${formatValue(tempLow, " °C")}.`,
      tone: "warn",
    });
  }

  if (Number.isFinite(hum) && Number.isFinite(humHigh) && hum > humHigh) {
    insights.push({
      title: "Humidade acima do limite",
      detail: `Valor atual ${formatValue(hum, " %", 0)} face ao máximo configurado de ${formatValue(humHigh, " %", 0)}.`,
      tone: "warn",
    });
  } else if (Number.isFinite(hum) && Number.isFinite(humLow) && hum < humLow) {
    insights.push({
      title: "Humidade abaixo do limite",
      detail: `Valor atual ${formatValue(hum, " %", 0)} face ao mínimo configurado de ${formatValue(humLow, " %", 0)}.`,
      tone: "warn",
    });
  }

  if (communicationHealth?.label === "Instável") {
    insights.push({
      title: "Comunicação instável",
      detail: communicationHealth?.summary || "Existem perdas relevantes nas leituras.",
      tone: "warn",
    });
  } else if (communicationHealth?.label === "Com falhas") {
    insights.push({
      title: "Pequenas falhas de comunicação",
      detail: communicationHealth?.summary || "A comunicação continua aceitável.",
      tone: "warn",
    });
  }

  if (predictiveStatus?.level === "high") {
    insights.push({
      title: "Risco preditivo elevado",
      detail: predictiveStatus?.detail || "Tendência com potencial de alerta em breve.",
      tone: "bad",
    });
  } else if (predictiveStatus?.level === "medium") {
    insights.push({
      title: "Risco preditivo moderado",
      detail: predictiveStatus?.detail || "A variável aproxima-se do limite.",
      tone: "warn",
    });
  }

  if (!insights.length) {
    insights.push({
      title: "Operação dentro do esperado",
      detail: "Sem desvios críticos detetados neste momento.",
      tone: "good",
    });
  }

  return insights.slice(0, 3);
}

function normalizeAlertRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.alerts)
    ? payload.alerts
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.events)
    ? payload.events
    : [];

  return rows.map(normalizeAlertEvent);
}

function normalizeAlertType(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("hum")) return "humidity";
  if (s.includes("temp")) return "temperature";
  if (s.includes("offline") || s.includes("wifi") || s.includes("connection")) return "offline";
  if (s.includes("system") || s.includes("ack")) return "system";
  return value || "system";
}

function normalizeAlertLevel(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("ack")) return "ack";
  if (s.includes("normal") || s.includes("recover") || s.includes("resolved")) return "normal";
  if (s.includes("alarm") || s.includes("critical")) return "alarm";
  if (s.includes("alert") || s.includes("high") || s.includes("low")) return "alert";
  return value || "alert";
}

function normalizeAlertState(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("high") || s.includes("above") || s.includes("max") || s.includes("alta")) {
    return "high";
  }
  if (s.includes("low") || s.includes("below") || s.includes("min") || s.includes("baixa")) {
    return "low";
  }
  return null;
}

function normalizeAlertEvent(item) {
  if (!item) return item;
  const eventDescriptor =
    item.event_type ||
    item.event ||
    item.kind ||
    item.reason ||
    item.title ||
    item.type ||
    "";
  const levelDescriptor = [
    item.level,
    item.severity,
    item.status,
    eventDescriptor,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...item,
    type: normalizeAlertType(item.type || item.metric || item.variable || eventDescriptor),
    level: normalizeAlertLevel(levelDescriptor),
    state: item.state || item.direction || normalizeAlertState(`${eventDescriptor} ${item.status || ""}`),
    created_at: item.created_at || item.timestamp || item.sent_at,
    sent_at: item.sent_at || item.created_at || item.timestamp || null,
    temperature: parseNumber(item.temperature ?? item.temp ?? item.value_temperature),
    humidity: parseNumber(item.humidity ?? item.hum ?? item.value_humidity),
  };
}

function getReadingAlertState(reading, config, key) {
  const value = parseNumber(reading?.[key]);
  const low =
    key === "temperature"
      ? parseNumber(config?.temp_low_c)
      : parseNumber(config?.hum_low);
  const high =
    key === "temperature"
      ? parseNumber(config?.temp_high_c)
      : parseNumber(config?.hum_high);

  if (value === null) return null;
  if (high !== null && value >= high) return "high";
  if (low !== null && value <= low) return "low";
  return null;
}

function getReadingAlarmMask(reading) {
  const mask = parseNumber(reading?.alarm_mask);
  return mask !== null && mask > 0 ? mask : null;
}

function getMaskAlertState(mask, key) {
  if (mask === null) return null;

  if (key === "temperature") {
    if (mask & 0x01) return "high";
    if (mask & 0x02) return "low";
  }

  if (key === "humidity") {
    if (mask & 0x04) return "high";
    if (mask & 0x08) return "low";
  }

  return null;
}

function getEffectiveReadingAlertState(reading, config, key) {
  const maskState = getMaskAlertState(getReadingAlarmMask(reading), key);
  return maskState || getReadingAlertState(reading, config, key);
}

function getReadingEventIso(reading, ageKey) {
  const createdTs = new Date(reading?.created_at).getTime();
  const ageSeconds = parseNumber(reading?.[ageKey]);

  if (!Number.isFinite(createdTs) || ageSeconds === null || ageSeconds < 0) {
    return reading?.created_at || new Date(reading?.timestamp || Date.now()).toISOString();
  }

  return new Date(createdTs - ageSeconds * 1000).toISOString();
}

function buildDerivedAlertEvent(reading, type, level, state, source, derived = true, options = {}) {
  const eventAt =
    options.eventAt ||
    reading?.created_at ||
    new Date(reading?.timestamp || Date.now()).toISOString();

  return {
    id: `derived-${type}-${level}-${state || "state"}-${eventAt}`,
    type,
    level,
    state,
    source,
    created_at: eventAt,
    sent_at: eventAt,
    detected_at: eventAt,
    received_at: reading?.created_at || null,
    device_time: options.deviceTime || null,
    temperature: parseNumber(reading?.temperature),
    humidity: parseNumber(reading?.humidity),
    alarm_mask: parseNumber(reading?.alarm_mask),
    alarm_reason: reading?.alarm_reason || null,
    derived,
  };
}

function buildCurrentReadingFromDevice(device) {
  if (!device) return null;
  const timestamp = device?.last_seen ? new Date(device.last_seen).getTime() : Date.now();

  return {
    created_at: device?.last_seen || new Date(timestamp).toISOString(),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    temperature: parseNumber(device?.last_temperature),
    humidity: parseNumber(device?.last_humidity),
    device_status: device?.status,
    alarm_ack: String(device?.status || "").toLowerCase().includes("ack"),
    current_snapshot: true,
  };
}

function deriveAlertEventsFromReadings(readings, config) {
  const ordered = [...(readings || [])]
    .filter((item) => Number.isFinite(item?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const events = [];
  const activeState = {
    temperature: null,
    humidity: null,
  };
  const activeSource = {
    temperature: null,
    humidity: null,
  };
  let ackActive = false;
  let lastAckCount = null;

  ordered.forEach((reading) => {
    ["temperature", "humidity"].forEach((type) => {
      const maskState = getMaskAlertState(getReadingAlarmMask(reading), type);
      const thresholdState = getReadingAlertState(reading, config, type);
      const nextState = maskState || thresholdState;
      const nextSource = maskState ? "firmware_alarm" : nextState ? "reading" : null;
      const previousState = activeState[type];
      const previousSource = activeSource[type];
      const isDerived = nextSource !== "firmware_alarm";

      if (nextState && nextState !== previousState) {
        events.push(
          buildDerivedAlertEvent(reading, type, "alert", nextState, nextSource, isDerived, {
            eventAt: getReadingEventIso(reading, "alarm_event_age_s"),
            deviceTime: reading?.alarm_event_time || null,
          })
        );
      }

      if (!nextState && previousState) {
        events.push(
          buildDerivedAlertEvent(
            reading,
            type,
            "normal",
            previousState,
            previousSource || "reading",
            previousSource !== "firmware_alarm"
          )
        );
      }

      activeState[type] = nextState;
      activeSource[type] = nextSource;
    });

    const readingAckCount = parseNumber(reading?.alarm_ack_count);
    const readingAck =
      reading?.alarm_ack === true ||
      String(reading?.alarm_ack || "").toLowerCase() === "true" ||
      String(reading?.device_status || reading?.status || "").toLowerCase().includes("ack");

    if (
      readingAckCount !== null &&
      readingAck &&
      ((lastAckCount === null && readingAckCount > 0) ||
        (lastAckCount !== null && readingAckCount > lastAckCount))
    ) {
      events.push(
        buildDerivedAlertEvent(reading, "system", "ack", null, "device_status", false, {
          eventAt: getReadingEventIso(reading, "alarm_ack_age_s"),
          deviceTime: reading?.alarm_ack_time || null,
        })
      );
    } else if (readingAckCount === null && readingAck && !ackActive) {
      events.push(
        buildDerivedAlertEvent(reading, "system", "ack", null, "device_status", false, {
          eventAt: getReadingEventIso(reading, "alarm_ack_age_s"),
          deviceTime: reading?.alarm_ack_time || null,
        })
      );
    }

    if (readingAckCount !== null) lastAckCount = readingAckCount;
    ackActive = readingAck;
  });

  return events;
}

function deriveCurrentAlertEvents(device, config, existingEvents) {
  const reading = buildCurrentReadingFromDevice(device);
  if (!reading) return [];

  const events = [];

  ["temperature", "humidity"].forEach((type) => {
    const currentState = getReadingAlertState(reading, config, type);
    if (!currentState) return;

    const latestForType = [...(existingEvents || [])]
      .filter((item) => String(item?.type || "").toLowerCase() === type)
      .sort((a, b) => getAlertTimestamp(b) - getAlertTimestamp(a))[0];
    const alreadyOpen =
      String(latestForType?.level || "").toLowerCase() === "alert" &&
      String(latestForType?.state || "").toLowerCase() === currentState;

    if (!alreadyOpen) {
      events.push(buildDerivedAlertEvent(reading, type, "alert", currentState, "current_state"));
    }
  });

  return events;
}

function getAlertTimestamp(item) {
  const ts = new Date(
    item?.detected_at || item?.event_at || item?.sent_at || item?.created_at
  ).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function getAlertDedupeKey(item) {
  const bucket = Math.floor(getAlertTimestamp(item) / 120000);
  return [
    String(item?.type || "system").toLowerCase(),
    String(item?.level || "").toLowerCase(),
    String(item?.state || item?.direction || "").toLowerCase(),
    bucket,
  ].join("|");
}

function areEquivalentAlertEvents(a, b) {
  const aType = String(a?.type || "system").toLowerCase();
  const bType = String(b?.type || "system").toLowerCase();
  const aLevel = String(a?.level || "").toLowerCase();
  const bLevel = String(b?.level || "").toLowerCase();
  if (aType !== bType || aLevel !== bLevel) return false;

  const aState = String(a?.state || a?.direction || "").toLowerCase();
  const bState = String(b?.state || b?.direction || "").toLowerCase();
  if (aState && bState && aState !== bState) return false;

  const diffMs = Math.abs(getAlertTimestamp(a) - getAlertTimestamp(b));
  return diffMs <= 120000;
}

function mergeAlertEvents(backendAlerts, derivedAlerts) {
  const merged = [];
  const seen = new Set();

  [...normalizeAlertRows(backendAlerts), ...(derivedAlerts || [])]
    .filter(Boolean)
    .sort((a, b) => getAlertTimestamp(b) - getAlertTimestamp(a))
    .forEach((item) => {
      const key = getAlertDedupeKey(item);
      if (seen.has(key)) return;
      if (item?.derived && merged.some((existing) => !existing?.derived && areEquivalentAlertEvents(existing, item))) {
        return;
      }
      seen.add(key);
      merged.push(item);
    });

  return merged;
}

function getDevicePriority(device) {
  return getStatusInfo(
    getEffectiveStatus(device, parseNumber(device?.config?.send_interval_s))
  ).priority;
}

function sortDevices(devices) {
  return [...(devices || [])].sort((a, b) => {
    const priorityDiff = getDevicePriority(a) - getDevicePriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    const aSeen = a?.last_seen ? new Date(a.last_seen).getTime() : 0;
    const bSeen = b?.last_seen ? new Date(b.last_seen).getTime() : 0;
    if (bSeen !== aSeen) return bSeen - aSeen;

    const aName = String(a?.name || a?.device_id || "");
    const bName = String(b?.name || b?.device_id || "");
    return aName.localeCompare(bName, "pt");
  });
}

function getBestInitialDeviceId(devices, currentSelectedId) {
  const safeDevices = devices || [];
  if (!safeDevices.length) return null;

  if (currentSelectedId && safeDevices.some((d) => d.device_id === currentSelectedId)) {
    return currentSelectedId;
  }

  if (typeof window !== "undefined") {
    const storedId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (storedId && safeDevices.some((d) => d.device_id === storedId)) {
      return storedId;
    }
  }

  const ordered = sortDevices(safeDevices);
  return ordered[0]?.device_id || safeDevices[0]?.device_id || null;
}

function CustomTooltip({ active, payload, label, unit, digits = 1 }) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload;
  const value = payload[0]?.value;

  return (
    <div style={styles.tooltip}>
      <div style={styles.tooltipTitle}>
        {formatDateTime(point?.created_at || label)}
      </div>
      <div style={styles.tooltipValue}>
        {value === null || value === undefined
          ? "Sem leitura neste intervalo"
          : (
            <>
              Valor: <strong>{formatValue(value, unit, digits)}</strong>
            </>
          )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, tone = "neutral", subvalue, accentLabel }) {
  const toneMap = {
    neutral: {
      border: "#223047",
      bg: "#0f172a",
      value: "#f8fafc",
      accent: "#94a3b8",
      chipBg: "#111827",
    },
    good: {
      border: "#223047",
      bg: "#0f172a",
      value: "#f8fafc",
      accent: "#22c55e",
      chipBg: "#132219",
    },
    warn: {
      border: "#223047",
      bg: "#0f172a",
      value: "#f8fafc",
      accent: "#f59e0b",
      chipBg: "#2a2112",
    },
    bad: {
      border: "#223047",
      bg: "#0f172a",
      value: "#f8fafc",
      accent: "#ef4444",
      chipBg: "#2a1316",
    },
  };

  const selected = toneMap[tone] || toneMap.neutral;

  return (
    <div
      style={{
        ...styles.metricCard,
        borderColor: selected.border,
        background: selected.bg,
      }}
    >
      <div style={styles.metricTopRow}>
        <div style={styles.metricLabel}>{label}</div>
        {accentLabel ? (
          <span
            style={{
              ...styles.miniChip,
              color: "#94a3b8",
              borderColor: "transparent",
              background: "#111827",
            }}
          >
            {accentLabel}
          </span>
        ) : null}
      </div>

      <div
        style={{
          ...styles.metricValue,
          color: tone === "warn" || tone === "bad" ? selected.accent : selected.value,
        }}
      >
        {value}
      </div>
      {subvalue ? <div style={styles.metricSubvalue}>{subvalue}</div> : null}
    </div>
  );
}

function InfoItem({ label, value, valueColor }) {
  return (
    <div style={styles.infoItem}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={{ ...styles.infoValue, color: valueColor || styles.infoValue.color }}>
        {value}
      </span>
    </div>
  );
}

function SmallStat({ label, value }) {
  return (
    <div style={styles.smallStat}>
      <div style={styles.smallStatLabel}>{label}</div>
      <div style={styles.smallStatValue}>{value}</div>
    </div>
  );
}

function HealthStatCard({ label, value, hint, tone = "neutral", badge }) {
  const toneStyles = getHealthToneStyles(tone);

  return (
    <div style={styles.healthCard}>
      <div style={styles.healthTop}>
        <div style={styles.healthLabel}>{label}</div>
        {badge ? (
          <span
            style={{
              ...styles.healthBadge,
              background: toneStyles.badgeBg,
              borderColor: toneStyles.badgeBorder,
              color: toneStyles.valueColor,
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <div style={{ ...styles.healthValue, color: toneStyles.valueColor }}>
        {value}
      </div>
      <div style={styles.healthHint}>{hint}</div>
    </div>
  );
}

function getHealthToneStyles(tone) {
  if (tone === "good") {
    return {
      valueColor: "#22c55e",
      badgeBg: "#132219",
      badgeBorder: "transparent",
    };
  }

  if (tone === "warn") {
    return {
      valueColor: "#f59e0b",
      badgeBg: "#2a2112",
      badgeBorder: "transparent",
    };
  }

  if (tone === "bad") {
    return {
      valueColor: "#ef4444",
      badgeBg: "#2a1316",
      badgeBorder: "transparent",
    };
  }

  return {
    valueColor: "#cbd5e1",
    badgeBg: "#162033",
    badgeBorder: "transparent",
  };
}

function DeviceSelector({
  devices,
  selectedDeviceId,
  onSelect,
  isMobile,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const orderedDevices = useMemo(() => sortDevices(devices), [devices]);
  const selectedDevice =
    orderedDevices.find((item) => item.device_id === selectedDeviceId) ||
    orderedDevices[0] ||
    null;

  const selectedStatusInfo = getStatusInfo(
    getEffectiveStatus(selectedDevice, parseNumber(selectedDevice?.config?.send_interval_s))
  );

  const stats = useMemo(() => {
    const all = orderedDevices.length;
    const offline = orderedDevices.filter(
      (item) =>
        getEffectiveStatus(item, parseNumber(item?.config?.send_interval_s)) === "OFFLINE"
    ).length;

    const alerts = orderedDevices.filter((item) => {
      const status = String(
        getEffectiveStatus(item, parseNumber(item?.config?.send_interval_s)) || ""
      ).toLowerCase();

      return status.includes("alert") || status.includes("alarm") || status.includes("critical");
    }).length;

    const normal = Math.max(0, all - offline - alerts);

    return { all, offline, alerts, normal };
  }, [orderedDevices]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!orderedDevices.length) {
    return (
      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.cardTitle}>Dispositivo</div>
            <div style={styles.cardHint}>Nenhum dispositivo disponível</div>
          </div>
        </div>

        <div style={styles.emptyState}>Nenhum dispositivo encontrado.</div>
      </section>
    );
  }

  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.cardTitle}>Dispositivos monitorizados</div>
          <div style={styles.cardHint}>
            Seleção do equipamento em monitorização
          </div>
        </div>

        <div style={styles.selectorSummaryPills}>
          <span style={styles.selectorSummaryPill}>{stats.all} total</span>
          <span style={styles.selectorSummaryPill}>{stats.normal} normal</span>
          <span style={styles.selectorSummaryPill}>{stats.alerts} alerta</span>
          <span style={styles.selectorSummaryPill}>{stats.offline} offline</span>
        </div>
      </div>

      <div ref={wrapRef} style={styles.selectorWrap}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          style={styles.selectorMainButton}
        >
          <div style={styles.selectorMainLeft}>
            <div
              style={{
                ...styles.selectorStatusDot,
                background: selectedStatusInfo.dot,
                boxShadow: `0 0 10px ${selectedStatusInfo.dot}`,
              }}
            />
            <div style={styles.selectorMainText}>
              <div style={styles.selectorMainName}>
                {selectedDevice?.name || selectedDevice?.device_id || "Selecionar dispositivo"}
              </div>
              <div style={styles.selectorMainMeta}>
                {selectedDevice?.location || "Localização por definir"} ·{" "}
                {formatValue(selectedDevice?.last_temperature, " °C")} ·{" "}
                {formatValue(selectedDevice?.last_humidity, " %")}
              </div>
            </div>
          </div>

          <div style={styles.selectorMainRight}>
            <div
              style={{
                ...styles.selectorMainStatus,
                color: selectedStatusInfo.color,
                background: selectedStatusInfo.soft,
                borderColor: "transparent",
              }}
            >
              {selectedStatusInfo.label}
            </div>

            <div
              style={{
                ...styles.selectorChevron,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▼
            </div>
          </div>
        </button>

        {open ? (
          <div
            style={{
              ...styles.selectorDropdown,
              maxHeight: isMobile ? "420px" : "360px",
            }}
          >
            {orderedDevices.map((item) => {
              const info = getStatusInfo(
                getEffectiveStatus(item, parseNumber(item?.config?.send_interval_s))
              );
              const active = item.device_id === selectedDeviceId;

              return (
                <button
                  key={item.device_id}
                  type="button"
                  onClick={() => {
                    onSelect(item.device_id);
                    setOpen(false);
                  }}
                  style={{
                    ...styles.selectorOption,
                    ...(active ? styles.selectorOptionActive : {}),
                  }}
                >
                  <div style={styles.selectorOptionLeft}>
                    <div
                      style={{
                        ...styles.selectorOptionDot,
                        background: info.dot,
                      }}
                    />
                    <div style={styles.selectorOptionText}>
                      <div style={styles.selectorOptionName}>
                        {item?.name || item?.device_id}
                      </div>
                      <div style={styles.selectorOptionMeta}>
                        {item?.location || "Localização por definir"}
                      </div>
                    </div>
                  </div>

                  <div style={styles.selectorOptionRight}>
                    <div style={styles.selectorOptionTemp}>
                      {formatValue(item?.last_temperature, " °C")}
                    </div>
                    <div
                      style={{
                        ...styles.selectorOptionStatus,
                        color: info.color,
                        background: info.soft,
                        borderColor: "transparent",
                      }}
                    >
                      {info.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AlertRow({ item }) {
  const levelInfo = getAlertLevelInfo(item?.level);
  const isAck = String(item?.level || "").toLowerCase().includes("ack");

  const typeMap = {
    temperature: "Temperatura",
    humidity: "Humidade",
    offline: "Ligação",
    system: "Sistema",
  };

  const typeLabel = typeMap[String(item?.type || "").toLowerCase()] || "Evento";
  const stateLabel =
    item?.state === "high"
      ? "acima do limite"
      : item?.state === "low"
      ? "abaixo do limite"
      : "";
  const eventType = isAck
    ? "ACK confirmado"
    : stateLabel
    ? `${typeLabel} ${stateLabel}`
    : typeLabel;

  return (
    <div
      style={{
        ...styles.alertRow,
        background: `linear-gradient(90deg, ${levelInfo.bg}88 0%, rgba(15,23,42,0.82) 100%)`,
        borderColor: levelInfo.border,
      }}
    >
      <div style={styles.alertRowTop}>
        <div style={styles.alertRowTitle}>{eventType}</div>
        <span
          style={{
            ...styles.alertBadge,
            color: levelInfo.color,
            background: levelInfo.bg,
            borderColor: "transparent",
          }}
        >
          {levelInfo.label}
        </span>
      </div>

      <div style={styles.alertRowMeta}>
        <span>{formatDateTime(item?.detected_at || item?.event_at || item?.sent_at || item?.created_at)}</span>

        {item?.temperature !== null && item?.temperature !== undefined ? (
          <span>Temp: {formatValue(item.temperature, " °C")}</span>
        ) : null}

        {item?.humidity !== null && item?.humidity !== undefined ? (
          <span>Hum: {formatValue(item.humidity, " %", 0)}</span>
        ) : null}

        {item?.derived ? <span>Detetado automaticamente</span> : null}
      </div>
    </div>
  );
}

function UnifiedPredictionCard({ prediction, isOffline }) {
  const toneMap = {
    unknown: {
      border: "#243042",
      bg: "linear-gradient(135deg, rgba(11,18,32,0.98), rgba(15,23,42,0.96))",
      value: "#f8fafc",
      badgeBg: "#162033",
      badgeBorder: "transparent",
      badgeColor: "#94a3b8",
    },
    low: {
      border: "#24513a",
      bg: "linear-gradient(135deg, rgba(10,24,22,0.98), rgba(15,23,42,0.96))",
      value: "#d1fae5",
      badgeBg: "#132219",
      badgeBorder: "transparent",
      badgeColor: "#22c55e",
    },
    medium: {
      border: "#4b3a1d",
      bg: "linear-gradient(135deg, rgba(28,24,15,0.98), rgba(15,23,42,0.96))",
      value: "#fde68a",
      badgeBg: "#2a2112",
      badgeBorder: "transparent",
      badgeColor: "#f59e0b",
    },
    high: {
      border: "#4b1f24",
      bg: "linear-gradient(135deg, rgba(32,14,18,0.98), rgba(15,23,42,0.96))",
      value: "#fecaca",
      badgeBg: "#2a1316",
      badgeBorder: "transparent",
      badgeColor: "#ef4444",
    },
  };

  const selected = toneMap[prediction?.level] || toneMap.unknown;
  const hasSpecificSource =
    prediction?.source && String(prediction.source).toLowerCase() !== "none";
  const shouldShowSourceLabel = isOffline || hasSpecificSource;
  const shouldShowAdvice =
    isOffline ||
    prediction?.level === "medium" ||
    prediction?.level === "high" ||
    (prediction?.level === "unknown" && hasSpecificSource);

  return (
    <section
      style={{
        ...styles.smartSurfaceCard,
        borderColor: selected.border,
        background: selected.bg,
      }}
    >
      <div style={styles.smartSurfaceHeader}>
        <div>
          <div style={styles.smartSurfaceEyebrow}>Análise preditiva</div>
          <div style={styles.cardTitle}>Tendência de risco</div>
          <div style={styles.smartSurfaceHint}>
            Leitura preditiva resumida do comportamento recente
          </div>
        </div>

        <div
          style={{
            ...styles.healthBadge,
            background: selected.badgeBg,
            borderColor: selected.badgeBorder,
            color: selected.badgeColor,
          }}
        >
          {prediction?.chip || "Sem dados"}
        </div>
      </div>

      <div style={styles.smartSignalLine} />

      <div style={{ ...styles.predictionMainTitle, color: selected.value }}>
        {prediction?.title || "Predição indisponível"}
      </div>

      <div style={styles.predictionMainDetail}>
        {prediction?.detail || "Sem dados recentes para prever tendência."}
      </div>

      {shouldShowSourceLabel ? (
        <div style={styles.predictionSourceLabel}>
          {prediction?.source_label || "Sem dados recentes"}
        </div>
      ) : null}

      {shouldShowAdvice && (prediction?.cause || prediction?.action) ? (
        <div style={styles.predictionAdviceGrid}>
          {prediction?.cause ? (
            <div style={styles.predictionAdviceItem}>
              <span style={styles.predictionAdviceLabel}>Causa provável</span>
              <span>{prediction.cause}</span>
            </div>
          ) : null}

          {prediction?.action ? (
            <div style={styles.predictionAdviceItem}>
              <span style={styles.predictionAdviceLabel}>Ação sugerida</span>
              <span>{prediction.action}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {isOffline ? (
        <div style={styles.predictionOfflineNoteGlobal}>
          Predição suspensa até voltar online.
        </div>
      ) : null}
    </section>
  );
}

function OperationalInsightCard({ items }) {
  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.cardTitle}>Leitura operacional</div>
          <div style={styles.cardHint}>
            Leitura simples para decidir rapidamente o que precisa de atenção
          </div>
        </div>
      </div>

      <div style={styles.insightGrid}>
        {items.map((item, index) => {
          const toneStyles =
            item.tone === "bad"
              ? {
                  border: "#4b1f24",
                  bg: "#2a1316",
                  title: "#fecaca",
                }
              : item.tone === "warn"
              ? {
                  border: "#4b3a1d",
                  bg: "#2a2112",
                  title: "#f59e0b",
                }
              : {
                  border: "#223047",
                  bg: "#0f172a",
                  title: "#86efac",
                };

          return (
            <div
              key={`${item.title}-${index}`}
              style={{
                ...styles.insightCard,
                borderColor: toneStyles.border,
                background: toneStyles.bg,
              }}
            >
              <div style={{ ...styles.insightTitle, color: toneStyles.title }}>
                {item.title}
              </div>
              <div style={styles.insightDetail}>{item.detail}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}



function SmartClientInsight({ communicationHealth, isOffline, statusInfo, summary24h }) {
  const lowCoverage = (communicationHealth?.delivery_pct ?? 100) < 90;
  const noReadings24h = (summary24h?.totalReadings ?? 0) === 0;

  let title = "Recomendação STS";
  let detail = "Evitar aberturas prolongadas ajuda a estabilizar a temperatura e reduzir consumo.";
  let tag = "Boas práticas";

  if (isOffline) {
    title = "Verificação recomendada";
    detail = "Confirmar alimentação, Wi-Fi e posição do dispositivo antes de confiar nos valores.";
    tag = "Dispositivo offline";
  } else if (noReadings24h) {
    title = "Sem leituras recentes";
    detail = "Não existem dados suficientes nas últimas 24h para avaliar a operação.";
    tag = "Sem dados";
  } else if (lowCoverage || communicationHealth?.label === "Com falhas" || communicationHealth?.label === "Instável") {
    title = "Atenção à comunicação";
    detail = "Falhas frequentes podem atrasar alertas. Confirma a cobertura Wi-Fi junto ao equipamento.";
    tag = "Comunicação";
  } else if (String(statusInfo?.label || "").toLowerCase().includes("normal")) {
    title = "Operação estável";
    detail = "A estabilidade térmica ajuda a preservar qualidade, reduzir desperdício e controlar consumo.";
    tag = "Operação";
  }

  return (
    <section style={styles.smartInsightCard}>
      <div style={styles.smartInsightTop}>
        <div style={styles.smartInsightKicker}>STS Insight</div>
        <div style={styles.smartInsightTag}>{tag}</div>
      </div>
      <div style={styles.smartInsightLine} />
      <div style={styles.smartInsightTitle}>{title}</div>
      <div style={styles.smartInsightDetail}>{detail}</div>
    </section>
  );
}


function DataChart({
  title,
  data,
  dataKey,
  unit,
  minThreshold,
  maxThreshold,
  isMobile,
  periodKey,
  isOffline,
}) {
  const { min, max } = getSeriesMinMax(data, dataKey);
  const yDomain = getChartDomain(data, dataKey, [minThreshold, maxThreshold]);
  const { minPoint, maxPoint } = getReferencePoints(data, dataKey);
  const yTicks =
    dataKey === "temperature" ? getNiceTemperatureTicks(yDomain) : undefined;

  const valueDigits = dataKey === "humidity" ? 0 : 1;
  const yTickFormatter =
    dataKey === "humidity"
      ? (value) => `${Math.round(Number(value))}`
      : (value) => `${Number(value).toFixed(1)}`;

  const timeWindow = getPeriodWindow(periodKey);
  const xTicks = getXAxisTicks(periodKey);
  const hasData = data.some((item) => parseNumber(item?.[dataKey]) !== null);

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div>
          <div style={styles.chartTitle}>{title}</div>
          <div style={styles.chartSubtitle}>
            Pico inferior: {formatValue(min, unit, valueDigits)} | Pico superior: {formatValue(max, unit, valueDigits)}
          </div>
          <div style={styles.chartHint}>
            Intervalo exibido: {periodKey.toUpperCase()}
          </div>
          {isOffline ? (
            <div style={styles.chartOfflineHint}>
              Dispositivo offline · histórico preservado até à última leitura válida
            </div>
          ) : null}
        </div>
      </div>

      {!hasData ? (
        <div style={styles.emptyChartState}>Sem leituras neste período.</div>
      ) : (
        <div style={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 320}>
            <LineChart
              data={data}
              margin={{ top: 20, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid stroke="#273142" strokeDasharray="3 3" />

              <XAxis
                type="number"
                dataKey="timestamp"
                domain={[timeWindow.start, timeWindow.end]}
                ticks={xTicks}
                scale="time"
                tickFormatter={(value) => formatShortTime(value, periodKey)}
                stroke="#7c8aa0"
                tick={{ fontSize: 12 }}
                tickMargin={8}
                minTickGap={24}
              />

              <YAxis
                stroke="#7c8aa0"
                tick={{ fontSize: 12 }}
                domain={yDomain}
                ticks={yTicks}
                width={64}
                tickMargin={8}
                allowDecimals={dataKey === "temperature"}
                tickFormatter={yTickFormatter}
              />

              <Tooltip content={<CustomTooltip unit={unit} digits={valueDigits} />} />

              {minThreshold !== null && minThreshold !== undefined && (
                <ReferenceLine
                  y={Number(minThreshold)}
                  stroke="#f59e0b"
                  strokeDasharray="6 6"
                />
              )}

              {maxThreshold !== null && maxThreshold !== undefined && (
                <ReferenceLine
                  y={Number(maxThreshold)}
                  stroke="#ef4444"
                  strokeDasharray="6 6"
                />
              )}

              <Line
                type="linear"
                dataKey={dataKey}
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />

              {minPoint && (
                <ReferenceDot
                  x={minPoint.timestamp}
                  y={minPoint.value}
                  r={4}
                  fill="#facc15"
                  stroke="none"
                  label={{
                    value: `Min ${formatValue(minPoint.value, "", valueDigits)}`,
                    position: "bottom",
                    fill: "#facc15",
                    fontSize: 12,
                  }}
                />
              )}

              {maxPoint && (
                <ReferenceDot
                  x={maxPoint.timestamp}
                  y={maxPoint.value}
                  r={4}
                  fill="#fb7185"
                  stroke="none"
                  label={{
                    value: `Max ${formatValue(maxPoint.value, "", valueDigits)}`,
                    position: "top",
                    fill: "#fb7185",
                    fontSize: 12,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function BootScreen() {
  return (
    <main style={styles.bootPage}>
      <div style={styles.bootWrap}>
        <div style={styles.bootCircle}>
          <div style={styles.bootSpinner} />
          <div style={styles.bootCenter}>
            <Image
              src={STS_LOGO_SRC}
              alt="STS"
              width={166}
              height={110}
              priority
              style={styles.bootLogoImage}
            />
          </div>
        </div>

        <div style={styles.bootText}>
          A sincronizar dados mais recentes...
        </div>
      </div>
    </main>
  );
}

async function fetchJsonOrThrow(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();

  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = {
      error: "Resposta inválida da API.",
      details: raw?.slice?.(0, 300) || "",
    };
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Erro API ${response.status}.`);
  }

  return payload;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [period, setPeriod] = useState("24h");
const [reportPeriod, setReportPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deviceOverview, setDeviceOverview] = useState(null);
const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  const [profile, setProfile] = useState(null);
  const [devicePermissions, setDevicePermissions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [clientForm, setClientForm] = useState({
    temp_low_c: "",
    temp_high_c: "",
    hum_low: "",
    hum_high: "",
  });

  const [adminForm, setAdminForm] = useState({
    name: "",
    location: "",
    hyst_c: "",
    send_interval_s: "",
    display_standby_min: "",
  });

  const [clientMessage, setClientMessage] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [pageError, setPageError] = useState("");

  const [isMobile, setIsMobile] = useState(false);

  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const isSuperAdmin = profile?.role === "super_admin";
  const isClientAdmin = profile?.role === "client_admin";

  const canEditSelectedDevice = useMemo(() => {
    const access = devicePermissions.find(
      (item) => item.device_id === selectedDeviceId
    );

    if (isSuperAdmin) return true;
    if (isClientAdmin) return Boolean(access?.can_edit);

    return Boolean(access?.can_edit);
  }, [devicePermissions, isSuperAdmin, isClientAdmin, selectedDeviceId]);

  const chartReadings = useMemo(
    () => buildTimeSeries(readings, period),
    [readings, period]
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;
    if (typeof window === "undefined") return;

    window.localStorage.setItem(DEVICE_STORAGE_KEY, selectedDeviceId);
  }, [selectedDeviceId]);

  const loadData = useCallback(
    async ({ silent = false, syncForms = true } = {}) => {
      if (requestInFlightRef.current) return;

      requestInFlightRef.current = true;
      setPageError("");

      if (!silent && mountedRef.current) {
        if (!initialLoaded) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
      }

      try {
        const {
          data: { user },
          error: sessionError,
        } = await supabase.auth.getUser();

        if (sessionError) throw sessionError;
        if (!user) {
          router.replace("/login");
          return;
        }

        const [profileResponse, permissionsResponse] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase
            .from("device_access")
            .select("device_id, can_view, can_edit")
            .eq("user_id", user.id),
        ]);

        if (profileResponse.error) {
          console.warn("profile:", JSON.stringify(profileResponse.error, null, 2));
          throw new Error("Não foi possível carregar o perfil do utilizador.");
        }

        if (permissionsResponse.error) {
          console.warn("permissions:", JSON.stringify(permissionsResponse.error, null, 2));
          throw new Error("Não foi possível carregar as permissões do utilizador.");
        }

        const profileData = profileResponse.data || null;
        const permissionsData = permissionsResponse.data || [];

        if (!profileData) {
          throw new Error("O utilizador autenticado não tem perfil criado em public.profiles.");
        }

        if (!profileData.is_active) {
          throw new Error("O teu utilizador está inativo.");
        }

        let devicesQuery = supabase
          .from("devices")
          .select("*")
          .order("device_id", { ascending: true });

        if (profileData.role !== "super_admin") {
          const allowedDeviceIds = permissionsData
            .filter((item) => item.can_view)
            .map((item) => item.device_id);

          if (!allowedDeviceIds.length) {
            if (!mountedRef.current) return;

            setProfile(profileData);
            setDevicePermissions(permissionsData);
            setDevices([]);
            setInitialLoaded(true);
            return;
          }

          devicesQuery = devicesQuery.in("device_id", allowedDeviceIds);
        }

        const { data: devicesData, error: devicesError } = await devicesQuery;

        if (devicesError) {
          console.warn("devices list:", JSON.stringify(devicesError, null, 2));
          throw new Error("Não foi possível carregar a lista de dispositivos.");
        }

        const safeDevices = devicesData || [];
        const nextSelectedDeviceId = getBestInitialDeviceId(safeDevices, selectedDeviceId);

        const [deviceResponse, overviewData, historyRows, alertsRows] = await Promise.all([
          nextSelectedDeviceId
            ? supabase
                .from("devices")
                .select("*")
                .eq("device_id", nextSelectedDeviceId)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          nextSelectedDeviceId
            ? fetchJsonOrThrow(`/api/sts/device/${nextSelectedDeviceId}/overview`).catch((error) => {
                console.warn("overview:", error);
                return null;
              })
            : Promise.resolve(null),

          nextSelectedDeviceId
            ? fetchJsonOrThrow(`/api/sts/device/${nextSelectedDeviceId}/history?limit=2000`)
            : Promise.resolve([]),

          nextSelectedDeviceId
            ? fetchJsonOrThrow(
                `/api/sts/device/${nextSelectedDeviceId}/alerts?hours=${getPeriodConfig(period).hours}`
              ).catch((error) => {
                console.warn("alerts:", error);
                return [];
              })
            : Promise.resolve([]),
        ]);

        if (deviceResponse?.error) {
          console.warn("device:", JSON.stringify(deviceResponse.error, null, 2));
          throw new Error("Não foi possível carregar o dispositivo selecionado.");
        }

        const baseDeviceData = deviceResponse?.data || null;

        const deviceData = baseDeviceData
          ? {
              ...baseDeviceData,
              last_temperature:
                overviewData?.temperature ?? baseDeviceData?.last_temperature ?? null,
              last_humidity:
                overviewData?.humidity ?? baseDeviceData?.last_humidity ?? null,
              status:
                overviewData?.status
                  ? String(overviewData.status).toUpperCase()
                  : baseDeviceData?.status,
              online: overviewData?.online ?? baseDeviceData?.online ?? null,
              last_seen_seconds:
                overviewData?.last_seen_seconds ?? baseDeviceData?.last_seen_seconds ?? null,
              communication_health: overviewData?.communication_health || null,
              predictive_status: overviewData?.predictive_status || null,
              telemetry_seq:
                overviewData?.telemetry_seq ?? baseDeviceData?.telemetry_seq ?? null,
              buffer_count:
                overviewData?.buffer_count ?? baseDeviceData?.buffer_count ?? null,
              post_ok_count:
                overviewData?.post_ok_count ?? baseDeviceData?.post_ok_count ?? null,
              post_fail_count:
                overviewData?.post_fail_count ?? baseDeviceData?.post_fail_count ?? null,
              boot_count:
                overviewData?.boot_count ?? baseDeviceData?.boot_count ?? null,
              reset_reason:
                overviewData?.reset_reason ?? baseDeviceData?.reset_reason ?? null,
              clock_synced:
                overviewData?.clock_synced ?? baseDeviceData?.clock_synced ?? null,
              clock_sync_age_s:
                overviewData?.clock_sync_age_s ?? baseDeviceData?.clock_sync_age_s ?? null,
              alerts_24h: overviewData?.alerts_24h ?? 0,
              total_readings_24h: overviewData?.total_readings_24h ?? 0,
              last_seen:
                baseDeviceData?.last_seen ||
                (overviewData?.last_seen_seconds !== null &&
                overviewData?.last_seen_seconds !== undefined
                  ? new Date(Date.now() - overviewData.last_seen_seconds * 1000).toISOString()
                  : baseDeviceData?.last_seen),
            }
          : null;

        const readingsData = (historyRows || [])
          .map((item) => {
            const timestamp = new Date(item.created_at).getTime();

            return {
              ...item,
              temperature: parseNumber(item.temperature),
              humidity: parseNumber(item.humidity),
              timestamp: Number.isFinite(timestamp) ? timestamp : null,
            };
          })
          .filter((item) => Number.isFinite(item.timestamp));

        const derivedAlerts = deriveAlertEventsFromReadings(
          readingsData,
          deviceData?.config ?? {}
        );
        const currentAlerts = deriveCurrentAlertEvents(
          deviceData,
          deviceData?.config ?? {},
          [...normalizeAlertRows(alertsRows), ...derivedAlerts]
        );
        const alertWindow = getPeriodWindow(period);
        const alertsData = mergeAlertEvents(alertsRows, [
          ...derivedAlerts,
          ...currentAlerts,
        ]).filter((item) => {
          const timestamp = getAlertTimestamp(item);
          return timestamp >= alertWindow.start && timestamp <= alertWindow.end;
        });

        if (!mountedRef.current) return;

        if (nextSelectedDeviceId && nextSelectedDeviceId !== selectedDeviceId) {
          setSelectedDeviceId(nextSelectedDeviceId);
        }

        setProfile(profileData);
        setDevicePermissions(permissionsData);
        setDevices(safeDevices);
        setDevice(deviceData);
        setDeviceOverview(overviewData || null);
        setReadings(readingsData);
        setAlerts(alertsData);

        if (syncForms && deviceData) {
          const deviceConfig = deviceData?.config ?? {};

          setClientForm({
            temp_low_c: toInputValue(deviceConfig?.temp_low_c),
            temp_high_c: toInputValue(deviceConfig?.temp_high_c),
            hum_low: toInputValue(deviceConfig?.hum_low),
            hum_high: toInputValue(deviceConfig?.hum_high),
          });

          setAdminForm({
            name: deviceData?.name || "",
            location: deviceData?.location || "",
            hyst_c: toInputValue(deviceConfig?.hyst_c),
            send_interval_s: toInputValue(deviceConfig?.send_interval_s),
            display_standby_min: toInputValue(deviceConfig?.display_standby_min),
          });
        }

        setInitialLoaded(true);
      } catch (error) {
        console.warn("loadData:", error);
        if (mountedRef.current) {
          setPageError(
            error?.message || "Ocorreu um erro ao carregar os dados."
          );
        }
      } finally {
        requestInFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedDeviceId, supabase, router, initialLoaded, period]
  );

  useEffect(() => {
    loadData({ syncForms: true });

    const interval = setInterval(() => {
      loadData({ silent: true, syncForms: false });
    }, AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!selectedDeviceId) return;

    const channel = supabase
      .channel(`sts-live-${selectedDeviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "readings",
          filter: `device_id=eq.${selectedDeviceId}`,
        },
        () => {
          loadData({ silent: true, syncForms: false });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
          filter: `device_id=eq.${selectedDeviceId}`,
        },
        () => {
          loadData({ silent: true, syncForms: false });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
          filter: `device_id=eq.${selectedDeviceId}`,
        },
        () => {
          loadData({ silent: true, syncForms: false });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDeviceId, loadData, supabase]);

  const config = useMemo(() => device?.config ?? {}, [device?.config]);

  const tempLow = parseNumber(config?.temp_low_c);
  const tempHigh = parseNumber(config?.temp_high_c);
  const humLow = parseNumber(config?.hum_low);
  const humHigh = parseNumber(config?.hum_high);
  const hystC = parseNumber(config?.hyst_c);
  const sendIntervalS = parseNumber(config?.send_interval_s);
  const displayStandbyMin = parseNumber(config?.display_standby_min);

  const effectiveStatus = getEffectiveStatus(device, sendIntervalS);
  const statusInfo = getStatusInfo(effectiveStatus);
  const deviceDisplayName = device?.name || device?.device_id || selectedDeviceId || DEFAULT_DEVICE_ID;
  const deviceLocation = device?.location || "Localização por definir";

const communicationHealth = useMemo(
  () =>
    getCommunicationHealth({
      rawReadings: readings,
      sendIntervalS,
      deviceLastSeen: device?.last_seen,
      periodKey: period,
    }),
  [readings, sendIntervalS, device?.last_seen, period]
);

  const isDeviceOffline = effectiveStatus === "OFFLINE";

  const predictiveStatus = useMemo(
    () =>
      isDeviceOffline
        ? {
            level: "unknown",
            title: "Predição indisponível",
            detail: "Sem dados recentes para prever tendência.",
            cause: "Dispositivo offline.",
            action: "Confirmar alimentação, Wi-Fi e comunicação.",
            chip: "Suspensa",
            source: "none",
            source_label: "Dispositivo offline",
            eta_minutes: null,
            score: 0,
          }
        : device?.predictive_status || getPredictiveStatus(readings, config),
    [config, device?.predictive_status, isDeviceOffline, readings]
  );

  const effectiveLastDelayMs =
    communicationHealth?.last_delay_ms !== null &&
    communicationHealth?.last_delay_ms !== undefined
      ? communicationHealth.last_delay_ms
      : device?.last_seen
      ? Date.now() - new Date(device.last_seen).getTime()
      : null;

  const operationalInsights = useMemo(
    () =>
      getOperationalInsights({
        device,
        config,
        communicationHealth,
        predictiveStatus,
      }),
    [device, config, communicationHealth, predictiveStatus]
  );

  const currentTempTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : tempHigh !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) > tempHigh
      ? "warn"
      : tempLow !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) < tempLow
      ? "warn"
      : "neutral";

  const currentHumTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : humHigh !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) > humHigh
      ? "warn"
      : humLow !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) < humLow
      ? "warn"
      : "neutral";

  const currentTempValue = formatValue(device?.last_temperature, " °C");
  const currentHumValue = formatValue(device?.last_humidity, " %");
  const currentTempAccentLabel = isDeviceOffline ? "Offline" : "Tempo real";
  const currentHumAccentLabel = isDeviceOffline ? "Offline" : "Tempo real";

  const summary24h = useMemo(() => {
    const { start, end } = getPeriodWindow("24h");

    const scoped = readings
      .filter((item) => Number.isFinite(item?.timestamp))
      .filter((item) => item.timestamp >= start && item.timestamp <= end);

    const temps = scoped
      .map((item) => parseNumber(item.temperature))
      .filter((v) => v !== null);

    const hums = scoped
      .map((item) => parseNumber(item.humidity))
      .filter((v) => v !== null);

    const avg = (arr, digits = 1) =>
      arr.length
        ? Number((arr.reduce((sum, v) => sum + v, 0) / arr.length).toFixed(digits))
        : null;

    return {
      tempMin: temps.length ? Math.min(...temps) : null,
      tempMax: temps.length ? Math.max(...temps) : null,
      tempAvg: avg(temps, 1),
      humMin: hums.length ? Math.min(...hums) : null,
      humMax: hums.length ? Math.max(...hums) : null,
      humAvg: avg(hums, 0),
      totalReadings: scoped.length,
    };
  }, [readings]);

  async function saveClientConfig() {
    if (!device || !selectedDeviceId || !canEditSelectedDevice) return;

    setSavingClient(true);
    setClientMessage("");

    const newTempLow = parseNumber(clientForm.temp_low_c);
    const newTempHigh = parseNumber(clientForm.temp_high_c);
    const newHumLow = parseNumber(clientForm.hum_low);
    const newHumHigh = parseNumber(clientForm.hum_high);

    if (
      newTempLow === null ||
      newTempHigh === null ||
      newHumLow === null ||
      newHumHigh === null
    ) {
      setClientMessage("Preenche todos os campos do cliente com valores válidos.");
      setSavingClient(false);
      return;
    }

    if (newTempLow >= newTempHigh) {
      setClientMessage("A temperatura mínima deve ser inferior à máxima.");
      setSavingClient(false);
      return;
    }

    if (newHumLow >= newHumHigh) {
      setClientMessage("A humidade mínima deve ser inferior à máxima.");
      setSavingClient(false);
      return;
    }

    let data;

    try {
      data = await fetchJsonOrThrow(`/api/sts/device/${selectedDeviceId}/config`, {
        method: "POST",
        body: JSON.stringify({
          temp_low_c: newTempLow,
          temp_high_c: newTempHigh,
          hum_low: newHumLow,
          hum_high: newHumHigh,
        }),
      });
    } catch (error) {
      setClientMessage(error?.message || "Erro ao guardar configurações do cliente.");
      setSavingClient(false);
      return;
    }

    const refreshedConfig = data?.config || {};

    const nextDevice = {
      ...device,
      config: refreshedConfig,
      config_version: data?.config_version ?? device?.config_version,
      name: data?.name ?? device?.name,
      location: data?.location ?? device?.location,
      updated_at: data?.updated_at ?? device?.updated_at,
    };

    setDevice(nextDevice);
    setDevices((prev) =>
      prev.map((item) =>
        item.device_id === selectedDeviceId
          ? {
              ...item,
              ...nextDevice,
            }
          : item
      )
    );

    setClientForm({
      temp_low_c: toInputValue(refreshedConfig?.temp_low_c),
      temp_high_c: toInputValue(refreshedConfig?.temp_high_c),
      hum_low: toInputValue(refreshedConfig?.hum_low),
      hum_high: toInputValue(refreshedConfig?.hum_high),
    });

    setClientMessage("Configurações do cliente guardadas com sucesso.");
    setSavingClient(false);
  }

  async function saveAdminConfig() {
    if (!device || !selectedDeviceId || !isSuperAdmin) return;

    setSavingAdmin(true);
    setAdminMessage("");

    const newHyst = parseNumber(adminForm.hyst_c);
    const newSendInterval = parseNumber(adminForm.send_interval_s);
    const newDisplayStandby = parseNumber(adminForm.display_standby_min);

    if (
      newHyst === null ||
      newSendInterval === null ||
      newDisplayStandby === null
    ) {
      setAdminMessage("Preenche todos os campos admin com valores válidos.");
      setSavingAdmin(false);
      return;
    }

    if (newSendInterval < 5) {
      setAdminMessage("O intervalo de envio deve ser pelo menos 5 segundos.");
      setSavingAdmin(false);
      return;
    }

    let data;

    try {
      data = await fetchJsonOrThrow(`/api/sts/device/${selectedDeviceId}/config`, {
        method: "POST",
        body: JSON.stringify({
          name: adminForm.name.trim() || device?.device_id || selectedDeviceId,
          location: adminForm.location.trim() || "Localização por definir",
          hyst_c: newHyst,
          send_interval_s: newSendInterval,
          display_standby_min: newDisplayStandby,
        }),
      });
    } catch (error) {
      setAdminMessage(error?.message || "Erro ao guardar configurações admin.");
      setSavingAdmin(false);
      return;
    }

    const refreshedConfig = data?.config || {};

    const nextDevice = {
      ...device,
      config: refreshedConfig,
      config_version: data?.config_version ?? device?.config_version,
      name: data?.name ?? device?.name,
      location: data?.location ?? device?.location,
      updated_at: data?.updated_at ?? device?.updated_at,
    };

    setDevice(nextDevice);
    setDevices((prev) =>
      prev.map((item) =>
        item.device_id === selectedDeviceId
          ? {
              ...item,
              ...nextDevice,
            }
          : item
      )
    );

    setAdminForm({
      name: nextDevice?.name || "",
      location: nextDevice?.location || "",
      hyst_c: toInputValue(refreshedConfig?.hyst_c),
      send_interval_s: toInputValue(refreshedConfig?.send_interval_s),
      display_standby_min: toInputValue(refreshedConfig?.display_standby_min),
    });

    setAdminMessage("Configurações admin guardadas com sucesso.");
    setSavingAdmin(false);
  }

async function downloadPdfReport() {
  if (!selectedDeviceId) return;

  try {
    const response = await fetch(
      `/api/sts/device/${selectedDeviceId}/report?period=${reportPeriod}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Não foi possível gerar o PDF.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedDeviceId}_relatorio_${reportPeriod}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } catch (error) {
    setPageError(error?.message || "Erro ao descarregar relatório PDF.");
  }
}

  const hasDevices = devices.length > 0;
  const hasReadings = readings.length > 0;

  if (loading && !initialLoaded) {
    return <BootScreen />;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.brandLockup}>
            <Image
              src={STS_LOGO_SRC}
              alt="STS"
              width={132}
              height={58}
              priority
              style={styles.headerLogo}
            />
            <div>
            <h1 style={styles.title}>Cold</h1>
            <div style={styles.tagline}>{STS_TAGLINE}</div>
            <p style={styles.subtitle}>
              Monitorização inteligente para frio, conservação e operação crítica
            </p>
            </div>
          </div>

          <div style={styles.topActions}>
            {refreshing ? (
              <div style={styles.refreshingText}>A atualizar...</div>
            ) : null}

            <button
              onClick={async () => {
                await loadData({ syncForms: true });
              }}
              style={styles.refreshButton}
            >
              Atualizar
            </button>

            {isSuperAdmin ? (
              <button
                onClick={() => router.push("/admin")}
                style={styles.refreshButton}
              >
                Admin
              </button>
            ) : null}

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
              style={styles.refreshButton}
            >
              Sair
            </button>
          </div>
        </div>

        {pageError ? <div style={styles.errorBanner}>{pageError}</div> : null}
        <div id="devices">
<DeviceSelector
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelect={(deviceId) => {
            setSelectedDeviceId(deviceId);
            setClientMessage("");
            setAdminMessage("");
            setPageError("");
            setRefreshing(true);
          }}
          isMobile={isMobile}
        />
            </div>

        <section
          id="overview"
          style={{
            ...styles.heroCard,
            background: `linear-gradient(180deg, ${statusInfo.panel} 0%, #0f172a 100%)`,
            borderColor: statusInfo.border,
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(0, 1.8fr) minmax(340px, 1fr)",
          }}
        >
          <div style={styles.heroLeft}>
            <div style={styles.heroHeaderTop}>
              <div>
                <div style={styles.sectionEyebrow}>Dispositivo ativo</div>
                <div style={styles.deviceName}>{deviceDisplayName}</div>

                <div style={styles.deviceMetaLine}>
                  <span style={styles.deviceMetaBadge}>
                    {selectedDeviceId || DEFAULT_DEVICE_ID}
                  </span>
                  <span style={styles.deviceMetaDot}>•</span>
                  <span style={styles.deviceMetaLocation}>{deviceLocation}</span>
                </div>
              </div>

              <div
                style={{
                  ...styles.statusPillLarge,
                  color: statusInfo.color,
                  background: statusInfo.soft,
                  borderColor: "transparent",
                  boxShadow: statusInfo.glow,
                }}
              >
                {statusInfo.label}
              </div>
            </div>

            <div
              style={{
                ...styles.metricsRow,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <MetricBox
                label={isDeviceOffline ? "Última temperatura conhecida" : "Temperatura atual"}
                value={isDeviceOffline ? "-" : currentTempValue}
                tone={currentTempTone}
                accentLabel={currentTempAccentLabel}
                subvalue={
                  isDeviceOffline
                    ? `Último registo: ${formatValue(device?.last_temperature, " °C")}`
                    : tempLow !== null && tempHigh !== null
                    ? `Limite configurado: ${formatValue(tempLow, " °C")} a ${formatValue(tempHigh, " °C")}`
                    : "Sem limites definidos"
                }
              />
              <MetricBox
                label={isDeviceOffline ? "Última humidade conhecida" : "Humidade atual"}
                value={isDeviceOffline ? "-" : currentHumValue}
                tone={currentHumTone}
                accentLabel={currentHumAccentLabel}
                subvalue={
                  isDeviceOffline
                    ? `Último registo: ${formatValue(device?.last_humidity, " %")}`
                    : humLow !== null && humHigh !== null
                    ? `Limite configurado: ${formatValue(humLow, " %", 0)} a ${formatValue(humHigh, " %", 0)}`
                    : "Sem limites definidos"
                }
              />
            </div>

            <div
              style={{
                ...styles.heroMetaRow,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <InfoItem
                label="Última atualização do dispositivo"
                value={`${formatDateTime(device?.last_seen)} (${formatRelativeTime(device?.last_seen)})`}
              />
              <InfoItem
                label="Estado operacional"
                value={statusInfo.label}
                valueColor={statusInfo.color}
              />
            </div>
          </div>

          <div
            style={{
              ...styles.heroRight,
              borderLeft: isMobile ? "none" : styles.heroRight.borderLeft,
              borderTop: isMobile ? "1px solid #243042" : "none",
              paddingLeft: isMobile ? "0" : styles.heroRight.paddingLeft,
              paddingTop: isMobile ? "16px" : "0",
            }}
          >
            <div style={styles.sideTitle}>Resumo executivo 24h</div>

            <div style={styles.sideSummary}>
              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Média temp.</span>
                <span style={styles.summaryValue}>{formatValue(summary24h.tempAvg, " °C")}</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Média hum.</span>
                <span style={styles.summaryValue}>{formatValue(summary24h.humAvg, " %", 0)}</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Leituras 24h</span>
                <span style={styles.summaryValue}>{summary24h.totalReadings ?? 0}</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Comunicação</span>
                <span style={styles.summaryValue}>{communicationHealth.label}</span>
              </div>
            </div>
          </div>
        </section>



        <OperationalInsightCard items={operationalInsights} />

        <SmartClientInsight
          communicationHealth={communicationHealth}
          isOffline={effectiveStatus === "OFFLINE"}
          statusInfo={statusInfo}
          summary24h={summary24h}
        />

        <UnifiedPredictionCard
          prediction={predictiveStatus}
          isOffline={effectiveStatus === "OFFLINE"}
        />
        <section id="maintenance" style={{ ...styles.card, order: 20 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Saúde da comunicação</div>
              <div style={styles.cardHint}>
                Qualidade da ligação e regularidade das leituras
              </div>
            </div>
          </div>

          <div style={styles.healthSummaryBanner}>
            {communicationHealth.summary}
          </div>

          <div
            style={{
              ...styles.healthGrid,
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(4, minmax(0, 1fr))",
            }}
          >
            <HealthStatCard
              label="Atraso da última leitura"
              value={formatDurationCompact(effectiveLastDelayMs)}
              hint="Tempo desde a última leitura recebida"
              tone={
                communicationHealth.label === "Offline"
                  ? "bad"
                  : effectiveLastDelayMs !== null &&
                    effectiveLastDelayMs >
                      Math.max((Number(sendIntervalS) || 30) * 1000 * 4, 3 * 60 * 1000)
                  ? "warn"
                  : "good"
              }
            />

            <HealthStatCard
              label="Intervalo esperado"
              value={formatDurationCompact(communicationHealth.expected_interval_ms)}
              hint="Com base na configuração atual do dispositivo"
              tone="neutral"
            />

            <HealthStatCard
              label="Cobertura de leituras"
              value={`${communicationHealth.delivery_pct ?? 0}%`}
              hint={`${communicationHealth.received_readings} de ${communicationHealth.expected_readings} leituras esperadas`}
              tone={
                (communicationHealth.delivery_pct ?? 0) < 80
                  ? "bad"
                  : (communicationHealth.delivery_pct ?? 0) < 90
                  ? "warn"
                  : "good"
              }
            />

            <HealthStatCard
              label="Estabilidade"
              value={
                communicationHealth.regularity_pct !== null
                  ? `${communicationHealth.regularity_pct}%`
                  : "-"
              }
              hint={`Falhas relevantes: ${communicationHealth.relevant_gap_count} · Gaps graves: ${communicationHealth.severe_gap_count} · Maior gap: ${formatDurationCompact(communicationHealth.max_gap_ms)}`}
              tone={communicationHealth.tone}
              badge={communicationHealth.label}
            />
          </div>
        </section>

        <section id="reports" style={{ ...styles.card, order: 22 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Relatório PDF</div>
              <div style={styles.cardHint}>
                Exportação do resumo profissional de leituras do dispositivo
              </div>
            </div>
          </div>

          <div
            style={{
              ...styles.reportRow,
              gridTemplateColumns: isMobile
                ? "1fr"
                : "minmax(220px, 320px) auto",
            }}
          >
            <div style={styles.field}>
              <label style={styles.label}>Período do relatório</label>
              <select
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                style={styles.configInput}
              >
                <option value="1h">1H</option>
                <option value="6h">6H</option>
                <option value="12h">12H</option>
                <option value="24h">24H</option>
                <option value="7d">7D</option>
              </select>
            </div>

            <div style={styles.reportActionWrap}>
              <button
                style={styles.primaryButton}
                onClick={downloadPdfReport}
                disabled={!selectedDeviceId}
              >
                Descarregar PDF
              </button>
            </div>
          </div>
        </section>

        <section
          style={{
            ...styles.chartGrid,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          }}
        >
          <DataChart
            title="Temperatura"
            data={chartReadings}
            dataKey="temperature"
            unit=" °C"
            minThreshold={tempLow}
            maxThreshold={tempHigh}
            isMobile={isMobile}
            periodKey={period}
            isOffline={effectiveStatus === "OFFLINE"}
          />

          <DataChart
            title="Humidade"
            data={chartReadings}
            dataKey="humidity"
            unit=" %"
            minThreshold={humLow}
            maxThreshold={humHigh}
            isMobile={isMobile}
            periodKey={period}
            isOffline={effectiveStatus === "OFFLINE"}
          />
        </section>
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Período de visualização</div>
              <div style={styles.cardHint}>
                Ajusta o intervalo temporal apresentado nos gráficos
              </div>
            </div>
          </div>

          <div style={styles.periodRow}>
            {PERIODS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriod(item.key)}
                style={{
                  ...styles.periodButton,
                  ...(period === item.key ? styles.periodButtonActive : {}),
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>



<section id="alerts" style={{ ...styles.card, order: 21 }}>
  <div style={styles.cardHeader}>
    <div>
      <div style={styles.cardTitle}>Histórico de alertas</div>
      <div style={styles.cardHint}>
        Eventos registados no período selecionado ({period.toUpperCase()})
      </div>
    </div>

    {alerts.length > 3 ? (
      <button
        type="button"
        onClick={() => setAlertsCollapsed((prev) => !prev)}
        style={styles.collapseButton}
      >
        {alertsCollapsed ? "Minimizar" : "Ver todos"}
      </button>
    ) : null}
  </div>

  {!alerts.length ? (
    <div style={styles.emptyState}>
      Sem alertas registados para este dispositivo.
    </div>
  ) : (
    <div style={styles.alertList}>
      {(alertsCollapsed ? alerts : alerts.slice(0, 3)).map((item, index) => (
        <AlertRow
          key={item.id || `${item.sent_at || item.created_at}-${index}`}
          item={item}
        />
      ))}

      {!alertsCollapsed && alerts.length > 3 ? (
        <div style={styles.alertListHint}>
          A mostrar os 3 alertas mais recentes de {alerts.length}.
        </div>
      ) : null}
    </div>
  )}
</section>

        <section id="settings" style={{ ...styles.card, order: 23 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Configurações operacionais</div>
              <div style={styles.cardHint}>
                Limites operacionais por dispositivo
              </div>
            </div>

            <div style={styles.readOnlyBadge}>
              {canEditSelectedDevice ? "Configuração editável" : "Só leitura"}
            </div>
          </div>

          <div
            style={{
              ...styles.formGrid,
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(4, minmax(0, 1fr))",
            }}
          >
            <div style={styles.field}>
              <label style={styles.label}>Temperatura mínima (°C)</label>
              <input
                type="number"
                step="0.1"
                value={clientForm.temp_low_c}
                onChange={(e) =>
                  setClientForm((prev) => ({
                    ...prev,
                    temp_low_c: e.target.value,
                  }))
                }
                style={styles.configInput}
                disabled={!canEditSelectedDevice}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Temperatura máxima (°C)</label>
              <input
                type="number"
                step="0.1"
                value={clientForm.temp_high_c}
                onChange={(e) =>
                  setClientForm((prev) => ({
                    ...prev,
                    temp_high_c: e.target.value,
                  }))
                }
                style={styles.configInput}
                disabled={!canEditSelectedDevice}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Humidade mínima (%)</label>
              <input
                type="number"
                step="1"
                value={clientForm.hum_low}
                onChange={(e) =>
                  setClientForm((prev) => ({
                    ...prev,
                    hum_low: e.target.value,
                  }))
                }
                style={styles.configInput}
                disabled={!canEditSelectedDevice}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Humidade máxima (%)</label>
              <input
                type="number"
                step="1"
                value={clientForm.hum_high}
                onChange={(e) =>
                  setClientForm((prev) => ({
                    ...prev,
                    hum_high: e.target.value,
                  }))
                }
                style={styles.configInput}
                disabled={!canEditSelectedDevice}
              />
            </div>
          </div>

          {canEditSelectedDevice ? (
            <div style={styles.actionsRow}>
              <button
                style={styles.primaryButton}
                onClick={saveClientConfig}
                disabled={savingClient || !selectedDeviceId}
              >
                {savingClient ? "A guardar..." : "Guardar configurações"}
              </button>

              {clientMessage ? (
                <span
                  style={
                    clientMessage.toLowerCase().includes("sucesso")
                      ? styles.successText
                      : styles.errorTextInline
                  }
                >
                  {clientMessage}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {!loading && initialLoaded && hasDevices && !hasReadings ? (
          <div style={styles.emptyState}>
            Ainda não existem leituras históricas disponíveis para os últimos 7 dias.
          </div>
        ) : null}
      </div>
    </main>
  );
}

const styles = {
  bootPage: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 50% 18%, rgba(14,165,233,0.10) 0%, rgba(15,23,42,0.98) 34%, #060c16 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    color: "#f8fafc",
  },

  bootWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "18px",
    padding: "24px",
  },

  bootCircle: {
    position: "relative",
    width: "210px",
    height: "210px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  bootSpinner: {
    position: "absolute",
    inset: 0,
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.12)",
    borderTop: "1px solid rgba(103,232,249,0.72)",
    borderRight: "1px solid rgba(245,158,11,0.38)",
    boxShadow: "0 0 28px rgba(14,165,233,0.08)",
    animation: "spin 1.4s linear infinite",
  },

  bootCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "166px",
    height: "110px",
    transform: "translate(-50%, -50%)",
    borderRadius: "18px",
    background: "transparent",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "none",
    overflow: "hidden",
  },

  bootLogoImage: {
    display: "block",
    width: "166px",
    height: "110px",
    objectFit: "contain",
    objectPosition: "center center",
    filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.22))",
  },

  bootText: {
    fontSize: "12px",
    lineHeight: 1.4,
    color: "#94a3b8",
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: 0,
  },

  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #101a2d 0%, #0b1220 35%, #07101b 100%)",
    padding: "24px 16px 40px",
    color: "#e5edf7",
    overflowX: "hidden",
    scrollBehavior: "smooth",
  },

  container: {
    width: "100%",
    maxWidth: "1420px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    overflowX: "hidden",
  },


  dashboardShell: {
    display: "grid",
    gridTemplateColumns: "230px minmax(0, 1fr)",
    gap: "18px",
    alignItems: "start",
  },

  dashboardMain: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    minWidth: 0,
  },

  sidebar: {
    position: "sticky",
    top: "18px",
    background: "rgba(15, 23, 42, 0.94)",
    border: "1px solid #223047",
    borderRadius: "24px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    backdropFilter: "blur(10px)",
  },

  sidebarMobile: {
    background: "rgba(15, 23, 42, 0.94)",
    border: "1px solid #223047",
    borderRadius: "20px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overflowX: "auto",
  },

  sidebarBrand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    paddingBottom: "10px",
    borderBottom: "1px solid #223047",
  },

  sidebarProduct: {
    color: "#f8fafc",
    fontSize: "15px",
    fontWeight: 900,
    letterSpacing: "-0.02em",
  },

  sidebarVersion: {
    color: "#93c5fd",
    background: "#13203a",
    border: "1px solid #243b63",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 900,
  },

  sidebarNav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  sidebarLink: {
    textDecoration: "none",
    color: "#cbd5e1",
    background: "#0f172a",
    border: "1px solid #1f2b3d",
    borderRadius: "14px",
    padding: "11px 12px",
    fontSize: "13px",
    fontWeight: 800,
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    flexWrap: "wrap",
    padding: "2px 0 4px",
  },

  brandLockup: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    minWidth: 0,
    flex: "1 1 420px",
  },

  headerLogo: {
    width: "132px",
    height: "58px",
    objectFit: "contain",
    objectPosition: "center center",
    borderRadius: "10px",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    padding: 0,
    flexShrink: 0,
  },

  title: {
    margin: 0,
    fontSize: "28px",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 0,
    color: "#f8fafc",
  },

  subtitle: {
    margin: "5px 0 0 0",
    color: "#94a3b8",
    fontSize: "14px",
    lineHeight: 1.35,
  },

  tagline: {
    marginTop: "6px",
    color: "#dbeafe",
    fontSize: "13px",
    fontWeight: 800,
    lineHeight: 1.25,
  },

  topActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: "0 1 auto",
  },


  versionBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "8px",
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(15,23,42,0.42)",
    color: "#94a3b8",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.03em",
  },

  systemNav: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
    background: "rgba(15, 23, 42, 0.78)",
    border: "1px solid #1f2937",
    borderRadius: "22px",
    padding: "12px",
    backdropFilter: "blur(10px)",
  },

  systemNavItem: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "16px",
    padding: "12px",
    minWidth: 0,
  },

  systemNavLabel: {
    display: "block",
    color: "#7c8aa0",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "5px",
  },

  systemNavValue: {
    display: "block",
    color: "#f8fafc",
    fontSize: "13px",
    fontWeight: 900,
    overflowWrap: "anywhere",
  },

  refreshingText: {
    fontSize: "13px",
    color: "#93c5fd",
    fontWeight: 700,
  },

  refreshButton: {
    border: "1px solid #2a3547",
    background: "#121a2b",
    color: "#e5edf7",
    borderRadius: "14px",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "14px",
    minHeight: "38px",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  smartInsightCard: {
    background: "linear-gradient(135deg, rgba(9,21,29,0.98), rgba(15,23,42,0.96))",
    border: "1px solid #24515c",
    borderRadius: "20px",
    padding: "18px 20px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
  },

  smartInsightTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },

  smartInsightKicker: {
    fontSize: "11px",
    fontWeight: 900,
    color: "#67e8f9",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  smartInsightTag: {
    border: "1px solid #24515c",
    background: "rgba(8,47,73,0.35)",
    color: "#67e8f9",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
  },

  smartInsightLine: {
    height: "1px",
    width: "100%",
    background: "linear-gradient(90deg, rgba(103,232,249,0.58), rgba(34,197,94,0.16), rgba(148,163,184,0))",
    marginBottom: "12px",
  },

  smartInsightTitle: {
    fontSize: "18px",
    fontWeight: 900,
    color: "#f8fafc",
    letterSpacing: 0,
    marginBottom: "6px",
  },

  smartInsightDetail: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: 1.5,
    fontWeight: 700,
  },

  readinessCard: {
    background: "rgba(17, 24, 39, 0.88)",
    border: "1px solid #223047",
    borderRadius: "24px",
    padding: "20px",
    overflow: "hidden",
  },

  readinessGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
  },

  card: {
    background: "rgba(17, 24, 39, 0.92)",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "20px",
    overflow: "visible",
    backdropFilter: "blur(10px)",
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease, transform 180ms ease",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#f8fafc",
  },

  cardHint: {
    marginTop: "4px",
    fontSize: "13px",
    color: "#94a3b8",
  },

  errorBanner: {
    background: "#2a1316",
    border: "1px solid #4b1f24",
    color: "#fecaca",
    borderRadius: "18px",
    padding: "14px 16px",
    fontWeight: 700,
  },

  emptyState: {
    background: "#0f172a",
    border: "1px dashed #334155",
    borderRadius: "18px",
    padding: "18px",
    color: "#94a3b8",
    textAlign: "center",
    fontWeight: 700,
  },

  emptyChartState: {
    height: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#94a3b8",
    fontWeight: 700,
    background: "#0c1424",
    border: "1px dashed #243042",
    borderRadius: "18px",
  },

  selectorWrap: {
    position: "relative",
  },

  selectorSummaryPills: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  selectorSummaryPill: {
    border: "1px solid #243042",
    background: "#0f172a",
    color: "#cbd5e1",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 800,
  },

  selectorMainButton: {
    width: "100%",
    border: "1px solid #243042",
    background: "#0f172a",
    color: "#f8fafc",
    borderRadius: "18px",
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    cursor: "pointer",
    textAlign: "left",
  },

  selectorMainLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },

  selectorStatusDot: {
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    flexShrink: 0,
  },

  selectorMainText: {
    minWidth: 0,
  },

  selectorMainName: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
    wordBreak: "break-word",
  },

  selectorMainMeta: {
    marginTop: "4px",
    fontSize: "13px",
    color: "#94a3b8",
    wordBreak: "break-word",
  },

  selectorMainRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  },

  selectorMainStatus: {
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  selectorChevron: {
    fontSize: "14px",
    color: "#cbd5e1",
    transition: "transform 0.18s ease",
  },

  selectorDropdown: {
    position: "absolute",
    top: "calc(100% + 10px)",
    left: 0,
    right: 0,
    zIndex: 50,
    background: "#0b1220",
    border: "1px solid #243042",
    borderRadius: "18px",
    padding: "10px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
    overflowY: "auto",
  },

  selectorOption: {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "12px",
    color: "#f8fafc",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    textAlign: "left",
    marginBottom: "8px",
  },

  selectorOptionActive: {
    border: "1px solid #2563eb",
    boxShadow: "0 0 0 1px rgba(37,99,235,0.22)",
    background: "#101c34",
  },

  selectorOptionLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },

  selectorOptionDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    flexShrink: 0,
  },

  selectorOptionText: {
    minWidth: 0,
  },

  selectorOptionName: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
    wordBreak: "break-word",
  },

  selectorOptionMeta: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#94a3b8",
    wordBreak: "break-word",
  },

  selectorOptionRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "6px",
    flexShrink: 0,
  },

  selectorOptionTemp: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#e2e8f0",
  },

  selectorOptionStatus: {
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  heroCard: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(340px, 1fr)",
    gap: "18px",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "22px",
    overflow: "hidden",
  },

  heroLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: 0,
  },

  heroRight: {
    borderLeft: "1px solid #243042",
    paddingLeft: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    justifyContent: "center",
    minWidth: 0,
  },

  heroHeaderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },

  sectionEyebrow: {
    fontSize: "12px",
    fontWeight: 800,
    color: "#7c8aa0",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "8px",
  },

  deviceName: {
    fontSize: "24px",
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    wordBreak: "break-word",
  },

  deviceMetaLine: {
    marginTop: "10px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 600,
  },

  deviceMetaBadge: {
    background: "#162033",
    border: "1px solid #243042",
    color: "#cbd5e1",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 700,
  },

  deviceMetaDot: {
    color: "#475569",
  },

  deviceMetaLocation: {
    color: "#94a3b8",
    wordBreak: "break-word",
  },

  statusPillLarge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid transparent",
    fontSize: "13px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },

  metricCard: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "20px",
    padding: "18px",
    minWidth: 0,
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
  },

  metricTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },

  metricLabel: {
    fontSize: "13px",
    color: "#8fa1b9",
    fontWeight: 700,
  },

  miniChip: {
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  metricValue: {
    fontSize: "30px",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  metricSubvalue: {
    marginTop: "10px",
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.4,
  },

  heroMetaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },

  infoItem: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },

  infoLabel: {
    fontSize: "12px",
    color: "#8fa1b9",
    fontWeight: 700,
  },

  infoValue: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#f8fafc",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  sideTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  sideSummary: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
  },

  summaryBlock: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    minWidth: 0,
    flexWrap: "wrap",
  },

  summaryLabel: {
    color: "#8fa1b9",
    fontSize: "13px",
    fontWeight: 700,
  },

  summaryValue: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#f8fafc",
    wordBreak: "break-word",
  },

  insightGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  },

  insightCard: {
    border: "1px solid #223047",
    borderRadius: "18px",
    padding: "16px",
    background: "#0f172a",
  },

  insightTitle: {
    fontSize: "15px",
    fontWeight: 800,
    marginBottom: "8px",
  },

  insightDetail: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: 1.5,
    fontWeight: 600,
  },

  predictionMainTitle: {
    fontSize: "30px",
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: 0,
    marginBottom: "10px",
  },

  predictionMainDetail: {
    fontSize: "15px",
    color: "#e5edf7",
    fontWeight: 700,
    marginBottom: "8px",
  },

  predictionSourceLabel: {
    fontSize: "13px",
    color: "#94a3b8",
    fontWeight: 700,
  },

  predictionAdviceGrid: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },

  predictionAdviceItem: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(15, 23, 42, 0.48)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "#dbeafe",
    fontSize: "13px",
    lineHeight: 1.45,
  },

  predictionAdviceLabel: {
    display: "block",
    marginBottom: "4px",
    color: "#94a3b8",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  predictionOfflineNoteGlobal: {
    marginTop: "14px",
    fontSize: "12px",
    color: "#94a3b8",
  },

  smartSurfaceCard: {
    border: "1px solid #243042",
    borderRadius: "20px",
    padding: "18px 20px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
  },

  smartSurfaceHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "14px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },

  smartSurfaceEyebrow: {
    fontSize: "10px",
    fontWeight: 900,
    color: "#67e8f9",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "5px",
  },

  smartSurfaceHint: {
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.45,
    fontWeight: 700,
  },

  smartSignalLine: {
    height: "1px",
    width: "100%",
    background: "linear-gradient(90deg, rgba(103,232,249,0.58), rgba(34,197,94,0.16), rgba(148,163,184,0))",
    marginBottom: "16px",
  },

  healthSummaryBanner: {
    background: "#0f172a",
    border: "1px solid #243042",
    borderRadius: "16px",
    padding: "14px 16px",
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: 700,
    marginBottom: "14px",
  },

  healthGrid: {
    display: "grid",
    gap: "14px",
  },

  healthCard: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "20px",
    padding: "16px",
    minWidth: 0,
  },

  healthTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
  },

  healthLabel: {
    fontSize: "12px",
    color: "#8fa1b9",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  healthBadge: {
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  healthValue: {
    fontSize: "26px",
    fontWeight: 900,
    letterSpacing: "-0.03em",
    marginBottom: "8px",
  },

  healthHint: {
    fontSize: "12px",
    color: "#94a3b8",
    lineHeight: 1.4,
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "18px",
  },

  chartCard: {
    background: "linear-gradient(180deg, #0f172a 0%, #0c1424 100%)",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "18px",
    overflow: "hidden",
    minWidth: 0,
  },

  chartHeader: {
    marginBottom: "10px",
  },

  chartTitle: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  chartSubtitle: {
    marginTop: "6px",
    fontSize: "13px",
    color: "#94a3b8",
  },

  chartHint: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#7c8aa0",
  },

  chartOfflineHint: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#cbd5e1",
  },

  chartWrap: {
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    paddingTop: "4px",
  },

  periodRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  periodButton: {
    border: "1px solid #2a3547",
    background: "#0f172a",
    color: "#cbd5e1",
    borderRadius: "14px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    minWidth: "64px",
    transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
  },

  periodButtonActive: {
    background: "#1d4ed8",
    color: "#ffffff",
    border: "1px solid #1d4ed8",
  },

  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  alertListHint: {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 700,
    textAlign: "center",
    padding: "4px 0",
  },

collapseButton: {
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#cbd5e1",
  borderRadius: "10px",
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: "12px",
},

  alertRow: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "18px",
    padding: "14px",
  },

  alertRowTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },

  alertRowTitle: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  alertBadge: {
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  alertRowMeta: {
    marginTop: "10px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    fontSize: "12px",
    color: "#94a3b8",
    fontWeight: 700,
  },

  formGrid: {
    display: "grid",
    gap: "12px",
    alignItems: "end",
    width: "100%",
    minWidth: 0,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
    width: "100%",
  },

  label: {
    fontSize: "11px",
    color: "#7f90a6",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    lineHeight: 1.2,
  },

  configInput: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    border: "1px solid #253246",
    background: "#0a1322",
    color: "#f8fafc",
    borderRadius: "10px",
    padding: "7px 10px",
    fontSize: "13px",
    outline: "none",
    height: "34px",
    boxSizing: "border-box",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    display: "block",
    overflow: "hidden",
    appearance: "none",
    WebkitAppearance: "none",
  },

  actionsRow: {
    marginTop: "16px",
    display: "flex",
    gap: "14px",
    alignItems: "center",
    flexWrap: "wrap",
  },

reportRow: {
  display: "grid",
  gap: "14px",
  alignItems: "end",
},

reportActionWrap: {
  display: "flex",
  alignItems: "end",
},

  primaryButton: {
    border: "1px solid #2563eb",
    background: "#163b7a",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "13px",
    minHeight: "36px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  readOnlyBadge: {
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#cbd5e1",
    borderRadius: "999px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: 800,
  },

  errorTextInline: {
    color: "#f87171",
    fontSize: "13px",
    fontWeight: 700,
  },

  successText: {
    color: "#22c55e",
    fontSize: "13px",
    fontWeight: 700,
  },

  adminPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: 0,
  },

  adminPanelTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },

  adminActive: {
    color: "#22c55e",
    fontWeight: 800,
  },

  adminGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    width: "100%",
    minWidth: 0,
  },

  smallStat: {
    background: "#0f172a",
    border: "1px solid #223047",
    borderRadius: "18px",
    padding: "16px",
    minWidth: 0,
  },

  smallStatLabel: {
    fontSize: "12px",
    color: "#8fa1b9",
    fontWeight: 700,
    marginBottom: "8px",
  },

  smallStatValue: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#f8fafc",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  subsection: {
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: "20px",
    padding: "18px",
    overflow: "hidden",
  },

  subsectionTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
    marginBottom: "16px",
  },

  tooltip: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "#f8fafc",
  },

  tooltipTitle: {
    fontSize: "12px",
    color: "#94a3b8",
    marginBottom: "6px",
  },

  tooltipValue: {
    fontSize: "12px",
    color: "#f8fafc",
  },

  rawConfigWrap: {
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: "20px",
    padding: "16px",
    overflow: "hidden",
  },

  rawConfigTitle: {
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 700,
    marginBottom: "10px",
  },

  rawConfig: {
    margin: 0,
    color: "#e2e8f0",
    fontSize: "13px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
};
