const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// -------- ENV / CONFIG --------
const API_TOKEN = process.env.API_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEMP_LIMIT = parseFloat(process.env.TEMP_LIMIT || "25");
const COOLDOWN_MIN = parseInt(process.env.ALERT_COOLDOWN_MIN || "30", 10);

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL;

// -------- SUPABASE CLIENT --------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------- HELPERS --------
async function sendAlertEmail({ device_id, temperature, humidity }) {
  if (!BREVO_API_KEY || !ALERT_FROM_EMAIL || !ALERT_TO_EMAIL) return;

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: ALERT_FROM_EMAIL },
      to: [{ email: ALERT_TO_EMAIL }],
      subject: `ALERTA Temperatura: ${device_id} (${temperature}°C)`,
      textContent:
        `Dispositivo: ${device_id}\n` +
        `Temperatura: ${temperature} °C\n` +
        `Humidade: ${humidity} %\n` +
        `Limite: ${TEMP_LIMIT} °C\n` +
        `Data: ${new Date().toISOString()}\n`,
    },
    {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
}

async function canSendAlert(device_id) {
  const sinceIso = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .select("id")
    .eq("device_id", device_id)
    .gte("sent_at", sinceIso)
    .limit(1);

  if (error) return false; // se houver erro, não spammar
  return data.length === 0;
}

// -------- ROUTES --------
app.get("/", (req, res) => res.send("Servidor ativo!"));

app.get("/api/latest", async (req, res) => {
  const { data, error } = await supabase
    .from("readings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.post("/api/temperature", async (req, res) => {
  const token = req.headers["authorization"];
  if (!API_TOKEN || token !== API_TOKEN) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { device_id, temperature, humidity } = req.body;

  if (!device_id || temperature === undefined || humidity === undefined) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  // 1) Guardar leitura
  const insRead = await supabase
    .from("readings")
    .insert([{ device_id, temperature, humidity }]);

  if (insRead.error) {
    return res.status(500).json({ error: insRead.error.message });
  }

  // 2) Alerta se passar o limite (com cooldown)
  if (Number(temperature) > TEMP_LIMIT) {
    const okToSend = await canSendAlert(device_id);

    if (okToSend) {
      try {
        await sendAlertEmail({ device_id, temperature, humidity });

        // guardar o alerta para cooldown
        const insAlert = await supabase
          .from("alerts")
          .insert([{ device_id, temperature, humidity }]);

        if (insAlert.error) {
          console.log("Erro a gravar alert:", insAlert.error.message);
        }
      } catch (e) {
        console.log("Erro ao enviar email Brevo:", e?.message || e);
      }
    }
  }

  return res.status(200).json({ message: "OK" });
});

app.post("/api/weekly-report", async (req, res) => {
  const token = req.headers["authorization"];
  if (!API_TOKEN || token !== API_TOKEN) return res.status(401).json({ error: "Não autorizado" });

  // últimos 7 dias
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("readings")
    .select("device_id,temperature,humidity,created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(200).json({ message: "Sem dados" });

  // agrega por dia (YYYY-MM-DD) e por device
  const byDeviceDay = {};
  for (const r of data) {
    const day = String(r.created_at).slice(0, 10);
    const key = `${r.device_id}__${day}`;
    if (!byDeviceDay[key]) {
      byDeviceDay[key] = {
        device_id: r.device_id,
        day,
        tmin: r.temperature,
        tmax: r.temperature,
      };
    } else {
      byDeviceDay[key].tmin = Math.min(byDeviceDay[key].tmin, r.temperature);
      byDeviceDay[key].tmax = Math.max(byDeviceDay[key].tmax, r.temperature);
    }
  }

  const rows = Object.values(byDeviceDay)
    .sort((a, b) => (a.device_id + a.day).localeCompare(b.device_id + b.day));

  // email “clean”
  const lines = [
    `Resumo semanal (últimos 7 dias)`,
    `Gerado: ${new Date().toISOString()}`,
    ``,
    `device_id | dia | min | max`,
    `--------------------------------`,
    ...rows.map(r => `${r.device_id} | ${r.day} | ${r.tmin.toFixed(1)} | ${r.tmax.toFixed(1)}`),
    ``,
  ];

  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: ALERT_FROM_EMAIL },
        to: [{ email: ALERT_TO_EMAIL }],
        subject: "Resumo semanal de temperatura",
        textContent: lines.join("\n"),
      },
      { headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }, timeout: 10000 }
    );
  } catch (e) {
    return res.status(500).json({ error: "Falha ao enviar email", details: e?.message || e });
  }

  return res.status(200).json({ message: "Resumo enviado", rows: rows.length });
});

app.listen(PORT, "0.0.0.0", () => console.log("Servidor ativo na porta " + PORT));