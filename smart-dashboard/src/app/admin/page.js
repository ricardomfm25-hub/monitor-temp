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

  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("email");

    const { data: devicesData } = await supabase
      .from("devices")
      .select("*")
      .order("device_id");

    const { data: accessData } = await supabase
      .from("device_access")
      .select("*");

    setUsers(profiles || []);
    setDevices(devicesData || []);
    setDeviceAccess(accessData || []);
  }

  async function assignDevice() {
    if (!selectedUser || !selectedDevice) {
      setMessage("Seleciona utilizador e dispositivo.");
      return;
    }

    const { error } = await supabase.from("device_access").insert({
      user_id: selectedUser,
      device_id: selectedDevice,
      can_view: true,
      can_edit: canEdit,
    });

    if (error) {
      setMessage("Erro ao atribuir.");
      return;
    }

    setMessage("Acesso atribuído com sucesso.");
    loadData();
  }

  async function removeAccess(userId, deviceId) {
    const { error } = await supabase
      .from("device_access")
      .delete()
      .eq("user_id", userId)
      .eq("device_id", deviceId);

    if (error) {
      setMessage("Erro ao remover.");
      return;
    }

    setMessage("Acesso removido.");
    loadData();
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

        {/* ASSIGN */}
        <section style={styles.card}>
          <div style={styles.cardTitle}>Atribuir dispositivo</div>

          <div style={styles.form}>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={styles.input}
            >
              <option value="">Selecionar utilizador</option>
              {users.map((u) => (
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
                  {d.device_id}
                </option>
              ))}
            </select>

            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={canEdit}
                onChange={() => setCanEdit(!canEdit)}
              />
              Permitir edição
            </label>

            <button onClick={assignDevice} style={styles.primaryButton}>
              Atribuir acesso
            </button>

            {message && <div style={styles.message}>{message}</div>}
          </div>
        </section>

        {/* USERS */}
        <section style={styles.card}>
          <div style={styles.cardTitle}>Utilizadores</div>

          <div style={styles.userList}>
            {users.map((user) => {
              const accesses = deviceAccess.filter(
                (a) => a.user_id === user.id
              );

              return (
                <div key={user.id} style={styles.userCard}>
                  <div style={styles.userHeader}>
                    <div>
                      <div style={styles.userName}>
                        {user.full_name}
                      </div>
                      <div style={styles.meta}>{user.email}</div>
                    </div>

                    <div style={styles.role}>{user.role}</div>
                  </div>

                  <div style={styles.deviceList}>
                    {accesses.length === 0 && (
                      <div style={styles.noDevice}>
                        Sem dispositivos
                      </div>
                    )}

                    {accesses.map((a) => (
                      <div key={a.device_id} style={styles.deviceRow}>
                        <span>{a.device_id}</span>

                        <button
                          style={styles.removeBtn}
                          onClick={() =>
                            removeAccess(user.id, a.device_id)
                          }
                        >
                          Remover
                        </button>
                      </div>
                    ))}
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
    maxWidth: "1000px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },

  header: {
    marginBottom: "10px",
  },

  title: {
    fontSize: "28px",
    fontWeight: "800",
    margin: 0,
  },

  subtitle: {
    color: "#94a3b8",
    marginTop: "6px",
  },

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "20px",
    padding: "20px",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: "800",
    marginBottom: "14px",
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  input: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  },

  checkbox: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    fontSize: "13px",
  },

  primaryButton: {
    background: "#2563eb",
    border: "none",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: "700",
    cursor: "pointer",
    color: "#fff",
  },

  message: {
    marginTop: "10px",
    color: "#22c55e",
    fontWeight: "700",
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
    padding: "14px",
  },

  userHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
  },

  userName: {
    fontWeight: "800",
  },

  meta: {
    fontSize: "12px",
    color: "#94a3b8",
  },

  role: {
    fontSize: "12px",
    background: "#1e293b",
    padding: "6px 10px",
    borderRadius: "999px",
  },

  deviceList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  deviceRow: {
    display: "flex",
    justifyContent: "space-between",
    background: "#020617",
    padding: "8px 10px",
    borderRadius: "10px",
  },

  noDevice: {
    color: "#64748b",
    fontSize: "12px",
  },

  removeBtn: {
    background: "#ef4444",
    border: "none",
    padding: "4px 8px",
    borderRadius: "6px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "12px",
  },
};