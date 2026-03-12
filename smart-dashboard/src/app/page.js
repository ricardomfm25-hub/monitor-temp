
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Thermometer,
  Droplets,
  ShieldAlert,
  Wifi,
  WifiOff,
  Activity,
  Clock3,
  MapPin,
  Server,
  CheckCircle2,
  TriangleAlert,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

const DEVICE_ID = "SmartThermoSecure_01";
const API_BASE = "https://monitor-temp.onrender.com";
const API_TOKEN = "0AnbKTm9WAf4KFsvU6qmKHHwYNa8ZY1y";

const demoOverview = {
  device_id: DEVICE_ID,
  client: "Cliente principal",
  location: "Sala monitorizada",
  zone: "Portugal",
  temperature: 22.4,
  humidity: 46,
  min_temp: 18,
  max_temp: 27,
  min_humidity: 30,
  max_humidity: 60,
  status: "normal",
  online: true,
  last_seen_seconds: 24,
  alerts_24h: 0,
  total_readings_24h: 2880,
  backend_status: "connected",
};

const demoHistory = [
  { time: "09:00", temperature: 21.8, humidity: 45 },
  { time: "10:00", temperature: 22.0, humidity: 46 },
  { time: "11:00", temperature: 22.3, humidity: 45 },
  { time: "12:00", temperature: 22.7, humidity: 46 },
  { time: "13:00", temperature: 22.5, humidity: 46 },
  { time: "14:00", temperature: 22.9, humidity: 47 },
  { time: "15:00", temperature: 22.6, humidity: 46 },
  { time: "16:00", temperature: 22.4, humidity: 46 },
];

const demoAlerts = [
  {
    id: 1,
    level: "normal",
    title: "Sistema estável",
    message: "Sem alertas críticos nas últimas 24 horas.",
    created_at: "há 12 min",
  },
  {
    id: 2,
    level: "normal",
    title: "Dispositivo online",
    message: "Última comunicação recebida com sucesso.",
    created_at: "há 24 s",
  },
];

