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

function FieldHelp({ children }) {
  return <div style={styles.fieldHelp}>{children}</div>;
}

function ConfigField({ label, help, children }) {
  return (
    <div style={styles.configField}>
      <div style={styles.configFieldLabel}>{label}</div>
      {children}
      <FieldHelp>{help}</FieldHelp>
    </div>
  );
}

function TogglePill({ checked, onClick, label, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.togglePill,
        ...(checked ? styles.togglePillActive : styles.togglePillInactive),
        ...(disabled ? styles.disabledButton : {}),
      }}
    >
      {label}
    </button>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceAccess, setDeviceAccess] = useState([]);
  const [alertRecipients, setAlertRecipients] = useState([]);
  const [profile, setProfile] = useState(null);

  const [deviceSearch, setDeviceSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClientRole, setSelectedClientRole] = useState("viewer");

  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "viewer",
  });

  const [accessUserId, setAccessUserId] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const [deviceForm, setDeviceForm] = useState({
    name: "",
    location: "",
    temp_low_c: "",
    temp_high_c: "",
    hum_low: "",
    hum_high: "",
    hyst_c: "",
    send_interval_s: "",
    display_standby_min: "",
  });

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [creatingUser, setCreatingUser] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [savingAlertKey, setSavingAlertKey] = useState("");
  const [savingUserRole, setSavingUserRole] = useState(false);
  const [savingUserActive, setSavingUserActive] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  const nonAdminUsers = useMemo(
    () => users.filter((u) => u.role !== "super_admin"),
    [users]
  );

  const filteredDevices = useMemo(() => {
    const search = deviceSearch.trim().toLowerCase();
    if (!search) return devices;

    return devices.filter((device) => {
      const haystack = [
        device.device_id,
        device.name,
        device.location,
        device.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [devices, deviceSearch]);

  const selectedDeviceData = useMemo(
    () => devices.find((d) => d.device_id === selectedDevice) || null,
    [devices, selectedDevice]
  );

  const selectedDeviceAccesses = useMemo(() => {
    if (!selectedDevice) return [];
    return deviceAccess.filter((row) => row.device_id === selectedDevice);
  }, [deviceAccess, selectedDevice]);

  const selectedDeviceClients = useMemo(() => {
    return selectedDeviceAccesses
      .map((access) => {
        const user = users.find((u) => u.id === access.user_id);
        if (!user || user.role === "super_admin") return null;
        return {
          ...user,
          access,
        };
      })
      .filter(Boolean);
  }, [selectedDeviceAccesses, users]);

  const filteredSelectedDeviceClients = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return selectedDeviceClients;

    return selectedDeviceClients.filter((client) => {
      const haystack = [client.full_name, client.email, client.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [selectedDeviceClients, clientSearch]);

  const selectedClient = useMemo(
    () => users.find((u) => u.id === selectedClientId) || null,
    [users, selectedClientId]
  );

  useEffect(() => {
    loadData({ showLoader: true });
  }, []);

  useEffect(() => {
    if (!selectedDeviceData) {
      setDeviceForm({
        name: "",
        location: "",
        temp_low_c: "",
        temp_high_c: "",
        hum_low: "",
        hum_high: "",
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
      temp_low_c: toInputValue(config.temp_low_c),
      temp_high_c: toInputValue(config.temp_high_c),
      hum_low: toInputValue(config.hum_low),
      hum_high: toInputValue(config.hum_high),
      hyst_c: toInputValue(config.hyst_c),
      send_interval_s: toInputValue(config.send_interval_s),
      display_standby_min: toInputValue(config.display_standby_min),
    });
  }, [selectedDeviceData]);

  useEffect(() => {
    if (!selectedClient) {
      setSelectedClientRole("viewer");
      return;
    }
    setSelectedClientRole(selectedClient.role || "viewer");
  }, [selectedClient]);

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
        { data: alertData, error: alertError },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("devices").select("*").order("device_id"),
        supabase.from("device_access").select("*"),
        supabase
          .from("device_alert_recipients")
          .select("*")
          .order("device_id")
          .order("email"),
      ]);

      if (profileError) throw profileError;
      if (profilesError) throw profilesError;
      if (devicesError) throw devicesError;
      if (accessError) throw accessError;
      if (alertError) throw alertError;

      if (!profileData || profileData.role !== "super_admin") {
        router.replace("/");
        return;
      }

      const safeUsers = profiles || [];
      const safeDevices = devicesData || [];
      const safeAccesses = accessData || [];

      setProfile(profileData);
      setUsers(safeUsers);
      setDevices(safeDevices);
      setDeviceAccess(safeAccesses);
      setAlertRecipients(alertData || []);

      let nextSelectedDevice = selectedDevice;
      if (!nextSelectedDevice && safeDevices.length > 0) {
        nextSelectedDevice = safeDevices[0].device_id;
        setSelectedDevice(nextSelectedDevice);
      } else if (
        nextSelectedDevice &&
        !safeDevices.some((d) => d.device_id === nextSelectedDevice)
      ) {
        nextSelectedDevice = safeDevices[0]?.device_id || "";
        setSelectedDevice(nextSelectedDevice);
      }

      const deviceUsers = safeAccesses
        .filter((row) => row.device_id === nextSelectedDevice)
        .map((row) => row.user_id);

      if (!selectedClientId && deviceUsers.length > 0) {
        setSelectedClientId(deviceUsers[0]);
      } else if (
        selectedClientId &&
        !safeUsers.some((u) => u.id === selectedClientId)
      ) {
        setSelectedClientId(deviceUsers[0] || "");
      } else if (
        selectedClientId &&
        nextSelectedDevice &&
        !deviceUsers.includes(selectedClientId)
      ) {
        setSelectedClientId(deviceUsers[0] || "");
      }

      if (!accessUserId && safeUsers.some((u) => u.role !== "super_admin")) {
        const firstUser = safeUsers.find((u) => u.role !== "super_admin");
        setAccessUserId(firstUser?.id || "");
      } else if (
        accessUserId &&
        !safeUsers.some((u) => u.id === accessUserId)
      ) {
        const firstUser = safeUsers.find((u) => u.role !== "super_admin");
        setAccessUserId(firstUser?.id || "");
      }
    } catch (error) {
      setMessage(error?.message || "Erro ao carregar dados de administração.");
      setMessageType("error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function getUserAlertRow(userId, deviceId) {
    return (
      alertRecipients.find(
        (row) => row.user_id === userId && row.device_id === deviceId
      ) || null
    );
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

  async function updateSelectedClientRole() {
    if (!selectedClient) {
      setMessage("Seleciona um cliente deste dispositivo.");
      setMessageType("error");
      return;
    }

    if (!["viewer", "client_admin"].includes(selectedClientRole)) {
      setMessage("Role inválido.");
      setMessageType("error");
      return;
    }

    setSavingUserRole(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          role: selectedClientRole,
        })
        .eq("id", selectedClient.id);

      if (error) throw error;

      setMessage("Role atualizada com sucesso.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro ao atualizar role.");
      setMessageType("error");
    } finally {
      setSavingUserRole(false);
    }
  }

  async function toggleSelectedClientActive() {
    if (!selectedClient) {
      setMessage("Seleciona um cliente deste dispositivo.");
      setMessageType("error");
      return;
    }

    setSavingUserActive(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_active: !selectedClient.is_active,
        })
        .eq("id", selectedClient.id);

      if (error) throw error;

      setMessage(
        !selectedClient.is_active
          ? "Utilizador reativado com sucesso."
          : "Utilizador desativado com sucesso."
      );
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro ao atualizar estado do utilizador.");
      setMessageType("error");
    } finally {
      setSavingUserActive(false);
    }
  }

  async function deleteSelectedClient() {
    if (!selectedClient) {
      setMessage("Seleciona um cliente deste dispositivo.");
      setMessageType("error");
      return;
    }

    const confirmed = window.confirm(
      `Remover totalmente o utilizador "${selectedClient.full_name}"?\n\nEsta ação vai apagar:\n- login\n- perfil\n- acessos a dispositivos\n- preferências de alertas\n\nNão pode ser revertida.`
    );

    if (!confirmed) return;

    setDeletingUser(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: selectedClient.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "Erro ao remover utilizador.");
        setMessageType("error");
        return;
      }

      setMessage("Utilizador removido totalmente com sucesso.");
      setMessageType("success");
      setSelectedClientId("");
      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro ao remover utilizador.");
      setMessageType("error");
    } finally {
      setDeletingUser(false);
    }
  }

  async function assignDevice() {
    if (!accessUserId || !selectedDevice) {
      setMessage("Seleciona utilizador e dispositivo.");
      setMessageType("error");
      return;
    }

    setSavingAccess(true);
    setMessage("");

    try {
      const existing = deviceAccess.find(
        (row) => row.user_id === accessUserId && row.device_id === selectedDevice
      );

      if (existing) {
        const { error } = await supabase
          .from("device_access")
          .update({
            can_view: true,
            can_edit: canEdit,
          })
          .eq("user_id", accessUserId)
          .eq("device_id", selectedDevice);

        if (error) throw error;

        setMessage("Acesso atualizado com sucesso.");
        setMessageType("success");
        await loadData();
        return;
      }

      const { error } = await supabase.from("device_access").insert({
        user_id: accessUserId,
        device_id: selectedDevice,
        can_view: true,
        can_edit: canEdit,
      });

      if (error) throw error;

      setMessage("Acesso atribuído com sucesso.");
      setMessageType("success");
      setSelectedClientId(accessUserId);
      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro ao atribuir ou atualizar acesso.");
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

      if (selectedClientId === userId) {
        setSelectedClientId("");
      }

      await loadData();
    } catch (error) {
      setMessage(error?.message || "Erro ao remover acesso.");
      setMessageType("error");
    }
  }

  async function toggleAlertSetting(user, deviceId, field, nextValue) {
    if (!user?.id || !deviceId) return;

    const key = `${user.id}_${deviceId}_${field}`;
    setSavingAlertKey(key);
    setMessage("");

    try {
      const existing = getUserAlertRow(user.id, deviceId);

      if (existing) {
        const { error } = await supabase
          .from("device_alert_recipients")
          .update({
            [field]: nextValue,
            email: user.email,
            name: user.full_name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const insertPayload = {
          user_id: user.id,
          device_id: deviceId,
          email: user.email,
          name: user.full_name,
          is_active: field === "is_active" ? nextValue : true,
          temp_alerts: field === "temp_alerts" ? nextValue : true,
          humidity_alerts: field === "humidity_alerts" ? nextValue : true,
          offline_alerts: field === "offline_alerts" ? nextValue : true,
          predictive_alerts: field === "predictive_alerts" ? nextValue : false,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("device_alert_recipients")
          .insert(insertPayload);

        if (error) throw error;
      }

      await loadData();
      setMessage("Preferência de alertas atualizada.");
      setMessageType("success");
    } catch (error) {
      setMessage(error?.message || "Erro ao atualizar alertas.");
      setMessageType("error");
    } finally {
      setSavingAlertKey("");
    }
  }

  async function saveDeviceConfig() {
    if (!selectedDeviceData || !selectedDevice) {
      setMessage("Seleciona um dispositivo.");
      setMessageType("error");
      return;
    }

    const values = {
      temp_low_c: parseNumber(deviceForm.temp_low_c),
      temp_high_c: parseNumber(deviceForm.temp_high_c),
      hum_low: parseNumber(deviceForm.hum_low),
      hum_high: parseNumber(deviceForm.hum_high),
      hyst_c: parseNumber(deviceForm.hyst_c),
      send_interval_s: parseNumber(deviceForm.send_interval_s),
      display_standby_min: parseNumber(deviceForm.display_standby_min),
    };

    if (
      !deviceForm.name.trim() ||
      !deviceForm.location.trim() ||
      Object.values(values).some((v) => v === null)
    ) {
      setMessage("Preenche todos os campos do dispositivo com valores válidos.");
      setMessageType("error");
      return;
    }

    if (values.temp_low_c >= values.temp_high_c) {
      setMessage("A temperatura mínima deve ser inferior à máxima.");
      setMessageType("error");
      return;
    }

    if (values.hum_low >= values.hum_high) {
      setMessage("A humidade mínima deve ser inferior à máxima.");
      setMessageType("error");
      return;
    }

    if (values.hyst_c < 0) {
      setMessage("A histerese não pode ser negativa.");
      setMessageType("error");
      return;
    }

    if (values.send_interval_s < 5) {
      setMessage("O intervalo de envio deve ser pelo menos 5 segundos.");
      setMessageType("error");
      return;
    }

    if (values.display_standby_min < 0) {
      setMessage("O standby do display não pode ser negativo.");
      setMessageType("error");
      return;
    }

    setSavingDevice(true);
    setMessage("");

    try {
      const currentConfig = selectedDeviceData.config || {};

      const newConfig = {
        ...currentConfig,
        temp_low_c: values.temp_low_c,
        temp_high_c: values.temp_high_c,
        hum_low: values.hum_low,
        hum_high: values.hum_high,
        hyst_c: values.hyst_c,
        send_interval_s: values.send_interval_s,
        display_standby_min: values.display_standby_min,
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
    } catch (error) {
      setMessage(error?.message || "Erro ao guardar configuração do dispositivo.");
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
              Gestão por dispositivo, clientes, alertas e configuração técnica
            </p>
          </div>

          <div style={styles.topActions}>
            {refreshing ? <div style={styles.refreshingText}>A atualizar...</div> : null}

            <button onClick={() => router.push("/")} style={styles.secondaryButton}>
              Dashboard
            </button>

            <button onClick={() => loadData()} style={styles.secondaryButton}>
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

        <div style={styles.topGrid}>
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
                value={accessUserId}
                onChange={(e) => setAccessUserId(e.target.value)}
                style={styles.input}
              >
                <option value="">Selecionar utilizador</option>
                {nonAdminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={
                  selectedDeviceData
                    ? `${selectedDeviceData.name || selectedDeviceData.device_id} (${selectedDeviceData.device_id})`
                    : ""
                }
                style={styles.input}
                disabled
                placeholder="Seleciona primeiro um dispositivo"
              />
            </div>

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={canEdit}
                onChange={() => setCanEdit((prev) => !prev)}
              />
              <span>Permitir edição de configurações</span>
            </label>

            <div style={styles.actionsRow}>
              <button
                onClick={assignDevice}
                style={styles.primaryButton}
                disabled={savingAccess || !selectedDevice}
              >
                {savingAccess ? "A guardar..." : "Atribuir acesso"}
              </button>
            </div>
          </section>
        </div>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Selecionar dispositivo</div>

          <div style={styles.devicePickerGrid}>
            <div style={styles.devicePickerLeft}>
              <input
                type="text"
                placeholder="Pesquisar dispositivo, localização ou ID"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                style={styles.input}
              />

              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                style={styles.input}
              >
                <option value="">Selecionar dispositivo</option>
                {filteredDevices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.name ? `${d.name} (${d.device_id})` : d.device_id}
                  </option>
                ))}
              </select>

              <div style={styles.deviceQuickList}>
                {filteredDevices.length === 0 ? (
                  <div style={styles.emptyStateSmall}>Nenhum dispositivo encontrado.</div>
                ) : (
                  filteredDevices.map((d) => (
                    <button
                      key={d.device_id}
                      type="button"
                      onClick={() => setSelectedDevice(d.device_id)}
                      style={{
                        ...styles.deviceQuickItem,
                        ...(selectedDevice === d.device_id
                          ? styles.deviceQuickItemActive
                          : {}),
                      }}
                    >
                      <div style={styles.deviceQuickName}>
                        {d.name || d.device_id}
                      </div>
                      <div style={styles.deviceQuickMeta}>
                        {d.device_id} · {d.location || "Sem localização"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={styles.devicePickerRight}>
              {!selectedDeviceData ? (
                <div style={styles.emptyState}>
                  Seleciona um dispositivo para veres o resumo.
                </div>
              ) : (
                <div style={styles.selectedDeviceCard}>
                  <div style={styles.selectedDeviceTop}>
                    <div>
                      <div style={styles.selectedDeviceName}>
                        {selectedDeviceData.name || selectedDeviceData.device_id}
                      </div>
                      <div style={styles.meta}>
                        {selectedDeviceData.device_id}
                      </div>
                    </div>

                    <div style={styles.statusBadgeNeutral}>
                      {selectedDeviceData.status || "Sem estado"}
                    </div>
                  </div>

                  <div style={styles.selectedDeviceStats}>
                    <SmallStat
                      label="Localização"
                      value={selectedDeviceData.location || "-"}
                    />
                    <SmallStat
                      label="Última temperatura"
                      value={formatValue(
                        selectedDeviceData.last_temperature,
                        " °C"
                      )}
                    />
                    <SmallStat
                      label="Última humidade"
                      value={formatValue(
                        selectedDeviceData.last_humidity,
                        " %"
                      )}
                    />
                    <SmallStat
                      label="Last seen"
                      value={formatDateTime(selectedDeviceData.last_seen)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Cliente do dispositivo</div>

          {!selectedDevice ? (
            <div style={styles.emptyState}>
              Seleciona primeiro um dispositivo.
            </div>
          ) : (
            <div style={styles.clientSectionGrid}>
              <div style={styles.clientListPanel}>
                <input
                  type="text"
                  placeholder="Pesquisar cliente por nome ou email"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  style={styles.input}
                />

                {filteredSelectedDeviceClients.length === 0 ? (
                  <div style={styles.emptyStateSmall}>
                    Nenhum cliente encontrado para este dispositivo.
                  </div>
                ) : (
                  <div style={styles.clientCardList}>
                    {filteredSelectedDeviceClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setSelectedClientId(client.id)}
                        style={{
                          ...styles.clientCard,
                          ...(selectedClientId === client.id
                            ? styles.clientCardActive
                            : {}),
                        }}
                      >
                        <div style={styles.clientCardTop}>
                          <div>
                            <div style={styles.clientCardName}>
                              {client.full_name}
                            </div>
                            <div style={styles.clientCardMeta}>
                              {client.email}
                            </div>
                          </div>

                          <div
                            style={{
                              ...styles.miniStatusBadge,
                              ...(client.is_active
                                ? styles.miniStatusBadgeActive
                                : styles.miniStatusBadgeInactive),
                            }}
                          >
                            {client.is_active ? "Ativo" : "Inativo"}
                          </div>
                        </div>

                        <div style={styles.clientCardBottom}>
                          <span style={styles.mutedTag}>{client.role}</span>
                          <span style={styles.mutedTag}>
                            {client.access?.can_edit ? "Com edição" : "Só leitura"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.clientDetailsPanel}>
                {!selectedClient ? (
                  <div style={styles.emptyState}>
                    Seleciona um cliente para gerir o utilizador e os alertas.
                  </div>
                ) : (
                  <>
                    <div style={styles.clientDetailsHeader}>
                      <div>
                        <div style={styles.selectedUserName}>
                          {selectedClient.full_name}
                        </div>
                        <div style={styles.meta}>{selectedClient.email}</div>
                      </div>

                      <div style={styles.clientActionRow}>
                        <button
                          onClick={toggleSelectedClientActive}
                          style={styles.smallActionButton}
                          disabled={savingUserActive}
                        >
                          {savingUserActive
                            ? "A atualizar..."
                            : selectedClient.is_active
                            ? "Desativar"
                            : "Reativar"}
                        </button>

                        <button
                          onClick={deleteSelectedClient}
                          style={styles.smallDangerButton}
                          disabled={deletingUser}
                        >
                          {deletingUser ? "A remover..." : "Remover"}
                        </button>
                      </div>
                    </div>

                    <div style={styles.clientMiniStats}>
                      <SmallStat label="Role atual" value={selectedClient.role} />
                      <SmallStat
                        label="Estado"
                        value={selectedClient.is_active ? "Ativo" : "Inativo"}
                      />
                      <SmallStat
                        label="Permissão"
                        value={
                          selectedDeviceClients.find((c) => c.id === selectedClient.id)
                            ?.access?.can_edit
                            ? "Com edição"
                            : "Só leitura"
                        }
                      />
                    </div>

                    <div style={styles.compactPanel}>
                      <div style={styles.compactPanelTitle}>Role</div>
                      <div style={styles.inlineControls}>
                        <select
                          value={selectedClientRole}
                          onChange={(e) => setSelectedClientRole(e.target.value)}
                          style={styles.input}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="client_admin">Client Admin</option>
                        </select>

                        <button
                          onClick={updateSelectedClientRole}
                          style={styles.primaryButton}
                          disabled={savingUserRole}
                        >
                          {savingUserRole ? "A guardar..." : "Guardar"}
                        </button>
                      </div>
                    </div>

                    <div style={styles.compactPanel}>
                      <div style={styles.compactPanelTitle}>Alertas</div>
                      {(() => {
                        const alertRow = getUserAlertRow(selectedClient.id, selectedDevice);
                        const savingPrefix = `${selectedClient.id}_${selectedDevice}_`;

                        return (
                          <>
                            <div style={styles.toggleWrap}>
                              <TogglePill
                                checked={Boolean(alertRow?.is_active)}
                                onClick={() =>
                                  toggleAlertSetting(
                                    selectedClient,
                                    selectedDevice,
                                    "is_active",
                                    !Boolean(alertRow?.is_active)
                                  )
                                }
                                label={`Receber alertas: ${
                                  alertRow?.is_active ? "Sim" : "Não"
                                }`}
                              />

                              <TogglePill
                                checked={Boolean(alertRow?.temp_alerts)}
                                onClick={() =>
                                  toggleAlertSetting(
                                    selectedClient,
                                    selectedDevice,
                                    "temp_alerts",
                                    !Boolean(alertRow?.temp_alerts)
                                  )
                                }
                                label="Temperatura"
                                disabled={!alertRow?.is_active}
                              />

                              <TogglePill
                                checked={Boolean(alertRow?.humidity_alerts)}
                                onClick={() =>
                                  toggleAlertSetting(
                                    selectedClient,
                                    selectedDevice,
                                    "humidity_alerts",
                                    !Boolean(alertRow?.humidity_alerts)
                                  )
                                }
                                label="Humidade"
                                disabled={!alertRow?.is_active}
                              />

                              <TogglePill
                                checked={Boolean(alertRow?.offline_alerts)}
                                onClick={() =>
                                  toggleAlertSetting(
                                    selectedClient,
                                    selectedDevice,
                                    "offline_alerts",
                                    !Boolean(alertRow?.offline_alerts)
                                  )
                                }
                                label="Offline"
                                disabled={!alertRow?.is_active}
                              />

                              <TogglePill
                                checked={Boolean(alertRow?.predictive_alerts)}
                                onClick={() =>
                                  toggleAlertSetting(
                                    selectedClient,
                                    selectedDevice,
                                    "predictive_alerts",
                                    !Boolean(alertRow?.predictive_alerts)
                                  )
                                }
                                label="Preditivo"
                                disabled={!alertRow?.is_active}
                              />
                            </div>

                            {savingAlertKey.startsWith(savingPrefix) ? (
                              <div style={styles.savingHint}>
                                A guardar preferências...
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>

                    <div style={styles.compactPanel}>
                      <div style={styles.compactPanelTitle}>Acesso ao dispositivo</div>
                      <div style={styles.inlineControls}>
                        <button
                          style={styles.removeBtn}
                          onClick={() =>
                            removeAccess(selectedClient.id, selectedDevice)
                          }
                        >
                          Remover acesso
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Configuração do dispositivo</div>

          {!selectedDeviceData ? (
            <div style={styles.emptyState}>
              Seleciona um dispositivo para editar a configuração.
            </div>
          ) : (
            <>
              <div style={styles.configSectionTitle}>Identificação</div>
              <div style={styles.configGrid}>
                <ConfigField
                  label="Nome do dispositivo"
                  help="Nome apresentado na dashboard, emails e área administrativa."
                >
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
                  />
                </ConfigField>

                <ConfigField
                  label="Localização"
                  help="Descrição do local físico onde o dispositivo está instalado."
                >
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
                  />
                </ConfigField>
              </div>

              <div style={styles.configSectionTitle}>Limites de temperatura</div>
              <div style={styles.configGrid}>
                <ConfigField
                  label="Temperatura mínima (°C)"
                  help="Abaixo deste valor, o sistema entra em alerta de temperatura baixa."
                >
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Temp. mínima"
                    value={deviceForm.temp_low_c}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        temp_low_c: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>

                <ConfigField
                  label="Temperatura máxima (°C)"
                  help="Acima deste valor, o sistema entra em alerta de temperatura alta."
                >
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Temp. máxima"
                    value={deviceForm.temp_high_c}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        temp_high_c: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>
              </div>

              <div style={styles.configSectionTitle}>Limites de humidade</div>
              <div style={styles.configGrid}>
                <ConfigField
                  label="Humidade mínima (%)"
                  help="Abaixo deste valor, o sistema entra em alerta de humidade baixa."
                >
                  <input
                    type="number"
                    step="1"
                    placeholder="Humidade mínima"
                    value={deviceForm.hum_low}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        hum_low: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>

                <ConfigField
                  label="Humidade máxima (%)"
                  help="Acima deste valor, o sistema entra em alerta de humidade alta."
                >
                  <input
                    type="number"
                    step="1"
                    placeholder="Humidade máxima"
                    value={deviceForm.hum_high}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        hum_high: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>
              </div>

              <div style={styles.configSectionTitle}>Parâmetros técnicos</div>
              <div style={styles.configGrid}>
                <ConfigField
                  label="Histerese (°C)"
                  help="Margem para evitar alertas repetidos quando o valor anda muito perto do limite."
                >
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Histerese"
                    value={deviceForm.hyst_c}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        hyst_c: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>

                <ConfigField
                  label="Intervalo de envio (s)"
                  help="Tempo entre cada envio de leitura do dispositivo para o backend."
                >
                  <input
                    type="number"
                    step="1"
                    placeholder="Intervalo de envio"
                    value={deviceForm.send_interval_s}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        send_interval_s: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>

                <ConfigField
                  label="Standby do display (min)"
                  help="Minutos até o ecrã entrar em standby para poupança de energia."
                >
                  <input
                    type="number"
                    step="1"
                    placeholder="Standby display"
                    value={deviceForm.display_standby_min}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        display_standby_min: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </ConfigField>
              </div>

              <div style={styles.actionsRow}>
                <button
                  onClick={saveDeviceConfig}
                  style={styles.primaryButton}
                  disabled={savingDevice}
                >
                  {savingDevice ? "A guardar..." : "Guardar dispositivo"}
                </button>
              </div>
            </>
          )}
        </section>

        {selectedDeviceData ? (
          <section style={styles.card}>
            <div style={styles.cardTitle}>Informação técnica do dispositivo</div>

            <div style={styles.statsGrid}>
              <SmallStat label="Device ID" value={selectedDeviceData.device_id || "-"} />
              <SmallStat label="Nome" value={selectedDeviceData.name || "-"} />
              <SmallStat label="Localização" value={selectedDeviceData.location || "-"} />
              <SmallStat label="Config version" value={selectedDeviceData.config_version ?? "-"} />
              <SmallStat label="Atualizada em" value={formatDateTime(selectedDeviceData.updated_at)} />
              <SmallStat label="Last seen" value={formatDateTime(selectedDeviceData.last_seen)} />
              <SmallStat label="Status raw" value={selectedDeviceData.status || "-"} />
              <SmallStat
                label="Última temp."
                value={formatValue(selectedDeviceData.last_temperature, " °C")}
              />
              <SmallStat
                label="Última hum."
                value={formatValue(selectedDeviceData.last_humidity, " %")}
              />
            </div>
          </section>
        ) : null}

        {selectedDeviceData ? (
          <section style={styles.card}>
            <div style={styles.cardTitle}>Configuração raw</div>

            <div style={styles.rawConfigWrap}>
              <pre style={styles.rawConfig}>
                {JSON.stringify(selectedDeviceData.config || {}, null, 2)}
              </pre>
            </div>
          </section>
        ) : null}
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
    maxWidth: "1360px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
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
    fontSize: "30px",
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

  topGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
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

  smallActionButton: {
    border: "1px solid #475569",
    background: "#0f172a",
    color: "#e2e8f0",
    borderRadius: "10px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  },

  smallDangerButton: {
    border: "1px solid #b91c1c",
    background: "#7f1d1d",
    color: "#fff",
    borderRadius: "10px",
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  },

  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "20px",
    padding: "18px",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 800,
    marginBottom: "12px",
    color: "#f8fafc",
  },

  loadingText: {
    color: "#cbd5e1",
    fontSize: "14px",
    fontWeight: 700,
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

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },

  actionsRow: {
    marginTop: "14px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },

  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "14px",
    fontSize: "14px",
    color: "#cbd5e1",
  },

  emptyState: {
    background: "#0f172a",
    border: "1px dashed #334155",
    color: "#94a3b8",
    borderRadius: "16px",
    padding: "18px",
    fontSize: "14px",
  },

  emptyStateSmall: {
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  devicePickerGrid: {
    display: "grid",
    gridTemplateColumns: "390px 1fr",
    gap: "16px",
  },

  devicePickerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  devicePickerRight: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  deviceQuickList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "330px",
    overflowY: "auto",
    paddingRight: "4px",
  },

  deviceQuickItem: {
    textAlign: "left",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "12px",
    padding: "11px 12px",
    cursor: "pointer",
    color: "#e5edf7",
  },

  deviceQuickItemActive: {
    border: "1px solid #3b82f6",
    background: "#132033",
    boxShadow: "0 0 0 1px rgba(59,130,246,0.25) inset",
  },

  deviceQuickName: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  deviceQuickMeta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "4px",
  },

  selectedDeviceCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "16px",
  },

  selectedDeviceTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  selectedDeviceName: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  selectedDeviceStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
  },

  statusBadgeNeutral: {
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
    background: "#111c2e",
    border: "1px solid #334155",
    color: "#cbd5e1",
  },

  clientSectionGrid: {
    display: "grid",
    gridTemplateColumns: "370px 1fr",
    gap: "16px",
    alignItems: "start",
  },

  clientListPanel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  clientCardList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "420px",
    overflowY: "auto",
    paddingRight: "4px",
  },

  clientCard: {
    textAlign: "left",
    background: "#0b1220",
    border: "1px solid #223047",
    borderRadius: "12px",
    padding: "12px",
    cursor: "pointer",
    color: "#e5edf7",
  },

  clientCardActive: {
    border: "1px solid #3b82f6",
    background: "#132033",
    boxShadow: "0 0 0 1px rgba(59,130,246,0.25) inset",
  },

  clientCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
  },

  clientCardName: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  clientCardMeta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "3px",
  },

  clientCardBottom: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "10px",
  },

  mutedTag: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#cbd5e1",
    border: "1px solid #334155",
    background: "#111c2e",
    borderRadius: "999px",
    padding: "5px 8px",
  },

  miniStatusBadge: {
    borderRadius: "999px",
    padding: "5px 8px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  miniStatusBadgeActive: {
    background: "#0f3b22",
    border: "1px solid #22c55e",
    color: "#bbf7d0",
  },

  miniStatusBadgeInactive: {
    background: "#3f1d1d",
    border: "1px solid #ef4444",
    color: "#fecaca",
  },

  clientDetailsPanel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  clientDetailsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
  },

  clientActionRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  selectedUserName: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  clientMiniStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "10px",
  },

  compactPanel: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "14px",
  },

  compactPanelTitle: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#e2e8f0",
    marginBottom: "10px",
  },

  inlineControls: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
  },

  smallStat: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "14px",
    minWidth: 0,
  },

  smallStatLabel: {
    fontSize: "12px",
    color: "#8fa1b9",
    fontWeight: 700,
    marginBottom: "7px",
  },

  smallStatValue: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  alertsBoxLarge: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "14px",
  },

  toggleWrap: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  togglePill: {
    borderRadius: "999px",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },

  togglePillActive: {
    background: "#0f3b22",
    border: "1px solid #22c55e",
    color: "#bbf7d0",
  },

  togglePillInactive: {
    background: "#1f2937",
    border: "1px solid #334155",
    color: "#cbd5e1",
  },

  savingHint: {
    marginTop: "10px",
    fontSize: "12px",
    color: "#93c5fd",
    fontWeight: 700,
  },

  configSectionTitle: {
    marginTop: "18px",
    marginBottom: "12px",
    fontSize: "14px",
    fontWeight: 800,
    color: "#cbd5e1",
    letterSpacing: "0.02em",
  },

  configGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "14px",
  },

  configField: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "14px",
  },

  configFieldLabel: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#e2e8f0",
    marginBottom: "10px",
  },

  fieldHelp: {
    fontSize: "12px",
    color: "#8fa1b9",
    lineHeight: 1.5,
    marginTop: "8px",
  },

  rawConfigWrap: {
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: "14px",
    padding: "16px",
    overflow: "hidden",
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

  meta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "4px",
  },
};