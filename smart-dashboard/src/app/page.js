"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const detempo realryPct = Math.max(
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
      detempo realry_pct: detempo realryPct,
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
    Math.min(100, Math.round(detempo realryPct - penalty))
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
    detempo realryPct >= 98 &&
    relevantGapCount <= 1 &&
    severeGapCount === 0
  ) {
    label = "Excelente";
    tone = "good";
    summary = "Cobertura muito alta e comunicação muito consistente.";
  } else if (
    detempo realryPct >= 94 &&
    relevantGapCount <= 5 &&
    severeGapCount <= 1
  ) {
    label = "Estável";
    tone = "good";
    summary = "Boa cobertura com apenas pequenas falhas pontuais.";
  } else if (detempo realryPct >= 88 && severeGapCount <= 2) {
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
    detempo realry_pct: detempo realryPct,
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
    }))
    .filter((r) => r.created_at && r.value !== null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

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

  if (targetLimit === null || targetLimit === undefined) {
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

  const distance = Math.abs(targetLimit - current.value);
  const speedThreshold = type === "temperature" ? 0.03 : 0.18;

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
    return {
      active: true,
      severity: "high",
      eta_minutes: Math.max(1, Math.round(etaMinutes)),
      title: "Risco elevado",
      detail: `${getTrendDirectionLabel(direction, type)} · possível alerta em ~${Math.max(
        1,
        Math.round(etaMinutes)
      )} min`,
      source: type,
      score: 90,
    };
  }

  if (etaMinutes <= 120 && closeToLimit) {
    return {
      active: true,
      severity: "medium",
      eta_minutes: Math.max(1, Math.round(etaMinutes)),
      title: "Risco moderado",
      detail: `${getTrendDirectionLabel(direction, type)} · aproximação ao limite`,
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
      title: "Dispositivo sem comunicação",
      detail:
        lastSeenSeconds > 86400
          ? `Sem comunicação há ${Math.floor(lastSeenSeconds / 86400)} dias.`
          : "Sem comunicação recente.",
      tone: "bad",
    });

    insights.push({
      title: "Tempo real suspenso",
      detail: "Últimos valores apenas como registo histórico.",
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
      tone: "bad",
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
      tone: "bad",
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
              color: selected.accent,
              borderColor: "transparent",
              background: selected.chipBg,
            }}
          >
            {accentLabel}
          </span>
        ) : null}
      </div>

      <div style={{ ...styles.metricValue, color: selected.value }}>{value}</div>
      {subvalue ? <div style={styles.metricSubvalue}>{subvalue}</div> : null}
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div style={styles.infoItem}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
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
        {pageError ? <div style={styles.errorBanner}>{pageError}</div> : null}

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

        <section
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
                value={isDeviceOffline ? "-" : formatValue(device?.last_temperature, " °C")}
                tone={currentTempTone}
                accentLabel={isDeviceOffline ? "Offline" : "Tempo real"}
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
                value={isDeviceOffline ? "-" : formatValue(device?.last_humidity, " %")}
                tone={currentHumTone}
                accentLabel={isDeviceOffline ? "Offline" : "Tempo real"}
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

        <UnifiedPredictionCard
          prediction={predictiveStatus}
          isOffline={effectiveStatus === "OFFLINE"}
        />

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Saúde da comunicação</div>
              <div style={styles.cardHint}>
                Estado real da regularidade e entrega das leituras do dispositivo
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
              value={`${communicationHealth.detempo realry_pct ?? 0}%`}
              hint={`${communicationHealth.received_readings}/${communicationHealth.expected_readings} leituras esperadas`}
              tone={
                (communicationHealth.detempo realry_pct ?? 0) < 88
                  ? "bad"
                  : (communicationHealth.detempo realry_pct ?? 0) < 94
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

        <section style={styles.card}>
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



<section style={styles.card}>
  <div style={styles.cardHeader}>
    <div>
      <div style={styles.cardTitle}>Histórico de alertas</div>
      <div style={styles.cardHint}>
        Últimos eventos registados para este dispositivo
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

        <section style={styles.card}>
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
      "radial-gradient(circle at top, #162235 0%, #0b1220 45%, #060c16 100%)",
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
    gap: "20px",
  },

  bootCircle: {
    position: "relative",
    width: "220px",
    height: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  bootSpinner: {
    position: "absolute",
    inset: 0,
    borderRadius: "999px",
    border: "2px solid rgba(59,130,246,0.14)",
    borderTop: "2px solid rgba(96,165,250,0.95)",
    borderRight: "2px solid rgba(59,130,246,0.45)",
    boxShadow: "0 0 36px rgba(37,99,235,0.12)",
    animation: "spin 1.25s linear infinite",
  },

  bootCenter: {
    width: "148px",
    height: "148px",
    borderRadius: "999px",
    background: "rgba(15, 23, 42, 0.96)",
    border: "1px solid #223149",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 30px rgba(37,99,235,0.10)",
  },

  bootLogo: {
    fontSize: "36px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    color: "#f8fafc",
  },

  bootText: {
    fontSize: "13px",
    lineHeight: 1.4,
    color: "#9fb0c6",
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: "0.02em",
  },

  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #101a2d 0%, #0b1220 35%, #07101b 100%)",
    padding: "24px 16px 40px",
    color: "#e5edf7",
    overflowX: "hidden",
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

  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
  },

  subtitle: {
    margin: "6px 0 0 0",
    color: "#94a3b8",
    fontSize: "14px",
  },


  versionBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "10px",
    border: "1px solid #243b63",
    background: "#13203a",
    color: "#93c5fd",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.04em",
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
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "14px",
  },

  card: {
    background: "rgba(17, 24, 39, 0.92)",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "20px",
    overflow: "visible",
    backdropFilter: "blur(10px)",
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
    letterSpacing: "-0.03em",
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

  predictionOfflineNoteGlobal: {
    marginTop: "14px",
    fontSize: "12px",
    color: "#94a3b8",
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
    fontSize: "13px",
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