function badgeClasses(status) {
  if (status === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (status === "alert") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "offline") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function dotClasses(status) {
  if (status === "critical") return "bg-red-500";
  if (status === "alert") return "bg-amber-500";
  if (status === "offline") return "bg-slate-400";
  return "bg-emerald-500";
}

function statusLabel(status) {
  if (status === "critical") return "Crítico";
  if (status === "alert") return "Alerta";
  if (status === "offline") return "Offline";
  return "Normal";
}

function relativeLastSeen(seconds) {
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h`;
}

function StatCard({ title, value, subtitle, icon: Icon, iconStyle }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`rounded-2xl p-3 ${iconStyle}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: API_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status}`);
  }

  return response.json();
}

export default function Page() {
  const [overview, setOverview] = useState(demoOverview);
  const [history, setHistory] = useState(demoHistory);
  const [alerts, setAlerts] = useState(demoAlerts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [usingDemo, setUsingDemo] = useState(true);

  const refreshData = async () => {
    try {
      setError("");

      const [overviewData, historyData, alertsData] = await Promise.all([
        fetchJson(`/api/dashboard/device/${DEVICE_ID}`),
        fetchJson(`/api/dashboard/device/${DEVICE_ID}/history`),
        fetchJson(`/api/dashboard/device/${DEVICE_ID}/alerts`),
      ]);

      setOverview({ ...demoOverview, ...overviewData });
      setHistory(Array.isArray(historyData) && historyData.length ? historyData : demoHistory);
      setAlerts(Array.isArray(alertsData) && alertsData.length ? alertsData : demoAlerts);
      setUsingDemo(false);
      setLastRefresh(new Date());
    } catch (err) {
      setUsingDemo(true);
      setError("A mostrar dados demo. Falta confirmar token ou endpoints reais.");
      setOverview(demoOverview);
      setHistory(demoHistory);
      setAlerts(demoAlerts);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const temperatureState = useMemo(() => {
    if (overview.temperature > overview.max_temp || overview.temperature < overview.min_temp) {
      return "Fora do intervalo";
    }
    return "Dentro do intervalo";
  }, [overview]);

  const humidityState = useMemo(() => {
    if (overview.humidity > overview.max_humidity || overview.humidity < overview.min_humidity) {
      return "Fora do intervalo";
    }
    return "Dentro do intervalo";
  }, [overview]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                SmartThermoSecure
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Dashboard profissional · {DEVICE_ID}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Monitorização dedicada do dispositivo principal para demonstração comercial.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className={`h-2.5 w-2.5 rounded-full ${dotClasses(overview.status)}`} />
                <span className="text-sm font-medium text-slate-700">
                  {statusLabel(overview.status)}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                {overview.online ? (
                  <Wifi className="h-4 w-4 text-emerald-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-slate-500" />
                )}
                <span className="text-sm font-medium text-slate-700">
                  {overview.online ? "Online" : "Offline"}
                </span>
              </div>

              <button
                onClick={refreshData}
                className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Temperatura atual"
            value={`${overview.temperature?.toFixed?.(1) ?? overview.temperature}°C`}
            subtitle={temperatureState}
            icon={Thermometer}
            iconStyle="bg-sky-50 text-sky-700"
          />
          <StatCard
            title="Humidade atual"
            value={`${overview.humidity}%`}
            subtitle={humidityState}
            icon={Droplets}
            iconStyle="bg-cyan-50 text-cyan-700"
          />
          <StatCard
            title="Alertas 24h"
            value={overview.alerts_24h}
            subtitle="Eventos recentes do dispositivo"
            icon={Bell}
            iconStyle="bg-amber-50 text-amber-700"
          />
          <StatCard
            title="Última leitura"
            value={relativeLastSeen(overview.last_seen_seconds || 0)}
            subtitle="Latência da última atualização"
            icon={Clock3}
            iconStyle="bg-slate-100 text-slate-700"
          />
          <StatCard
            title="Leituras 24h"
            value={overview.total_readings_24h}
            subtitle="Volume total registado"
            icon={Activity}
            iconStyle="bg-emerald-50 text-emerald-700"
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="p-6">
              <h2 className="text-xl font-semibold">Tendência ambiental</h2>
              <p className="mt-1 text-sm text-slate-500">
                Histórico recente de temperatura e humidade do {DEVICE_ID}
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-72 rounded-3xl bg-slate-50 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="temperature" strokeWidth={2} fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72 rounded-3xl bg-slate-50 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="humidity" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="p-6">
              <h2 className="text-xl font-semibold">Perfil do dispositivo</h2>
              <p className="mt-1 text-sm text-slate-500">
                Resumo executivo do ponto monitorizado
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                      Dispositivo
                    </p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight">
                      {overview.device_id}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-medium ${badgeClasses(
                      overview.status
                    )}`}
                  >
                    {statusLabel(overview.status)}
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-slate-500" />
                    Cliente: <span className="font-medium">{overview.client}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    Local: <span className="font-medium">{overview.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-500" />
                    Backend: <span className="font-medium">{overview.backend_status}</span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-sm text-slate-500">Limite temperatura</p>
                    <p className="mt-2 text-2xl font-bold">
                      {overview.min_temp}°C — {overview.max_temp}°C
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-sm text-slate-500">Limite humidade</p>
                    <p className="mt-2 text-2xl font-bold">
                      {overview.min_humidity}% — {overview.max_humidity}%
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-950 p-5 text-white">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                    <div>
                      <p className="font-semibold">Mensagem comercial forte</p>
                      <p className="mt-1 text-sm text-slate-300">
                        Este painel mostra controlo contínuo, resposta rápida e rastreabilidade
                        operacional do SmartThermoSecure_01.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="p-6">
              <h2 className="text-xl font-semibold">Alertas e eventos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Últimas ocorrências registadas para este equipamento
              </p>
            </div>
            <div className="space-y-3 px-6 pb-6">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 h-3 w-3 rounded-full ${dotClasses(alert.level)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{alert.title}</p>
                        <span className="whitespace-nowrap text-xs text-slate-500">
                          {alert.created_at}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{alert.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="p-6">
              <h2 className="text-xl font-semibold">Estado operacional</h2>
              <p className="mt-1 text-sm text-slate-500">
                Leitura rápida para apresentação ao cliente
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Thermometer className="h-4 w-4" />
                    Temperatura
                  </div>
                  <p className="mt-3 text-3xl font-bold">
                    {overview.temperature?.toFixed?.(1) ?? overview.temperature}°C
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{temperatureState}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Droplets className="h-4 w-4" />
                    Humidade
                  </div>
                  <p className="mt-3 text-3xl font-bold">{overview.humidity}%</p>
                  <p className="mt-2 text-sm text-slate-500">{humidityState}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    {overview.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                    Conectividade
                  </div>
                  <p className="mt-3 text-3xl font-bold">
                    {overview.online ? "Online" : "Offline"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Última leitura {relativeLastSeen(overview.last_seen_seconds || 0)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <TriangleAlert className="h-4 w-4" />
                    Alertas
                  </div>
                  <p className="mt-3 text-3xl font-bold">{overview.alerts_24h}</p>
                  <p className="mt-2 text-sm text-slate-500">Total nas últimas 24 horas</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                {loading
                  ? "A carregar dados..."
                  : `Última atualização: ${lastRefresh.toLocaleTimeString("pt-PT")}${
                      usingDemo ? " · modo demo" : " · dados reais"
                    }`}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}