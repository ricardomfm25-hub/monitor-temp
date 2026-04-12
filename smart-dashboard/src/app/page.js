"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";

const DEFAULT_DEVICE_ID = "SmartTempSystems_01";
const AUTO_REFRESH_MS = 15000;
const OFFLINE_LIMIT_MS = 120000;

/* ---------------- UTILS ---------------- */

function formatValue(v, unit = "", d = 1) {
  if (v === null || v === undefined || isNaN(v)) return "-";
  return `${Number(v).toFixed(d)}${unit}`;
}

function parseNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

function formatRelativeTime(value) {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  const s = Math.floor(diff / 1000);

  if (s < 10) return "agora";
  if (s < 60) return `há ${s}s`;

  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;

  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

function getEffectiveStatus(device) {
  if (!device?.last_seen) return "OFFLINE";
  if (Date.now() - new Date(device.last_seen).getTime() > OFFLINE_LIMIT_MS)
    return "OFFLINE";
  return device.status || "NORMAL";
}

/* ---------------- PREVISÃO SIMPLES ---------------- */

function buildPrediction(readings, config) {
  if (!readings || readings.length < 6) {
    return { label: "Normal", text: "Sem tendência relevante", tone: "good" };
  }

  const last = readings.slice(-6);
  let trend = 0;

  for (let i = 1; i < last.length; i++) {
    trend += last[i].temperature - last[i - 1].temperature;
  }

  const current = last[last.length - 1].temperature;
  const max = config?.temp_high_c;

  if (trend > 0.5 && max && current > max - 1) {
    return {
      label: "Alerta próximo",
      text: "Temperatura a subir rapidamente",
      tone: "bad",
    };
  }

  return { label: "Normal", text: "Sem risco próximo", tone: "good" };
}

/* ---------------- BOOT SCREEN ---------------- */

function BootScreen() {
  return (
    <main style={styles.bootPage}>
      <div style={styles.bootWrap}>
        <div style={styles.bootCircle}>
          <div style={styles.bootSpinner} />
          <div style={styles.bootCenter}>
            <div style={styles.bootLogo}>STS</div>
          </div>
        </div>
        <div style={styles.bootText}>A sincronizar...</div>
      </div>
    </main>
  );
}

/* ---------------- PAGE ---------------- */

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    location: "",
    display: "",
    temp_low: "",
    temp_high: "",
  });

  const load = useCallback(async () => {
    const { data: dev } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", DEFAULT_DEVICE_ID)
      .single();

    const { data: r } = await supabase
      .from("readings")
      .select("*")
      .eq("device_id", DEFAULT_DEVICE_ID)
      .order("created_at", { ascending: true })
      .limit(200);

    setDevice(dev);
    setReadings(r || []);

    if (dev) {
      setForm({
        name: dev.name || "",
        location: dev.location || "",
        display: dev.config?.display_standby_min || "",
        temp_low: dev.config?.temp_low_c || "",
        temp_high: dev.config?.temp_high_c || "",
      });
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const i = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(i);
  }, [load]);

  if (loading) return <BootScreen />;

  const status = getEffectiveStatus(device);
  const prediction = buildPrediction(readings, device?.config);

  async function save() {
    const newConfig = {
      ...device.config,
      temp_low_c: parseNumber(form.temp_low),
      temp_high_c: parseNumber(form.temp_high),
      display_standby_min: parseNumber(form.display),
    };

    await supabase
      .from("devices")
      .update({
        name: form.name,
        location: form.location,
        config: newConfig,
        config_version: device.config_version + 1,
      })
      .eq("device_id", device.device_id);

    load();
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h2>{device.name}</h2>
        <p>{device.location}</p>

        <div>Status: {status}</div>
        <div>Temp: {formatValue(device.last_temperature, "°C")}</div>
        <div>Hum: {formatValue(device.last_humidity, "%", 0)}</div>
      </div>

      <div style={styles.card}>
        <h3>Previsão</h3>
        <div>{prediction.label}</div>
        <small>{prediction.text}</small>
      </div>

      <div style={styles.card}>
        <h3>Configuração</h3>

        <input placeholder="Nome" value={form.name}
          onChange={(e)=>setForm({...form,name:e.target.value})}/>

        <input placeholder="Localização" value={form.location}
          onChange={(e)=>setForm({...form,location:e.target.value})}/>

        <input placeholder="Temp min" value={form.temp_low}
          onChange={(e)=>setForm({...form,temp_low:e.target.value})}/>

        <input placeholder="Temp max" value={form.temp_high}
          onChange={(e)=>setForm({...form,temp_high:e.target.value})}/>

        <input placeholder="Display (min)" value={form.display}
          onChange={(e)=>setForm({...form,display:e.target.value})}/>

        <button onClick={save}>Guardar</button>
      </div>
    </main>
  );
}

/* ---------------- STYLES ---------------- */

const styles = {
  page: {
    background: "#0b1220",
    minHeight: "100vh",
    padding: "20px",
    color: "#fff",
  },

  card: {
    background: "#111827",
    padding: "20px",
    borderRadius: "20px",
    marginBottom: "16px",
  },

  bootPage: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#0b1220",
    color: "#fff",
  },

  bootWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
  },

  bootCircle: {
    position: "relative",
    width: "200px",
    height: "200px",
  },

  bootSpinner: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: "999px",
    border: "2px solid #1e293b",
    borderTop: "2px solid #3b82f6",
    animation: "spin 1s linear infinite",
  },

  bootCenter: {
    position: "absolute",
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  bootLogo: {
    fontSize: "32px",
    fontWeight: "bold",
  },

  bootText: {
    fontSize: "14px",
    color: "#94a3b8",
  },
};