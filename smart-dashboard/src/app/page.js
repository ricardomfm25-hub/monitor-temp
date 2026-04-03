"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const DEFAULT_DEVICE_ID = "SmartThermoSecure_01";
const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || "stsadminRM2026";
const AUTO_REFRESH_MS = 15000;
const OFFLINE_LIMIT_MS = 120 * 1000;

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
      day: "2-digit",
      month: "2-digit",
    });
  }

  return d.toLocaleTimeString("pt-PT", {
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

function getEffectiveStatus(device) {
  const lastSeen = device?.last_seen ? new Date(device.last_seen).getTime() : null;
  const now = Date.now();

  if (!lastSeen || now - lastSeen > OFFLINE_LIMIT_MS) {
    return "OFFLINE";
  }

  return device?.status || "SEM DADOS";
}

function getStatusInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("offline")) {
    return {
      label: "OFFLINE",
      color: "#94a3b8",
      soft: "#1a2230",
      border: "#334155",
      glow: "0 0 0 1px rgba(148,163,184,0.12)",
    };
  }

  if (s.includes("alarm") || s.includes("critical")) {
    return {
      label: "ALARME",
      color: "#ef4444",
      soft: "#2a1316",
      border: "#4b1f24",
      glow: "0 0 0 1px rgba(239,68,68,0.15)",
    };
  }

  if (s.includes("alert")) {
    return {
      label: "ALERTA",
      color: "#f59e0b",
      soft: "#2a2112",
      border: "#4b3a1d",
      glow: "0 0 0 1px rgba(245,158,11,0.12)",
    };
  }

  if (s.includes("normal") || s.includes("ok")) {
    return {
      label: "NORMAL",
      color: "#22c55e",
      soft: "#132219",
      border: "#1f3b2a",
      glow: "0 0 0 1px rgba(34,197,94,0.12)",
    };
  }

  return {
    label: status || "SEM DADOS",
    color: "#94a3b8",
    soft: "#161b22",
    border: "#293241",
    glow: "0 0 0 1px rgba(148,163,184,0.10)",
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
    label: "NORMAL",
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
    if (t >= start) {
      buckets.set(t, {
        timestamp: t,
        created_at: new Date(t).toISOString(),
        temperature: null,
        humidity: null,
        tempSum: 0,
        tempCount: 0,
        humSum: 0,
        humCount: 0,
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
    }

    if (hum !== null) {
      bucket.humSum += hum;
      bucket.humCount += 1;
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

function getCommunicationStats(rawReadings, sendIntervalS, deviceLastSeen, periodKey) {
  const sorted = [...(rawReadings || [])]
    .filter((item) => Number.isFinite(item?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 30 * 1000;

  const { start, end } = getPeriodWindow(periodKey);
  const periodMs = Math.max(end - start, expectedMs);
  const expectedReadings = Math.max(1, Math.round(periodMs / expectedMs));
  const receivedReadings = sorted.length;
  const deliveryPct = Math.max(
    0,
    Math.min(100, Math.round((receivedReadings / expectedReadings) * 100))
  );

  const gapThresholdMs = Math.max(expectedMs * 2.2, 90 * 1000);

  if (!sorted.length) {
    return {
      lastDelayMs: deviceLastSeen
        ? Date.now() - new Date(deviceLastSeen).getTime()
        : null,
      expectedMs,
      maxGapMs: null,
      gapCount: 0,
      regularityPct: 0,
      deliveryPct,
      expectedReadings,
      receivedReadings,
      stabilityLabel: "Sem dados",
      stabilityTone: "neutral",
    };
  }

  const intervals = [];
  let maxGapMs = 0;
  let gapCount = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const delta = sorted[i].timestamp - sorted[i - 1].timestamp;
    intervals.push(delta);

    if (delta > maxGapMs) maxGapMs = delta;
    if (delta > gapThresholdMs) gapCount += 1;
  }

  const intervalScore =
    intervals.length > 0
      ? Math.max(0, Math.round(((intervals.length - gapCount) / intervals.length) * 100))
      : receivedReadings >= expectedReadings
      ? 100
      : deliveryPct;

  const regularityPct = Math.round((deliveryPct * 0.6) + (intervalScore * 0.4));

  let stabilityLabel = "Estável";
  let stabilityTone = "good";

  if (regularityPct < 70 || gapCount >= 3) {
    stabilityLabel = "Instável";
    stabilityTone = "bad";
  } else if (regularityPct < 92 || gapCount >= 1) {
    stabilityLabel = "Com falhas";
    stabilityTone = "warn";
  }

  const lastTimestamp = sorted[sorted.length - 1]?.timestamp || null;

  return {
    lastDelayMs: lastTimestamp ? Date.now() - lastTimestamp : null,
    expectedMs,
    maxGapMs: maxGapMs || null,
    gapCount,
    regularityPct,
    deliveryPct,
    expectedReadings,
    receivedReadings,
    stabilityLabel,
    stabilityTone,
  };
}

function getHealthToneStyles(tone) {
  if (tone === "good") {
    return {
      valueColor: "#22c55e",
      badgeBg: "#132219",
      badgeBorder: "#1f3b2a",
    };
  }

  if (tone === "warn") {
    return {
      valueColor: "#f59e0b",
      badgeBg: "#2a2112",
      badgeBorder: "#4b3a1d",
    };
  }

  if (tone === "bad") {
    return {
      valueColor: "#ef4444",
      badgeBg: "#2a1316",
      badgeBorder: "#4b1f24",
    };
  }

  return {
    valueColor: "#cbd5e1",
    badgeBg: "#162033",
    badgeBorder: "#243042",
  };
}

function getStatsFromReadings(readings) {
  const temps = readings
    .map((r) => parseNumber(r?.temperature))
    .filter((v) => v !== null);

  const hums = readings
    .map((r) => parseNumber(r?.humidity))
    .filter((v) => v !== null);

  const avg = (values) =>
    values.length
      ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
      : null;

  return {
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
    tempAvg: avg(temps),
    humMin: hums.length ? Math.min(...hums) : null,
    humMax: hums.length ? Math.max(...hums) : null,
    humAvg: avg(hums),
    totalReadings: readings.length,
  };
}

function countThresholdViolations(readings, limits) {
  const { tempLow, tempHigh, humLow, humHigh } = limits;
  let count = 0;

  for (const item of readings || []) {
    const temp = parseNumber(item?.temperature);
    const hum = parseNumber(item?.humidity);

    const tempBad =
      (tempLow !== null && temp !== null && temp < tempLow) ||
      (tempHigh !== null && temp !== null && temp > tempHigh);

    const humBad =
      (humLow !== null && hum !== null && hum < humLow) ||
      (humHigh !== null && hum !== null && hum > humHigh);

    if (tempBad || humBad) count += 1;
  }

  return count;
}

async function fetchAllReadingsForPeriod(supabase, deviceId, sinceIso) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from("readings")
      .select("device_id, temperature, humidity, created_at")
      .eq("device_id", deviceId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn("readings:", JSON.stringify(error, null, 2));
      throw error;
    }

    const chunk = data || [];
    allRows = allRows.concat(chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

async function fetchRecentAlerts(supabase, deviceId, limit = 20) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("device_id", deviceId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("alerts:", JSON.stringify(error, null, 2));
    throw error;
  }

  return data || [];
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
          : <>Valor: <strong>{formatValue(value, unit, digits)}</strong></>}
      </div>
    </div>
  );
}

function MetricBox({ label, value, tone = "neutral", subvalue }) {
  const toneMap = {
    neutral: {
      border: "#1e293b",
      bg: "#0f172a",
      value: "#f8fafc",
    },
    good: {
      border: "#1f3b2a",
      bg: "#0f1d15",
      value: "#86efac",
    },
    warn: {
      border: "#4b3a1d",
      bg: "#21180f",
      value: "#fcd34d",
    },
    bad: {
      border: "#4b1f24",
      bg: "#211013",
      value: "#fca5a5",
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
      <div style={styles.metricLabel}>{label}</div>
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

function DeviceSelectorCard({ device, selected, onSelect }) {
  const effectiveStatus = getEffectiveStatus(device);
  const statusInfo = getStatusInfo(effectiveStatus);

  return (
    <button
      onClick={() => onSelect(device.device_id)}
      style={{
        ...styles.deviceSelectorCard,
        ...(selected ? styles.deviceSelectorCardActive : {}),
      }}
    >
      <div style={styles.deviceSelectorTop}>
        <div style={styles.deviceSelectorName}>
          {device?.name || device?.device_id}
        </div>
        <div
          style={{
            ...styles.deviceSelectorStatus,
            color: statusInfo.color,
            background: statusInfo.soft,
            borderColor: statusInfo.border,
          }}
        >
          {statusInfo.label}
        </div>
      </div>

      <div style={styles.deviceSelectorMeta}>{device?.device_id}</div>
      <div style={styles.deviceSelectorMeta}>
        {device?.location || "Localização por definir"}
      </div>

      <div style={styles.deviceSelectorMetrics}>
        <span>{formatValue(device?.last_temperature, " °C")}</span>
        <span>{formatValue(device?.last_humidity, " %")}</span>
      </div>
    </button>
  );
}

function AlertRow({ item }) {
  const levelInfo = getAlertLevelInfo(item?.level);

  return (
    <div style={styles.alertRow}>
      <div style={styles.alertRowTop}>
        <div style={styles.alertRowTitle}>{item?.title || "Evento"}</div>
        <span
          style={{
            ...styles.alertBadge,
            color: levelInfo.color,
            background: levelInfo.bg,
            borderColor: levelInfo.border,
          }}
        >
          {levelInfo.label}
        </span>
      </div>

      <div style={styles.alertRowMessage}>
        {item?.message || "Sem detalhe adicional."}
      </div>

      <div style={styles.alertRowMeta}>
        <span>{formatDateTime(item?.sent_at || item?.created_at)}</span>
        {item?.temperature !== null && item?.temperature !== undefined ? (
          <span>{formatValue(item.temperature, " °C")}</span>
        ) : null}
        {item?.humidity !== null && item?.humidity !== undefined ? (
          <span>{formatValue(item.humidity, " %", 0)}</span>
        ) : null}
      </div>
    </div>
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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [adminError, setAdminError] = useState("");

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

  const chartReadings = useMemo(
    () => buildTimeSeries(readings, period),
    [readings, period]
  );

  const currentPeriodStats = useMemo(
    () => getStatsFromReadings(readings),
    [readings]
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

  const loadData = useCallback(
    async ({ silent = false, syncForms = true } = {}) => {
      if (!selectedDeviceId) return;
      if (requestInFlightRef.current) return;

      requestInFlightRef.current = true;
      setPageError("");

      if (!silent && mountedRef.current) {
        setLoading(true);
      }

      try {
        const windowRange = getPeriodWindow(period);
        const since = new Date(windowRange.start).toISOString();

        const [devicesResponse, deviceResponse, readingsRows, alertsRows] =
          await Promise.all([
            supabase.from("devices").select("*").order("device_id", {
              ascending: true,
            }),
            supabase
              .from("devices")
              .select("*")
              .eq("device_id", selectedDeviceId)
              .limit(1)
              .maybeSingle(),
            fetchAllReadingsForPeriod(supabase, selectedDeviceId, since),
            fetchRecentAlerts(supabase, selectedDeviceId, 20),
          ]);

        if (devicesResponse.error) {
          console.warn("devices list:", JSON.stringify(devicesResponse.error, null, 2));
          throw new Error("Não foi possível carregar a lista de dispositivos.");
        }

        if (deviceResponse.error) {
          console.warn("device:", JSON.stringify(deviceResponse.error, null, 2));
          throw new Error("Não foi possível carregar o dispositivo selecionado.");
        }

        const devicesData = devicesResponse.data || [];
        const deviceData = deviceResponse.data || null;
        const readingsData = (readingsRows || [])
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

        if (!mountedRef.current) return;

        setDevices(devicesData);
        setDevice(deviceData);
        setReadings(readingsData);
        setAlerts(alertsRows || []);
        setLastSyncAt(new Date().toISOString());

        if (!deviceData && devicesData.length > 0) {
          const fallbackDeviceId =
            devicesData.find((d) => d.device_id === DEFAULT_DEVICE_ID)?.device_id ||
            devicesData[0].device_id;

          if (fallbackDeviceId && fallbackDeviceId !== selectedDeviceId) {
            setSelectedDeviceId(fallbackDeviceId);
            return;
          }
        }

        if (syncForms) {
          const config = deviceData?.config || {};

          setClientForm({
            temp_low_c: toInputValue(config?.temp_low_c),
            temp_high_c: toInputValue(config?.temp_high_c),
            hum_low: toInputValue(config?.hum_low),
            hum_high: toInputValue(config?.hum_high),
          });

          setAdminForm({
            name: deviceData?.name || "",
            location: deviceData?.location || "",
            hyst_c: toInputValue(config?.hyst_c),
            send_interval_s: toInputValue(config?.send_interval_s),
            display_standby_min: toInputValue(config?.display_standby_min),
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
        }
      }
    },
    [selectedDeviceId, period, supabase]
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

  const config = device?.config || {};

  const tempLow = parseNumber(config?.temp_low_c);
  const tempHigh = parseNumber(config?.temp_high_c);
  const humLow = parseNumber(config?.hum_low);
  const humHigh = parseNumber(config?.hum_high);
  const hystC = parseNumber(config?.hyst_c);
  const sendIntervalS = parseNumber(config?.send_interval_s);
  const displayStandbyMin = parseNumber(config?.display_standby_min);

  const effectiveStatus = getEffectiveStatus(device);
  const statusInfo = getStatusInfo(effectiveStatus);
  const deviceDisplayName = device?.name || device?.device_id || selectedDeviceId;
  const deviceLocation = device?.location || "Localização por definir";

  const communicationStats = useMemo(
    () => getCommunicationStats(readings, sendIntervalS, device?.last_seen, period),
    [readings, sendIntervalS, device?.last_seen, period]
  );

  const violationCount = useMemo(
    () =>
      countThresholdViolations(readings, {
        tempLow,
        tempHigh,
        humLow,
        humHigh,
      }),
    [readings, tempLow, tempHigh, humLow, humHigh]
  );

  const currentTempTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : tempHigh !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) > tempHigh
      ? "bad"
      : tempLow !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) < tempLow
      ? "warn"
      : "good";

  const currentHumTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : humHigh !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) > humHigh
      ? "bad"
      : humLow !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) < humLow
      ? "warn"
      : "good";

  async function saveClientConfig() {
    if (!device || !selectedDeviceId) return;
    if (!isAdmin) {
      setClientMessage("Só o modo admin pode alterar configurações.");
      return;
    }

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

    const newConfig = {
      ...config,
      temp_low_c: newTempLow,
      temp_high_c: newTempHigh,
      hum_low: newHumLow,
      hum_high: newHumHigh,
    };

    const { error } = await supabase
      .from("devices")
      .update({
        config: newConfig,
        config_version: Number(device?.config_version || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", selectedDeviceId);

    if (error) {
      setClientMessage("Erro ao guardar configurações do cliente.");
      console.warn("saveClientConfig:", JSON.stringify(error, null, 2));
      setSavingClient(false);
      return;
    }

    setClientMessage("Configurações do cliente guardadas com sucesso.");
    await loadData({ syncForms: true });
    setSavingClient(false);
  }

  async function saveAdminConfig() {
    if (!device || !selectedDeviceId) return;

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

    const newConfig = {
      ...config,
      hyst_c: newHyst,
      send_interval_s: newSendInterval,
      display_standby_min: newDisplayStandby,
    };

    const { error } = await supabase
      .from("devices")
      .update({
        name: adminForm.name.trim() || device?.device_id || selectedDeviceId,
        location: adminForm.location.trim() || "Localização por definir",
        config: newConfig,
        config_version: Number(device?.config_version || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", selectedDeviceId);

    if (error) {
      setAdminMessage("Erro ao guardar configurações admin.");
      console.warn("saveAdminConfig:", JSON.stringify(error, null, 2));
      setSavingAdmin(false);
      return;
    }

    setAdminMessage("Configurações admin guardadas com sucesso.");
    await loadData({ syncForms: true });
    setSavingAdmin(false);
  }

  const hasDevices = devices.length > 0;
  const hasReadings = readings.length > 0;

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.title}>Dashboard STS</h1>
            <p style={styles.subtitle}>
              Monitorização em tempo real dos dispositivos STS
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                await loadData({ syncForms: true });
              }}
              style={styles.refreshButton}
            >
              Atualizar
            </button>

            <button
              onClick={async () => {
                const supabaseClient = createClient();
                await supabaseClient.auth.signOut();
                window.location.href = "/login";
              }}
              style={styles.refreshButton}
            >
              Sair
            </button>
          </div>
        </div>

        {pageError ? <div style={styles.errorBanner}>{pageError}</div> : null}

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Dispositivos</div>
              <div style={styles.cardHint}>
                Seleciona o dispositivo a visualizar
              </div>
            </div>
          </div>

          {!hasDevices && initialLoaded ? (
            <div style={styles.emptyState}>
              Nenhum dispositivo encontrado.
            </div>
          ) : (
            <div
              style={{
                ...styles.deviceSelectorGrid,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {devices.map((item) => (
                <DeviceSelectorCard
                  key={item.device_id}
                  device={item}
                  selected={item.device_id === selectedDeviceId}
                  onSelect={(deviceId) => {
                    setSelectedDeviceId(deviceId);
                    setClientMessage("");
                    setAdminMessage("");
                    setPageError("");
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section
          style={{
            ...styles.heroCard,
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(0, 1.7fr) minmax(320px, 1fr)",
          }}
        >
          <div style={styles.heroLeft}>
            <div style={styles.heroHeaderTop}>
              <div>
                <div style={styles.sectionEyebrow}>Dispositivo</div>
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
                  borderColor: statusInfo.border,
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
                label="Temperatura atual"
                value={formatValue(device?.last_temperature, " °C")}
                tone={currentTempTone}
                subvalue={
                  tempLow !== null && tempHigh !== null
                    ? `Limite: ${formatValue(tempLow, " °C")} a ${formatValue(tempHigh, " °C")}`
                    : "Sem limites definidos"
                }
              />
              <MetricBox
                label="Humidade atual"
                value={formatValue(device?.last_humidity, " %")}
                tone={currentHumTone}
                subvalue={
                  humLow !== null && humHigh !== null
                    ? `Limite: ${formatValue(humLow, " %", 0)} a ${formatValue(humHigh, " %", 0)}`
                    : "Sem limites definidos"
                }
              />
            </div>

            <div
              style={{
                ...styles.heroMetaRow,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <InfoItem
                label="Última atualização do dispositivo"
                value={`${formatDateTime(device?.last_seen)} (${formatRelativeTime(device?.last_seen)})`}
              />
              <InfoItem
                label="Estado do dispositivo"
                value={statusInfo.label}
              />
              <InfoItem
                label="Última sincronização da dashboard"
                value={`${formatDateTime(lastSyncAt)} (${formatRelativeTime(lastSyncAt)})`}
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
            <div style={styles.sideTitle}>Configurações do cliente</div>

            <div style={styles.sideSummary}>
              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Temp. mínima</span>
                <span style={styles.summaryValue}>{tempLow ?? "-"} °C</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Temp. máxima</span>
                <span style={styles.summaryValue}>{tempHigh ?? "-"} °C</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Hum. mínima</span>
                <span style={styles.summaryValue}>{humLow ?? "-"} %</span>
              </div>

              <div style={styles.summaryBlock}>
                <span style={styles.summaryLabel}>Hum. máxima</span>
                <span style={styles.summaryValue}>{humHigh ?? "-"} %</span>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Resumo do período</div>
              <div style={styles.cardHint}>
                Indicadores principais para o intervalo selecionado
              </div>
            </div>
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
              label="Temperatura mínima"
              value={formatValue(currentPeriodStats.tempMin, " °C")}
              hint={`Média: ${formatValue(currentPeriodStats.tempAvg, " °C")}`}
              tone="good"
            />

            <HealthStatCard
              label="Temperatura máxima"
              value={formatValue(currentPeriodStats.tempMax, " °C")}
              hint={`Leituras no período: ${currentPeriodStats.totalReadings}`}
              tone={
                tempHigh !== null &&
                currentPeriodStats.tempMax !== null &&
                currentPeriodStats.tempMax > tempHigh
                  ? "bad"
                  : "neutral"
              }
            />

            <HealthStatCard
              label="Humidade mínima"
              value={formatValue(currentPeriodStats.humMin, " %", 0)}
              hint={`Média: ${formatValue(currentPeriodStats.humAvg, " %", 0)}`}
              tone="good"
            />

            <HealthStatCard
              label="Ocorrências fora do limite"
              value={String(violationCount)}
              hint="Contagem baseada nas leituras do período visível"
              tone={
                violationCount >= 5 ? "bad" : violationCount >= 1 ? "warn" : "good"
              }
              badge={
                violationCount >= 5
                  ? "Crítico"
                  : violationCount >= 1
                  ? "Atenção"
                  : "OK"
              }
            />
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Saúde da comunicação</div>
              <div style={styles.cardHint}>
                Estado de envio e regularidade das leituras do dispositivo
              </div>
            </div>
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
              value={formatDurationCompact(communicationStats.lastDelayMs)}
              hint="Tempo desde a última leitura recebida"
              tone={
                communicationStats.lastDelayMs !== null &&
                communicationStats.lastDelayMs >
                  Math.max((Number(sendIntervalS) || 30) * 1000 * 4, 3 * 60 * 1000)
                  ? "bad"
                  : "good"
              }
            />

            <HealthStatCard
              label="Intervalo esperado"
              value={formatDurationCompact(communicationStats.expectedMs)}
              hint="Com base na configuração atual do dispositivo"
              tone="neutral"
            />

            <HealthStatCard
              label="Cobertura de leituras"
              value={`${communicationStats.deliveryPct ?? 0}%`}
              hint={`${communicationStats.receivedReadings}/${communicationStats.expectedReadings} leituras esperadas`}
              tone={
                (communicationStats.deliveryPct ?? 0) < 70
                  ? "bad"
                  : (communicationStats.deliveryPct ?? 0) < 92
                  ? "warn"
                  : "good"
              }
            />

            <HealthStatCard
              label="Estabilidade"
              value={
                communicationStats.regularityPct !== null
                  ? `${communicationStats.regularityPct}%`
                  : "-"
              }
              hint={`Falhas detetadas: ${communicationStats.gapCount} · Maior gap: ${formatDurationCompact(communicationStats.maxGapMs)}`}
              tone={communicationStats.stabilityTone}
              badge={communicationStats.stabilityLabel}
            />
          </div>
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
          />
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Histórico de alertas</div>
              <div style={styles.cardHint}>
                Eventos reais registados para este dispositivo
              </div>
            </div>
          </div>

          {!alerts.length ? (
            <div style={styles.emptyState}>
              Sem alertas registados para este dispositivo.
            </div>
          ) : (
            <div style={styles.alertList}>
              {alerts.map((item, index) => (
                <AlertRow
                  key={item.id || `${item.sent_at || item.created_at}-${index}`}
                  item={item}
                />
              ))}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Configurações do cliente</div>
              <div style={styles.cardHint}>
                Limites operacionais por dispositivo
              </div>
            </div>

            <div style={styles.readOnlyBadge}>
              {isAdmin ? "Edição ativa" : "Só leitura"}
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
                disabled={!isAdmin}
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
                disabled={!isAdmin}
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
                disabled={!isAdmin}
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
                disabled={!isAdmin}
              />
            </div>
          </div>

          <div style={styles.actionsRow}>
            <button
              style={{
                ...styles.primaryButton,
                ...(isAdmin ? {} : styles.disabledButton),
              }}
              onClick={saveClientConfig}
              disabled={savingClient || !selectedDeviceId || !isAdmin}
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
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Modo admin</div>
              <div style={styles.cardHint}>
                Área reservada para informação técnica e gestão por dispositivo
              </div>
            </div>
          </div>

          {!isAdmin ? (
            <>
              <div style={styles.adminLoginRow}>
                <input
                  type="password"
                  placeholder="Código admin"
                  value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value)}
                  style={styles.input}
                />
                <button
                  style={styles.loginButton}
                  onClick={() => {
                    if (adminCodeInput === ADMIN_CODE) {
                      setIsAdmin(true);
                      setAdminError("");
                    } else {
                      setAdminError("Código inválido");
                    }
                  }}
                >
                  Entrar
                </button>
              </div>

              {adminError ? (
                <div style={styles.errorText}>{adminError}</div>
              ) : null}
            </>
          ) : (
            <div style={styles.adminPanel}>
              <div style={styles.adminPanelTop}>
                <div style={styles.adminActive}>Modo admin ativo</div>
                <button
                  style={styles.logoutButton}
                  onClick={() => {
                    setIsAdmin(false);
                    setAdminCodeInput("");
                    setAdminError("");
                    setAdminMessage("");
                    setClientMessage("");
                  }}
                >
                  Sair
                </button>
              </div>

              <div
                style={{
                  ...styles.adminGrid,
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <SmallStat label="Config version" value={device?.config_version ?? "-"} />
                <SmallStat label="Atualizada em" value={formatDateTime(device?.updated_at)} />
                <SmallStat label="Last seen" value={formatDateTime(device?.last_seen)} />
                <SmallStat label="Status raw" value={device?.status || "-"} />
                <SmallStat label="Device ID" value={device?.device_id || selectedDeviceId || "-"} />
                <SmallStat label="Nome" value={deviceDisplayName} />
                <SmallStat label="Localização" value={deviceLocation} />
                <SmallStat label="Última temp." value={formatValue(device?.last_temperature, " °C")} />
                <SmallStat label="Última hum." value={formatValue(device?.last_humidity, " %")} />
                <SmallStat label="Histerese" value={hystC !== null ? `${hystC} °C` : "-"} />
                <SmallStat label="Envio" value={sendIntervalS !== null ? `${sendIntervalS}s` : "-"} />
                <SmallStat
                  label="Standby display"
                  value={displayStandbyMin !== null ? `${displayStandbyMin} min` : "-"}
                />
              </div>

              <div style={styles.subsection}>
                <div style={styles.subsectionTitle}>Configurações admin</div>

                <div
                  style={{
                    ...styles.formGrid,
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(4, minmax(0, 1fr))",
                  }}
                >
                  <div style={styles.field}>
                    <label style={styles.label}>Nome do dispositivo</label>
                    <input
                      type="text"
                      value={adminForm.name}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      style={styles.configInput}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Localização</label>
                    <input
                      type="text"
                      value={adminForm.location}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      style={styles.configInput}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Histerese (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={adminForm.hyst_c}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          hyst_c: e.target.value,
                        }))
                      }
                      style={styles.configInput}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Intervalo de envio (s)</label>
                    <input
                      type="number"
                      step="1"
                      value={adminForm.send_interval_s}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          send_interval_s: e.target.value,
                        }))
                      }
                      style={styles.configInput}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Standby display (min)</label>
                    <input
                      type="number"
                      step="1"
                      value={adminForm.display_standby_min}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          display_standby_min: e.target.value,
                        }))
                      }
                      style={styles.configInput}
                    />
                  </div>
                </div>

                <div style={styles.actionsRow}>
                  <button
                    style={styles.primaryButton}
                    onClick={saveAdminConfig}
                    disabled={savingAdmin || !selectedDeviceId}
                  >
                    {savingAdmin ? "A guardar..." : "Guardar admin"}
                  </button>

                  {adminMessage ? (
                    <span
                      style={
                        adminMessage.toLowerCase().includes("sucesso")
                          ? styles.successText
                          : styles.errorTextInline
                      }
                    >
                      {adminMessage}
                    </span>
                  ) : null}
                </div>
              </div>

              <div style={styles.rawConfigWrap}>
                <div style={styles.rawConfigTitle}>Configuração raw</div>
                <pre style={styles.rawConfig}>
                  {JSON.stringify(device?.config || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>

        {!loading && hasDevices && !hasReadings ? (
          <div style={styles.emptyState}>
            Ainda não existem leituras para o período selecionado.
          </div>
        ) : null}

        {loading && <div style={styles.loading}>A carregar dados...</div>}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    padding: "24px 16px 40px",
    color: "#e5edf7",
    overflowX: "hidden",
  },

  container: {
    width: "100%",
    maxWidth: "1380px",
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
    fontSize: "28px",
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#f8fafc",
  },

  subtitle: {
    margin: "6px 0 0 0",
    color: "#94a3b8",
    fontSize: "14px",
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
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "20px",
    overflow: "hidden",
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

  deviceSelectorGrid: {
    display: "grid",
    gap: "12px",
  },

  deviceSelectorCard: {
    textAlign: "left",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "18px",
    padding: "16px",
    cursor: "pointer",
    color: "#f8fafc",
    transition: "all 0.15s ease",
  },

  deviceSelectorCardActive: {
    border: "1px solid #2563eb",
    boxShadow: "0 0 0 1px rgba(37,99,235,0.25)",
    background: "#101c34",
  },

  deviceSelectorTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
  },

  deviceSelectorName: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  deviceSelectorStatus: {
    border: "1px solid",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  deviceSelectorMeta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginBottom: "6px",
    wordBreak: "break-word",
  },

  deviceSelectorMetrics: {
    marginTop: "10px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    fontSize: "13px",
    fontWeight: 700,
    color: "#e2e8f0",
  },

  heroCard: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 1fr)",
    gap: "18px",
    background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
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
    fontWeight: 800,
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
    border: "1px solid",
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
    border: "1px solid #1e293b",
    borderRadius: "20px",
    padding: "18px",
    minWidth: 0,
  },

  metricLabel: {
    fontSize: "13px",
    color: "#8fa1b9",
    fontWeight: 700,
    marginBottom: "8px",
  },

  metricValue: {
    fontSize: "30px",
    lineHeight: 1,
    fontWeight: 800,
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
  },

  heroMetaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
  },

  infoItem: {
    background: "#0f172a",
    border: "1px solid #1e293b",
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
    border: "1px solid #1e293b",
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

  healthGrid: {
    display: "grid",
    gap: "14px",
  },

  healthCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
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
    border: "1px solid",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  healthValue: {
    fontSize: "26px",
    fontWeight: 800,
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
    border: "1px solid",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  alertRowMessage: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: 1.5,
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

  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed",
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

  adminLoginRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },

  input: {
    flex: "1 1 260px",
    minWidth: "220px",
    border: "1px solid #2a3547",
    background: "#0f172a",
    color: "#f8fafc",
    borderRadius: "12px",
    padding: "9px 12px",
    fontSize: "13px",
    outline: "none",
    height: "38px",
  },

  loginButton: {
    border: "1px solid #1d4ed8",
    background: "#1d4ed8",
    color: "#ffffff",
    borderRadius: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 800,
  },

  logoutButton: {
    border: "1px solid #2a3547",
    background: "#0f172a",
    color: "#e5edf7",
    borderRadius: "14px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
  },

  errorText: {
    marginTop: "10px",
    color: "#f87171",
    fontSize: "13px",
    fontWeight: 700,
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
    border: "1px solid #1e293b",
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

  loading: {
    textAlign: "center",
    color: "#94a3b8",
    fontWeight: 700,
    paddingTop: "4px",
  },
};