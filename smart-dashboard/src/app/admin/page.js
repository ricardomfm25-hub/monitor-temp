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

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserRole, setSelectedUserRole] = useState("viewer");

  const [selectedDevice, setSelectedDevice] = useState("");
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

  const selectedDeviceData = useMemo(
    () => devices.find((d) => d.device_id === selectedDevice) || null,
    [devices, selectedDevice]
  );

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const selectedUserAccesses = useMemo(() => {
    if (!selectedUserId) return [];
    return deviceAccess.filter((row) => row.user_id === selectedUserId);
  }, [deviceAccess, selectedUserId]);

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
    if (selectedUser) {
      setSelectedUserRole(selectedUser.role || "viewer");
      setAccessUserId(selectedUser.id);
    } else {
      setSelectedUserRole("viewer");
      if (!selectedUserId) setAccessUserId("");
    }
  }, [selectedUser, selectedUserId]);

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

      const safeDevices = devicesData || [];
      const safeUsers = profiles || [];

      setProfile(profileData);
      setUsers(safeUsers);
      setDevices(safeDevices);
      setDeviceAccess(accessData || []);
      setAlertRecipients(alertData || []);

      if (!selectedDevice && safeDevices.length > 0) {
        setSelectedDevice(safeDevices[0].device_id);
      } else if (
        selectedDevice &&
        !safeDevices.some((d) => d.device_id === selectedDevice)
      ) {
        setSelectedDevice(safeDevices[0]?.device_id || "");
      }

      if (!selectedUserId && safeUsers.some((u) => u.role !== "super_admin")) {
        const firstUser = safeUsers.find((u) => u.role !== "super_admin");
        setSelectedUserId(firstUser?.id || "");
      } else if (
        selectedUserId &&
        !safeUsers.some((u) => u.id === selectedUserId)
      ) {
        const firstUser = safeUsers.find((u) => u.role !== "super_admin");
        setSelectedUserId(firstUser?.id || "");
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

  async function updateSelectedUserRole() {
    if (!selectedUser) {
      setMessage("Seleciona um utilizador.");
      setMessageType("error");
      return;
    }

    if (!["viewer", "client_admin"].includes(selectedUserRole)) {
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
          role: selectedUserRole,
        })
        .eq("id", selectedUser.id);

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

  async function toggleSelectedUserActive() {
    if (!selectedUser) {
      setMessage("Seleciona um utilizador.");
      setMessageType("error");
      return;
    }

    setSavingUserActive(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_active: !selectedUser.is_active,
        })
        .eq("id", selectedUser.id);

      if (error) throw error;

      setMessage(
        !selectedUser.is_active
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

  async function deleteSelectedUser() {
    if (!selectedUser) {
      setMessage("Seleciona um utilizador.");
      setMessageType("error");
      return;
    }

    const confirmed = window.confirm(
      `Remover totalmente o utilizador "${selectedUser.full_name}"?\n\nEsta ação vai apagar:\n- login\n- perfil\n- acessos a dispositivos\n- preferências de alertas\n\nNão pode ser revertida.`
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
          user_id: selectedUser.id,
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
      setSelectedUserId("");
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
              Gestão de utilizadores, acessos, alertas e configuração técnica dos dispositivos
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

        <section style={styles.card}>
          <div style={styles.cardTitle}>Gestão de utilizador</div>
          <div style={styles.cardDescription}>
            Seleciona um utilizador para gerir role, estado e remoção total da conta.
          </div>

          <div style={styles.userManagerGrid}>
            <div style={styles.userManagerLeft}>
              <div style={styles.sectionLabel}>Selecionar utilizador</div>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={styles.input}
              >
                <option value="">Selecionar utilizador</option>
                {nonAdminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>

              <div style={styles.userQuickList}>
                {nonAdminUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    style={{
                      ...styles.userQuickItem,
                      ...(selectedUserId === u.id
                        ? styles.userQuickItemActive
                        : {}),
                    }}
                  >
                    <div style={styles.userQuickName}>{u.full_name}</div>
                    <div style={styles.userQuickMeta}>
                      {u.email} · {u.role} · {u.is_active ? "ativo" : "inativo"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.userManagerRight}>
              {!selectedUser ? (
                <div style={styles.emptyState}>
                  Seleciona um utilizador para veres e editares os detalhes.
                </div>
              ) : (
                <>
                  <div style={styles.selectedUserCard}>
                    <div style={styles.selectedUserTop}>
                      <div>
                        <div style={styles.selectedUserName}>
                          {selectedUser.full_name}
                        </div>
                        <div style={styles.meta}>{selectedUser.email}</div>
                      </div>

                      <div
                        style={{
                          ...styles.statusBadge,
                          ...(selectedUser.is_active
                            ? styles.statusBadgeActive
                            : styles.statusBadgeInactive),
                        }}
                      >
                        {selectedUser.is_active ? "Ativo" : "Inativo"}
                      </div>
                    </div>

                    <div style={styles.selectedUserDetails}>
                      <SmallStat label="Role atual" value={selectedUser.role} />
                      <SmallStat
                        label="Criado em"
                        value={formatDateTime(selectedUser.created_at)}
                      />
                      <SmallStat
                        label="User ID"
                        value={selectedUser.id}
                      />
                    </div>
                  </div>

                  <div style={styles.inlinePanel}>
                    <div style={styles.sectionLabel}>Alterar role</div>
                    <div style={styles.inlineControls}>
                      <select
                        value={selectedUserRole}
                        onChange={(e) => setSelectedUserRole(e.target.value)}
                        style={styles.input}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="client_admin">Client Admin</option>
                      </select>

                      <button
                        onClick={updateSelectedUserRole}
                        style={styles.primaryButton}
                        disabled={savingUserRole}
                      >
                        {savingUserRole ? "A guardar..." : "Guardar role"}
                      </button>
                    </div>
                  </div>

                  <div style={styles.inlinePanel}>
                    <div style={styles.sectionLabel}>Estado do utilizador</div>
                    <div style={styles.inlineControls}>
                      <button
                        onClick={toggleSelectedUserActive}
                        style={
                          selectedUser.is_active
                            ? styles.warningButton
                            : styles.successButton
                        }
                        disabled={savingUserActive}
                      >
                        {savingUserActive
                          ? "A atualizar..."
                          : selectedUser.is_active
                          ? "Desativar utilizador"
                          : "Reativar utilizador"}
                      </button>
                    </div>
                  </div>

                  <div style={styles.inlinePanelDanger}>
                    <div style={styles.sectionLabelDanger}>Zona de remoção</div>
                    <div style={styles.dangerText}>
                      Remove totalmente o utilizador, incluindo login, perfil,
                      acessos e preferências de alertas.
                    </div>
                    <div style={styles.inlineControls}>
                      <button
                        onClick={deleteSelectedUser}
                        style={styles.dangerButton}
                        disabled={deletingUser}
                      >
                        {deletingUser ? "A remover..." : "Remover Utilizador"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <div style={styles.twoColGrid}>
          <section style={styles.card}>
            <div style={styles.cardTitle}>Criar utilizador</div>
            <div style={styles.cardDescription}>
              Cria um novo utilizador cliente para futura associação a dispositivos.
            </div>

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
            <div style={styles.cardDescription}>
              Liga um utilizador a um dispositivo e define se pode editar configurações.
            </div>

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
              <span>Permitir edição de configurações</span>
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
        </div>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Acessos e alertas do utilizador selecionado</div>
          <div style={styles.cardDescription}>
            Para o utilizador escolhido no topo, gere os dispositivos atribuídos e os tipos de alerta por email.
          </div>

          {!selectedUser ? (
            <div style={styles.emptyState}>
              Seleciona um utilizador no topo para veres os acessos e os alertas.
            </div>
          ) : selectedUserAccesses.length === 0 ? (
            <div style={styles.emptyState}>
              Este utilizador ainda não tem dispositivos atribuídos.
            </div>
          ) : (
            <div style={styles.deviceList}>
              {selectedUserAccesses.map((access) => {
                const device = devices.find((d) => d.device_id === access.device_id);
                const alertRow = getUserAlertRow(selectedUser.id, access.device_id);
                const savingPrefix = `${selectedUser.id}_${access.device_id}_`;

                return (
                  <div
                    key={`${access.user_id}-${access.device_id}`}
                    style={styles.deviceAccessCard}
                  >
                    <div style={styles.deviceAccessTop}>
                      <div>
                        <div style={styles.deviceName}>
                          {device?.name || access.device_id}
                        </div>
                        <div style={styles.meta}>
                          {access.device_id} ·{" "}
                          {access.can_edit ? "Com edição" : "Só leitura"}
                        </div>
                      </div>

                      <button
                        style={styles.removeBtn}
                        onClick={() =>
                          removeAccess(access.user_id, access.device_id)
                        }
                      >
                        Remover acesso
                      </button>
                    </div>

                    <div style={styles.alertsBox}>
                      <div style={styles.alertsTitle}>Alertas por email</div>
                      <div style={styles.alertsSubtitle}>
                        Define exatamente que notificações este utilizador recebe para este dispositivo.
                      </div>

                      <div style={styles.toggleWrap}>
                        <TogglePill
                          checked={Boolean(alertRow?.is_active)}
                          onClick={() =>
                            toggleAlertSetting(
                              selectedUser,
                              access.device_id,
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
                              selectedUser,
                              access.device_id,
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
                              selectedUser,
                              access.device_id,
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
                              selectedUser,
                              access.device_id,
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
                              selectedUser,
                              access.device_id,
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
                          A guardar preferências de alertas...
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.cardTitle}>Configuração do dispositivo</div>
          <div style={styles.cardDescription}>
            Ajusta os limites operacionais e parâmetros técnicos do dispositivo selecionado.
          </div>

          <div style={styles.configTopRow}>
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
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
                disabled={!selectedDevice}
              />
            </ConfigField>
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
            <div style={styles.cardDescription}>
              Estado atual e dados principais do dispositivo selecionado.
            </div>

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
            <div style={styles.cardDescription}>
              Vista técnica completa do objeto de configuração atual do dispositivo.
            </div>

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
    maxWidth: "1320px",
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

  twoColGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "20px",
  },

  userManagerGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
    gap: "20px",
  },

  userManagerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },

  userManagerRight: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },

  sectionLabel: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#cbd5e1",
  },

  sectionLabelDanger: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#fecaca",
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

  successButton: {
    border: "1px solid #15803d",
    background: "#14532d",
    color: "#dcfce7",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
  },

  warningButton: {
    border: "1px solid #b45309",
    background: "#78350f",
    color: "#fde68a",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
  },

  dangerButton: {
    border: "1px solid #dc2626",
    background: "#7f1d1d",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
  },

  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "22px",
    padding: "22px",
  },

  cardTitle: {
    fontSize: "19px",
    fontWeight: 800,
    marginBottom: "8px",
    color: "#f8fafc",
  },

  cardDescription: {
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.5,
    marginBottom: "16px",
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

  emptyState: {
    background: "#0f172a",
    border: "1px dashed #334155",
    color: "#94a3b8",
    borderRadius: "16px",
    padding: "18px",
    fontSize: "14px",
  },

  userQuickList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "420px",
    overflowY: "auto",
    paddingRight: "4px",
  },

  userQuickItem: {
    textAlign: "left",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "12px 14px",
    cursor: "pointer",
    color: "#e5edf7",
  },

  userQuickItemActive: {
    border: "1px solid #3b82f6",
    background: "#132033",
    boxShadow: "0 0 0 1px rgba(59,130,246,0.25) inset",
  },

  userQuickName: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  userQuickMeta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "5px",
  },

  selectedUserCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "18px",
    padding: "18px",
  },

  selectedUserTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  selectedUserName: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  selectedUserDetails: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },

  statusBadge: {
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  statusBadgeActive: {
    background: "#0f3b22",
    border: "1px solid #22c55e",
    color: "#bbf7d0",
  },

  statusBadgeInactive: {
    background: "#3f1d1d",
    border: "1px solid #ef4444",
    color: "#fecaca",
  },

  inlinePanel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  inlinePanelDanger: {
    background: "#2a1316",
    border: "1px solid #4b1f24",
    borderRadius: "16px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  dangerText: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#fecaca",
  },

  inlineControls: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
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

  configTopRow: {
    marginBottom: "18px",
    maxWidth: "420px",
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
    borderRadius: "16px",
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
    borderRadius: "16px",
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

  deviceList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  deviceAccessCard: {
    background: "#020617",
    border: "1px solid #172033",
    padding: "14px",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },

  deviceAccessTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
  },

  deviceName: {
    fontWeight: 800,
    color: "#f8fafc",
    fontSize: "15px",
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

  alertsBox: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: "14px",
    padding: "14px",
  },

  alertsTitle: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#f8fafc",
  },

  alertsSubtitle: {
    fontSize: "12px",
    color: "#8fa1b9",
    marginTop: "6px",
    marginBottom: "12px",
    lineHeight: 1.45,
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

  meta: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "4px",
  },
};