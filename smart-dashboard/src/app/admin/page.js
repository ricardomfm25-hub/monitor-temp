"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

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

function formatValue(value, suffix = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function SmallStat({ label, value }) {
  return (
    <div style={styles.smallStat}>
      <div style={styles.smallStatLabel}>{label}</div>
      <div style={styles.smallStatValue}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceAccess, setDeviceAccess] = useState([]);
  const [profile, setProfile] = useState(null);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const [deviceForm, setDeviceForm] = useState({
    name: "",
    location: "",
    hyst_c: "",
    send_interval_s: "",
    display_standby_min: "",
  });

  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "viewer",
  });

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);

  const selectedDeviceData = useMemo(
    () => devices.find((d) => d.device_id === selectedDevice) || null,
    [devices, selectedDevice]
  );

  useEffect(() => {
    loadData({ showLoader: true });
  }, []);

  useEffect(() => {
    if (!selectedDeviceData) {
      setDeviceForm({
        name: "",
        location: "",
        hyst_c: "",
        send_interval_s: "",
        display_standby_min: "",
      });
      return;
    }

    const config = selectedDeviceData.config || {};

    setDeviceForm({
      name: selectedDeviceData.name || "",
      location: selectedDeviceData.location || "",
      hyst_c: toInputValue(config.hyst_c),
      send_interval_s: toInputValue(config.send_interval_s),
      display_standby_min: toInputValue(config.display_standby_min),
    });
  }, [selectedDeviceData]);

  async function loadData({ showLoader = false } = {}) {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        router.replace("/login");
        return;
      }

      const [
        { data: profileData, error: profileError },
        { data: profiles, error: profilesError },
        { data: devicesData, error: devicesError },
        { data: accessData, error: accessError },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("*").order("email"),
        supabase.from("devices").select("*").order("device_id"),
        supabase.from("device_access").select("*"),
      ]);

      if (profileError) throw profileError;
      if (profilesError) throw profilesError;
      if (devicesError) throw devicesError;
      if (accessError) throw accessError;

      if (!profileData || profileData.role !== "super_admin") {
        router.replace("/");
        return;
      }

      const safeDevices = devicesData || [];

      setProfile(profileData);
      setUsers(profiles || []);
      setDevices(safeDevices);
      setDeviceAccess(accessData || []);

      if (!selectedDevice && safeDevices.length > 0) {
        setSelectedDevice(safeDevices[0].device_id);
      } else if (
        selectedDevice &&
        !safeDevices.some((d) => d.device_id === selectedDevice)
      ) {
        setSelectedDevice(safeDevices[0]?.device_id || "");
      }
    } catch (error) {
      setMessage(error?.message || "Erro ao carregar dados de administração.");
      setMessageType("error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function assignDevice() {
    if (!selectedUser || !selectedDevice) {
      setMessage("Seleciona utilizador e dispositivo.");
      setMessageType("error");
      return;
    }

    setSavingAccess(true);
    setMessage("");

    try {
      const existing = deviceAccess.find(
        (row) => row.user_id === selectedUser && row.device_id === selectedDevice
      );

      if (existing) {
        const { error } = await supabase
          .from("device_access")
          .update({
            can_view: true,
            can_edit: canEdit,
          })
          .eq("user_id", selectedUser)
          .eq("device_id", selectedDevice);

        if (error) throw error;

        setMessage("Acesso atualizado com sucesso.");
        setMessageType("success");
        await loadData();
        return;
      }

      const { error } = await supabase.from("device_access").insert({
        user_id: selectedUser,
        device_id: selectedDevice,
        can_view: true,
        can_edit: canEdit,
      });

      if (error) throw error;

      setMessage("Acesso atribuído com sucesso.");
      setMessageType("success");
      await loadData();
    } catch {
      setMessage("Erro ao atribuir ou atualizar acesso.");
      setMessageType("error");
    } finally {
      setSavingAccess(false);
    }
  }

  async function removeAccess(userId, deviceId) {
    setMessage("");

    try {
      const { error } = await supabase
        .from("device_access")
        .delete()
        .eq("user_id", userId)
        .eq("device_id", deviceId);

      if (error) throw error;

      setMessage("Acesso removido.");
      setMessageType("success");
      await loadData();
    } catch {
      setMessage("Erro ao remover acesso.");
      setMessageType("error");
    }
  }

  async function createUser() {
    const full_name = newUser.full_name.trim();
    const email = newUser.email.trim().toLowerCase();
    const password = newUser.password;
    const role = newUser.role;

    if (!full_name || !email || !password) {
      setMessage("Preenche nome, email e password.");
      setMessageType("error");
      return;
    }

    setCreatingUser(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name,
          email,
          password,
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "Erro ao criar utilizador.");
        setMessageType("error");
        return;
      }

      setMessage("Utilizador criado com sucesso.");
      setMessageType("success");

      setNewUser({
        full_name: "",
        email: "",
        password: "",
        role: "viewer",
      });

      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro inesperado ao criar utilizador.");
      setMessageType("error");
    } finally {
      setCreatingUser(false);
    }
  }

  async function saveDeviceConfig() {
    if (!selectedDeviceData || !selectedDevice) {
      setMessage("Seleciona um dispositivo.");
      setMessageType("error");
      return;
    }

    const newHyst = parseNumber(deviceForm.hyst_c);
    const newSendInterval = parseNumber(deviceForm.send_interval_s);
    const newDisplayStandby = parseNumber(deviceForm.display_standby_min);

    if (
      !deviceForm.name.trim() ||
      !deviceForm.location.trim() ||
      newHyst === null ||
      newSendInterval === null ||
      newDisplayStandby === null
    ) {
      setMessage("Preenche todos os campos do dispositivo com valores válidos.");
      setMessageType("error");
      return;
    }

    if (newSendInterval < 5) {
      setMessage("O intervalo de envio deve ser pelo menos 5 segundos.");
      setMessageType("error");
      return;
    }

    setSavingDevice(true);
    setMessage("");

    try {
      const currentConfig = selectedDeviceData.config || {};

      const newConfig = {
        ...currentConfig,
        hyst_c: newHyst,
        send_interval_s: newSendInterval,
        display_standby_min: newDisplayStandby,
      };

      const { data, error } = await supabase
        .from("devices")
        .update({
          name: deviceForm.name.trim(),
          location: deviceForm.location.trim(),
          config: newConfig,
          config_version: Number(selectedDeviceData.config_version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", selectedDevice)
        .select("*")
        .single();

      if (error || !data) {
        throw error || new Error("Erro ao guardar dispositivo.");
      }

      setDevices((prev) =>
        prev.map((item) =>
          item.device_id === data.device_id ? { ...item, ...data } : item
        )
      );

      setMessage("Configuração do dispositivo guardada com sucesso.");
      setMessageType("success");
    } catch {
      setMessage("Erro ao guardar configuração do dispositivo.");
      setMessageType("error");
    } finally {
      setSavingDevice(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.loadingText}>A carregar painel de administração...</div>
          </div>
        </div>
      </main>
    );
  }

  if (profile?.role !== "super_admin") {
    return null;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerBar}>
          <div style={styles.header}>
            <h1 style={styles.title}>Admin Panel</h1>
            <p style={styles.subtitle}>
              Gestão de utilizadores, acessos e configuração técnica dos dispositivos
            </p>
          </div>

          <div style={styles.topActions}>
            {refreshing ? <div style={styles.refreshingText}>A atualizar...</div> : null}

            <button
              onClick={() => router.push("/")}
              style={styles.secondaryButton}
            >
              Dashboard
            </button>

            <button
              onClick={() => loadData()}
              style={styles.secondaryButton}
            >
              Atualizar
            </button>

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
              style={styles.secondaryButton}
            >
              Sair
            </button>
          </div>
        </div>

        {message ? (
          <div
            style={
              messageType === "error"
                ? styles.messageError
                : styles.messageSuccess
            }
          >
            {message}
          </div>
        ) : null}

        <section style={styles.card}>
          <div style={styles.cardTitle}>Criar utilizador</div>

          <div style={styles.formGrid}>
            <input
              type="text"
              placeholder="Nome completo"
              value={newUser.full_name}
              onChange={(e) =>
                setNewUser((prev) => ({
                  ...prev,
                  full_name: e.target.value,
                }))
              }
              style={styles.input}
            />

            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
              style={styles.input}
            />

            <input
              type="text"
              placeholder="Password inicial"
              value={newUser.password}
              onChange={(e) =>
                setNewUser((prev) => ({
                  ...prev,
                  password: e.target.value,
                }))
              }
              style={styles.input}
            />

            <select
              value={newUser.role}
              onChange={(e) =>
                setNewUser((prev) => ({
                  ...prev,
                  role: e.target.value,
                }))
              }
              style={styles.input}
            >
              <option value="viewer">Viewer</option>
              <option value="client_admin">Client Admin</option>
            </select>
          </div>

          <div style={styles.actionsRow}>
            <button
              onClick={createUser}
              style={styles.primaryButton}
              disabled={creatingUser}
            >
              {creatingUser ? "A criar..." : "Criar utilizador"}
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Atribuir dispositivo</div>

          <div style={styles.formGrid}>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={styles.input}
            >
              <option value="">Selecionar utilizador</option>
              {users
                .filter((u) => u.role !== "super_admin")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
            </select>

            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              style={styles.input}
            >
              <option value="">Selecionar dispositivo</option>
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.name ? `${d.name} (${d.device_id})` : d.device_id}
                </option>
              ))}
            </select>
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={canEdit}
              onChange={() => setCanEdit((prev) => !prev)}
            />
            <span>Permitir edição</span>
          </label>

          <div style={styles.actionsRow}>
            <button
              onClick={assignDevice}
              style={styles.primaryButton}
              disabled={savingAccess}
            >
              {savingAccess ? "A guardar..." : "Atribuir acesso"}
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Configuração do dispositivo</div>

          <div style={styles.formGrid}>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              style={styles.input}
            >
              <option value="">Selecionar dispositivo</option>
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.name ? `${d.name} (${d.device_id})` : d.device_id}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Nome do dispositivo"
              value={deviceForm.name}
              onChange={(e) =>
                setDeviceForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              style={styles.input}
              disabled={!selectedDevice}
            />

            <input
              type="text"
              placeholder="Localização"
              value={deviceForm.location}
              onChange={(e) =>
                setDeviceForm((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
              style={styles.input}
              disabled={!selectedDevice}
            />

            <input
              type="number"
              step="0.1"
              placeholder="Histerese (°C)"
              value={deviceForm.hyst_c}
              onChange={(e) =>
                setDeviceForm((prev) => ({
                  ...prev,
                  hyst_c: e.target.value,
                }))
              }
              style={styles.input}
              disabled={!selectedDevice}
            />

            <input
              type="number"
              step="1"
              placeholder="Intervalo de envio (s)"
              value={deviceForm.send_interval_s}
              onChange={(e) =>
                setDeviceForm((prev) => ({
                  ...prev,
                  send_interval_s: e.target.value,
                }))
              }
              style={styles.input}
              disabled={!selectedDevice}
            />

            <input
              type="number"
              step="1"
              placeholder="Standby display (min)"
              value={deviceForm.display_standby_min}
              onChange={(e) =>
                setDeviceForm((prev) => ({
                  ...prev,
                  display_standby_min: e.target.value,
                }))
              }
              style={styles.input}
              disabled={!selectedDevice}
            />
          </div>

          <div style={styles.actionsRow}>
            <button
              onClick={saveDeviceConfig}
              style={styles.primaryButton}
              disabled={savingDevice || !selectedDevice}
            >
              {savingDevice ? "A guardar..." : "Guardar dispositivo"}
            </button>
          </div>
        </section>

        {selectedDeviceData ? (
          <section style={styles.card}>
            <div style={styles.cardTitle}>Informação técnica do dispositivo</div>

            <div style={styles.statsGrid}>
              <SmallStat
                label="Device ID"
                value={selectedDeviceData.device_id || "-"}
              />
              <SmallStat
                label="Nome"
                value={selectedDeviceData.name || "-"}
              />
              <SmallStat
                label="Localização"
                value={selectedDeviceData.location || "-"}
              />
              <SmallStat
                label="Config version"
                value={selectedDeviceData.config_version ?? "-"}
              />
              <SmallStat
                label="Atualizada em"
                value={formatDateTime(selectedDeviceData.updated_at)}
              />
              <SmallStat
                label="Last seen"
                value={formatDateTime(selectedDeviceData.last_seen)}
              />
              <SmallStat
                label="Status raw"
                value={selectedDeviceData.status || "-"}
              />
              <SmallStat
                label="Última temp."
                value={formatValue(selectedDeviceData.last_temperature, " °C")}
              />
              <SmallStat
                label="Última hum."
                value={formatValue(selectedDeviceData.last_humidity, " %")}
              />
            </div>

            <div style={styles.rawConfigWrap}>
              <div style={styles.rawConfigTitle}>Configuração raw</div>
              <pre style={styles.rawConfig}>
                {JSON.stringify(selectedDeviceData.config || {}, null, 2)}
              </pre>
            </div>
          </section>
        ) : null}

        <section style={styles.card}>
          <div style={styles.cardTitle}>Utilizadores</div>

          <div style={styles.userList}>
            {users.map((user) => {
              const accesses = deviceAccess.filter(
                (row) => row.user_id === user.id
              );

              return (
                <div key={user.id} style={styles.userCard}>
                  <div style={styles.userHeader}>
                    <div>
                      <div style={styles.userName}>{user.full_name}</div>
                      <div style={styles.meta}>{user.email}</div>
                    </div>

                    <div style={styles.roleBadge}>{user.role}</div>
                  </div>

                  <div style={styles.deviceList}>
                    {accesses.length === 0 ? (
                      <div style={styles.noDevice}>Sem dispositivos atribuídos</div>
                    ) : (
                      accesses.map((access) => (
                        <div
                          key={`${access.user_id}-${access.device_id}`}
                          style={styles.deviceRow}
                        >
                          <div>
                            <div style={styles.deviceName}>{access.device_id}</div>
                            <div style={styles.meta}>
                              {access.can_edit ? "Com edição" : "Só leitura"}
                            </div>
                          </div>

                          <button
                            style={styles.removeBtn}
                            onClick={() =>
                              removeAccess(access.user_id, access.device_id)
                            }
                          >
                            Remover
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    padding: "24px",
    color: "#e5edf7",
  },

  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },

  headerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },

  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  subtitle: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "14px",
  },

  topActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
  },

  refreshingText: {
    fontSize: "13px",
    color: "#93c5fd",
    fontWeight: 700,
  },

  secondaryButton: {
    border: "1px solid #334155",
    background: "#111c2e",
    color: "#cbd5e1",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "14px",
  },

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "20px",
    padding: "20px",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 800,
    marginBottom: "16px",
    color: "#f8fafc",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },

  input: {
    width: "100%",
    border: "1px solid #253246",
    background: "#0a1322",
    color: "#f8fafc",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    outline: "none",
    minHeight: "44px",
    boxSizing: "border-box",
  },

  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "14px",
    fontSize: "14px",
    color: "#cbd5e1",
  },

  actionsRow: {
    marginTop: "16px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },

  primaryButton: {
    border: "1px solid #2563eb",
    background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
  },

  messageSuccess: {
    background: "#0f172a",
    border: "1px solid #1f3b2a",
    color: "#86efac",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: 700,
  },

  messageError: {
    background: "#2a1316",
    border: "1px solid #4b1f24",
    color: "#fecaca",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: 700,
  },

  loadingText: {
    color: "#cbd5e1",
    fontSize: "14px",
    fontWeight: 700,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },

  smallStat: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
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

  rawConfigWrap: {
    marginTop: "16px",
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: "16px",
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

  userList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  userCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "16px",
  },

  userHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  userName: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  meta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "4px",
  },

  roleBadge: {
    border: "1px solid #334155",
    background: "#111c2e",
    color: "#cbd5e1",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  deviceList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  noDevice: {
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 700,
  },

  deviceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    background: "#020617",
    border: "1px solid #172033",
    padding: "10px 12px",
    borderRadius: "12px",
    flexWrap: "wrap",
  },

  deviceName: {
    fontWeight: 700,
    color: "#f8fafc",
  },

  removeBtn: {
    background: "#7f1d1d",
    border: "1px solid #b91c1c",
    padding: "8px 10px",
    borderRadius: "8px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
  },
};