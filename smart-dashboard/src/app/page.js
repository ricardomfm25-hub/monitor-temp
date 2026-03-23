"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "recharts";

const DEVICE_ID = "SmartThermoSecure_01";
const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || "stsadminRM2026";

const PERIODS = [
  { key: "1h", label: "1H", hours: 1 },
  { key: "6h", label: "6H", hours: 6 },
  { key: "12h", label: "12H", hours: 12 },
  { key: "24h", label: "24H", hours: 24 },
  { key: "7d", label: "7D", hours: 24 * 7 },
];

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortTime(value) {
  if (!value) return "";
  const d = new Date(value);
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

function toInputValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return String(value);
}

function getStatusInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("alarm")) {
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

function getMinMax(data, key) {
  const values = data
    .map((item) => Number(item[key]))
    .filter((v) => !Number.isNaN(v));

  if (!values.length) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;

  const value = payload[0]?.value;

  return (
    <div style={styles.tooltip}>
      <div style={styles.tooltipTitle}>{formatDateTime(label)}</div>
      <div style={styles.tooltipValue}>
        Valor: <strong>{formatValue(value, unit)}</strong>
      </div>
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
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

function DataChart({
  title,
  data,
  dataKey,
  unit,
  minThreshold,
  maxThreshold,
  isMobile,
}) {
  const { min, max } = getMinMax(data, dataKey);

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div>
          <div style={styles.chartTitle}>{title}</div>
          <div style={styles.chartSubtitle}>
            Pico inferior: {formatValue(min, unit)} | Pico superior:{" "}
            {formatValue(max, unit)}
          </div>
        </div>
      </div>

      <div
        style={{
          ...styles.chartWrap,
          height: isMobile ? "180px" : "300px",
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#273142" strokeDasharray="3 3" />
            <XAxis
              dataKey="created_at"
              tickFormatter={formatShortTime}
              stroke="#7c8aa0"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              stroke="#7c8aa0"
              tick={{ fontSize: 12 }}
              domain={["auto", "auto"]}
              width={36}
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />

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
              type="monotone"
              dataKey={dataKey}
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [savingClient, setSavingClient] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);

  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);

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

  const [isMobile, setIsMobile] = useState(false);

  const selectedPeriod = useMemo(
    () => PERIODS.find((p) => p.key === period) || PERIODS[3],
    [period]
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const supabase = createClient();

  async function loadData() {
    setLoading(true);

    const since = new Date(
      Date.now() - selectedPeriod.hours * 60 * 60 * 1000
    ).toISOString();

    const [deviceResponse, readingsResponse] = await Promise.all([
      supabase
        .from("devices")
        .select("*")
        .eq("device_id", DEVICE_ID)
        .limit(1)
        .maybeSingle(),

      supabase
        .from("readings")
        .select("*")
        .eq("device_id", DEVICE_ID)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
    ]);

    if (deviceResponse.error) {
      console.warn("devices:", JSON.stringify(deviceResponse.error, null, 2));
    }

    if (readingsResponse.error) {
      console.warn("readings:", JSON.stringify(readingsResponse.error, null, 2));
    }

    const deviceData = deviceResponse.data || null;

    setDevice(deviceData);
    setReadings(readingsResponse.data || []);

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

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const config = device?.config || {};

  const tempLow = config?.temp_low_c;
  const tempHigh = config?.temp_high_c;
  const humLow = config?.hum_low;
  const humHigh = config?.hum_high;
  const hystC = config?.hyst_c;
  const sendIntervalS = config?.send_interval_s;
  const displayStandbyMin = config?.display_standby_min;

  const statusInfo = getStatusInfo(device?.status);
  const deviceDisplayName = device?.name || device?.device_id || DEVICE_ID;
  const deviceLocation = device?.location || "Localização por definir";

  function parseNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const normalized = String(value).replace(",", ".");
    const numeric = Number(normalized);
    return Number.isNaN(numeric) ? null : numeric;
  }

  async function saveClientConfig() {
    if (!device) return;

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
      .eq("device_id", DEVICE_ID);

    if (error) {
      setClientMessage("Erro ao guardar configurações do cliente.");
      console.warn("saveClientConfig:", JSON.stringify(error, null, 2));
      setSavingClient(false);
      return;
    }

    setClientMessage("Configurações do cliente guardadas com sucesso.");
    await loadData();
    setSavingClient(false);
  }

  async function saveAdminConfig() {
    if (!device) return;

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

    const newConfig = {
      ...config,
      hyst_c: newHyst,
      send_interval_s: newSendInterval,
      display_standby_min: newDisplayStandby,
    };

    const { error } = await supabase
      .from("devices")
      .update({
        name: adminForm.name.trim() || device?.device_id || DEVICE_ID,
        location: adminForm.location.trim() || "Localização por definir",
        config: newConfig,
        config_version: Number(device?.config_version || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", DEVICE_ID);

    if (error) {
      setAdminMessage("Erro ao guardar configurações admin.");
      console.warn("saveAdminConfig:", JSON.stringify(error, null, 2));
      setSavingAdmin(false);
      return;
    }

    setAdminMessage("Configurações admin guardadas com sucesso.");
    await loadData();
    setSavingAdmin(false);
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.title}>Dashboard STS</h1>
            <p style={styles.subtitle}>
              Monitorização em tempo real do dispositivo {DEVICE_ID}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={loadData} style={styles.refreshButton}>
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

        <section
          style={{
            ...styles.heroCard,
            gridTemplateColumns: isMobile ? "1fr" : "1.7fr 1fr",
          }}
        >
          <div style={styles.heroLeft}>
            <div style={styles.heroHeaderTop}>
              <div>
                <div style={styles.sectionEyebrow}>Dispositivo</div>
                <div style={styles.deviceName}>{deviceDisplayName}</div>

                <div style={styles.deviceMetaLine}>
                  <span style={styles.deviceMetaBadge}>{DEVICE_ID}</span>
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
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <MetricBox
                label="Temperatura atual"
                value={formatValue(device?.last_temperature, " °C")}
              />
              <MetricBox
                label="Humidade atual"
                value={formatValue(device?.last_humidity, " %")}
              />
            </div>

            <div
              style={{
                ...styles.heroMetaRow,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <InfoItem
                label="Última atualização"
                value={formatDateTime(device?.last_seen)}
              />
              <InfoItem
                label="Estado do dispositivo"
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

        <section
          style={{
            ...styles.chartGrid,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          }}
        >
          <DataChart
            title="Temperatura"
            data={readings}
            dataKey="temperature"
            unit=" °C"
            minThreshold={tempLow}
            maxThreshold={tempHigh}
            isMobile={isMobile}
          />

          <DataChart
            title="Humidade"
            data={readings}
            dataKey="humidity"
            unit=" %"
            minThreshold={humLow}
            maxThreshold={humHigh}
            isMobile={isMobile}
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
              <div style={styles.cardTitle}>Configurações do cliente</div>
              <div style={styles.cardHint}>
                Limites operacionais visíveis e editáveis pelo cliente
              </div>
            </div>
          </div>

          <div
            style={{
              ...styles.formGrid,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
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
              />
            </div>
          </div>

          <div style={styles.actionsRow}>
            <button
              style={styles.primaryButton}
              onClick={saveClientConfig}
              disabled={savingClient}
            >
              {savingClient ? "A guardar..." : "Guardar configurações"}
            </button>

            {clientMessage ? (
              <span style={styles.successText}>{clientMessage}</span>
            ) : null}
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>Modo admin</div>
              <div style={styles.cardHint}>
                Área reservada para informação técnica e gestão futura
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

              {adminError ? <div style={styles.errorText}>{adminError}</div> : null}
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
                  }}
                >
                  Sair
                </button>
              </div>

              <div
                style={{
                  ...styles.adminGrid,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                }}
              >
                <SmallStat label="Config version" value={device?.config_version ?? "-"} />
                <SmallStat label="Atualizada em" value={formatDateTime(device?.updated_at)} />
                <SmallStat label="Last seen" value={formatDateTime(device?.last_seen)} />
                <SmallStat label="Status raw" value={device?.status || "-"} />
                <SmallStat label="Device ID" value={device?.device_id || DEVICE_ID} />
                <SmallStat label="Nome" value={deviceDisplayName} />
                <SmallStat label="Localização" value={deviceLocation} />
                <SmallStat
                  label="Última temp."
                  value={formatValue(device?.last_temperature, " °C")}
                />
                <SmallStat
                  label="Última hum."
                  value={formatValue(device?.last_humidity, " %")}
                />
                <SmallStat
                  label="Histerese"
                  value={hystC !== undefined ? `${hystC} °C` : "-"}
                />
                <SmallStat
                  label="Envio"
                  value={sendIntervalS !== undefined ? `${sendIntervalS}s` : "-"}
                />
                <SmallStat
                  label="Standby display"
                  value={displayStandbyMin !== undefined ? `${displayStandbyMin} min` : "-"}
                />
              </div>

              <div style={styles.subsection}>
                <div style={styles.subsectionTitle}>Configurações admin</div>

                <div
                  style={{
                    ...styles.formGrid,
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                  }}
                >
                  <div style={styles.field}>
                    <label style={styles.label}>Nome do dispositivo</label>
                    <input
                      type="text"
                      value={adminForm.name}
                      onChange={(e) =>
                        setAdminForm((prev) => ({ ...prev, name: e.target.value }))
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
                        setAdminForm((prev) => ({ ...prev, location: e.target.value }))
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
                        setAdminForm((prev) => ({ ...prev, hyst_c: e.target.value }))
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
                    disabled={savingAdmin}
                  >
                    {savingAdmin ? "A guardar..." : "Guardar admin"}
                  </button>

                  {adminMessage ? (
                    <span style={styles.successText}>{adminMessage}</span>
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

  heroCard: {
    display: "grid",
    gridTemplateColumns: "1.7fr 1fr",
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
  },

  heroMetaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "20px",
    overflow: "hidden",
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

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
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

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
  },

  chartCard: {
    background: "#111827",
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

  chartWrap: {
    width: "100%",
    height: "300px",
    minWidth: 0,
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
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "12px",
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