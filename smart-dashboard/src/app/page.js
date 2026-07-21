"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { FirmwareVersionBadge } from "./components/FirmwareVersionBadge";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  Cpu,
  Droplets,
  Gauge,
  HeartPulse,
  Home,
  Info,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Power,
  Radio,
  Settings,
  Snowflake,
  Thermometer,
  Timer,
  Wrench,
  Wifi,
  X,
} from "lucide-react";
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
const LANGUAGE_STORAGE_KEY = "sts_dashboard_language";
const THEME_STORAGE_KEY = "sts_dashboard_theme";
const STS_PRODUCT = {
  family: "STS",
  product: "STS Cold",
  domain: "stsapp.pt",
};
const STS_TAGLINE = "Monitorizar Hoje. Proteger Amanhã.";
const STS_LOGO_SRC = "/sts-logo.png";

const I18N = {
  en: {
    overview: "Overview",
    readings: "Readings",
    charts: "Charts",
    alerts: "Alerts",
    diagnostics: "Diagnostics",
    settings: "Settings",
    information: "Information",
    monitoring: "Monitoring",
    system: "System",
    navigation: "Navigation",
    workspace: "Device workspace",
    client: "Client",
    refresh: "Refresh",
    logout: "Exit",
    updating: "Updating...",
    currentCondition: "Current condition",
    currentTemperature: "Temperature",
    lastTemperature: "Last temperature",
    currentHumidity: "Humidity",
    lastHumidity: "Last humidity",
    realtime: "Live",
    offline: "Offline",
    settingsTitle: "Operational settings",
    settingsHint: "Operational limits per device",
    editable: "Editable configuration",
    readOnly: "Read only",
    interface: "Interface",
    interfaceHint: "Dashboard display preferences",
    chooseLanguage: "Language used across this client dashboard",
    chooseTheme: "Visual comfort for the operation room",
    language: "Language",
    theme: "Theme",
    darkTheme: "Dark",
    lightTheme: "Light",
    english: "English",
    portuguese: "Portuguese",
    tempMin: "Minimum temperature (°C)",
    tempMax: "Maximum temperature (°C)",
    humMin: "Minimum humidity (%)",
    humMax: "Maximum humidity (%)",
    stability: "Stability",
    stabilityHint: "Fine tuning used to avoid repeated alerts close to the limit",
    tempHysteresis: "Temperature hysteresis (C)",
    humHysteresis: "Humidity hysteresis (%)",
    deviceCadence: "Device cadence",
    deviceCadenceHint: "How often the device sends readings and manages the display",
    sendInterval: "Send interval (min)",
    displayStandby: "Display standby (min)",
    saveSettings: "Save settings",
    saving: "Saving...",
    chartsPeriod: "Display period",
    chartsPeriodHint: "Adjust the time range shown in charts",
    temperature: "Temperature",
    humidity: "Humidity",
    alertHistory: "Alert history",
    noAlerts: "No alerts registered for this device.",
    showAll: "View all",
    minimize: "Minimize",
    diagnosticsTitle: "Communication health",
    diagnosticsHint: "Connection quality and reading regularity",
    diagnosticsPeriod: "Diagnostics period",
    reportTitle: "PDF report",
    reportHint: "Export the professional reading summary for this device",
    reportPeriod: "Report period",
    downloadPdf: "Download PDF",
    readingsTitle: "Readings",
    readingsHint: "Detailed readings, limits and trend for this device.",
    indoorTemperature: "Indoor temperature",
    indoorHumidity: "Indoor humidity",
    summary24h: "24h summary",
    minMax: "Min / Max",
    limits: "Limits",
    noLimits: "No limits defined",
    informationHint: "Device identification and context.",
    model: "Model",
    deviceId: "Device ID",
    location: "Location",
    configVersion: "Config version",
    lastUpdate: "Last update",
    chooseOperation: "Select operation",
    chooseTitle: "Choose location and device",
    chooseText: "Choose the area to start monitoring.",
    noDevices: "No devices found.",
    executiveStatus: "Executive status",
    generalStatus: "General status",
    noActiveAlerts: "No active alerts",
    activeAlerts: "Active alerts",
    outdoorTemperature: "Outdoor temperature",
    outdoorHumidity: "Outdoor humidity",
    temperatureDelta: "Temperature delta",
    lastCommunication: "Last communication",
    externalReference: "External reference",
    interiorMinusExterior: "Interior minus exterior",
    avgTemp: "avg temp",
    avgHum: "avg hum",
    ackRegistered: "ACK registered",
    noAckPending: "No ACK pending",
    communication: "Communication",
    validatedReadings: "Validated readings",
    technicalGeneral: "General",
    technicalSensors: "Sensors",
    technicalAlerts: "Alerts",
    technicalCommunicationDisplay: "Communication & display",
    activeAlertSingular: "active alert",
    activeAlertPlural: "active alerts",
    requiresOperationalAttention: "Requires operational attention",
    alarmTime: "Alarm time",
    sinceMostRecentActiveAlert: "Since the most recent active alert",
    noActiveAlarm: "No active alarm",
    recentAlertsFirst: "Most recent alerts from the last {hours}h first",
    ackExplanation: "Confirmation without deleting the alert",
    readingsCount: "{count} readings",
    remoteAck: "Remote ACK",
    sendingRemoteAck: "Sending ACK...",
  },
  pt: {
    overview: "Visão geral",
    readings: "Leituras",
    charts: "Gráficos",
    alerts: "Alertas",
    diagnostics: "Diagnóstico",
    settings: "Configurações",
    information: "Informação",
    monitoring: "Monitorização",
    system: "Sistema",
    navigation: "Navegação",
    workspace: "Área do dispositivo",
    client: "Cliente",
    refresh: "Atualizar",
    logout: "Sair",
    updating: "A atualizar...",
    currentCondition: "Condição atual",
    currentTemperature: "Temperatura",
    lastTemperature: "Última temperatura",
    currentHumidity: "Humidade",
    lastHumidity: "Última humidade",
    realtime: "Tempo real",
    offline: "Offline",
    settingsTitle: "Configurações operacionais",
    settingsHint: "Limites operacionais por dispositivo",
    chooseLanguage: "Idioma usado em toda a dashboard deste cliente",
    chooseTheme: "Conforto visual para a sala de operacao",
    english: "Ingles",
    portuguese: "Portugues",
    stability: "Estabilidade",
    stabilityHint: "Ajuste fino usado para evitar alertas repetidos junto ao limite",
    tempHysteresis: "Histerese temperatura (C)",
    humHysteresis: "Histerese humidade (%)",
    deviceCadence: "Cadencia do dispositivo",
    deviceCadenceHint: "Frequencia de envio das leituras e gestao do display",
    sendInterval: "Intervalo de envio (min)",
    displayStandby: "Standby do display (min)",
    editable: "Configuração editável",
    readOnly: "Só leitura",
    interface: "Interface",
    interfaceHint: "Preferências de visualização da dashboard",
    language: "Língua",
    theme: "Tema",
    darkTheme: "Escuro",
    lightTheme: "Claro",
    tempMin: "Temperatura mínima (°C)",
    tempMax: "Temperatura máxima (°C)",
    humMin: "Humidade mínima (%)",
    humMax: "Humidade máxima (%)",
    saveSettings: "Guardar configurações",
    saving: "A guardar...",
    chartsPeriod: "Período de visualização",
    chartsPeriodHint: "Ajusta o intervalo temporal apresentado nos gráficos",
    temperature: "Temperatura",
    humidity: "Humidade",
    alertHistory: "Histórico de alertas",
    noAlerts: "Sem alertas registados para este dispositivo.",
    showAll: "Ver todos",
    minimize: "Minimizar",
    diagnosticsTitle: "Saúde da comunicação",
    diagnosticsHint: "Qualidade da ligação e regularidade das leituras",
    reportTitle: "Relatório PDF",
    reportHint: "Exportação do resumo profissional de leituras do dispositivo",
    reportPeriod: "Período do relatório",
    downloadPdf: "Descarregar PDF",
    readingsTitle: "Leituras",
    readingsHint: "Leituras detalhadas, limites e tendência do dispositivo.",
    indoorTemperature: "Temperatura interior",
    indoorHumidity: "Humidade interior",
    summary24h: "Resumo 24h",
    minMax: "Min / Max",
    limits: "Limites",
    noLimits: "Sem limites definidos",
    informationHint: "Identificação e contexto do dispositivo.",
    model: "Modelo",
    deviceId: "ID do dispositivo",
    location: "Localização",
    configVersion: "Versão de configuração",
    lastUpdate: "Última atualização",
    chooseOperation: "Selecionar operação",
    chooseTitle: "Escolhe o local e o dispositivo",
    chooseText: "Escolhe a área para começar a monitorizar.",
    noDevices: "Nenhum dispositivo encontrado.",
    executiveStatus: "Estado executivo",
    generalStatus: "Estado geral",
    noActiveAlerts: "Sem alertas ativos",
    activeAlerts: "Alertas ativos",
    outdoorTemperature: "Temperatura exterior",
    outdoorHumidity: "Humidade exterior",
    temperatureDelta: "Delta temperatura",
    lastCommunication: "Ultima comunicacao",
    externalReference: "Referencia exterior",
    interiorMinusExterior: "Interior menos exterior",
    avgTemp: "media temp.",
    avgHum: "media hum.",
    ackRegistered: "ACK registado",
    noAckPending: "Sem ACK pendente",
    communication: "Comunicacao",
    validatedReadings: "Leituras validadas",
    technicalGeneral: "Geral",
    technicalSensors: "Sensores",
    technicalAlerts: "Alertas",
    technicalCommunicationDisplay: "Comunicacao e display",
    activeAlertSingular: "alerta ativo",
    activeAlertPlural: "alertas ativos",
    requiresOperationalAttention: "Requer atencao operacional",
    alarmTime: "Tempo em alarme",
    sinceMostRecentActiveAlert: "Desde o alerta ativo mais recente",
    noActiveAlarm: "Sem alarme ativo",
    recentAlertsFirst: "Alertas mais recentes das últimas {hours}h primeiro",
    ackExplanation: "Confirmação sem eliminar o alerta",
    readingsCount: "{count} leituras",
    remoteAck: "ACK remoto",
    sendingRemoteAck: "A enviar ACK...",
  },
};

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

const ALERT_RECENT_HOURS = 24;
const ALERT_HISTORY_HOURS = 24 * 30;

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

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "sim"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  }
  return null;
}

function getOfflineLimitMs(sendIntervalS, offlineAlertAfterMin) {
  const configuredMs =
    Number.isFinite(Number(offlineAlertAfterMin)) && Number(offlineAlertAfterMin) > 0
      ? Number(offlineAlertAfterMin) * 60 * 1000
      : 6 * 60 * 1000;

  const cadenceGraceMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000 * 2.5
      : 0;

  return Math.max(configuredMs, cadenceGraceMs, 180 * 1000);
}

function getEffectiveStatus(device, sendIntervalS, offlineAlertAfterMin) {
  const lastSeen = device?.last_seen ? new Date(device.last_seen).getTime() : null;
  const now = Date.now();
  const offlineLimitMs = getOfflineLimitMs(sendIntervalS, offlineAlertAfterMin);

  if (!lastSeen || now - lastSeen > offlineLimitMs) {
    return "OFFLINE";
  }

  return device?.status || "SEM DADOS";
}

function getDeviceEffectiveStatus(device) {
  return getEffectiveStatus(
    device,
    parseNumber(device?.config?.send_interval_s),
    parseNumber(device?.config?.offline_alert_after_min)
  );
}

function isOfflineCapturedReading(reading, sendIntervalS) {
  const explicitOffline = parseBoolean(reading?.offline_captured);
  if (explicitOffline !== null) return explicitOffline;

  const deliveryAttempts = parseNumber(reading?.delivery_attempts) || 0;
  const sampleAgeS = parseNumber(reading?.sample_age_s);
  const sampleEpoch = parseNumber(reading?.sample_epoch);
  const expectedMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000
      : 60 * 1000;
  const delayedMs = Math.max(expectedMs, 60 * 1000);

  if (deliveryAttempts > 1) return true;
  if (sampleAgeS !== null && sampleAgeS * 1000 > delayedMs) return true;

  if (sampleEpoch !== null && sampleEpoch > 1700000000) {
    return Date.now() - sampleEpoch * 1000 > delayedMs;
  }

  return false;
}

function getStatusInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("ack")) {
    return {
      label: "ACK",
      color: "#60a5fa",
      soft: "rgba(37, 99, 235, 0.16)",
      border: "rgba(96, 165, 250, 0.28)",
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
      soft: "rgba(239, 68, 68, 0.14)",
      border: "rgba(248, 113, 113, 0.28)",
      glow: "0 0 0 1px rgba(239,68,68,0.12)",
      priority: 3,
      dot: "#ef4444",
      panel: "#17151d",
    };
  }

  if (s.includes("alarm") || s.includes("critical")) {
    return {
      label: "ALARME",
      color: "#ef4444",
      soft: "rgba(239, 68, 68, 0.14)",
      border: "rgba(248, 113, 113, 0.28)",
      glow: "0 0 0 1px rgba(239,68,68,0.12)",
      priority: 0,
      dot: "#ef4444",
      panel: "#17151d",
    };
  }

  if (s.includes("alert")) {
    return {
      label: "ALERTA",
      color: "#f59e0b",
      soft: "rgba(245, 158, 11, 0.14)",
      border: "rgba(251, 191, 36, 0.28)",
      glow: "0 0 0 1px rgba(245,158,11,0.10)",
      priority: 1,
      dot: "#f59e0b",
      panel: "#17181d",
    };
  }

  if (s.includes("normal") || s.includes("ok")) {
    return {
      label: "NORMAL",
      color: "#22c55e",
      soft: "rgba(34, 197, 94, 0.14)",
      border: "rgba(74, 222, 128, 0.24)",
      glow: "0 0 0 1px rgba(34,197,94,0.10)",
      priority: 2,
      dot: "#22c55e",
      panel: "#101c1b",
    };
  }

  return {
    label: status || "SEM DADOS",
    color: "#94a3b8",
    soft: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.20)",
    glow: "0 0 0 1px rgba(148,163,184,0.08)",
    priority: 4,
    dot: "#94a3b8",
    panel: "#121a24",
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

function getSeriesMinMax(data, keys) {
  const safeKeys = Array.isArray(keys) ? keys : [keys];
  const values = data
    .flatMap((item) => safeKeys.map((key) => parseNumber(item?.[key])))
    .filter((v) => v !== null);

  if (!values.length) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getChartDomain(data, keys, thresholds = []) {
  const safeKeys = Array.isArray(keys) ? keys : [keys];
  const metricKey = String(safeKeys[0] || "");
  const values = data
    .flatMap((item) => safeKeys.map((key) => parseNumber(item?.[key])))
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
      metricKey.includes("humidity")
        ? Math.max(Math.abs(min) * 0.02, 1)
        : Math.max(Math.abs(min) * 0.03, 0.6);

    return [
      Number((min - pad).toFixed(2)),
      Number((max + pad).toFixed(2)),
    ];
  }

  const range = max - min;
  const pad =
    metricKey.includes("humidity")
      ? Math.max(range * 0.15, 1)
      : Math.max(range * 0.18, 0.3);

  return [
    Number((min - pad).toFixed(2)),
    Number((max + pad).toFixed(2)),
  ];
}

