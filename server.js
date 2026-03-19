const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const API_TOKEN = process.env.API_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEMP_LIMIT = parseFloat(process.env.TEMP_LIMIT || "25");
const COOLDOWN_MIN = parseInt(process.env.ALERT_COOLDOWN_MIN || "30", 10);

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------------- HELPERS --------------------
function getAuthToken(req) {
  return req.headers["authorization"];
}

function isAuthorized(req) {
  return getAuthToken(req) === API_TOKEN;
}

function getDeviceConfig(deviceRow) {
  const cfg = deviceRow?.config || {};

  return {
    min_temp: Number(cfg.min_temp ?? 18),
    max_temp: Number(cfg.max_temp ?? TEMP_LIMIT),
    min_humidity: Number(cfg.min_humidity ?? 30),
    max_humidity: Number(cfg.max_humidity ?? 60),
  };
}

function getDeviceStatus({ online, temperature, humidity, min_temp, max_temp, min_humidity, max_humidity }) {
  if (!online) return "offline";

  const tempCritical = temperature > max_temp + 2 || temperature < min_temp - 2;
  const humCritical = humidity > max_humidity + 5 || humidity < min_humidity - 5;

  if (tempCritical || humCritical) return "critical";

  const tempAlert = temperature > max_temp || temperature < min_temp;
  const humAlert = humidity > max_humidity || humidity < min_humidity;

  if (tempAlert || humAlert) return "alert";

  return "normal";
}

function getRelativeDateTimePt(dateValue) {
  const d = new Date(dateValue);
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAlertTitle(level, temperature, maxTemp) {
  if (level === "critical") return "Temperatura crítica";
  if (level === "alert" && temperature > maxTemp) return "Temperatura acima do limite";
  if (level === "alert") return "Leitura fora do intervalo";
  return "Evento registado";
}

function getAlertMessage(deviceId, temperature, humidity) {
  return `${deviceId} registou ${Number(temperature).toFixed(1)}°C e ${Number(humidity).toFixed(0)}% de humidade.`;
}

// -------------------- EMAIL ALERTA --------------------
async function sendAlertEmail({ device_id, temperature, humidity }) {
  if (!BREVO_API_KEY) return;

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: ALERT_FROM_EMAIL },
      to: [{ email: ALERT_TO_EMAIL }],
      subject: `⚠ ALERTA - ${device_id} (${temperature}°C)`,
      htmlContent: `
        <h2>⚠ Alerta de Temperatura</h2>
        <p><strong>Dispositivo:</strong> ${device_id}</p>
        <p><strong>Temperatura:</strong> ${temperature} °C</p>
        <p><strong>Humidade:</strong> ${humidity} %</p>
        <p><strong>Limite configurado:</strong> ${TEMP_LIMIT} °C</p>
        <p><em>Enviado automaticamente pelo SmartThermoSecure.</em></p>
      `,
    },
    {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );
}

// -------------------- COOLDOWN --------------------
async function canSendAlert(device_id) {
  const sinceIso = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .select("id")
    .eq("device_id", device_id)
    .gte("sent_at", sinceIso)
    .limit(1);

  if (error) {
    console.error("Erro a verificar cooldown:", error);
    return false;
  }

  return !data || data.length === 0;
}

// -------------------- RESUMO SEMANAL --------------------
async function sendWeeklyReport() {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("readings")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro no resumo semanal:", error);
    return;
  }

  if (!data || data.length === 0) return;

  const devices = {};

  for (const r of data) {
    const rawDate = new Date(r.created_at);
    const day = rawDate.toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

    if (!devices[r.device_id]) devices[r.device_id] = {};
    if (!devices[r.device_id][day]) {
      devices[r.device_id][day] = {
        min: r.temperature,
        max: r.temperature,
      };
    } else {
      devices[r.device_id][day].min = Math.min(devices[r.device_id][day].min, r.temperature);
      devices[r.device_id][day].max = Math.max(devices[r.device_id][day].max, r.temperature);
    }
  }

  let html = `<h2>📊 Resumo Semanal - SmartThermoSecure</h2>`;

  for (const device in devices) {
    html += `<h3>Dispositivo: ${device}</h3>`;
    html += `
      <table style="border-collapse:collapse;width:100%;max-width:600px">
        <tr>
          <th style="border-bottom:1px solid #ccc;padding:6px;text-align:left">Dia</th>
          <th style="border-bottom:1px solid #ccc;padding:6px;text-align:right">Min (°C)</th>
          <th style="border-bottom:1px solid #ccc;padding:6px;text-align:right">Max (°C)</th>
        </tr>
    `;

    for (const day in devices[device]) {
      html += `
        <tr>
          <td style="padding:6px;border-bottom:1px solid #eee">${day}</td>
          <td style="padding:6px;text-align:right;border-bottom:1px solid #eee">${devices[device][day].min.toFixed(1)}</td>
          <td style="padding:6px;text-align:right;border-bottom:1px solid #eee">${devices[device][day].max.toFixed(1)}</td>
        </tr>
      `;
    }

    html += `</table><br>`;
  }

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: ALERT_FROM_EMAIL },
      to: [{ email: ALERT_TO_EMAIL }],
      subject: "📊 Resumo Semanal SmartThermoSecure",
      htmlContent: html,
    },
    {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );
}

