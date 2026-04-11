"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceAccess, setDeviceAccess] = useState([]);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "viewer",
  });

  const [message, setMessage] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: profiles }, { data: devicesData }, { data: accessData }] =
      await Promise.all([
        supabase.from("profiles").select("*").order("email"),
        supabase.from("devices").select("*").order("device_id"),
        supabase.from("device_access").select("*"),
      ]);

    setUsers(profiles || []);
    setDevices(devicesData || []);
    setDeviceAccess(accessData || []);
  }

  async function assignDevice() {
    if (!selectedUser || !selectedDevice) {
      setMessage("Seleciona utilizador e dispositivo.");
      return;
    }

    setSavingAccess(true);
    setMessage("");

    const existing = deviceAccess.find(
      (row) =>
        row.user_id === selectedUser && row.device_id === selectedDevice
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

      if (error) {
        setMessage("Erro ao atualizar acesso.");
        setSavingAccess(false);
        return;
      }

      setMessage("Acesso atualizado com sucesso.");
      await loadData();
      setSavingAccess(false);
      return;
    }

    const { error } = await supabase.from("device_access").insert({
      user_id: selectedUser,
      device_id: selectedDevice,
      can_view: true,
      can_edit: canEdit,
    });

    if (error) {
      setMessage("Erro ao atribuir acesso.");
      setSavingAccess(false);
      return;
    }

    setMessage("Acesso atribuído com sucesso.");
    await loadData();
    setSavingAccess(false);
  }

  async function removeAccess(userId, deviceId) {
    setMessage("");

    const { error } = await supabase
      .from("device_access")
      .delete()
      .eq("user_id", userId)
      .eq("device_id", deviceId);

    if (error) {
      setMessage("Erro ao remover acesso.");
      return;
    }

    setMessage("Acesso removido.");
    await loadData();
  }

  async function createUser() {
    const full_name = newUser.full_name.trim();
    const email = newUser.email.trim().toLowerCase();
    const password = newUser.password;
    const role = newUser.role;

    if (!full_name || !email || !password) {
      setMessage("Preenche nome, email e password.");
      return;
    }

    setCreatingUser(true);
    setMessage("");

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
      setCreatingUser(false);
      return;
    }

    setMessage("Utilizador criado com sucesso.");
    setNewUser({
      full_name: "",
      email: "",
      password: "",
      role: "viewer",
    });

    await loadData();
    setCreatingUser(false);
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Admin Panel</h1>
          <p style={styles.subtitle}>
            Gestão de utilizadores e acessos aos dispositivos
          </p>
        </div>

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

        {message ? <div style={styles.message}>{message}</div> : null}

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
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
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

  message: {
    background: "#0f172a",
    border: "1px solid #1f3b2a",
    color: "#86efac",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: 700,
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