function getReferencePoints(data, keys) {
  const safeKeys = Array.isArray(keys) ? keys : [keys];
  const points = data
    .flatMap((item) =>
      safeKeys.map((key) => ({
        value: parseNumber(item?.[key]),
        created_at: item?.created_at,
        timestamp: item?.timestamp,
      }))
    )
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

function buildTimeSeries(readings, periodKey, sendIntervalS) {
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
        latestTimestamp: null,
        temperature: null,
        humidity: null,
        tempTimestamp: null,
        humTimestamp: null,
        offlineTemperature: null,
        offlineHumidity: null,
        offlineTempTimestamp: null,
        offlineHumTimestamp: null,
        offlineCount: 0,
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

    const isOfflineReading = isOfflineCapturedReading(item, sendIntervalS);

    if (temp !== null) {
      bucket.hasData = true;
      if (bucket.latestTimestamp === null || item.timestamp >= bucket.latestTimestamp) {
        bucket.latestTimestamp = item.timestamp;
      }

      if (isOfflineReading) {
        if (bucket.offlineTempTimestamp === null || item.timestamp >= bucket.offlineTempTimestamp) {
          bucket.offlineTemperature = temp;
          bucket.offlineTempTimestamp = item.timestamp;
        }
      } else {
        if (bucket.tempTimestamp === null || item.timestamp >= bucket.tempTimestamp) {
          bucket.temperature = temp;
          bucket.tempTimestamp = item.timestamp;
        }
      }
    }

    if (hum !== null) {
      bucket.hasData = true;
      if (bucket.latestTimestamp === null || item.timestamp >= bucket.latestTimestamp) {
        bucket.latestTimestamp = item.timestamp;
      }

      if (isOfflineReading) {
        if (bucket.offlineHumTimestamp === null || item.timestamp >= bucket.offlineHumTimestamp) {
          bucket.offlineHumidity = hum;
          bucket.offlineHumTimestamp = item.timestamp;
        }
      } else {
        if (bucket.humTimestamp === null || item.timestamp >= bucket.humTimestamp) {
          bucket.humidity = hum;
          bucket.humTimestamp = item.timestamp;
        }
      }
    }

    if (isOfflineReading) {
      bucket.offlineCount += 1;
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      timestamp: bucket.timestamp,
      created_at:
        bucket.latestTimestamp !== null
          ? new Date(bucket.latestTimestamp).toISOString()
          : bucket.created_at,
      temperature: bucket.temperature !== null ? Number(bucket.temperature.toFixed(2)) : null,
      humidity: bucket.humidity !== null ? Number(bucket.humidity.toFixed(2)) : null,
      temperature_offline:
        bucket.offlineTemperature !== null ? Number(bucket.offlineTemperature.toFixed(2)) : null,
      humidity_offline:
        bucket.offlineHumidity !== null ? Number(bucket.offlineHumidity.toFixed(2)) : null,
      hasData: bucket.hasData,
      offline_captured: bucket.offlineCount > 0,
      offline_count: bucket.offlineCount,
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
  offlineAlertAfterMin,
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
      : 60 * 1000;

  const offlineThresholdMs = getOfflineLimitMs(sendIntervalS, offlineAlertAfterMin);
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
  const severeGapThresholdMs = Math.max(expectedMs * 3, offlineThresholdMs);

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
    if (lastDelayMs > offlineThresholdMs * 0.7) {
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
    title: "Normal",
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
    title: "Atenção",
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
    title: "Normal",
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
    chip: "Normal",
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

function mergeLiveDeviceReading(readings, device) {
  const current = buildCurrentReadingFromDevice(device);
  if (
    !current ||
    !Number.isFinite(current.timestamp) ||
    (parseNumber(current.temperature) === null && parseNumber(current.humidity) === null)
  ) {
    return readings || [];
  }

  const safeReadings = readings || [];
  const latest = safeReadings
    .filter((item) => Number.isFinite(item?.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const sameTemp =
    latest && parseNumber(latest.temperature) === parseNumber(current.temperature);
  const sameHum =
    latest && parseNumber(latest.humidity) === parseNumber(current.humidity);

  if (
    latest &&
    Math.abs(current.timestamp - latest.timestamp) < 1000 &&
    sameTemp &&
    sameHum
  ) {
    return safeReadings;
  }

  return [
    ...safeReadings,
    {
      ...current,
      live_current: true,
      offline_captured: false,
      delivery_attempts: 0,
      sample_age_s: 0,
    },
  ].sort((a, b) => a.timestamp - b.timestamp);
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
    const latestState = String(latestForType?.state || "").toLowerCase();
    const alreadyOpen =
      String(latestForType?.level || "").toLowerCase() === "alert" &&
      (!latestState || latestState === currentState);

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
  return getStatusInfo(getDeviceEffectiveStatus(device)).priority;
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

function getDeviceCompany(device, profile) {
  return (
    device?.company ||
    device?.company_name ||
    device?.organization ||
    device?.client_name ||
    profile?.company_name ||
    profile?.client_name ||
    STS_PRODUCT.family
  );
}

function getLocationParts(device) {
  const raw = String(device?.location || "").trim();
  if (!raw || raw === "Localização por definir") {
    return {
      building: "Localização",
      room: "Por definir",
    };
  }

  const parts = raw
    .split(/\s*(?:>|\/|,|–|-)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    building: device?.building || device?.site || parts[0] || "Localização",
    room: device?.room || device?.division || device?.area || parts[1] || parts[0] || "Dispositivos",
  };
}

function getDeviceEmoji(device) {
  return (
    device?.emoji ||
    device?.device_emoji ||
    device?.icon_emoji ||
    device?.config?.emoji ||
    device?.config?.device_emoji ||
    "🌡️"
  );
}

function getLocationEmoji(device) {
  return (
    device?.location_emoji ||
    device?.room_emoji ||
    device?.config?.location_emoji ||
    device?.config?.room_emoji ||
    "📍"
  );
}

function buildDeviceHierarchy(devices, profile) {
  const companies = new Map();

  for (const item of sortDevices(devices)) {
    const companyName = getDeviceCompany(item, profile);
    const { building, room } = getLocationParts(item);

    if (!companies.has(companyName)) {
      companies.set(companyName, {
        name: companyName,
        buildings: new Map(),
        count: 0,
      });
    }

    const company = companies.get(companyName);
    company.count += 1;

    if (!company.buildings.has(building)) {
      company.buildings.set(building, {
        name: building,
        rooms: new Map(),
        count: 0,
      });
    }

    const buildingNode = company.buildings.get(building);
    buildingNode.count += 1;

    if (!buildingNode.rooms.has(room)) {
      buildingNode.rooms.set(room, {
        name: room,
        devices: [],
      });
    }

    buildingNode.rooms.get(room).devices.push(item);
  }

  return Array.from(companies.values()).map((company) => ({
    ...company,
    buildings: Array.from(company.buildings.values()).map((building) => ({
      ...building,
      rooms: Array.from(building.rooms.values()),
    })),
  }));
}

function getBestInitialDeviceId(devices, currentSelectedId) {
  const safeDevices = devices || [];
  if (!safeDevices.length) return null;

  if (currentSelectedId && safeDevices.some((d) => d.device_id === currentSelectedId)) {
    return currentSelectedId;
  }

  return null;
}

function CustomTooltip({ active, payload, label, unit, digits = 1 }) {
  if (!active || !payload || !payload.length) return null;

  const visiblePayload =
    payload.find((item) => item?.value !== null && item?.value !== undefined) ||
    payload[0];
  const point = visiblePayload?.payload;
  const value = visiblePayload?.value;
  const isOfflineSeries = String(visiblePayload?.dataKey || "").endsWith("_offline");

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
              {isOfflineSeries ? "Offline" : "Valor"}: <strong>{formatValue(value, unit, digits)}</strong>
            </>
          )}
      </div>
      {isOfflineSeries ? (
        <div style={styles.tooltipMeta}>
          Leitura captada offline{point.offline_count > 1 ? ` (${point.offline_count})` : ""}
        </div>
      ) : null}
    </div>
  );
}

function MetricBox({ label, value, tone = "neutral", subvalue, accentLabel, icon: Icon }) {
  const toneMap = {
    neutral: {
      border: "rgba(148, 163, 184, 0.16)",
      bg: "rgba(8, 13, 23, 0.54)",
      value: "#f8fafc",
      accent: "#64748b",
      chipBg: "rgba(148, 163, 184, 0.12)",
    },
    good: {
      border: "rgba(34, 197, 94, 0.24)",
      bg: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(8,13,23,0.66))",
      value: "#f8fafc",
      accent: "#22c55e",
      chipBg: "rgba(34, 197, 94, 0.12)",
    },
    warn: {
      border: "rgba(245, 158, 11, 0.30)",
      bg: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(8,13,23,0.66))",
      value: "#f8fafc",
      accent: "#f59e0b",
      chipBg: "rgba(245, 158, 11, 0.12)",
    },
    bad: {
      border: "rgba(239, 68, 68, 0.28)",
      bg: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(8,13,23,0.66))",
      value: "#f8fafc",
      accent: "#ef4444",
      chipBg: "rgba(239, 68, 68, 0.12)",
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
        <div style={styles.metricLabelWrap}>
          {Icon ? (
            <span style={styles.metricIcon}>
              <Icon size={16} />
            </span>
          ) : null}
          <div style={styles.metricLabel}>{label}</div>
        </div>
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

function InfoItem({ label, value, valueColor, icon: Icon }) {
  return (
    <div style={styles.infoItem}>
      <span style={styles.infoLabel}>
        {Icon ? <Icon size={14} /> : null}
        {label}
      </span>
      <span style={{ ...styles.infoValue, color: valueColor || styles.infoValue.color }}>
        {value}
      </span>
    </div>
  );
}

function getHardwareSummary(diagnostics) {
  const components = diagnostics?.components || {};
  const entries = Object.values(components);
  if (!diagnostics || entries.length === 0) {
    return { label: "Sem detalhe", tone: "neutral", color: "#94a3b8" };
  }

  const failing = entries.filter((item) => item?.ok === false);
  if (diagnostics?.overall_ok === false || failing.length > 0) {
    return {
      label: failing.length ? `${failing.length} componente(s) com atenção` : "Atenção",
      tone: "bad",
      color: "#ef4444",
    };
  }

  return { label: "Hardware OK", tone: "good", color: "#22c55e" };
}

function isMaintenanceActive(config) {
  const ts = config?.maintenance?.active_until
    ? new Date(config.maintenance.active_until).getTime()
    : NaN;
  return Number.isFinite(ts) && ts > Date.now();
}

function SmallStat({ label, value }) {
  return (
    <div style={styles.smallStat}>
      <div style={styles.smallStatLabel}>{label}</div>
      <div style={styles.smallStatValue}>{value}</div>
    </div>
  );
}

function ExecutiveStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  emphasis = false,
}) {
  const toneStyles = getHealthToneStyles(tone);

  return (
    <div
      style={{
        ...styles.executiveStatCard,
        ...(emphasis ? styles.executiveStatCardEmphasis : {}),
        borderColor: toneStyles.badgeBorder,
      }}
    >
      <div style={styles.executiveStatTop}>
        <span
          style={{
            ...styles.executiveStatIcon,
            color: toneStyles.valueColor,
            background: toneStyles.badgeBg,
            borderColor: toneStyles.badgeBorder,
          }}
        >
          {Icon ? <Icon size={17} /> : null}
        </span>
        <span style={styles.executiveStatLabel}>{label}</span>
      </div>

      <div style={{ ...styles.executiveStatValue, color: toneStyles.valueColor }}>
        {value}
      </div>

      {hint ? <div style={styles.executiveStatHint}>{hint}</div> : null}
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
      badgeBg: "rgba(34, 197, 94, 0.14)",
      badgeBorder: "rgba(74, 222, 128, 0.24)",
    };
  }

  if (tone === "warn") {
    return {
      valueColor: "#f59e0b",
      badgeBg: "rgba(245, 158, 11, 0.15)",
      badgeBorder: "rgba(251, 191, 36, 0.25)",
    };
  }

  if (tone === "bad") {
    return {
      valueColor: "#ef4444",
      badgeBg: "rgba(239, 68, 68, 0.14)",
      badgeBorder: "rgba(248, 113, 113, 0.25)",
    };
  }

  return {
    valueColor: "#94a3b8",
    badgeBg: "rgba(148, 163, 184, 0.12)",
    badgeBorder: "rgba(148, 163, 184, 0.20)",
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

  const selectedStatusInfo = getStatusInfo(getDeviceEffectiveStatus(selectedDevice));

  const stats = useMemo(() => {
    const all = orderedDevices.length;
    const offline = orderedDevices.filter(
      (item) => getDeviceEffectiveStatus(item) === "OFFLINE"
    ).length;

    const alerts = orderedDevices.filter((item) => {
      const status = String(getDeviceEffectiveStatus(item) || "").toLowerCase();

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
              ?
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
              const info = getStatusInfo(getDeviceEffectiveStatus(item));
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

const DEVICE_NAV_SECTIONS = [
  { key: "overview", label: "Overview", group: "Monitoring", icon: LayoutDashboard },
  { key: "charts", label: "Charts", group: "Monitoring", icon: BarChart3 },
  { key: "alerts", label: "Alerts", group: "Monitoring", icon: Bell },
  { key: "diagnostics", label: "Diagnostics", group: "System", icon: HeartPulse },
  { key: "settings", label: "Settings", group: "System", icon: Settings },
  { key: "information", label: "Information", group: "System", icon: Info },
];

function DeviceSidebar({
  activeSection,
  onSectionChange,
  collapsed,
  onHoverStart,
  onHoverEnd,
  isMobile,
  t,
}) {
  const monitoringItems = DEVICE_NAV_SECTIONS.filter(
    (item) => item.group === "Monitoring"
  );
  const systemItems = DEVICE_NAV_SECTIONS.filter((item) => item.group === "System");

  return (
    <aside
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      style={{
        ...styles.appSidebar,
        ...(collapsed ? styles.appSidebarCollapsed : {}),
        ...(!collapsed && !isMobile ? styles.appSidebarExpanded : {}),
        ...(isMobile ? styles.appSidebarMobile : {}),
      }}
    >
      <nav style={{ ...styles.deviceNav, ...(isMobile ? styles.deviceNavMobile : {}) }}>
        {!isMobile ? (
          <div
            style={{
              ...styles.deviceNavGroupLabel,
              ...(collapsed ? styles.deviceNavGroupLabelCollapsed : {}),
            }}
          >
            {t("monitoring")}
          </div>
        ) : null}
        {monitoringItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSectionChange(item.key)}
              style={{
                ...styles.deviceNavItem,
                ...(collapsed ? styles.deviceNavItemCollapsed : {}),
                ...(isMobile ? styles.deviceNavItemMobile : {}),
                ...(activeSection === item.key ? styles.deviceNavItemActive : {}),
              }}
              title={t(item.key)}
            >
              <span style={styles.deviceNavIconSlot}><Icon size={16} /></span>
              <span
                style={{
                  ...styles.deviceNavText,
                  ...(collapsed ? styles.deviceNavTextCollapsed : {}),
                }}
              >
                {t(item.key)}
              </span>
            </button>
          );
        })}

        {!isMobile ? (
          <div
            style={{
              ...styles.deviceNavGroupLabel,
              ...(collapsed ? styles.deviceNavGroupLabelCollapsed : {}),
            }}
          >
            {t("system")}
          </div>
        ) : null}
        {systemItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSectionChange(item.key)}
              style={{
                ...styles.deviceNavItem,
                ...(collapsed ? styles.deviceNavItemCollapsed : {}),
                ...(isMobile ? styles.deviceNavItemMobile : {}),
                ...(activeSection === item.key ? styles.deviceNavItemActive : {}),
              }}
              title={t(item.key)}
            >
              <span style={styles.deviceNavIconSlot}><Icon size={16} /></span>
              <span
                style={{
                  ...styles.deviceNavText,
                  ...(collapsed ? styles.deviceNavTextCollapsed : {}),
                }}
              >
                {t(item.key)}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function NotificationCenter({ alerts, devices, isMobile, storageKey }) {
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const [clearedAt, setClearedAt] = useState(0);
  const wrapRef = useRef(null);
  const deviceMap = useMemo(
    () => new Map((devices || []).map((item) => [item.device_id, item])),
    [devices]
  );
  const visibleAlerts = useMemo(
    () => [...(alerts || [])]
      .filter((item) => !clearedAt || getAlertTimestamp(item) > clearedAt)
      .sort((a, b) => getAlertTimestamp(b) - getAlertTimestamp(a))
      .slice(0, 30),
    [alerts, clearedAt]
  );
  const unreadCount = useMemo(
    () => visibleAlerts.filter((item) => !seenAt || getAlertTimestamp(item) > seenAt).length,
    [seenAt, visibleAlerts]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    const timer = window.setTimeout(() => {
      setSeenAt(Number(window.localStorage.getItem(`${storageKey}:seen`) || 0));
      setClearedAt(Number(window.localStorage.getItem(`${storageKey}:cleared`) || 0));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function toggleNotifications() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && unreadCount) {
      const timestamp = Date.now();
      setSeenAt(timestamp);
      if (storageKey) window.localStorage.setItem(`${storageKey}:seen`, String(timestamp));
    }
  }

  function clearNotifications() {
    const timestamp = Date.now();
    setClearedAt(timestamp);
    setSeenAt(timestamp);
    if (storageKey) {
      window.localStorage.setItem(`${storageKey}:cleared`, String(timestamp));
      window.localStorage.setItem(`${storageKey}:seen`, String(timestamp));
    }
  }

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div ref={wrapRef} style={styles.notificationWrap}>
      <button
        type="button"
        aria-label={`Notificações por ver: ${unreadCount}`}
        title="Notificações de todos os dispositivos"
        onClick={toggleNotifications}
        style={{ ...styles.notificationButton, ...(isMobile ? styles.notificationButtonMobile : {}) }}
      >
        <Bell size={17} />
        <span>Notificações</span>
        {unreadCount ? (
          <span style={styles.notificationCount}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div style={{ ...styles.notificationPanel, ...(isMobile ? styles.notificationPanelMobile : {}) }}>
          <div style={styles.notificationHeader}>
            <div>
              <strong style={styles.notificationTitle}>Centro de notificações</strong>
              <span style={styles.notificationSubtitle}>Alertas de todos os equipamentos</span>
            </div>
            <div style={styles.notificationHeaderActions}>
              <span style={styles.notificationHeaderCount}>{visibleAlerts.length}</span>
              {visibleAlerts.length ? (
                <button type="button" onClick={clearNotifications} style={styles.notificationClearButton}>
                  Limpar
                </button>
              ) : null}
            </div>
          </div>
          <div style={styles.notificationList}>
            {visibleAlerts.length ? visibleAlerts.map((item, index) => {
              const sourceDevice = deviceMap.get(item.device_id);
              const level = getAlertLevelInfo(item?.level);
              return (
                <div key={item.id || `${item.device_id}-${getAlertTimestamp(item)}-${index}`} style={styles.notificationItem}>
                  <span style={{ ...styles.notificationDot, background: level.color }} />
                  <div style={styles.notificationItemBody}>
                    <div style={styles.notificationItemTop}>
                      <strong>{sourceDevice?.name || item.device_id || "Dispositivo"}</strong>
                      <span style={{ color: level.color }}>{level.label}</span>
                    </div>
                    <span style={styles.notificationLocation}>
                      {getLocationEmoji(sourceDevice)} {sourceDevice?.location || "Localização por definir"}
                    </span>
                    <span style={styles.notificationMessage}>
                      {item?.title || String(item?.type || "Alerta").replace(/^./, (letter) => letter.toUpperCase())}
                      {item?.state ? ` · ${item.state}` : ""}
                    </span>
                    {item?.message ? (
                      <span style={styles.notificationLocation}>{item.message}</span>
                    ) : null}
                    <span style={styles.notificationTime}>{formatDateTime(item?.detected_at || item?.event_at || item?.created_at)}</span>
                  </div>
                </div>
              );
            }) : <div style={styles.notificationEmpty}>Sem alertas registados.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeviceEntryPicker({ devices, profile, onSelectDevice, t }) {
  const hierarchy = useMemo(
    () => buildDeviceHierarchy(devices, profile),
    [devices, profile]
  );

  return (
    <section style={styles.entryGate}>
      <div style={styles.entryPanel}>
        <div style={styles.controlCenterIntro}>
          <div>
            <div style={styles.entryKicker}>Centro de controlo</div>
            <h2 style={styles.controlCenterTitle}>Locais de frio controlado</h2>
            <p style={styles.controlCenterText}>Consulta o estado geral e entra no equipamento que pretendes monitorizar.</p>
          </div>
          <div style={styles.controlCenterStats}>
            <span><strong>{hierarchy.reduce((total, company) => total + company.buildings.reduce((sum, building) => sum + building.rooms.length, 0), 0)}</strong> locais</span>
            <span><strong>{devices.length}</strong> dispositivos</span>
            <span><strong>{devices.filter((item) => getDeviceEffectiveStatus(item) === "OFFLINE").length}</strong> offline</span>
          </div>
        </div>
        <div style={styles.entryTree}>
          {hierarchy.flatMap((company) =>
            company.buildings.flatMap((building) =>
              building.rooms.map((room) => (
                <div key={`${company.name}-${building.name}-${room.name}`} style={styles.entryCompany}>
                  <div style={styles.entryCompanyTitle}>
                    <span style={styles.entryLocationIcon}>
                      <MapPin size={17} />
                    </span>
                    <div>
                      <span style={styles.entryLocationLabel}>{t("location")}</span>
                      <span style={styles.entryLocationName}>{room.name}</span>
                    </div>
                  </div>
                  <div style={styles.entryDevices}>
                    {room.devices.map((item) => {
                      const info = getStatusInfo(getDeviceEffectiveStatus(item));

                      return (
                        <button
                          key={item.device_id}
                          type="button"
                          onClick={() => onSelectDevice(item.device_id)}
                          style={styles.entryDeviceButton}
                        >
                          <span style={styles.entryDeviceIcon}>
                            <Snowflake size={17} />
                          </span>
                          <span
                            style={{
                              ...styles.treeDeviceDot,
                              background: info.dot,
                              boxShadow: `0 0 12px ${info.dot}`,
                            }}
                          />
                          <span style={styles.entryDeviceContent}>
                            <span style={styles.entryDeviceTopline}>
                              <strong>{item?.name || item?.device_id}</strong>
                              <span style={{ color: info.color }}>{info.label}</span>
                            </span>
                            <span style={styles.entryDeviceMetrics}>
                              {formatValue(item?.last_temperature, " °C")} · {formatValue(item?.last_humidity, " %")} · {formatRelativeTime(item?.last_seen)}
                            </span>
                            <span style={styles.entryDeviceId}>{item.device_id}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </section>
  );
}

function AlertRow({ item }) {
  const levelInfo = getAlertLevelInfo(item?.level);
  const isAck = String(item?.level || "").toLowerCase().includes("ack");
  const deviceTime = item?.device_time || item?.deviceTime;
  const acknowledgedBy =
    item?.acked_by || item?.acknowledged_by || item?.operator || item?.user_name;
  const note = item?.note || item?.notes || item?.observation || item?.alarm_reason;

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
        background: `linear-gradient(90deg, ${levelInfo.bg}66 0%, rgba(15,23,42,0.72) 100%)`,
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
        {deviceTime ? <span>Hora dispositivo: {formatDateTime(deviceTime)}</span> : null}
        {item?.source ? <span>Origem: {item.source}</span> : null}
        {isAck ? (
          <span>ACK: {acknowledgedBy || "Operador / dispositivo"}</span>
        ) : null}
        {note ? <span>Obs: {note}</span> : null}
      </div>
    </div>
  );
}

function UnifiedPredictionCard({ prediction, isOffline, theme = "dark" }) {
  const darkToneMap = {
    unknown: {
      border: "rgba(148, 163, 184, 0.30)",
      bg: "linear-gradient(135deg, rgba(15, 23, 42, 0.86) 0%, rgba(8, 13, 23, 0.92) 100%)",
      value: "#e2e8f0",
      badgeBg: "rgba(148, 163, 184, 0.12)",
      badgeBorder: "rgba(148, 163, 184, 0.20)",
      badgeColor: "#cbd5e1",
    },
    low: {
      border: "rgba(34, 197, 94, 0.30)",
      bg: "linear-gradient(135deg, rgba(20, 83, 45, 0.28) 0%, rgba(8, 13, 23, 0.92) 100%)",
      value: "#86efac",
      badgeBg: "rgba(34, 197, 94, 0.14)",
      badgeBorder: "rgba(74, 222, 128, 0.24)",
      badgeColor: "#86efac",
    },
    medium: {
      border: "rgba(245, 158, 11, 0.34)",
      bg: "linear-gradient(135deg, rgba(120, 53, 15, 0.32) 0%, rgba(8, 13, 23, 0.92) 100%)",
      value: "#fbbf24",
      badgeBg: "rgba(245, 158, 11, 0.15)",
      badgeBorder: "rgba(251, 191, 36, 0.25)",
      badgeColor: "#fbbf24",
    },
    high: {
      border: "rgba(239, 68, 68, 0.34)",
      bg: "linear-gradient(135deg, rgba(127, 29, 29, 0.34) 0%, rgba(8, 13, 23, 0.92) 100%)",
      value: "#f87171",
      badgeBg: "rgba(239, 68, 68, 0.14)",
      badgeBorder: "rgba(248, 113, 113, 0.25)",
      badgeColor: "#fca5a5",
    },
  };
  const lightToneMap = {
    unknown: {
      border: "rgba(15, 23, 42, 0.16)",
      bg: "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.92) 100%)",
      value: "#102033",
      badgeBg: "rgba(100, 116, 139, 0.10)",
      badgeBorder: "rgba(15, 23, 42, 0.12)",
      badgeColor: "#475569",
    },
    low: {
      border: "rgba(22, 163, 74, 0.24)",
      bg: "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(236, 253, 245, 0.88) 100%)",
      value: "#166534",
      badgeBg: "rgba(34, 197, 94, 0.12)",
      badgeBorder: "rgba(34, 197, 94, 0.20)",
      badgeColor: "#15803d",
    },
    medium: {
      border: "rgba(217, 119, 6, 0.26)",
      bg: "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 251, 235, 0.90) 100%)",
      value: "#92400e",
      badgeBg: "rgba(245, 158, 11, 0.13)",
      badgeBorder: "rgba(245, 158, 11, 0.22)",
      badgeColor: "#b45309",
    },
    high: {
      border: "rgba(220, 38, 38, 0.26)",
      bg: "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 241, 242, 0.90) 100%)",
      value: "#be123c",
      badgeBg: "rgba(239, 68, 68, 0.12)",
      badgeBorder: "rgba(239, 68, 68, 0.22)",
      badgeColor: "#be123c",
    },
  };

  const toneMap = theme === "light" ? lightToneMap : darkToneMap;
  const selected = toneMap[prediction?.level] || toneMap.unknown;
  const hasSpecificSource =
    prediction?.source && String(prediction.source).toLowerCase() !== "none";
  const shouldShowAdvice =
    isOffline ||
    prediction?.level === "medium" ||
    prediction?.level === "high" ||
    (prediction?.level === "unknown" && hasSpecificSource);
  const predictionInfoText = "Leitura preditiva resumida do comportamento recente.";

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
          <div style={styles.smartSurfaceEyebrowRow}>
            <div style={styles.smartSurfaceEyebrow}>Análise Preditiva</div>
            <span
              aria-label={predictionInfoText}
              className="sts-info-tooltip"
              style={styles.infoTooltipIcon}
            >
              <Info size={13} />
              <span className="sts-info-tooltip-content">
                <strong>Tendência de Risco</strong>
                <span>{predictionInfoText}</span>
              </span>
            </span>
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

function OperationalInsightCard({ items, theme = "dark" }) {
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
              ? theme === "light"
                ? {
                    border: "rgba(220, 38, 38, 0.22)",
                    bg: "rgba(255, 241, 242, 0.88)",
                    title: "#be123c",
                  }
                : {
                    border: "rgba(239, 68, 68, 0.30)",
                    bg: "rgba(127, 29, 29, 0.22)",
                    title: "#fca5a5",
                  }
              : item.tone === "warn"
              ? theme === "light"
                ? {
                    border: "rgba(217, 119, 6, 0.22)",
                    bg: "rgba(255, 251, 235, 0.88)",
                    title: "#92400e",
                  }
                : {
                    border: "rgba(245, 158, 11, 0.34)",
                    bg: "rgba(120, 53, 15, 0.22)",
                    title: "#fbbf24",
                  }
              : theme === "light"
              ? {
                  border: "rgba(22, 163, 74, 0.20)",
                  bg: "rgba(236, 253, 245, 0.86)",
                  title: "#166534",
                }
              : {
                  border: "rgba(34, 197, 94, 0.24)",
                  bg: "rgba(20, 83, 45, 0.20)",
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
  const offlineDataKey = `${dataKey}_offline`;
  const chartKeys = [dataKey, offlineDataKey];
  const { min, max } = getSeriesMinMax(data, chartKeys);
  const yDomain = getChartDomain(data, chartKeys, [minThreshold, maxThreshold]);
  const { minPoint, maxPoint } = getReferencePoints(data, chartKeys);
  const yTicks =
    dataKey === "temperature" ? getNiceTemperatureTicks(yDomain) : undefined;

  const valueDigits = dataKey === "humidity" ? 0 : 1;
  const yTickFormatter =
    dataKey === "humidity"
      ? (value) => `${Math.round(Number(value))}`
      : (value) => `${Number(value).toFixed(1)}`;

  const timeWindow = getPeriodWindow(periodKey);
  const xTicks = isMobile
    ? getXAxisTicks(periodKey).filter((_, index) => index % 2 === 0)
    : getXAxisTicks(periodKey);
  const hasData = data.some((item) =>
    chartKeys.some((key) => parseNumber(item?.[key]) !== null)
  );
  const offlinePoints = data.filter(
    (item) => item?.offline_captured && parseNumber(item?.[offlineDataKey]) !== null
  );

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
          {offlinePoints.length > 0 ? (
            <div style={styles.chartBackfillHint}>
              <span style={styles.chartBackfillDot} />
              Linha vermelha: leituras captadas offline
            </div>
          ) : null}
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
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 320} debounce={120}>
            <LineChart
              data={data}
              margin={
                isMobile
                  ? { top: 18, right: 10, left: 0, bottom: 6 }
                  : { top: 20, right: 24, left: 8, bottom: 8 }
              }
            >
              <CartesianGrid
                stroke="rgba(148, 163, 184, 0.14)"
                vertical={false}
                strokeDasharray="2 10"
              />

              <XAxis
                type="number"
                dataKey="timestamp"
                domain={[timeWindow.start, timeWindow.end]}
                ticks={xTicks}
                scale="time"
                tickFormatter={(value) => formatShortTime(value, periodKey)}
                stroke="#64748b"
                tick={{ fontSize: isMobile ? 10 : 12, fill: "#64748b" }}
                tickMargin={isMobile ? 6 : 8}
                minTickGap={isMobile ? 14 : 24}
              />

              <YAxis
                stroke="#64748b"
                tick={{ fontSize: isMobile ? 10 : 12, fill: "#64748b" }}
                domain={yDomain}
                ticks={yTicks}
                width={isMobile ? 46 : 64}
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

              {offlinePoints.length > 0 ? (
                <Line
                  type="linear"
                  dataKey={offlineDataKey}
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#ef4444", stroke: "#fecaca", strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: "#ef4444", stroke: "#fecaca", strokeWidth: 1 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : null}

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
  const [diagnosticsPeriod, setDiagnosticsPeriod] = useState("24h");
const [reportPeriod, setReportPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadState, setLoadState] = useState("initialLoading");
  const [lastRefreshError, setLastRefreshError] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [clearingAlerts, setClearingAlerts] = useState(false);
  const [sendingRemoteAck, setSendingRemoteAck] = useState(false);
  const [deviceOverview, setDeviceOverview] = useState(null);
const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  const [profile, setProfile] = useState(null);
  const [devicePermissions, setDevicePermissions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [globalAlerts, setGlobalAlerts] = useState([]);

  const [clientForm, setClientForm] = useState({
    temp_low_c: "",
    temp_high_c: "",
    hum_low: "",
    hum_high: "",
    hyst_c: "",
    hyst_hum: "",
    send_interval_s: "",
    offline_alert_after_min: "",
    display_standby_min: "",
  });

  const [adminForm, setAdminForm] = useState({
    name: "",
    location: "",
    hyst_c: "",
    hyst_hum: "",
    send_interval_s: "",
    offline_alert_after_min: "",
    display_standby_min: "",
  });

  const [clientMessage, setClientMessage] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [alertActionMessage, setAlertActionMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [activeDeviceSection, setActiveDeviceSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState("dark");

  const [isMobile, setIsMobile] = useState(false);

  const t = useCallback(
    (key) => I18N[language]?.[key] || I18N.en[key] || key,
    [language]
  );
  const profileLanguageStorageKey = profile?.id
    ? `${LANGUAGE_STORAGE_KEY}:${profile.id}`
    : null;
  const profileThemeStorageKey = profile?.id
    ? `${THEME_STORAGE_KEY}:${profile.id}`
    : null;

  const requestInFlightRef = useRef(false);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const skipNextProfileLanguageSaveRef = useRef(false);
  const skipNextProfileThemeSaveRef = useRef(false);

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

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === "en" || storedLanguage === "pt") {
      setLanguage(storedLanguage);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!profileLanguageStorageKey) return;
    const storedLanguage = window.localStorage.getItem(profileLanguageStorageKey);
    if (storedLanguage === "en" || storedLanguage === "pt") {
      skipNextProfileLanguageSaveRef.current = true;
      setLanguage(storedLanguage);
    }
  }, [profileLanguageStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!profileThemeStorageKey) return;
    const storedTheme = window.localStorage.getItem(profileThemeStorageKey);
    if (storedTheme === "dark" || storedTheme === "light") {
      skipNextProfileThemeSaveRef.current = true;
      setTheme(storedTheme);
    }
  }, [profileThemeStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    if (profileLanguageStorageKey) {
      if (skipNextProfileLanguageSaveRef.current) {
        skipNextProfileLanguageSaveRef.current = false;
      } else {
        window.localStorage.setItem(profileLanguageStorageKey, language);
      }
    }
  }, [language, profileLanguageStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.document.documentElement.dataset.stsTheme = theme;
    if (profileThemeStorageKey) {
      if (skipNextProfileThemeSaveRef.current) {
        skipNextProfileThemeSaveRef.current = false;
      } else {
        window.localStorage.setItem(profileThemeStorageKey, theme);
      }
    }
  }, [theme, profileThemeStorageKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(
    async ({ silent = false, syncForms = true } = {}) => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;
      requestInFlightRef.current = true;
      setPageError("");
      setLastRefreshError("");

      const switchingDevice =
        initialLoaded &&
        Boolean(selectedDeviceId) &&
        Boolean(device?.device_id) &&
        device.device_id !== selectedDeviceId;

      if (!silent && mountedRef.current) {
        if (!initialLoaded) {
          setLoading(true);
          setLoadState("initialLoading");
        } else {
          setRefreshing(true);
          setLoadState(switchingDevice ? "deviceSwitchLoading" : "backgroundRefreshing");
        }
      } else if (silent && mountedRef.current) {
        setLoadState(initialLoaded ? "backgroundRefreshing" : "initialLoading");
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

        const [deviceResponse, overviewData, historyRows, alertsRows, globalAlertRows] = await Promise.all([
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
                `/api/sts/device/${nextSelectedDeviceId}/alerts?hours=${ALERT_HISTORY_HOURS}`
              ).catch((error) => {
                console.warn("alerts:", error);
                return [];
              })
            : Promise.resolve([]),

          safeDevices.length
            ? supabase
                .from("alerts")
                .select("*")
                .in("device_id", safeDevices.map((item) => item.device_id))
                .limit(200)
                .then(({ data, error }) => {
                  if (error) {
                    console.warn("global alerts:", error);
                    return [];
                  }
                  return data || [];
                })
            : Promise.resolve([]),
        ]);

        if (deviceResponse?.error) {
          console.warn("device:", JSON.stringify(deviceResponse.error, null, 2));
          throw new Error("Não foi possível carregar o dispositivo selecionado.");
        }

        const baseDeviceData = deviceResponse?.data || null;

        let deviceData = baseDeviceData
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
              config: overviewData?.config || baseDeviceData?.config || {},
              hardware_diagnostics:
                overviewData?.hardware_diagnostics ||
                overviewData?.diagnostics?.hardware_diagnostics ||
                baseDeviceData?.config?.hardware_diagnostics ||
                null,
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
              firmware_version:
                overviewData?.firmware_version ||
                overviewData?.fw_version ||
                overviewData?.firmware ||
                overviewData?.config?.firmware_version ||
                overviewData?.config?.fw_version ||
                overviewData?.config?.firmware ||
                overviewData?.diagnostics?.firmware_version ||
                overviewData?.diagnostics?.fw_version ||
                overviewData?.diagnostics?.firmware ||
                baseDeviceData?.firmware_version ||
                baseDeviceData?.fw_version ||
                baseDeviceData?.firmware ||
                baseDeviceData?.config?.firmware_version ||
                baseDeviceData?.config?.fw_version ||
                baseDeviceData?.config?.firmware ||
                null,
              alerts_24h: overviewData?.alerts_24h ?? 0,
              total_readings_24h: overviewData?.total_readings_24h ?? 0,
              last_seen:
                overviewData?.last_seen ||
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
              telemetry_seq: parseNumber(item.telemetry_seq),
              sample_age_s: parseNumber(item.sample_age_s),
              sample_epoch: parseNumber(item.sample_epoch),
              delivery_attempts: parseNumber(item.delivery_attempts),
              offline_captured: parseBoolean(item.offline_captured) === true,
              timestamp: Number.isFinite(timestamp) ? timestamp : null,
            };
          })
          .filter((item) => Number.isFinite(item.timestamp));

        if (deviceData && readingsData.length) {
          const latestHistoryReading = [...readingsData].sort(
            (a, b) => b.timestamp - a.timestamp
          )[0];
          const deviceLastSeenTs = deviceData?.last_seen
            ? new Date(deviceData.last_seen).getTime()
            : 0;

          if (latestHistoryReading?.timestamp > deviceLastSeenTs) {
            deviceData = {
              ...deviceData,
              last_seen: latestHistoryReading.created_at,
              last_seen_seconds: Math.max(
                0,
                Math.floor((Date.now() - latestHistoryReading.timestamp) / 1000)
              ),
              last_temperature:
                latestHistoryReading.temperature ?? deviceData.last_temperature,
              last_humidity: latestHistoryReading.humidity ?? deviceData.last_humidity,
            };
          }
        }

        const derivedAlerts = deriveAlertEventsFromReadings(
          readingsData,
          deviceData?.config ?? {}
        );
        const currentAlerts = deriveCurrentAlertEvents(
          deviceData,
          deviceData?.config ?? {},
          [...normalizeAlertRows(alertsRows), ...derivedAlerts]
        );
        const alertsData = mergeAlertEvents(alertsRows, [
          ...derivedAlerts,
          ...currentAlerts,
        ]);

        if (!mountedRef.current || requestId !== requestSeqRef.current) return;

        if (nextSelectedDeviceId && nextSelectedDeviceId !== selectedDeviceId) {
          setSelectedDeviceId(nextSelectedDeviceId);
        }

        setProfile(profileData);
        setDevicePermissions(permissionsData);
        setDevices(
          safeDevices.map((item) =>
            item.device_id === nextSelectedDeviceId && deviceData
              ? { ...item, ...deviceData }
              : item
          )
        );
        setDevice(deviceData);
        setDeviceOverview(overviewData || null);
        setReadings(readingsData);
        setAlerts(alertsData);
        setGlobalAlerts(mergeAlertEvents(globalAlertRows, []));

        if (syncForms && deviceData) {
          const deviceConfig = deviceData?.config ?? {};

          setClientForm({
            temp_low_c: toInputValue(deviceConfig?.temp_low_c),
            temp_high_c: toInputValue(deviceConfig?.temp_high_c),
            hum_low: toInputValue(deviceConfig?.hum_low),
            hum_high: toInputValue(deviceConfig?.hum_high),
            hyst_c: toInputValue(deviceConfig?.hyst_c),
            hyst_hum: toInputValue(deviceConfig?.hyst_hum),
            send_interval_s: toInputValue((parseNumber(deviceConfig?.send_interval_s) ?? 60) / 60),
            offline_alert_after_min: toInputValue(deviceConfig?.offline_alert_after_min ?? 6),
            display_standby_min: toInputValue(deviceConfig?.display_standby_min),
          });

          setAdminForm({
            name: deviceData?.name || "",
            location: deviceData?.location || "",
            hyst_c: toInputValue(deviceConfig?.hyst_c),
            hyst_hum: toInputValue(deviceConfig?.hyst_hum),
            send_interval_s: toInputValue((parseNumber(deviceConfig?.send_interval_s) ?? 60) / 60),
            offline_alert_after_min: toInputValue(deviceConfig?.offline_alert_after_min ?? 6),
            display_standby_min: toInputValue(deviceConfig?.display_standby_min),
          });
        }

        setInitialLoaded(true);
        setLastRefreshError("");
        setLoadState("loaded");
      } catch (error) {
        console.warn("loadData:", error);
        if (mountedRef.current && requestId === requestSeqRef.current) {
          const message =
            error?.message || "Ocorreu um erro ao carregar os dados.";
          if (initialLoaded) {
            setLastRefreshError(message);
            setLoadState("error");
          } else {
            setPageError(message);
            setLoadState("error");
          }
        }
      } finally {
        if (requestId === requestSeqRef.current) {
          requestInFlightRef.current = false;
        }
        if (mountedRef.current && requestId === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedDeviceId, supabase, router, initialLoaded, device?.device_id]
  );

  useEffect(() => {
    loadData({ syncForms: true });

    const interval = setInterval(() => {
      loadData({ silent: true, syncForms: false });
    }, AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    setAlertsCollapsed(false);
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!DEVICE_NAV_SECTIONS.some((item) => item.key === activeDeviceSection)) {
      setActiveDeviceSection("overview");
    }
  }, [activeDeviceSection]);

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

  useEffect(() => {
    if (!initialLoaded || !profile?.id || !devices.length || selectedDeviceId) return;

    const channel = supabase
      .channel(`sts-global-alerts-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        () => {
          loadData({ silent: true, syncForms: false });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [devices.length, initialLoaded, loadData, profile?.id, selectedDeviceId, supabase]);

  const config = useMemo(() => device?.config ?? {}, [device?.config]);
  const hardwareDiagnostics =
    deviceOverview?.hardware_diagnostics ||
    deviceOverview?.diagnostics?.hardware_diagnostics ||
    config?.hardware_diagnostics ||
    null;
  const hardwareSummary = getHardwareSummary(hardwareDiagnostics);
  const maintenanceActive = isMaintenanceActive(config);

  const tempLow = parseNumber(config?.temp_low_c);
  const tempHigh = parseNumber(config?.temp_high_c);
  const humLow = parseNumber(config?.hum_low);
  const humHigh = parseNumber(config?.hum_high);
  const hystC = parseNumber(config?.hyst_c);
  const hystHum = parseNumber(config?.hyst_hum);
  const sendIntervalS = parseNumber(config?.send_interval_s);
  const displayStandbyMin = parseNumber(config?.display_standby_min);
  const canEditTechnicalConfig =
    isSuperAdmin ||
    (canEditSelectedDevice && Boolean(config?.client_can_edit_technical));

  const liveReadings = useMemo(
    () => mergeLiveDeviceReading(readings, device),
    [readings, device]
  );

  const chartReadings = useMemo(
    () => buildTimeSeries(liveReadings, period, sendIntervalS),
    [liveReadings, period, sendIntervalS]
  );

  const offlineAlertAfterMin = parseNumber(config?.offline_alert_after_min);
  const effectiveStatus = getEffectiveStatus(device, sendIntervalS, offlineAlertAfterMin);
  const statusInfo = getStatusInfo(effectiveStatus);
  const deviceSwitchLoading =
    loadState === "deviceSwitchLoading" ||
    (initialLoaded &&
      Boolean(selectedDeviceId) &&
      Boolean(device?.device_id) &&
      device.device_id !== selectedDeviceId);
  const backgroundRefreshing =
    loadState === "backgroundRefreshing" && !deviceSwitchLoading;
  const deviceDisplayName = device?.name || device?.device_id || selectedDeviceId || "Selecionar dispositivo";
  const locationParts = getLocationParts(device);
  const headerContext = {
    company: getDeviceCompany(device, profile),
    building: locationParts.building,
    room: locationParts.room,
    device: deviceDisplayName,
  };
  const headerBreadcrumbParts = [
    headerContext.company,
    headerContext.building,
    headerContext.room,
  ].filter((part, index, parts) => {
    const normalized = String(part || "").trim().toLocaleLowerCase("pt");
    return normalized && parts.findIndex(
      (candidate) => String(candidate || "").trim().toLocaleLowerCase("pt") === normalized
    ) === index;
  });
  const firmwareVersion =
    device?.firmware_version ||
    device?.fw_version ||
    device?.firmware ||
    deviceOverview?.firmware_version ||
    deviceOverview?.fw_version ||
    deviceOverview?.firmware ||
    deviceOverview?.config?.firmware_version ||
    deviceOverview?.config?.fw_version ||
    deviceOverview?.config?.firmware ||
    deviceOverview?.diagnostics?.firmware_version ||
    deviceOverview?.diagnostics?.fw_version ||
    deviceOverview?.diagnostics?.firmware ||
    device?.config?.firmware_version ||
    device?.config?.fw_version ||
    device?.config?.firmware ||
    null;
  const deviceLocation = device?.location || "Localização por definir";

const communicationHealth = useMemo(
  () =>
    getCommunicationHealth({
      rawReadings: liveReadings,
      sendIntervalS,
      offlineAlertAfterMin,
      deviceLastSeen: device?.last_seen,
      periodKey: diagnosticsPeriod,
    }),
  [liveReadings, sendIntervalS, offlineAlertAfterMin, device?.last_seen, diagnosticsPeriod]
);

  const recentAlerts = useMemo(() => {
    const cutoff = Date.now() - ALERT_RECENT_HOURS * 60 * 60 * 1000;
    return alerts.filter((item) => getAlertTimestamp(item) >= cutoff);
  }, [alerts]);

  const activeAlerts = useMemo(() => {
    if (maintenanceActive) return [];

    const alertState = config?.alert_state || {};
    const hasAuthoritativeAlertState =
      config?.alert_state &&
      ["temp_active", "hum_active", "offline_active"].some((key) =>
        Object.prototype.hasOwnProperty.call(config.alert_state, key)
      );
    const activeTypes = new Set();
    if (alertState.temp_active) activeTypes.add("temperature");
    if (alertState.hum_active) activeTypes.add("humidity");
    if (alertState.offline_active && effectiveStatus === "OFFLINE") {
      activeTypes.add("offline");
    }

    const sorted = [...alerts].sort(
      (a, b) => getAlertTimestamp(b) - getAlertTimestamp(a)
    );

    if (activeTypes.size > 0) {
      const latestActiveByType = new Map();
      for (const item of sorted) {
        const type = String(item?.type || "").toLowerCase();
        if (activeTypes.has(type) && !latestActiveByType.has(type)) {
          latestActiveByType.set(type, item);
        }
      }

      return [...latestActiveByType.values()].filter(
        (item) => String(item?.event || "").toLowerCase() !== "resolved"
      );
    }

    if (hasAuthoritativeAlertState) return [];

    const latestByType = new Map();
    for (const item of sorted) {
      const type = String(item?.type || "system").toLowerCase();
      if (!latestByType.has(type)) latestByType.set(type, item);
    }

    return [...latestByType.values()].filter((item) => {
      const level = String(item?.level || "").toLowerCase();
      const event = String(item?.event || "").toLowerCase();
      return (
        event !== "resolved" &&
        !level.includes("ack") &&
        (level.includes("alert") ||
          level.includes("alarm") ||
          level.includes("critical"))
      );
    });
  }, [alerts, config?.alert_state, effectiveStatus, maintenanceActive]);

  const ackAlerts = useMemo(
    () =>
      alerts.filter((item) =>
        String(item?.level || "").toLowerCase().includes("ack")
      ),
    [alerts]
  );

  const visibleAlerts = alertsCollapsed ? alerts : recentAlerts;
  const hasOlderAlerts = alerts.length > recentAlerts.length;

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
        : device?.predictive_status || getPredictiveStatus(liveReadings, config),
    [config, device?.predictive_status, isDeviceOffline, liveReadings]
  );

  const effectiveLastDelayMs =
    communicationHealth?.last_delay_ms !== null &&
    communicationHealth?.last_delay_ms !== undefined
      ? communicationHealth.last_delay_ms
      : device?.last_seen
      ? Date.now() - new Date(device.last_seen).getTime()
      : null;
  const lastCommunicationTone =
    effectiveLastDelayMs === null
      ? "neutral"
      : effectiveLastDelayMs > communicationHealth.offline_threshold_ms
      ? "bad"
      : effectiveLastDelayMs > communicationHealth.offline_threshold_ms * 0.7
      ? "warn"
      : "neutral";

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

  const dashboardNotifications = useMemo(() => {
    const supplemental = [];

    for (const item of devices) {
      if (getDeviceEffectiveStatus(item) === "OFFLINE") {
        const configuredThreshold = getOfflineLimitMs(
          item?.config?.send_interval_s,
          item?.config?.offline_alert_after_min
        );
        const offlineSince = item?.last_seen
          ? new Date(new Date(item.last_seen).getTime() + configuredThreshold).toISOString()
          : item?.updated_at || new Date(0).toISOString();
        supplemental.push({
          id: `offline-${item.device_id}-${offlineSince}`,
          device_id: item.device_id,
          type: "communication",
          level: "alarm",
          title: "Falha de comunicação",
          message: "O dispositivo ultrapassou o limite configurado sem comunicar.",
          created_at: offlineSince,
        });
      }
    }

    if (device?.device_id && ["medium", "high", "critical"].includes(String(predictiveStatus?.level))) {
      supplemental.push({
        id: `prediction-${device.device_id}-${predictiveStatus.level}`,
        device_id: device.device_id,
        type: "prediction",
        level: predictiveStatus.level === "medium" ? "alert" : "alarm",
        title: predictiveStatus.title || "Aviso de predição",
        message: predictiveStatus.detail || predictiveStatus.cause || "Tendência que requer acompanhamento.",
        created_at: device.last_seen || device.updated_at,
      });
    }

    if (device?.device_id && hardwareSummary?.tone === "bad") {
      supplemental.push({
        id: `hardware-${device.device_id}-${hardwareSummary.label}`,
        device_id: device.device_id,
        type: "hardware",
        level: "alarm",
        title: "Falha de hardware",
        message: hardwareSummary.label,
        created_at: device.updated_at || device.last_seen,
      });
    }

    return [...globalAlerts, ...supplemental];
  }, [device, devices, globalAlerts, hardwareSummary?.label, hardwareSummary?.tone, predictiveStatus]);

  const currentTempTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : String(effectiveStatus || "").toLowerCase().match(/alarm|critical/) &&
        ((tempHigh !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) > tempHigh) ||
          (tempLow !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) < tempLow))
      ? "bad"
      : tempHigh !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) > tempHigh
      ? "warn"
      : tempLow !== null && parseNumber(device?.last_temperature) !== null && parseNumber(device?.last_temperature) < tempLow
      ? "warn"
      : "good";

  const currentHumTone =
    effectiveStatus === "OFFLINE"
      ? "neutral"
      : String(effectiveStatus || "").toLowerCase().match(/alarm|critical/) &&
        ((humHigh !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) > humHigh) ||
          (humLow !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) < humLow))
      ? "bad"
      : humHigh !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) > humHigh
      ? "warn"
      : humLow !== null && parseNumber(device?.last_humidity) !== null && parseNumber(device?.last_humidity) < humLow
      ? "warn"
      : "good";

  const currentTempValue = formatValue(device?.last_temperature, " °C");
  const currentHumValue = formatValue(device?.last_humidity, " %");
  const outdoorTemperature =
    parseNumber(device?.last_external_temperature) ??
    parseNumber(device?.external_temperature) ??
    parseNumber(device?.outdoor_temperature) ??
    parseNumber(device?.temperature_external);
  const outdoorHumidity =
    parseNumber(device?.last_external_humidity) ??
    parseNumber(device?.external_humidity) ??
    parseNumber(device?.outdoor_humidity) ??
    parseNumber(device?.humidity_external);
  const currentTemperatureNumber = parseNumber(device?.last_temperature);
  const deltaTemperature =
    currentTemperatureNumber !== null && outdoorTemperature !== null
      ? Number((currentTemperatureNumber - outdoorTemperature).toFixed(1))
      : null;
  const currentTempAccentLabel = isDeviceOffline ? "Offline" : "Tempo real";
  const currentHumAccentLabel = isDeviceOffline ? "Offline" : "Tempo real";

  const latestReadings = useMemo(
    () =>
      [...liveReadings]
        .filter((item) => Number.isFinite(item?.timestamp))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 8),
    [liveReadings]
  );

  const summary24h = useMemo(() => {
    const { start, end } = getPeriodWindow("24h");

    const scoped = liveReadings
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
  }, [liveReadings]);

  async function saveClientConfig() {
    if (!device || !selectedDeviceId || !canEditSelectedDevice) return;

    setSavingClient(true);
    setClientMessage("");

    const newTempLow = parseNumber(clientForm.temp_low_c);
    const newTempHigh = parseNumber(clientForm.temp_high_c);
    const newHumLow = parseNumber(clientForm.hum_low);
    const newHumHigh = parseNumber(clientForm.hum_high);
    const newHyst = canEditTechnicalConfig ? parseNumber(clientForm.hyst_c) : null;
    const newHystHum = canEditTechnicalConfig
      ? parseNumber(clientForm.hyst_hum)
      : null;
    const newSendInterval = canEditTechnicalConfig
      ? parseNumber(clientForm.send_interval_s)
      : null;
    const newOfflineAlertAfter = canEditTechnicalConfig
      ? parseNumber(clientForm.offline_alert_after_min)
      : null;
    const newDisplayStandby = canEditTechnicalConfig
      ? parseNumber(clientForm.display_standby_min)
      : null;

    if (
      newTempLow === null ||
      newTempHigh === null ||
      newHumLow === null ||
      newHumHigh === null ||
      (canEditTechnicalConfig &&
        (newHyst === null ||
          newHystHum === null ||
          newSendInterval === null ||
          newDisplayStandby === null))
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

    if (canEditTechnicalConfig && (newHyst < 0 || newHystHum < 0)) {
      setClientMessage("A histerese nao pode ser negativa.");
      setSavingClient(false);
      return;
    }

    if (canEditTechnicalConfig && (newSendInterval < 1 || newSendInterval > 15)) {
      setClientMessage("O intervalo de envio deve estar entre 1 e 15 minutos.");
      setSavingClient(false);
      return;
    }

    if (canEditTechnicalConfig && (newOfflineAlertAfter === null || newOfflineAlertAfter < 1)) {
      setClientMessage("A falha de comunicacao deve ser pelo menos 1 minuto.");
      setSavingClient(false);
      return;
    }

    if (canEditTechnicalConfig && newDisplayStandby < 0) {
      setClientMessage("O standby do display nao pode ser negativo.");
      setSavingClient(false);
      return;
    }

    let data;
    const payload = {
      temp_low_c: newTempLow,
      temp_high_c: newTempHigh,
      hum_low: newHumLow,
      hum_high: newHumHigh,
    };

    if (canEditTechnicalConfig) {
      Object.assign(payload, {
        hyst_c: newHyst,
        hyst_hum: newHystHum,
        send_interval_s: newSendInterval * 60,
        offline_alert_after_min: newOfflineAlertAfter,
        display_standby_min: newDisplayStandby,
      });
    }

    try {
      data = await fetchJsonOrThrow(`/api/sts/device/${selectedDeviceId}/config`, {
        method: "POST",
        body: JSON.stringify(payload),
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
      hyst_c: toInputValue(refreshedConfig?.hyst_c),
      hyst_hum: toInputValue(refreshedConfig?.hyst_hum),
      send_interval_s: toInputValue((parseNumber(refreshedConfig?.send_interval_s) ?? 60) / 60),
      offline_alert_after_min: toInputValue(refreshedConfig?.offline_alert_after_min ?? 6),
      display_standby_min: toInputValue(refreshedConfig?.display_standby_min),
    });

    setClientMessage("Configurações do cliente guardadas com sucesso.");
    setSavingClient(false);
  }

  async function sendRemoteAck() {
    if (!selectedDeviceId || !canEditSelectedDevice || sendingRemoteAck || !activeAlerts.length) return;

    const confirmed = window.confirm(
      "Enviar um ACK remoto para o alarme ativo deste dispositivo?"
    );
    if (!confirmed) return;

    setSendingRemoteAck(true);
    setAlertActionMessage("");

    try {
      const data = await fetchJsonOrThrow(`/api/sts/device/${selectedDeviceId}/config`, {
        method: "POST",
        body: JSON.stringify({ action: "remote_ack" }),
      });

      setAlertActionMessage(data?.message || "Pedido de ACK remoto enviado.");
      await loadData({ silent: true, syncForms: false });
    } catch (error) {
      setAlertActionMessage(error?.message || "Erro ao enviar o ACK remoto.");
    } finally {
      setSendingRemoteAck(false);
    }
  }

  async function clearActiveAlerts() {
    if (!selectedDeviceId || !canEditSelectedDevice || clearingAlerts) return;

    const confirmed = window.confirm(
      "Regularizar alertas ativos deste dispositivo? O historico nao sera apagado."
    );
    if (!confirmed) return;

    setClearingAlerts(true);
    setAlertActionMessage("");

    try {
      const data = await fetchJsonOrThrow(`/api/sts/device/${selectedDeviceId}/alerts`, {
        method: "POST",
        body: JSON.stringify({
          note: "Regularizacao manual: estado atual verificado como operacional.",
        }),
      });

      setAlertActionMessage(data?.message || "Alertas regularizados com sucesso.");
      await loadData({ silent: true, syncForms: true });
    } catch (error) {
      setAlertActionMessage(error?.message || "Erro ao regularizar alertas.");
    } finally {
      setClearingAlerts(false);
    }
  }

  async function saveAdminConfig() {
    if (!device || !selectedDeviceId || !isSuperAdmin) return;

    setSavingAdmin(true);
    setAdminMessage("");

    const newHyst = parseNumber(adminForm.hyst_c);
    const newHystHum = parseNumber(adminForm.hyst_hum);
    const newSendInterval = parseNumber(adminForm.send_interval_s);
    const newOfflineAlertAfter = parseNumber(adminForm.offline_alert_after_min);
    const newDisplayStandby = parseNumber(adminForm.display_standby_min);

    if (
      newHyst === null ||
      newHystHum === null ||
      newSendInterval === null ||
      newOfflineAlertAfter === null ||
      newDisplayStandby === null
    ) {
      setAdminMessage("Preenche todos os campos admin com valores válidos.");
      setSavingAdmin(false);
      return;
    }

    if (newHyst < 0 || newHystHum < 0) {
      setAdminMessage("A histerese nao pode ser negativa.");
      setSavingAdmin(false);
      return;
    }

    if (newSendInterval < 1 || newSendInterval > 15) {
      setAdminMessage("O intervalo de envio deve estar entre 1 e 15 minutos.");
      setSavingAdmin(false);
      return;
    }

    if (newOfflineAlertAfter < 1) {
      setAdminMessage("A falha de comunicacao deve ser pelo menos 1 minuto.");
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
          hyst_hum: newHystHum,
          send_interval_s: newSendInterval * 60,
          offline_alert_after_min: newOfflineAlertAfter,
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
      hyst_hum: toInputValue(refreshedConfig?.hyst_hum),
      send_interval_s: toInputValue((parseNumber(refreshedConfig?.send_interval_s) ?? 60) / 60),
      offline_alert_after_min: toInputValue(refreshedConfig?.offline_alert_after_min ?? 6),
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
  const isSelectionMode = !selectedDeviceId && hasDevices;
  const hasReadings = readings.length > 0;
  const selectDevice = useCallback((deviceId) => {
    if (!deviceId || deviceId === selectedDeviceId) {
      return;
    }

    setLoadState("deviceSwitchLoading");
    setRefreshing(true);
    setSelectedDeviceId(deviceId);
    setActiveDeviceSection("overview");
    setClientMessage("");
    setAdminMessage("");
    setAlertActionMessage("");
    setPageError("");
  }, [selectedDeviceId]);
  const themeOverrides =
    theme === "light"
      ? {
          page: styles.pageLight,
          topBar: styles.topBarLight,
          entryTopBar: styles.entryTopBarLight,
        }
      : {
          page: null,
          topBar: null,
          entryTopBar: null,
        };

  if (loading && !initialLoaded) {
    return <BootScreen />;
  }

  return (
    <main style={{ ...styles.page, ...(themeOverrides.page || {}) }}>
      <div style={styles.container}>
        {isSelectionMode ? (
          <div
            style={{
              ...styles.topBar,
              ...(themeOverrides.topBar || {}),
              ...styles.entryTopBar,
              ...(themeOverrides.entryTopBar || {}),
              ...(isMobile ? styles.topBarMobile : {}),
            }}
          >
            <div style={styles.topLogoMark}>
              <Image
                src={STS_LOGO_SRC}
                alt="STS"
                width={104}
                height={46}
                priority
                style={styles.topLogoImage}
              />
            </div>

            <div style={styles.entryHeaderMain}>
              <div style={styles.deviceHeaderKicker}>{STS_PRODUCT.product}</div>
              <h1 style={styles.entryHeaderTitle}>{t("chooseTitle")}</h1>
            </div>

            <div style={{ ...styles.topActions, ...(isMobile ? styles.topActionsMobile : {}) }}>
              <NotificationCenter alerts={dashboardNotifications} devices={devices} isMobile={isMobile} storageKey={`sts_notifications:${profile?.id || "user"}`} />
              {isSuperAdmin ? (
                <button
                  onClick={() => router.push("/admin")}
                  style={{
                    ...styles.refreshButton,
                    ...(isMobile ? styles.refreshButtonMobile : {}),
                  }}
                >
                  <Wrench size={15} />
                  Admin
                </button>
              ) : null}

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                }}
                style={{
                  ...styles.refreshButton,
                  ...(isMobile ? styles.refreshButtonMobile : {}),
                }}
              >
                <X size={16} />
                {t("logout")}
              </button>
            </div>
          </div>
        ) : (
        <div
          style={{
            ...styles.topBar,
            ...(themeOverrides.topBar || {}),
            ...(isMobile ? styles.topBarMobile : {}),
          }}
        >
          <div style={styles.topLogoMark}>
            <Image
              src={STS_LOGO_SRC}
              alt="STS"
              width={104}
              height={46}
              priority
              style={styles.topLogoImage}
            />
          </div>

          <div style={{ ...styles.deviceHeaderMain, ...(isMobile ? styles.deviceHeaderMainMobile : {}) }}>
            <div>
              <div style={styles.deviceHeaderKicker}>{STS_PRODUCT.product}</div>
              <div style={styles.headerBreadcrumb}>
                {headerBreadcrumbParts.map((part, index) => (
                  <span key={`${part}-${index}`} style={styles.headerBreadcrumbItem}>
                    {index ? <span style={styles.headerBreadcrumbDivider}>&gt;</span> : null}
                    <span>{part}</span>
                  </span>
                ))}
              </div>
              <h1 style={styles.title}>{deviceDisplayName}</h1>
              <div style={styles.deviceHeaderMeta}>
                <span>{formatDateTime(device?.last_seen)}</span>
                <span>•</span>
                <span>{formatRelativeTime(device?.last_seen)}</span>
                {deviceSwitchLoading || backgroundRefreshing ? (
                  <>
                    <span>...</span>
                    <span style={styles.subtleLoadingText}>{t("updating")}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div style={styles.headerStatusGroup}>
              <div
                style={{
                  ...styles.statusPillLarge,
                  color: statusInfo.color,
                  background: statusInfo.soft,
                  borderColor: statusInfo.border,
                }}
              >
                {deviceSwitchLoading ? t("updating") : statusInfo.label}
              </div>
              <div
                title={communicationHealth.summary}
                style={{
                  ...styles.statusPillLarge,
                  ...styles.communicationStatusPill,
                }}
              >
                <Wifi size={15} />
                <span>{communicationHealth.label}</span>
              </div>
            </div>
          </div>

          <div style={{ ...styles.topActions, ...(isMobile ? styles.topActionsMobile : {}) }}>
            <NotificationCenter alerts={dashboardNotifications} devices={devices} isMobile={isMobile} storageKey={`sts_notifications:${profile?.id || "user"}`} />
            {isSuperAdmin ? (
              <button
                onClick={() => router.push("/admin")}
                style={{
                  ...styles.refreshButton,
                  ...(isMobile ? styles.refreshButtonMobile : {}),
                }}
              >
                <Wrench size={15} />
                Admin
              </button>
            ) : null}

            <button
              onClick={() => {
                setSelectedDeviceId(null);
                setDevice(null);
                setDeviceOverview(null);
                setReadings([]);
                setAlerts([]);
                setActiveDeviceSection("overview");
                setLoadState("loaded");
              }}
              style={{
                ...styles.refreshButton,
                ...(isMobile ? styles.refreshButtonMobile : {}),
              }}
            >
              <Home size={16} />
              Voltar
            </button>
          </div>
        </div>
        )}
        {pageError ? <div style={styles.errorBanner}>{pageError}</div> : null}
        {lastRefreshError && initialLoaded ? (
          <div style={styles.softWarningBanner}>
            Atualizacao em segundo plano falhou. Mantidos os ultimos dados validos.
          </div>
        ) : null}
        {!selectedDeviceId && hasDevices ? (
          <DeviceEntryPicker
            devices={devices}
            profile={profile}
            t={t}
            onSelectDevice={(deviceId) => {
              selectDevice(deviceId);
            }}
          />
        ) : null}

        {selectedDeviceId ? (
        <div
          style={{
            ...styles.appLayout,
            gridTemplateColumns: isMobile
              ? "1fr"
              : "82px minmax(0, 1fr)",
          }}
        >
          {deviceSwitchLoading ? (
            <div style={styles.deviceSwitchOverlay} role="status" aria-live="polite">
              <div style={styles.deviceSwitchCard}>
                <span style={styles.deviceSwitchSpinner} aria-hidden="true" />
                <div>
                  <strong style={styles.deviceSwitchTitle}>A sincronizar dispositivo</strong>
                  <span style={styles.deviceSwitchHint}>A carregar os dados mais recentes...</span>
                </div>
              </div>
            </div>
          ) : null}
          <DeviceSidebar
            activeSection={activeDeviceSection}
            onSectionChange={setActiveDeviceSection}
            t={t}
            isMobile={isMobile}
            collapsed={!sidebarOpen}
            onHoverStart={() => {
              if (!isMobile) setSidebarOpen(true);
            }}
            onHoverEnd={() => {
              if (!isMobile) setSidebarOpen(false);
            }}
          />

          <div
            key={activeDeviceSection}
            style={{
              ...styles.deviceWorkspace,
              ...styles.sectionTransition,
            }}
          >
        <section
          style={{
            ...styles.operationStrip,
            display: "none",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "1.2fr repeat(3, minmax(0, 1fr))",
          }}
        >
          <div style={{ ...styles.operationTile, ...styles.operationTilePrimary }}>
            <span style={styles.operationLabel}>Estado do sistema</span>
            <strong style={{ ...styles.operationValue, color: statusInfo.color }}>
              {statusInfo.label}
            </strong>
            <span style={styles.operationHint}>{deviceDisplayName}</span>
          </div>

          <div style={styles.operationTile}>
            <span style={styles.operationLabel}>Temperatura</span>
            <strong style={styles.operationValue}>
              {isDeviceOffline ? "-" : currentTempValue}
            </strong>
            <span style={styles.operationHint}>{currentTempAccentLabel}</span>
          </div>

          <div style={styles.operationTile}>
            <span style={styles.operationLabel}>Humidade</span>
            <strong style={styles.operationValue}>
              {isDeviceOffline ? "-" : currentHumValue}
            </strong>
            <span style={styles.operationHint}>{currentHumAccentLabel}</span>
          </div>

          <div style={styles.operationTile}>
            <span style={styles.operationLabel}>Leituras 24h</span>
            <strong style={styles.operationValue}>{summary24h.totalReadings ?? 0}</strong>
            <span style={styles.operationHint}>{communicationHealth.label}</span>
          </div>
        </section>

        <section
          style={{
            ...styles.commandGrid,
            display: activeDeviceSection === "overview" ? "grid" : "none",
            gridTemplateColumns: "1fr",
          }}
        >
          <section
            id="overview-executive"
            style={{
              ...styles.executiveOverview,
              borderColor: statusInfo.border,
            }}
          >
            <div style={styles.executiveHeader}>
              <div>
                <div style={styles.sectionEyebrow}>{t("overview")}</div>
                <div style={styles.executiveTitle}>{t("executiveStatus")}</div>
              </div>
              <div
                style={{
                  ...styles.statusPillLarge,
                  color: statusInfo.color,
                  background: statusInfo.soft,
                  borderColor: statusInfo.border,
                }}
              >
                {statusInfo.label}
              </div>
            </div>

            <div
              style={{
                ...styles.executiveGrid,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(4, minmax(0, 1fr))",
              }}
            >
              <ExecutiveStatCard
                label={t("generalStatus")}
                value={statusInfo.label}
                hint={
                  activeAlerts.length
                    ? `${activeAlerts.length} ${
                        activeAlerts.length === 1
                          ? t("activeAlertSingular")
                          : t("activeAlertPlural")
                      }`
                    : t("noActiveAlerts")
                }
                icon={Gauge}
                tone={effectiveStatus === "OFFLINE" ? "neutral" : activeAlerts.length ? "bad" : "good"}
                emphasis
              />
              <ExecutiveStatCard
                label={t("indoorTemperature")}
                value={isDeviceOffline ? "-" : currentTempValue}
                hint={
                  tempLow !== null && tempHigh !== null
                    ? `${t("limits")}: ${formatValue(tempLow, " °C")} - ${formatValue(tempHigh, " °C")}`
                    : currentTempAccentLabel
                }
                icon={Thermometer}
                tone={currentTempTone}
                emphasis
              />
              <ExecutiveStatCard
                label={t("indoorHumidity")}
                value={isDeviceOffline ? "-" : currentHumValue}
                hint={
                  humLow !== null && humHigh !== null
                    ? `${t("limits")}: ${formatValue(humLow, " %", 0)} - ${formatValue(humHigh, " %", 0)}`
                    : currentHumAccentLabel
                }
                icon={Droplets}
                tone={currentHumTone}
                emphasis
              />
              <ExecutiveStatCard
                label={t("activeAlerts")}
                value={activeAlerts.length}
                hint={ackAlerts.length ? `${ackAlerts.length} ${t("ackRegistered")}` : t("noAckPending")}
                icon={Bell}
                tone={activeAlerts.length ? "bad" : "good"}
              />
              <ExecutiveStatCard
                label="Wi-Fi"
                value={communicationHealth.label}
                hint={communicationHealth.summary}
                icon={Wifi}
                tone={communicationHealth.tone}
              />
              <ExecutiveStatCard
                label={t("outdoorTemperature")}
                value={formatValue(outdoorTemperature, " °C")}
                hint={t("externalReference")}
                icon={Snowflake}
              />
              <ExecutiveStatCard
                label={t("outdoorHumidity")}
                value={formatValue(outdoorHumidity, " %", 0)}
                hint={t("externalReference")}
                icon={Droplets}
              />
              <ExecutiveStatCard
                label={t("temperatureDelta")}
                value={formatValue(deltaTemperature, " °C")}
                hint={t("interiorMinusExterior")}
                icon={Gauge}
              />
              <ExecutiveStatCard
                label={t("summary24h")}
                value={t("readingsCount").replace("{count}", summary24h.totalReadings ?? 0)}
                hint={`${formatValue(summary24h.tempAvg, " °C")} ${t("avgTemp")} | ${formatValue(summary24h.humAvg, " %", 0)} ${t("avgHum")}`}
                icon={Timer}
              />
              <ExecutiveStatCard
                label={t("lastCommunication")}
                value={formatRelativeTime(device?.last_seen)}
                hint={formatDateTime(device?.last_seen)}
                icon={Radio}
                tone={lastCommunicationTone}
              />
            </div>
          </section>

          <section
            id="overview"
          style={{
            ...styles.heroCard,
            display: "none",
            background: `linear-gradient(135deg, ${statusInfo.panel} 0%, rgba(15,23,42,0.92) 100%)`,
            borderColor: statusInfo.border,
            gridTemplateColumns: "1fr",
          }}
        >
          <div style={styles.heroLeft}>
            <div style={styles.heroHeaderTop}>
              <div>
                <div style={styles.sectionEyebrow}>{t("overview")}</div>
                <div style={styles.deviceName}>{t("currentCondition")}</div>
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
                label={isDeviceOffline ? t("lastTemperature") : t("currentTemperature")}
                value={isDeviceOffline ? "-" : currentTempValue}
                tone={currentTempTone}
                accentLabel={isDeviceOffline ? t("offline") : t("realtime")}
                icon={Thermometer}
                subvalue={
                  tempLow !== null && tempHigh !== null
                    ? `${t("limits")}: ${formatValue(tempLow, " °C")} - ${formatValue(tempHigh, " °C")}`
                    : t("noLimits")
                }
              />
              <MetricBox
                label={isDeviceOffline ? t("lastHumidity") : t("currentHumidity")}
                value={isDeviceOffline ? "-" : currentHumValue}
                tone={currentHumTone}
                accentLabel={isDeviceOffline ? t("offline") : t("realtime")}
                icon={Droplets}
                subvalue={
                  humLow !== null && humHigh !== null
                    ? `${t("limits")}: ${formatValue(humLow, " %", 0)} - ${formatValue(humHigh, " %", 0)}`
                    : t("noLimits")
                }
              />
            </div>
          </div>

            <div style={styles.overviewSummaryPanel}>
            <div style={styles.sideTitle}>{t("summary24h")}</div>

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

          <UnifiedPredictionCard
            prediction={predictiveStatus}
            isOffline={effectiveStatus === "OFFLINE"}
            theme={theme}
          />

        </section>

        <section
          id="readings"
          style={{
            ...styles.card,
            display: activeDeviceSection === "readings" ? "block" : "none",
          }}
        >
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{t("readingsTitle")}</div>
              <div style={styles.cardHint}>{t("readingsHint")}</div>
            </div>
          </div>

          <div
            style={{
              ...styles.readingKpiGrid,
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(4, minmax(0, 1fr))",
            }}
          >
            <ExecutiveStatCard
              label={t("indoorTemperature")}
              value={isDeviceOffline ? "-" : currentTempValue}
              hint={`${t("minMax")}: ${formatValue(summary24h.tempMin, " °C")} / ${formatValue(summary24h.tempMax, " °C")}`}
              icon={Thermometer}
              tone={currentTempTone}
            />
            <ExecutiveStatCard
              label={t("indoorHumidity")}
              value={isDeviceOffline ? "-" : currentHumValue}
              hint={`${t("minMax")}: ${formatValue(summary24h.humMin, " %", 0)} / ${formatValue(summary24h.humMax, " %", 0)}`}
              icon={Droplets}
              tone={currentHumTone}
            />
            <ExecutiveStatCard
              label={t("summary24h")}
              value={summary24h.totalReadings ?? 0}
              hint={t("validatedReadings")}
              icon={ListChecks}
            />
            <ExecutiveStatCard
              label={t("communication")}
              value={communicationHealth.label}
              hint={communicationHealth.summary}
              icon={Radio}
              tone={communicationHealth.tone}
            />
          </div>

          <div style={styles.readingList}>
            {latestReadings.length ? (
              latestReadings.map((item, index) => (
                <div
                  key={`${item.created_at || item.timestamp}-${index}`}
                  style={{
                    ...styles.readingRow,
                    gridTemplateColumns: isMobile
                      ? "1fr 1fr"
                      : styles.readingRow.gridTemplateColumns,
                  }}
                >
                  <span style={styles.readingTime}>
                    {formatDateTime(item.created_at || item.timestamp)}
                  </span>
                  <span style={styles.readingValue}>
                    {formatValue(item.temperature, " °C")}
                  </span>
                  <span style={styles.readingValue}>
                    {formatValue(item.humidity, " %", 0)}
                  </span>
                  <span style={styles.readingMeta}>
                    {item.is_offline || item.offline ? "Offline buffer" : "Live"}
                  </span>
                </div>
              ))
            ) : (
              <div style={styles.emptyState}>No readings available.</div>
            )}
          </div>
        </section>

        <section
          id="maintenance"
          style={{
            ...styles.card,
            order: 20,
            display: activeDeviceSection === "diagnostics" ? "block" : "none",
          }}
        >
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{t("diagnosticsTitle")}</div>
              <div style={styles.cardHint}>
                {t("diagnosticsHint")}
              </div>
            </div>
          </div>

          <div style={styles.diagnosticsPeriodBlock}>
            <div style={styles.label}>{t("chartsPeriod")}</div>
            <div style={styles.periodRow}>
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setDiagnosticsPeriod(item.key)}
                  style={{
                    ...styles.periodButton,
                    ...(diagnosticsPeriod === item.key ? styles.periodButtonActive : {}),
                  }}
                >
                  {item.label}
                </button>
              ))}
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

          <div
            style={{
              ...styles.diagnosticsDetailGrid,
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(3, minmax(0, 1fr))",
            }}
          >
            <InfoItem
              label="Hardware"
              value={hardwareSummary.label}
              valueColor={hardwareSummary.color}
              icon={Cpu}
            />
            <InfoItem
              label="Modo manutenção"
              value={maintenanceActive ? "Ativo" : "Inativo"}
              valueColor={maintenanceActive ? "#f59e0b" : "#94a3b8"}
              icon={Settings}
            />
            <InfoItem
              label="Sensor"
              value={deviceOverview?.sensor_status || device?.sensor_status || "OK / sem detalhe"}
              icon={HeartPulse}
            />
            <InfoItem
              label="Wi-Fi"
              value={communicationHealth.label}
              valueColor={communicationHealth.tone === "bad" ? "#ef4444" : communicationHealth.tone === "warn" ? "#f59e0b" : "#22c55e"}
              icon={Wifi}
            />
            <InfoItem
              label="Firmware"
              value={
                <FirmwareVersionBadge
                  value={firmwareVersion}
                />
              }
              icon={Cpu}
            />
            <InfoItem
              label="Memoria"
              value={
                device?.free_heap ||
                deviceOverview?.diagnostics?.free_heap ||
                device?.memory_free ||
                "-"
              }
              icon={Cpu}
            />
            <InfoItem
              label="Uptime"
              value={
                parseNumber(device?.uptime_s || deviceOverview?.uptime_s)
                  ? formatDurationCompact(parseNumber(device?.uptime_s || deviceOverview?.uptime_s) * 1000)
                  : "-"
              }
              icon={Timer}
            />
            <InfoItem
              label="Reinicios"
              value={device?.boot_count ?? deviceOverview?.boot_count ?? "-"}
              icon={Power}
            />
            <InfoItem
              label="Latencia"
              value={
                device?.latency_ms || deviceOverview?.latency_ms
                  ? `${device?.latency_ms || deviceOverview?.latency_ms} ms`
                  : "-"
              }
              icon={Radio}
            />
            <InfoItem
              label="Pacotes perdidos"
              value={Math.max(
                0,
                (communicationHealth.expected_readings || 0) -
                  (communicationHealth.received_readings || 0)
              )}
              icon={ListChecks}
            />
            <InfoItem
              label="Alimentacao"
              value={device?.power_state || deviceOverview?.power_state || "-"}
              icon={Power}
            />
          </div>
        </section>

        <section
          id="reports"
          style={{
            ...styles.card,
            order: 22,
            display: activeDeviceSection === "settings" ? "block" : "none",
          }}
        >
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{t("reportTitle")}</div>
              <div style={styles.cardHint}>
                {t("reportHint")}
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
              <label style={styles.label}>{t("reportPeriod")}</label>
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
                {t("downloadPdf")}
              </button>
            </div>
          </div>
        </section>

        <section
          style={{
            ...styles.chartGrid,
            display: activeDeviceSection === "charts" ? "grid" : "none",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          }}
        >
          <DataChart
            title={t("temperature")}
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
            title={t("humidity")}
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
        <section
          style={{
            ...styles.card,
            display: activeDeviceSection === "charts" ? "block" : "none",
          }}
        >
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{t("chartsPeriod")}</div>
              <div style={styles.cardHint}>
                {t("chartsPeriodHint")}
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
  id="alerts"
  style={{
    ...styles.card,
    order: 21,
    display: activeDeviceSection === "alerts" ? "block" : "none",
  }}
>
  <div style={styles.cardHeader}>
    <div>
      <div style={styles.cardTitle}>{t("alertHistory")}</div>
      <div style={styles.cardHint}>
        {alertsCollapsed
          ? `Histórico completo disponível (${alerts.length})`
          : t("recentAlertsFirst").replace("{hours}", ALERT_RECENT_HOURS)}
      </div>
    </div>

    <div style={styles.alertHeaderActions}>
      {canEditSelectedDevice ? (
        <button
          type="button"
          onClick={sendRemoteAck}
          disabled={sendingRemoteAck || !activeAlerts.length || isDeviceOffline}
          title={
            isDeviceOffline
              ? "O dispositivo precisa de estar online para receber o ACK."
              : !activeAlerts.length
              ? "Não existem alertas ativos."
              : "Enviar confirmação do alarme ao dispositivo."
          }
          style={{
            ...styles.collapseButton,
            ...(sendingRemoteAck || !activeAlerts.length || isDeviceOffline
              ? styles.disabledButton
              : {}),
          }}
        >
          <CheckCircle2 size={15} />
          {sendingRemoteAck ? t("sendingRemoteAck") : t("remoteAck")}
        </button>
      ) : null}

      {canEditSelectedDevice && alerts.length ? (
        <button
          type="button"
          onClick={clearActiveAlerts}
          disabled={clearingAlerts}
          style={{
            ...styles.collapseButton,
            ...(clearingAlerts ? styles.disabledButton : {}),
          }}
        >
          {clearingAlerts ? "A regularizar..." : "Regularizar alertas"}
        </button>
      ) : null}

      {hasOlderAlerts ? (
        <button
          type="button"
          onClick={() => setAlertsCollapsed((prev) => !prev)}
          style={styles.collapseButton}
        >
          {alertsCollapsed ? t("minimize") : t("showAll")}
        </button>
      ) : null}
    </div>
  </div>

  {alertActionMessage ? (
    <div
      style={
        alertActionMessage.toLowerCase().includes("erro")
          ? styles.errorTextInline
          : styles.successText
      }
    >
      {alertActionMessage}
    </div>
  ) : null}

  <div
    style={{
      ...styles.alertOverviewGrid,
      gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
    }}
  >
    <ExecutiveStatCard
      label={t("activeAlerts")}
      value={activeAlerts.length}
      hint={activeAlerts.length ? t("requiresOperationalAttention") : t("noActiveAlerts")}
      icon={Bell}
      tone={activeAlerts.length ? "bad" : "good"}
    />
    <ExecutiveStatCard
      label={t("alertHistory")}
      value={alerts.length}
      hint={t("recentAlertsFirst").replace("{hours}", ALERT_RECENT_HOURS)}
      icon={ListChecks}
    />
    <ExecutiveStatCard
      label="ACK"
      value={ackAlerts.length}
      hint={t("ackExplanation")}
      icon={CheckCircle2}
      tone={ackAlerts.length ? "good" : "neutral"}
    />
    <ExecutiveStatCard
      label={t("alarmTime")}
      value={
        activeAlerts[0]
          ? formatDurationCompact(Date.now() - getAlertTimestamp(activeAlerts[0]))
          : "-"
      }
      hint={activeAlerts[0] ? t("sinceMostRecentActiveAlert") : t("noActiveAlarm")}
      icon={Clock}
      tone={activeAlerts.length ? "warn" : "good"}
    />
  </div>

  {!alerts.length ? (
    <div style={styles.emptyState}>
      {t("noAlerts")}
    </div>
  ) : !visibleAlerts.length ? (
    <div style={styles.emptyState}>
      Sem alertas nas últimas {ALERT_RECENT_HOURS}h.
    </div>
  ) : (
    <div style={styles.alertList}>
      {visibleAlerts.map((item, index) => (
        <AlertRow
          key={item.id || `${item.sent_at || item.created_at}-${index}`}
          item={item}
        />
      ))}

      {!alertsCollapsed && hasOlderAlerts ? (
        <div style={styles.alertListHint}>
          Existem mais {alerts.length - recentAlerts.length} alertas no histórico.
        </div>
      ) : null}
    </div>
  )}
</section>

        <section
          id="settings"
          style={{
            ...styles.card,
            order: 23,
            display: activeDeviceSection === "settings" ? "block" : "none",
          }}
        >
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{t("settingsTitle")}</div>
              <div style={styles.cardHint}>
                {t("settingsHint")}
              </div>
            </div>

            <div style={styles.readOnlyBadge}>
              {canEditSelectedDevice ? t("editable") : t("readOnly")}
            </div>
          </div>

          <div style={styles.settingsSection}>
            <div>
              <div style={styles.settingsSectionTitle}>{t("technicalGeneral")}</div>
              <div style={styles.cardHint}>{t("interfaceHint")}</div>
            </div>
            <div
              style={{
                ...styles.formGrid,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <div style={styles.field}>
                <label style={styles.label}>{t("language")}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={styles.configInput}
                >
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>{t("theme")}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  style={styles.configInput}
                >
                  <option value="dark">{t("darkTheme")}</option>
                  <option value="light">{t("lightTheme")}</option>
                </select>
              </div>
            </div>
          </div>

          <div style={styles.settingsSection}>
            <div>
              <div style={styles.settingsSectionTitle}>{t("technicalSensors")}</div>
              <div style={styles.cardHint}>{t("settingsHint")}</div>
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
                <label style={styles.label}>{t("tempMin")}</label>
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
                <label style={styles.label}>{t("tempMax")}</label>
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
                <label style={styles.label}>{t("humMin")}</label>
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
                <label style={styles.label}>{t("humMax")}</label>
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
          </div>

          {canEditTechnicalConfig ? (
          <>
          <div style={styles.settingsSection}>
            <div>
              <div style={styles.settingsSectionTitle}>{t("technicalAlerts")}</div>
              <div style={styles.cardHint}>{t("stabilityHint")}</div>
            </div>
            <div
              style={{
                ...styles.formGrid,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div style={styles.field}>
                <label style={styles.label}>{t("tempHysteresis")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={clientForm.hyst_c}
                  onChange={(e) =>
                    setClientForm((prev) => ({
                      ...prev,
                      hyst_c: e.target.value,
                    }))
                  }
                  style={styles.configInput}
                  disabled={!canEditSelectedDevice}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>{t("humHysteresis")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={clientForm.hyst_hum}
                  onChange={(e) =>
                    setClientForm((prev) => ({
                      ...prev,
                      hyst_hum: e.target.value,
                    }))
                  }
                  style={styles.configInput}
                  disabled={!canEditSelectedDevice}
                />
              </div>
            </div>
          </div>

          <div style={styles.settingsSection}>
            <div>
              <div style={styles.settingsSectionTitle}>{t("technicalCommunicationDisplay")}</div>
              <div style={styles.cardHint}>{t("deviceCadenceHint")}</div>
            </div>
            <div
              style={{
                ...styles.formGrid,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div style={styles.field}>
                <label style={styles.label}>{t("sendInterval")}</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="15"
                  value={clientForm.send_interval_s}
                  onChange={(e) =>
                    setClientForm((prev) => ({
                      ...prev,
                      send_interval_s: e.target.value,
                    }))
                  }
                  style={styles.configInput}
                  disabled={!canEditSelectedDevice}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Falha comunicação (min)</label>
                <input
                  type="number"
                  step="1"
                  value={clientForm.offline_alert_after_min}
                  onChange={(e) =>
                    setClientForm((prev) => ({
                      ...prev,
                      offline_alert_after_min: e.target.value,
                    }))
                  }
                  style={styles.configInput}
                  disabled={!canEditSelectedDevice}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>{t("displayStandby")}</label>
                <input
                  type="number"
                  step="1"
                  value={clientForm.display_standby_min}
                  onChange={(e) =>
                    setClientForm((prev) => ({
                      ...prev,
                      display_standby_min: e.target.value,
                    }))
                  }
                  style={styles.configInput}
                  disabled={!canEditSelectedDevice}
                />
              </div>
            </div>
          </div>
          </>
          ) : null}

          {canEditSelectedDevice ? (
            <div style={styles.actionsRow}>
              <button
                style={styles.primaryButton}
                onClick={saveClientConfig}
                disabled={savingClient || !selectedDeviceId}
              >
                {savingClient ? t("saving") : t("saveSettings")}
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

        {activeDeviceSection === "information" ? (
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>{t("information")}</div>
                <div style={styles.cardHint}>{t("informationHint")}</div>
              </div>
            </div>
            <div
              style={{
                ...styles.heroMetaRow,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <InfoItem label={t("model")} value={STS_PRODUCT.product} icon={Thermometer} />
              <InfoItem label={t("deviceId")} value={selectedDeviceId || "-"} icon={Info} />
              <InfoItem label={t("location")} value={deviceLocation} icon={MapPin} />
              <InfoItem
                label="Firmware"
                value={
                  <FirmwareVersionBadge
                    value={firmwareVersion}
                  />
                }
                icon={Wrench}
              />
              <InfoItem label={t("configVersion")} value={device?.config_version ?? "-"} icon={Settings} />
              <InfoItem label={t("lastUpdate")} value={formatDateTime(device?.updated_at || device?.last_seen)} icon={Clock} />
            </div>
          </section>
        ) : null}

        {!loading && initialLoaded && hasDevices && !hasReadings ? (
          <div style={styles.emptyState}>
            Ainda não existem leituras históricas disponíveis para os últimos 7 dias.
          </div>
        ) : null}
          </div>
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
    background:
      "conic-gradient(from -18deg, #ef4444 0deg, #fb923c 54deg, rgba(249,115,22,0.22) 118deg, transparent 158deg, transparent 202deg, rgba(37,99,235,0.16) 224deg, #2563eb 278deg, #38bdf8 336deg, #ef4444 360deg)",
    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
    mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
    boxShadow: "0 0 32px rgba(14,165,233,0.10), 0 0 30px rgba(239,68,68,0.08)",
    animation: "spin 1.15s linear infinite",
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
    "--sts-surface": "rgba(15, 23, 42, 0.74)",
    "--sts-surface-soft": "rgba(8, 13, 23, 0.50)",
    "--sts-surface-strong": "rgba(9, 15, 26, 0.98)",
    "--sts-border": "rgba(148, 163, 184, 0.15)",
    "--sts-border-strong": "rgba(148, 163, 184, 0.28)",
    "--sts-text": "#f8fafc",
    "--sts-muted": "#64748b",
    "--sts-muted-strong": "#94a3b8",
    "--sts-input-bg": "rgba(8, 13, 23, 0.62)",
    "--sts-shadow": "0 18px 42px rgba(0, 0, 0, 0.22)",
    "--sts-menu-bg": "rgba(9, 15, 26, 0.98)",
    "--sts-sidebar-bg": "linear-gradient(180deg, rgba(10, 18, 30, 0.96), rgba(7, 12, 20, 0.94))",
    background:
      "radial-gradient(circle at 18% 0%, rgba(20, 184, 166, 0.14) 0%, transparent 34%), linear-gradient(180deg, #071018 0%, #0a111b 44%, #070b12 100%)",
    padding: "20px 16px 44px",
    color: "#e5edf7",
    overflowX: "hidden",
    scrollBehavior: "smooth",
  },

  pageLight: {
    "--sts-surface": "rgba(255, 255, 255, 0.82)",
    "--sts-surface-soft": "rgba(248, 250, 252, 0.86)",
    "--sts-surface-strong": "rgba(255, 255, 255, 0.96)",
    "--sts-border": "rgba(15, 23, 42, 0.12)",
    "--sts-border-strong": "rgba(15, 23, 42, 0.18)",
    "--sts-text": "#102033",
    "--sts-muted": "#64748b",
    "--sts-muted-strong": "#475569",
    "--sts-input-bg": "rgba(255, 255, 255, 0.95)",
    "--sts-shadow": "0 18px 42px rgba(15, 23, 42, 0.10)",
    "--sts-menu-bg": "rgba(255, 255, 255, 0.96)",
    "--sts-sidebar-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(241, 245, 249, 0.90))",
    background:
      "radial-gradient(circle at 18% 0%, rgba(20, 184, 166, 0.16) 0%, transparent 32%), linear-gradient(180deg, #eef7f6 0%, #f7fafc 46%, #e8eef5 100%)",
    color: "#102033",
  },

  container: {
    width: "100%",
    maxWidth: "1480px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
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
    color: "var(--sts-text)",
    background: "#0f172a",
    border: "1px solid #1f2b3d",
    borderRadius: "14px",
    padding: "11px 12px",
    fontSize: "13px",
    fontWeight: 800,
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  topBar: {
    position: "relative",
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    flexWrap: "wrap",
    padding: "14px 18px",
    background: "rgba(11, 18, 32, 0.86)",
    border: "1px solid var(--sts-border)",
    borderRadius: "20px",
    boxShadow: "0 18px 46px rgba(0, 0, 0, 0.28)",
    backdropFilter: "blur(16px)",
    isolation: "isolate",
  },

  topBarLight: {
    background: "var(--sts-surface-strong)",
    border: "1px solid var(--sts-border)",
    boxShadow: "var(--sts-shadow)",
  },

  topBarMobile: {
    alignItems: "stretch",
    gap: "12px",
    padding: "12px",
    borderRadius: "16px",
  },

  topLogoMark: {
    width: "112px",
    height: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRight: "1px solid rgba(148, 163, 184, 0.14)",
    paddingRight: "14px",
    flexShrink: 0,
  },

  topLogoImage: {
    width: "96px",
    height: "42px",
    objectFit: "contain",
  },

  entryTopBar: {
    padding: "12px 16px",
    borderRadius: "18px",
    background: "rgba(8, 13, 23, 0.72)",
    boxShadow: "0 18px 42px rgba(0, 0, 0, 0.22)",
  },

  entryTopBarLight: {
    background: "var(--sts-surface-strong)",
    boxShadow: "var(--sts-shadow)",
  },

  entryHeaderMain: {
    minWidth: 0,
    flex: "1 1 auto",
  },

  entryHeaderTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "20px",
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: 0,
  },

  brandLockup: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    minWidth: 0,
    flex: "1 1 420px",
  },

  headerLogo: {
    width: "124px",
    height: "54px",
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
    fontSize: "clamp(20px, 2.4vw, 26px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 0,
    color: "var(--sts-text)",
    overflowWrap: "anywhere",
  },

  deviceHeaderMain: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minWidth: 0,
    flex: "1 1 420px",
    justifyContent: "space-between",
  },

  deviceHeaderMainMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: "10px",
    flexBasis: "100%",
  },

  headerStatusGroup: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
    flexShrink: 0,
  },

  deviceHeaderKicker: {
    color: "#5eead4",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "6px",
  },

  headerBreadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    flexWrap: "wrap",
    color: "var(--sts-muted-strong)",
    fontSize: "12px",
    fontWeight: 800,
    marginBottom: "7px",
  },

  headerBreadcrumbDivider: {
    color: "var(--sts-muted)",
    fontSize: "11px",
    fontWeight: 900,
  },

  headerBreadcrumbItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
  },

  deviceHeaderMeta: {
    marginTop: "8px",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 700,
  },

  subtleLoadingText: {
    color: "#5eead4",
    fontWeight: 900,
  },

  subtitle: {
    margin: "5px 0 0 0",
    color: "rgba(226, 232, 240, 0.78)",
    fontSize: "14px",
    lineHeight: 1.35,
  },

  tagline: {
    marginTop: "6px",
    color: "#99f6e4",
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

  topActionsMobile: {
    width: "100%",
    justifyContent: "stretch",
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
    color: "#99f6e4",
    fontWeight: 700,
  },

  quickActionButton: {
    width: "38px",
    height: "38px",
    border: "1px solid var(--sts-border)",
    background: "var(--sts-surface-soft)",
    color: "var(--sts-text)",
    borderRadius: "12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 180ms ease, border-color 180ms ease, transform 180ms ease",
  },

  refreshButton: {
    border: "1px solid rgba(255, 255, 255, 0.20)",
    background: "rgba(255, 255, 255, 0.10)",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "9px 13px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "13px",
    minHeight: "38px",
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
  },

  refreshButtonMobile: {
    flex: "1 1 0",
    justifyContent: "center",
    minWidth: "0",
    width: "100%",
    padding: "10px 9px",
  },

  notificationWrap: {
    position: "relative",
    zIndex: 9300,
  },

  notificationButton: {
    position: "relative",
    minHeight: "38px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    padding: "9px 12px",
    border: "1px solid rgba(255, 255, 255, 0.20)",
    borderRadius: "10px",
    background: "rgba(255, 255, 255, 0.10)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 850,
  },

  notificationButtonMobile: {
    width: "100%",
  },

  notificationCount: {
    minWidth: "20px",
    height: "20px",
    padding: "0 5px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: "#ef4444",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 950,
  },

  notificationPanel: {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    width: "min(430px, calc(100vw - 32px))",
    maxHeight: "min(620px, calc(100vh - 110px))",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid var(--sts-border)",
    borderRadius: "17px",
    background: "var(--sts-menu-bg)",
    boxShadow: "0 28px 75px rgba(0, 0, 0, 0.48)",
    backdropFilter: "blur(20px)",
  },

  notificationPanelMobile: {
    position: "fixed",
    top: "84px",
    left: "12px",
    right: "12px",
    width: "auto",
    maxHeight: "calc(100vh - 105px)",
  },

  notificationHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "16px",
    borderBottom: "1px solid var(--sts-border)",
  },

  notificationTitle: {
    display: "block",
    color: "var(--sts-text)",
    fontSize: "14px",
    fontWeight: 950,
  },

  notificationSubtitle: {
    display: "block",
    marginTop: "3px",
    color: "var(--sts-muted-strong)",
    fontSize: "11px",
    fontWeight: 700,
  },

  notificationHeaderCount: {
    minWidth: "30px",
    height: "30px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    background: "rgba(239, 68, 68, 0.14)",
    color: "#f87171",
    fontSize: "12px",
    fontWeight: 950,
  },

  notificationHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  notificationClearButton: {
    minHeight: "30px",
    padding: "0 10px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "9px",
    background: "rgba(148, 163, 184, 0.10)",
    color: "var(--sts-text)",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 900,
  },

  notificationList: {
    overflowY: "auto",
    padding: "8px",
  },

  notificationItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "11px",
    padding: "12px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
  },

  notificationDot: {
    width: "9px",
    height: "9px",
    marginTop: "5px",
    borderRadius: "999px",
    flexShrink: 0,
    boxShadow: "0 0 10px currentColor",
  },

  notificationItemBody: {
    minWidth: 0,
    flex: 1,
    display: "grid",
    gap: "4px",
  },

  notificationItemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "var(--sts-text)",
    fontSize: "12px",
    fontWeight: 900,
  },

  notificationLocation: {
    color: "var(--sts-muted-strong)",
    fontSize: "11px",
    fontWeight: 750,
  },

  notificationMessage: {
    color: "var(--sts-text)",
    fontSize: "12px",
    fontWeight: 750,
  },

  notificationTime: {
    color: "var(--sts-muted)",
    fontSize: "10px",
    fontWeight: 700,
  },

  notificationEmpty: {
    padding: "28px 16px",
    color: "var(--sts-muted-strong)",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 800,
  },

  clientMenuWrap: {
    position: "relative",
    zIndex: 9100,
  },

  clientMenuWrapMobile: {
    flex: "1 1 0",
    minWidth: 0,
  },

  clientMenuBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9050,
    border: 0,
    background: "transparent",
    padding: 0,
    margin: 0,
    minHeight: 0,
    width: "100vw",
    height: "100vh",
    cursor: "default",
  },

  clientMenu: {
    position: "fixed",
    top: "72px",
    right: "24px",
    width: "min(440px, calc(100vw - 32px))",
    maxHeight: "70vh",
    overflowY: "auto",
    zIndex: 9200,
    background: "var(--sts-menu-bg)",
    border: "1px solid var(--sts-border)",
    borderRadius: "16px",
    padding: "12px",
    boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
    backdropFilter: "blur(18px)",
  },

  clientMenuMobile: {
    top: "88px",
    left: "12px",
    right: "12px",
    width: "auto",
    maxHeight: "calc(100vh - 116px)",
    borderRadius: "14px",
    padding: "10px",
  },

  clientMenuCompany: {
    display: "grid",
    gap: "10px",
  },

  clientMenuCompanyTitle: {
    color: "var(--sts-text)",
    fontSize: "13px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  clientMenuBuilding: {
    borderTop: "1px solid rgba(148, 163, 184, 0.10)",
    paddingTop: "10px",
  },

  clientMenuBuildingTitle: {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "8px",
  },

  clientMenuRoom: {
    display: "grid",
    gap: "8px",
    marginBottom: "10px",
  },

  clientMenuRoomTitle: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "var(--sts-muted-strong)",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  clientMenuEmoji: {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9px",
    background: "rgba(148, 163, 184, 0.10)",
    fontSize: "15px",
    lineHeight: 1,
    flexShrink: 0,
  },

  clientMenuDevices: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(156px, 1fr))",
    gap: "8px",
  },

  clientMenuDeviceButton: {
    border: "1px solid var(--sts-border)",
    background: "var(--sts-surface-soft)",
    color: "var(--sts-text)",
    borderRadius: "11px",
    padding: "9px 10px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 850,
    textAlign: "left",
    minWidth: 0,
  },

  clientMenuDeviceButtonActive: {
    background: "rgba(20, 184, 166, 0.14)",
    border: "1px solid rgba(94, 234, 212, 0.24)",
    color: "#f8fafc",
  },

  clientMenuDeviceName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  appLayout: {
    position: "relative",
    display: "grid",
    gap: "16px",
    alignItems: "start",
    width: "100%",
    minWidth: 0,
  },

  deviceSwitchOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 100,
    minHeight: "260px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "72px",
    borderRadius: "22px",
    background: "rgba(6, 12, 22, 0.64)",
    backdropFilter: "blur(5px)",
    animation: "stsPanelIn 180ms ease both",
  },

  deviceSwitchCard: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "15px 19px",
    border: "1px solid rgba(94, 234, 212, 0.28)",
    borderRadius: "15px",
    background: "rgba(15, 23, 42, 0.94)",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.34)",
  },

  deviceSwitchSpinner: {
    width: "24px",
    height: "24px",
    flexShrink: 0,
    borderRadius: "999px",
    border: "3px solid rgba(94, 234, 212, 0.20)",
    borderTopColor: "#5eead4",
    animation: "spin 0.8s linear infinite",
  },

  deviceSwitchTitle: {
    display: "block",
    color: "var(--sts-text)",
    fontSize: "14px",
    fontWeight: 900,
  },

  deviceSwitchHint: {
    display: "block",
    marginTop: "3px",
    color: "var(--sts-muted-strong)",
    fontSize: "12px",
    fontWeight: 700,
  },

  deviceWorkspace: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  sectionTransition: {
    animation: "stsPanelIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
  },

  appSidebar: {
    position: "sticky",
    top: "16px",
    width: "100%",
    alignSelf: "stretch",
    minHeight: "calc(100vh - 96px)",
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    overflowX: "hidden",
    background: "var(--sts-sidebar-bg)",
    border: "1px solid var(--sts-border)",
    borderRadius: "22px",
    padding: "14px",
    boxShadow: "0 26px 60px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(16px)",
    zIndex: 40,
    transition: "width 220ms cubic-bezier(0.22, 1, 0.36, 1), padding 180ms ease, border-radius 180ms ease, box-shadow 220ms ease, background 180ms ease",
  },

  appSidebarExpanded: {
    width: "276px",
    boxShadow: "0 30px 74px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255,255,255,0.05)",
  },

  appSidebarCollapsed: {
    padding: "14px",
    borderRadius: "22px",
    overflowX: "hidden",
    minHeight: "calc(100vh - 96px)",
  },

  appSidebarMobile: {
    position: "relative",
    top: 0,
    maxHeight: "none",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "8px",
    borderRadius: "15px",
  },

  sidebarBrandBlock: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingBottom: "14px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
    marginBottom: "14px",
  },

  sidebarToggle: {
    width: "34px",
    height: "34px",
    border: "1px solid var(--sts-border)",
    background: "rgba(148, 163, 184, 0.08)",
    color: "#e2e8f0",
    borderRadius: "10px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    flexShrink: 0,
  },

  sidebarLogo: {
    width: "78px",
    height: "36px",
    objectFit: "contain",
  },

  sidebarProductName: {
    color: "#f8fafc",
    fontSize: "14px",
    fontWeight: 900,
  },

  sidebarProductMeta: {
    marginTop: "3px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 800,
  },

  sidebarSectionTitle: {
    margin: "14px 0 8px",
    color: "#64748b",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  sidebarDisclosure: {
    width: "100%",
    border: "1px solid var(--sts-border)",
    background: "rgba(148, 163, 184, 0.06)",
    color: "var(--sts-text)",
    borderRadius: "12px",
    padding: "10px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: "10px",
  },

  sidebarLocationSummary: {
    gap: "7px",
    marginTop: "8px",
  },

  sidebarLocationButton: {
    width: "100%",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    background: "rgba(8, 13, 23, 0.46)",
    color: "#94a3b8",
    borderRadius: "10px",
    padding: "8px 9px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 800,
  },

  deviceTree: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  treeCompany: {
    border: "1px solid rgba(148, 163, 184, 0.12)",
    background: "rgba(15, 23, 42, 0.44)",
    borderRadius: "16px",
    padding: "10px",
  },

  treeCompanyHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#e2e8f0",
    fontSize: "13px",
    fontWeight: 900,
  },

  treeBuilding: {
    marginTop: "10px",
    paddingLeft: "8px",
  },

  treeBuildingHeader: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 800,
  },

  treeRoom: {
    marginTop: "8px",
    paddingLeft: "16px",
  },

  treeRoomHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 800,
  },

  treeDeviceList: {
    marginTop: "7px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  treeDeviceButton: {
    width: "100%",
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--sts-text)",
    borderRadius: "10px",
    padding: "8px 9px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 800,
  },

  treeDeviceButtonActive: {
    background: "rgba(20, 184, 166, 0.12)",
    border: "1px solid rgba(94, 234, 212, 0.22)",
    color: "#f8fafc",
  },

  treeDeviceDot: {
    width: "8px",
    height: "8px",
    borderRadius: "999px",
    flexShrink: 0,
  },

  treeDeviceName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  sidebarEmpty: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 800,
  },

  deviceNav: {
    marginTop: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  deviceNavGroupLabel: {
    height: "16px",
    margin: "8px 12px 2px",
    color: "var(--sts-muted)",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    opacity: 1,
    transform: "translateX(0)",
    transition: "opacity 140ms ease, transform 180ms ease",
  },

  deviceNavGroupLabelCollapsed: {
    opacity: 0,
    transform: "translateX(-4px)",
  },

  deviceNavMobile: {
    flexDirection: "row",
    gap: "8px",
    minWidth: "max-content",
  },

  deviceNavItem: {
    width: "100%",
    minHeight: "48px",
    border: "1px solid transparent",
    background: "transparent",
    color: "#94a3b8",
    borderRadius: "14px",
    padding: "11px 12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "13px",
    fontWeight: 850,
    transition: "background 180ms ease, border-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
  },

  deviceNavItemCollapsed: {
    justifyContent: "flex-start",
    padding: "11px 12px",
    gap: 0,
  },

  deviceNavIconSlot: {
    width: "28px",
    minWidth: "28px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  deviceNavText: {
    display: "block",
    maxWidth: "180px",
    opacity: 1,
    transform: "translateX(0)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    transition: "max-width 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 130ms ease 55ms, transform 180ms ease",
  },

  deviceNavTextCollapsed: {
    maxWidth: 0,
    opacity: 0,
    transform: "translateX(-5px)",
    transition: "max-width 180ms ease, opacity 80ms ease, transform 140ms ease",
  },

  deviceNavItemMobile: {
    width: "44px",
    height: "42px",
    flex: "0 0 44px",
    padding: 0,
    justifyContent: "center",
  },

  deviceNavItemActive: {
    background: "linear-gradient(135deg, rgba(20, 184, 166, 0.18), rgba(15, 23, 42, 0.48))",
    border: "1px solid rgba(94, 234, 212, 0.28)",
    color: "#f8fafc",
    boxShadow: "0 14px 32px rgba(20, 184, 166, 0.10)",
  },

  entryGate: {
    minHeight: "calc(100vh - 112px)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "14px 0 24px",
  },

  entryPanel: {
    width: "100%",
    maxWidth: "1180px",
    background: "var(--sts-surface)",
    border: "1px solid var(--sts-border)",
    borderRadius: "18px",
    padding: "22px",
    boxShadow: "0 28px 64px rgba(0, 0, 0, 0.26)",
    backdropFilter: "blur(18px)",
  },

  entryLogo: {
    width: "126px",
    height: "54px",
    objectFit: "contain",
    marginBottom: "18px",
  },

  entryKicker: {
    color: "#5eead4",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "10px",
  },

  entryTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "30px",
    lineHeight: 1.05,
    fontWeight: 950,
  },

  entryText: {
    margin: "12px 0 22px",
    color: "#94a3b8",
    maxWidth: "680px",
    fontSize: "14px",
    lineHeight: 1.55,
    fontWeight: 700,
  },

  entryTree: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
    gap: "16px",
    marginTop: "20px",
  },

  controlCenterIntro: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "24px",
    padding: "4px 4px 20px",
    borderBottom: "1px solid var(--sts-border)",
    flexWrap: "wrap",
  },

  controlCenterTitle: {
    margin: 0,
    color: "var(--sts-text)",
    fontSize: "clamp(22px, 3vw, 32px)",
    lineHeight: 1.1,
    fontWeight: 950,
  },

  controlCenterText: {
    margin: "8px 0 0",
    color: "var(--sts-muted-strong)",
    fontSize: "13px",
    fontWeight: 700,
  },

  controlCenterStats: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    color: "var(--sts-muted-strong)",
    fontSize: "11px",
    fontWeight: 800,
  },

  entryCompany: {
    border: "1px solid var(--sts-border)",
    background: "linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(8, 13, 23, 0.72))",
    borderRadius: "16px",
    padding: "16px",
    minHeight: "220px",
    display: "flex",
    flexDirection: "column",
  },

  entryCompanyTitle: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#f8fafc",
    fontSize: "13px",
    fontWeight: 900,
    marginBottom: "12px",
  },

  entryLocationIcon: {
    width: "36px",
    height: "36px",
    borderRadius: "11px",
    border: "1px solid rgba(94, 234, 212, 0.22)",
    background: "rgba(20, 184, 166, 0.12)",
    color: "#5eead4",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  entryLocationLabel: {
    display: "block",
    color: "#64748b",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "2px",
  },

  entryLocationName: {
    display: "block",
    color: "var(--sts-text)",
    fontSize: "15px",
    fontWeight: 900,
    overflowWrap: "anywhere",
  },

  entryBuilding: {
    borderTop: "1px solid rgba(148, 163, 184, 0.10)",
    paddingTop: "12px",
    marginTop: "12px",
  },

  entryBuildingTitle: {
    color: "var(--sts-text)",
    fontSize: "13px",
    fontWeight: 900,
    marginBottom: "10px",
  },

  entryRoom: {
    marginTop: "10px",
  },

  entryRoomTitle: {
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "8px",
  },

  entryDevices: {
    display: "grid",
    gridTemplateColumns: "1fr",
    alignContent: "start",
    justifyContent: "start",
    gap: "12px",
    flex: 1,
  },

  entryDeviceButton: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(8, 13, 23, 0.70)",
    color: "#e2e8f0",
    borderRadius: "13px",
    padding: "13px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    fontWeight: 850,
    textAlign: "left",
    justifyContent: "flex-start",
    minWidth: 0,
    minHeight: "82px",
    width: "100%",
    transition: "border-color 160ms ease, background 160ms ease, transform 160ms ease",
  },

  entryDeviceIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    border: "1px solid rgba(125, 211, 252, 0.22)",
    background: "rgba(14, 165, 233, 0.12)",
    color: "#7dd3fc",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "21px",
  },

  entryDeviceContent: {
    minWidth: 0,
    flex: 1,
    display: "grid",
    gap: "4px",
  },

  entryDeviceTopline: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    fontSize: "13px",
  },

  entryDeviceMetrics: {
    color: "var(--sts-muted-strong)",
    fontSize: "11px",
    fontWeight: 750,
  },

  entryDeviceId: {
    color: "var(--sts-muted)",
    fontSize: "10px",
    fontWeight: 700,
  },

  operationStrip: {
    display: "grid",
    gap: "12px",
  },

  operationTile: {
    minWidth: 0,
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid var(--sts-border)",
    borderRadius: "14px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    boxShadow: "0 18px 38px rgba(0, 0, 0, 0.20)",
  },

  operationTilePrimary: {
    background: "linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(15, 23, 42, 0.84))",
    borderColor: "rgba(94, 234, 212, 0.22)",
  },

  operationLabel: {
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
  },

  operationValue: {
    fontSize: "24px",
    lineHeight: 1,
    fontWeight: 950,
    color: "#f8fafc",
    overflowWrap: "anywhere",
  },

  operationHint: {
    fontSize: "12px",
    lineHeight: 1.35,
    color: "#64748b",
    fontWeight: 700,
    overflowWrap: "anywhere",
  },

  commandGrid: {
    display: "grid",
    gap: "18px",
    alignItems: "stretch",
  },

  executiveOverview: {
    background: "var(--sts-surface)",
    border: "1px solid var(--sts-border)",
    borderRadius: "20px",
    padding: "20px",
    minWidth: 0,
    boxShadow: "var(--sts-shadow)",
    backdropFilter: "blur(16px)",
  },

  executiveHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },

  executiveTitle: {
    color: "var(--sts-text)",
    fontSize: "clamp(20px, 2.1vw, 26px)",
    fontWeight: 950,
    lineHeight: 1,
    letterSpacing: 0,
  },

  executiveGrid: {
    display: "grid",
    gap: "14px",
  },

  executiveStatCard: {
    minWidth: 0,
    border: "1px solid var(--sts-border)",
    background: "var(--sts-surface-soft)",
    borderRadius: "16px",
    padding: "15px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: "136px",
    transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease",
  },

  executiveStatCardEmphasis: {
    minHeight: "154px",
    background: "linear-gradient(135deg, rgba(20,184,166,0.10), var(--sts-surface-soft))",
  },

  executiveStatTop: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    minWidth: 0,
  },

  executiveStatIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "11px",
    border: "1px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  executiveStatLabel: {
    color: "var(--sts-muted-strong)",
    fontSize: "12px",
    fontWeight: 850,
    overflowWrap: "anywhere",
  },

  executiveStatValue: {
    color: "var(--sts-text)",
    fontSize: "clamp(22px, 2.4vw, 31px)",
    lineHeight: 1,
    fontWeight: 950,
    overflowWrap: "anywhere",
  },

  executiveStatHint: {
    marginTop: "auto",
    color: "var(--sts-muted)",
    fontSize: "12px",
    lineHeight: 1.35,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },

  readingKpiGrid: {
    display: "grid",
    gap: "12px",
    marginBottom: "16px",
  },

  readingList: {
    display: "grid",
    gap: "8px",
  },

  readingRow: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1.4fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(110px, 0.7fr)",
    gap: "10px",
    alignItems: "center",
    border: "1px solid var(--sts-border)",
    background: "var(--sts-surface-soft)",
    borderRadius: "12px",
    padding: "11px 12px",
    minWidth: 0,
  },

  readingTime: {
    color: "var(--sts-muted-strong)",
    fontSize: "12px",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },

  readingValue: {
    color: "var(--sts-text)",
    fontSize: "14px",
    fontWeight: 900,
  },

  readingMeta: {
    color: "var(--sts-muted)",
    fontSize: "12px",
    fontWeight: 800,
  },

  commandSide: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  smartInsightCard: {
    background: "var(--sts-surface)",
    border: "1px solid var(--sts-border)",
    borderRadius: "16px",
    padding: "18px 20px",
    boxShadow: "var(--sts-shadow)",
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
    color: "#5eead4",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  smartInsightTag: {
    border: "1px solid rgba(94, 234, 212, 0.24)",
    background: "rgba(20, 184, 166, 0.14)",
    color: "#99f6e4",
    borderRadius: "999px",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
  },

  smartInsightLine: {
    height: "1px",
    width: "100%",
    background: "linear-gradient(90deg, rgba(13,148,136,0.52), rgba(245,158,11,0.20), rgba(148,163,184,0))",
    marginBottom: "12px",
  },

  smartInsightTitle: {
    fontSize: "18px",
    fontWeight: 900,
    color: "var(--sts-text)",
    letterSpacing: 0,
    marginBottom: "6px",
  },

  smartInsightDetail: {
    fontSize: "13px",
    color: "var(--sts-muted-strong)",
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
    background: "var(--sts-surface)",
    border: "1px solid var(--sts-border)",
    borderRadius: "16px",
    padding: "18px",
    overflow: "visible",
    minWidth: 0,
    boxShadow: "var(--sts-shadow)",
    backdropFilter: "blur(16px)",
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
    fontSize: "clamp(16px, 1.8vw, 18px)",
    fontWeight: 800,
    letterSpacing: 0,
    color: "var(--sts-text)",
  },

  cardHint: {
    marginTop: "4px",
    fontSize: "13px",
    color: "var(--sts-muted)",
  },

  errorBanner: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(248, 113, 113, 0.24)",
    color: "#fecaca",
    borderRadius: "12px",
    padding: "14px 16px",
    fontWeight: 700,
  },

  softWarningBanner: {
    background: "rgba(245, 158, 11, 0.10)",
    border: "1px solid rgba(245, 158, 11, 0.22)",
    color: "#facc15",
    borderRadius: "12px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 800,
  },

  emptyState: {
    background: "var(--sts-surface-soft)",
    border: "1px dashed var(--sts-border-strong)",
    borderRadius: "12px",
    padding: "18px",
    color: "var(--sts-muted)",
    textAlign: "center",
    fontWeight: 700,
  },

  emptyChartState: {
    height: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontWeight: 700,
    background: "rgba(15, 23, 42, 0.56)",
    border: "1px dashed rgba(148, 163, 184, 0.24)",
    borderRadius: "12px",
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
    border: "1px solid var(--sts-border-strong)",
    background: "var(--sts-surface-soft)",
    color: "var(--sts-muted-strong)",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 800,
  },

  selectorMainButton: {
    width: "100%",
    border: "1px solid rgba(15, 118, 110, 0.24)",
    background: "var(--sts-surface-strong)",
    color: "var(--sts-text)",
    borderRadius: "14px",
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
    color: "#64748b",
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
    overflowWrap: "anywhere",
  },

  selectorChevron: {
    fontSize: "14px",
    color: "#94a3b8",
    transition: "transform 0.18s ease",
  },

  selectorDropdown: {
    position: "absolute",
    top: "calc(100% + 10px)",
    left: 0,
    right: 0,
    zIndex: 50,
    background: "var(--sts-menu-bg)",
    border: "1px solid rgba(148, 163, 184, 0.32)",
    borderRadius: "14px",
    padding: "10px",
    boxShadow: "0 24px 54px rgba(0,0,0,0.32)",
    overflowY: "auto",
  },

  selectorOption: {
    width: "100%",
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border)",
    borderRadius: "12px",
    padding: "12px",
    color: "#e2e8f0",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    textAlign: "left",
    marginBottom: "8px",
  },

  selectorOptionActive: {
    border: "1px solid #0f766e",
    boxShadow: "0 0 0 3px rgba(15,118,110,0.12)",
    background: "rgba(20, 184, 166, 0.14)",
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
    color: "#102033",
    wordBreak: "break-word",
  },

  selectorOptionMeta: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#64748b",
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
    color: "#17202c",
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
    border: "1px solid rgba(94, 234, 212, 0.18)",
    borderRadius: "18px",
    padding: "22px",
    overflow: "hidden",
    boxShadow: "0 22px 54px rgba(0, 0, 0, 0.26)",
  },

  heroLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: 0,
  },

  heroRight: {
    borderLeft: "1px solid rgba(148, 163, 184, 0.16)",
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
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "8px",
  },

  deviceName: {
    fontSize: "28px",
    fontWeight: 900,
    letterSpacing: 0,
    color: "#f8fafc",
    wordBreak: "break-word",
  },

  deviceMetaLine: {
    marginTop: "10px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 600,
  },

  deviceMetaBadge: {
    background: "rgba(15, 23, 42, 0.70)",
    border: "1px solid var(--sts-border)",
    color: "var(--sts-text)",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 700,
  },

  deviceMetaDot: {
    color: "#94a3b8",
  },

  deviceMetaLocation: {
    color: "#475569",
    wordBreak: "break-word",
  },

  statusPillLarge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "9px 13px",
    borderRadius: "999px",
    border: "1px solid transparent",
    fontSize: "13px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  communicationStatusPill: {
    gap: "7px",
    color: "#99f6e4",
    background: "rgba(20, 184, 166, 0.10)",
    borderColor: "rgba(94, 234, 212, 0.22)",
  },

  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },

  metricCard: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border)",
    borderRadius: "14px",
    padding: "18px",
    minWidth: 0,
    boxShadow: "none",
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

  metricLabelWrap: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    minWidth: 0,
  },

  metricIcon: {
    width: "30px",
    height: "30px",
    borderRadius: "10px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(94, 234, 212, 0.10)",
    color: "#5eead4",
    flexShrink: 0,
  },

  metricLabel: {
    fontSize: "13px",
    color: "var(--sts-muted)",
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
    fontSize: "clamp(26px, 6vw, 34px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 0,
    color: "var(--sts-text)",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  metricSubvalue: {
    marginTop: "10px",
    color: "var(--sts-muted)",
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
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border)",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },

  infoLabel: {
    fontSize: "12px",
    color: "var(--sts-muted)",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
  },

  infoValue: {
    fontSize: "15px",
    fontWeight: 700,
    color: "var(--sts-text)",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  sideTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "var(--sts-text)",
  },

  overviewSummaryPanel: {
    marginTop: "2px",
    paddingTop: "14px",
    borderTop: "1px solid rgba(148, 163, 184, 0.16)",
    display: "grid",
    gap: "10px",
  },

  sideSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "8px",
  },

  summaryBlock: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border)",
    borderRadius: "10px",
    padding: "10px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    minWidth: 0,
    flexWrap: "wrap",
  },

  summaryLabel: {
    color: "var(--sts-muted)",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  summaryValue: {
    fontSize: "14px",
    fontWeight: 800,
    color: "var(--sts-text)",
    wordBreak: "break-word",
  },

  insightGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  },

  insightCard: {
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "14px",
    padding: "16px",
    background: "var(--sts-surface-soft)",
  },

  insightTitle: {
    fontSize: "15px",
    fontWeight: 800,
    marginBottom: "8px",
  },

  insightDetail: {
    fontSize: "13px",
    color: "var(--sts-muted-strong)",
    lineHeight: 1.5,
    fontWeight: 600,
  },

  predictionMainTitle: {
    fontSize: "32px",
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: 0,
    marginBottom: "10px",
  },

  predictionMainDetail: {
    fontSize: "16px",
    color: "var(--sts-text)",
    fontWeight: 700,
    marginBottom: "8px",
  },

  predictionAdviceGrid: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },

  predictionAdviceItem: {
    border: "1px solid var(--sts-border-strong)",
    background: "var(--sts-surface-soft)",
    borderRadius: "10px",
    padding: "10px 12px",
    color: "var(--sts-text)",
    fontSize: "13px",
    lineHeight: 1.45,
  },

  predictionAdviceLabel: {
    display: "block",
    marginBottom: "4px",
    color: "var(--sts-muted)",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  predictionOfflineNoteGlobal: {
    marginTop: "14px",
    fontSize: "12px",
    color: "var(--sts-muted)",
  },

  smartSurfaceCard: {
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "16px",
    padding: "22px 24px",
    boxShadow: "var(--sts-shadow)",
    overflow: "visible",
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
    fontSize: "18px",
    fontWeight: 900,
    color: "var(--sts-text)",
    letterSpacing: 0,
  },

  smartSurfaceEyebrowRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    marginBottom: "2px",
  },

  infoTooltipIcon: {
    width: "19px",
    height: "19px",
    borderRadius: "999px",
    border: "1px solid var(--sts-border-strong)",
    background: "rgba(148, 163, 184, 0.10)",
    color: "var(--sts-muted-strong)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "help",
    flexShrink: 0,
  },

  smartSignalLine: {
    height: "1px",
    width: "100%",
    background: "linear-gradient(90deg, rgba(13,148,136,0.48), rgba(245,158,11,0.18), rgba(148,163,184,0))",
    marginBottom: "16px",
  },

  healthSummaryBanner: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "12px",
    padding: "14px 16px",
    color: "var(--sts-muted-strong)",
    fontSize: "13px",
    fontWeight: 700,
    marginBottom: "14px",
  },

  diagnosticsPeriodBlock: {
    marginTop: "16px",
    marginBottom: "14px",
    display: "grid",
    gap: "10px",
  },

  healthGrid: {
    display: "grid",
    gap: "14px",
  },

  diagnosticsDetailGrid: {
    display: "grid",
    gap: "12px",
    marginTop: "14px",
  },

  healthCard: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "14px",
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
    color: "var(--sts-muted)",
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
    letterSpacing: 0,
    marginBottom: "8px",
  },

  healthHint: {
    fontSize: "12px",
    color: "var(--sts-muted)",
    lineHeight: 1.4,
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "18px",
    minWidth: 0,
  },

  chartCard: {
    background: "var(--sts-surface)",
    border: "1px solid var(--sts-border)",
    borderRadius: "16px",
    padding: "18px",
    overflow: "hidden",
    minWidth: 0,
    boxShadow: "var(--sts-shadow)",
  },

  chartHeader: {
    marginBottom: "10px",
  },

  chartTitle: {
    fontSize: "clamp(16px, 2vw, 18px)",
    fontWeight: 800,
    color: "var(--sts-text)",
  },

  chartSubtitle: {
    marginTop: "6px",
    fontSize: "13px",
    color: "var(--sts-muted)",
    overflowWrap: "anywhere",
  },

  chartHint: {
    marginTop: "6px",
    fontSize: "12px",
    color: "var(--sts-muted)",
  },

  chartOfflineHint: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#475569",
  },

  chartBackfillHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    marginTop: "8px",
    fontSize: "12px",
    color: "#fed7aa",
    fontWeight: 800,
  },

  chartBackfillDot: {
    width: "9px",
    height: "9px",
    borderRadius: "2px",
    background: "linear-gradient(135deg, #fb923c, #ef4444)",
    transform: "rotate(45deg)",
    boxShadow: "0 0 12px rgba(249,115,22,0.4)",
    flex: "0 0 auto",
  },

  chartWrap: {
    width: "100%",
    minWidth: 0,
    overflow: "visible",
    paddingTop: "4px",
  },

  periodRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  periodButton: {
    border: "1px solid var(--sts-border-strong)",
    background: "var(--sts-surface-soft)",
    color: "var(--sts-text)",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    minWidth: "64px",
    transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
  },

  periodButtonActive: {
    background: "#0f766e",
    color: "#ffffff",
    border: "1px solid #0f766e",
  },

  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  alertOverviewGrid: {
    display: "grid",
    gap: "12px",
    marginBottom: "16px",
  },

  alertHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },

  alertListHint: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    textAlign: "center",
    padding: "4px 0",
  },

collapseButton: {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  border: "1px solid var(--sts-border-strong)",
  background: "var(--sts-surface-soft)",
  color: "var(--sts-text)",
  borderRadius: "10px",
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: "12px",
},

  disabledButton: {
    opacity: 0.58,
    cursor: "not-allowed",
  },

  alertRow: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border)",
    borderRadius: "12px",
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
    color: "var(--sts-text)",
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
    color: "var(--sts-muted)",
    fontWeight: 700,
  },

  formGrid: {
    display: "grid",
    gap: "12px",
    alignItems: "end",
    width: "100%",
    minWidth: 0,
  },

  settingsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    alignItems: "stretch",
    padding: "16px",
    marginBottom: "16px",
    border: "1px solid var(--sts-border)",
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--sts-surface-soft) 92%, transparent), var(--sts-surface-soft))",
    borderRadius: "16px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },

  settingsSectionTitle: {
    color: "var(--sts-text)",
    fontSize: "15px",
    fontWeight: 900,
    marginBottom: "4px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: 0,
    width: "100%",
    border: "1px solid var(--sts-border)",
    background: "var(--sts-surface)",
    borderRadius: "14px",
    padding: "12px",
  },

  label: {
    fontSize: "11px",
    color: "var(--sts-muted)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    lineHeight: 1.2,
  },

  configInput: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    border: "1px solid var(--sts-border-strong)",
    background: "var(--sts-input-bg)",
    color: "var(--sts-text)",
    borderRadius: "12px",
    padding: "9px 12px",
    fontSize: "14px",
    outline: "none",
    height: "40px",
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
    border: "1px solid #0f766e",
    background: "#0f766e",
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
    boxShadow: "0 10px 22px rgba(15, 118, 110, 0.18)",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  readOnlyBadge: {
    border: "1px solid rgba(148, 163, 184, 0.34)",
    background: "rgba(148, 163, 184, 0.10)",
    color: "var(--sts-text)",
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
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "12px",
    padding: "16px",
    minWidth: 0,
  },

  smallStatLabel: {
    fontSize: "12px",
    color: "var(--sts-muted)",
    fontWeight: 700,
    marginBottom: "8px",
  },

  smallStatValue: {
    fontSize: "15px",
    fontWeight: 800,
    color: "var(--sts-text)",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  subsection: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "14px",
    padding: "18px",
    overflow: "hidden",
  },

  subsectionTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "var(--sts-text)",
    marginBottom: "16px",
  },

  tooltip: {
    background: "#0f172a",
    border: "1px solid rgba(148, 163, 184, 0.34)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "#f8fafc",
    boxShadow: "0 16px 32px rgba(15, 23, 42, 0.14)",
  },

  tooltipTitle: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "6px",
  },

  tooltipValue: {
    fontSize: "12px",
    color: "#f8fafc",
  },

  tooltipMeta: {
    marginTop: "6px",
    paddingTop: "6px",
    borderTop: "1px solid rgba(148,163,184,0.18)",
    fontSize: "11px",
    color: "#fb923c",
    fontWeight: 800,
  },

  rawConfigWrap: {
    background: "var(--sts-surface-soft)",
    border: "1px solid var(--sts-border-strong)",
    borderRadius: "14px",
    padding: "16px",
    overflow: "hidden",
  },

  rawConfigTitle: {
    color: "var(--sts-muted)",
    fontSize: "13px",
    fontWeight: 700,
    marginBottom: "10px",
  },

  rawConfig: {
    margin: 0,
    color: "var(--sts-text)",
    fontSize: "13px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
};