// -------------------- WEEKLY REPORT --------------------
app.post("/api/weekly-report", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    await sendWeeklyReport();
    res.json({ message: "Resumo enviado" });
  } catch (error) {
    console.error("Erro em /api/weekly-report:", error);
    res.status(500).json({ error: "Erro ao enviar resumo semanal" });
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
      return res.status(400).json({ error: "device_id, temperature e humidity são obrigatórios" });
    }

    await supabase.from("readings").insert([{ device_id, temperature, humidity }]);

    const nowIso = new Date().toISOString();
    const status = Number(temperature) > TEMP_LIMIT ? "ALARM" : "NORMAL";

    const { error } = await supabase
      .from("devices")
      .upsert(
        [
          {
            device_id,
            last_seen: nowIso,
            last_temperature: temperature,
            last_humidity: humidity,
            status,
            updated_at: nowIso,
          },
        ],
        { onConflict: "device_id" }
      );

    if (error) {
      console.error("Erro ao atualizar device:", error);
    }

    if (Number(temperature) > TEMP_LIMIT) {
      if (await canSendAlert(device_id)) {
        await sendAlertEmail({ device_id, temperature, humidity });
        await supabase.from("alerts").insert([{ device_id, temperature, humidity }]);
      }
    }

    res.json({ message: "OK" });
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

    const { min_temp, max_temp, min_humidity, max_humidity } = getDeviceConfig(deviceRow);

    const temperature =
      latestReading?.temperature ?? deviceRow?.last_temperature ?? null;
    const humidity =
      latestReading?.humidity ?? deviceRow?.last_humidity ?? null;

    const lastSeenIso = deviceRow?.last_seen || latestReading?.created_at || null;
    const lastSeenSeconds = lastSeenIso
      ? Math.floor((Date.now() - new Date(lastSeenIso).getTime()) / 1000)
      : 999999;

    const online = lastSeenSeconds <= 90;

    const normalizedStatus =
      temperature !== null && humidity !== null
        ? getDeviceStatus({
            online,
            temperature: Number(temperature),
            humidity: Number(humidity),
            min_temp,
            max_temp,
            min_humidity,
            max_humidity,
          })
        : online
        ? "normal"
        : "offline";

    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
      client: "Cliente principal",
      location: deviceRow?.location || "Local não definido",
      zone: deviceRow?.location || "N/D",
      temperature: temperature !== null ? Number(temperature) : null,
      humidity: humidity !== null ? Number(humidity) : null,
      min_temp,
      max_temp,
      min_humidity,
      max_humidity,
      status: normalizedStatus,
      online,
      last_seen_seconds: lastSeenSeconds,
      alerts_24h: alerts24hCount || 0,
      total_readings_24h: readings24hCount || 0,
      backend_status: "connected",
      updated_at: deviceRow?.updated_at || latestReading?.created_at || null,
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

    const { data, error } = await supabase
      .from("readings")
      .select("temperature, humidity, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) {
      console.error("Erro ao obter histórico:", error);
      return res.status(500).json({ error: "Erro ao obter histórico" });
    }

    const history = (data || [])
      .reverse()
      .map((row) => ({
        time: new Date(row.created_at).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        temperature: Number(row.temperature),
        humidity: Number(row.humidity),
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

    const { data: deviceRow } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    const { max_temp } = getDeviceConfig(deviceRow);

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("device_id", deviceId)
      .order("sent_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Erro ao obter alertas:", error);
      return res.status(500).json({ error: "Erro ao obter alertas" });
    }

    const alerts = (data || []).map((row, index) => {
      const temperature = Number(row.temperature);
      const humidity = Number(row.humidity);
      const level = temperature > max_temp + 2 ? "critical" : "alert";

      return {
        id: row.id || index + 1,
        level,
        title: getAlertTitle(level, temperature, max_temp),
        message: getAlertMessage(deviceId, temperature, humidity),
        created_at: getRelativeDateTimePt(row.sent_at),
      };
    });

    if (alerts.length === 0) {
      return res.json([
        {
          id: 1,
          level: "normal",
          title: "Sistema estável",
          message: "Sem alertas registados para este dispositivo.",
          created_at: getRelativeDateTimePt(new Date()),
        },
      ]);
    }

    res.json(alerts);
  } catch (error) {
    console.error("Erro em /api/dashboard/device/:id/alerts:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});


// -------------------- ATUALIZAR CONFIG DISPOSITIVO --------------------
app.post("/api/device/:id/config", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== API_TOKEN) return res.status(401).json({ error: "Não autorizado" });

  const deviceId = req.params.id;
  const { min_temp, max_temp, min_humidity, max_humidity } = req.body;

  const config = {
    min_temp,
    max_temp,
    min_humidity,
    max_humidity,
  };

  const { error } = await supabase
    .from("devices")
    .update({ config })
    .eq("device_id", deviceId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ message: "Configuração atualizada com sucesso" });
});


app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor ativo na porta " + PORT);
});