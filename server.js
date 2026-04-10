const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const cors = require("cors");

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

const FRONTEND_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
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

function sanitizeDeviceName(value, fallback) {
  const v = String(value || "").trim();
  return v || fallback;
}

function sanitizeLocation(value) {
  const v = String(value || "").trim();
  return v || "Localização por definir";
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
    send_interval_s: toNumberOrDefault(cfg.send_interval_s, 30),
    display_standby_min: toNumberOrDefault(cfg.display_standby_min, 10),
    alert_state: {
      temp_active: Boolean(alertState.temp_active),
      hum_active: Boolean(alertState.hum_active),
      offline_active: Boolean(alertState.offline_active),
      temp_last_sent_at: alertState.temp_last_sent_at || null,
      hum_last_sent_at: alertState.hum_last_sent_at || null,
      offline_last_sent_at: alertState.offline_last_sent_at || null,
      temp_last_resolved_at: alertState.temp_last_resolved_at || null,
      hum_last_resolved_at: alertState.hum_last_resolved_at || null,
      offline_last_resolved_at: alertState.offline_last_resolved_at || null,
    },
  };
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

  if (tempCritical || humCritical) return "critical";

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

async function getDeviceAlertRecipients(deviceId) {
  const { data, error } = await supabase
    .from("device_alert_recipients")
    .select("email, name")
    .eq("device_id", deviceId)
    .eq("is_active", true);

  if (error) {
    console.error("Erro ao obter recipients do dispositivo:", error);
    return [];
  }

  const recipients = (data || [])
    .map((row) => ({
      email: String(row.email || "").trim(),
      name: String(row.name || "").trim() || undefined,
    }))
    .filter((row) => row.email);

  if (recipients.length > 0) return recipients;

  if (ALERT_TO_EMAIL) {
    return [{ email: ALERT_TO_EMAIL }];
  }

  return [];
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

async function sendEmail({ to, subject, htmlContent }) {
  if (!BREVO_API_KEY || !ALERT_FROM_EMAIL) {
    console.warn("Brevo/email não configurado. Email não enviado.");
    return;
  }

  const normalizedTo = (to || [])
    .map((row) => ({
      email: String(row.email || "").trim(),
      ...(row.name ? { name: row.name } : {}),
    }))
    .filter((row) => row.email);

  if (!normalizedTo.length) {
    console.warn("Sem destinatários para envio de email.");
    return;
  }

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: ALERT_FROM_EMAIL, name: "SmartTempSystems" },
      to: normalizedTo,
      subject,
      htmlContent,
    },
    {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    }
  );
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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
  const recipients = await getDeviceAlertRecipients(device.device_id);

  await sendEmail({
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

function canSendByCooldown(lastSentAt) {
  if (!lastSentAt) return true;
  const diffMs = Date.now() - new Date(lastSentAt).getTime();
  return diffMs >= COOLDOWN_MIN * 60 * 1000;
}

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

function statusToDbLabel(status) {
  const map = {
    normal: "NORMAL",
    alert: "ALERT",
    critical: "ALARM",
    offline: "OFFLINE",
  };
  return map[status] || "NORMAL";
}

function statusToApiLabel(status) {
  const map = {
    normal: "normal",
    alert: "alert",
    critical: "alarm",
    offline: "offline",
  };
  return map[status] || "normal";
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

  if (
    tempInfo.breached &&
    !alertState.temp_active &&
    canSendByCooldown(alertState.temp_last_sent_at)
  ) {
    await sendTemperatureTriggeredEmail({
      device: deviceRow,
      temperature: numericTemperature,
      humidity: numericHumidity,
      direction: tempInfo,
      cfg,
    });

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
    nextAlertState.temp_last_sent_at = nowIso();
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

  if (
    humInfo.breached &&
    !alertState.hum_active &&
    canSendByCooldown(alertState.hum_last_sent_at)
  ) {
    await sendHumidityTriggeredEmail({
      device: deviceRow,
      temperature: numericTemperature,
      humidity: numericHumidity,
      direction: humInfo,
      cfg,
    });

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
    nextAlertState.hum_last_sent_at = nowIso();
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
    if (alertState.offline_active) continue;
    if (!canSendByCooldown(alertState.offline_last_sent_at)) continue;

    await sendOfflineTriggeredEmail({ device: deviceRow, cfg });

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
      offline_last_sent_at: nowIso(),
    });

    await updateDeviceConfigAndStatus(deviceRow, {
      configPatch: nextConfig,
      status: "OFFLINE",
    });

    offlineTriggered += 1;
  }

  return { processed, offlineTriggered };
}

// -------------------- RESUMO SEMANAL --------------------
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
    const { device_id, temperature, humidity } = req.body;

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

    const insertReadingsResult = await supabase.from("readings").insert([
      {
        device_id,
        temperature: numericTemperature,
        humidity: numericHumidity,
      },
    ]);

    if (insertReadingsResult.error) {
      console.error("Erro ao inserir reading:", insertReadingsResult.error);
      return res.status(500).json({ error: "Erro ao guardar leitura" });
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

    const computedStatus = getDeviceStatus({
      online: true,
      temperature: numericTemperature,
      humidity: numericHumidity,
      temp_low_c: cfg.temp_low_c,
      temp_high_c: cfg.temp_high_c,
      hum_low: cfg.hum_low,
      hum_high: cfg.hum_high,
    });

    const currentNowIso = nowIso();

    const upsertPayload = {
      device_id,
      name: sanitizeDeviceName(baseDeviceRow.name, device_id),
      location: sanitizeLocation(baseDeviceRow.location),
      config: baseDeviceRow.config || {},
      config_version: baseDeviceRow.config_version || 1,
      last_seen: currentNowIso,
      last_temperature: numericTemperature,
      last_humidity: numericHumidity,
      status: statusToDbLabel(computedStatus),
      updated_at: currentNowIso,
    };

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

    const nextAlertState = await processTriggeredAndResolvedAlerts({
      deviceRow: freshDeviceRow,
      numericTemperature,
      numericHumidity,
      cfg: refreshedCfg,
    });

    const finalConfig = mergeAlertStateIntoConfig(freshDeviceRow, nextAlertState);

    await updateDeviceConfigAndStatus(freshDeviceRow, {
      configPatch: finalConfig,
      status: statusToDbLabel(computedStatus),
      last_seen: currentNowIso,
      last_temperature: numericTemperature,
      last_humidity: numericHumidity,
    });

    res.json({
      message: "OK",
      applied_config: getDeviceConfig({ config: finalConfig }),
      status: statusToApiLabel(computedStatus),
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

    const temperature =
      latestReading?.temperature ?? deviceRow?.last_temperature ?? null;
    const humidity = latestReading?.humidity ?? deviceRow?.last_humidity ?? null;

    const lastSeenIso = deviceRow?.last_seen || latestReading?.created_at || null;
    const lastSeenSeconds = lastSeenIso
      ? Math.floor((Date.now() - new Date(lastSeenIso).getTime()) / 1000)
      : 999999;

    const online =
      lastSeenSeconds <=
      Math.floor(getOfflineThresholdMs(cfg.send_interval_s) / 1000);

    const normalizedStatus =
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

    const since24hIso = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: alerts24hCount, error: alertsCountError } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("sent_at", since24hIso);

    if (alertsCountError) {
      console.error("Erro ao contar alertas:", alertsCountError);
      return res.status(500).json({ error: "Erro ao contar alertas" });
    }

    const { count: readings24hCount, error: readingsCountError } = await supabase
      .from("readings")
      .select("*", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", since24hIso);

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
      last_seen_seconds: lastSeenSeconds,
      alerts_24h: alerts24hCount || 0,
      total_readings_24h: readings24hCount || 0,
      backend_status: "connected",
      updated_at: deviceRow?.updated_at || latestReading?.created_at || null,
      alert_state,
    });
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id:", error);
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
      .select("temperature, humidity, created_at")
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

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("device_id", deviceId)
      .order("sent_at", { ascending: false })
      .limit(50);

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
      .select("device_id,name,location,config,config_version,updated_at")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }

    const config = getDeviceConfig(data);

    res.json({
      device_id: deviceId,
      name: data.name || deviceId,
      location: data.location || "Localização por definir",
      config_version: data.config_version || 1,
      updated_at: data.updated_at || null,
      config,
    });
  } catch (error) {
    console.error("Erro em /api/device/:id/config [GET]:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor SmartTempSystems ativo na porta " + PORT);
});