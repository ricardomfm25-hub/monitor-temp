const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const API_TOKEN = process.env.API_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEMP_LIMIT = parseFloat(process.env.TEMP_LIMIT || "25");
const COOLDOWN_MIN = parseInt(process.env.ALERT_COOLDOWN_MIN || "30", 10);

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  const { data } = await supabase
    .from("alerts")
    .select("id")
    .eq("device_id", device_id)
    .gte("sent_at", sinceIso)
    .limit(1);

  return data.length === 0;
}

// -------------------- RESUMO SEMANAL --------------------
async function sendWeeklyReport() {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("readings")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return;

  // Agrupar por dispositivo
  const devices = {};

  for (const r of data) {
    const rawDate = new Date(r.created_at);
const day = rawDate.toLocaleDateString("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit"
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
    html += `<h3>Dispositivo: SmartThermoSecure_01</h3>`;
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

// Endpoint chamado pelo GitHub Action
app.post("/api/weekly-report", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== API_TOKEN) return res.status(401).json({ error: "Não autorizado" });

  await sendWeeklyReport();
  res.json({ message: "Resumo enviado" });
});

// -------------------- API TEMPERATURA --------------------
app.post("/api/temperature", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== API_TOKEN) return res.status(401).json({ error: "Não autorizado" });

  const { device_id, temperature, humidity } = req.body;

  // Guardar leitura
  await supabase.from("readings").insert([{ device_id, temperature, humidity }]);

  // Atualizar estado do dispositivo
  const nowIso = new Date().toISOString();
  const status = Number(temperature) > TEMP_LIMIT ? "ALARM" : "NORMAL";

  const { error } = await supabase
    .from("devices")
    .upsert(
      [{
        device_id,
        last_seen: nowIso,
        last_temperature: temperature,
        last_humidity: humidity,
        status,
        updated_at: nowIso
      }],
      { onConflict: "device_id" }
    );

  if (error) {
    console.error("Erro ao atualizar device:", error);
  }

  // Lógica de alertas (mantém igual)
  if (Number(temperature) > TEMP_LIMIT) {
    if (await canSendAlert(device_id)) {
      await sendAlertEmail({ device_id, temperature, humidity });
      await supabase.from("alerts").insert([{ device_id, temperature, humidity }]);
    }
  }

  res.json({ message: "OK" });
<<<<<<< HEAD
});
});
>>>>>>> 9120a4a (update devices status endpoint)
