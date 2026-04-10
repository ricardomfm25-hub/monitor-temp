"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../utils/supabase/client";

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
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

    setUsers(profiles || []);
    setDevices(devicesData || []);
  }

  async function assignDevice() {
    if (!selectedUser || !selectedDevice) {
      setMessage("Seleciona utilizador e dispositivo.");
      return;
    }

    const { error } = await supabase
      .from("device_access")
      .insert({
        user_id: selectedUser,
        device_id: selectedDevice,
        can_view: true,
        can_edit: canEdit,
      });

    if (error) {
      setMessage("Erro ao atribuir device.");
      return;
    }

    setMessage("Acesso atribuído com sucesso.");
    loadData();
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Admin Panel</h1>

        {/* USERS */}
        <section style={styles.card}>
          <h2 style={styles.subtitle}>Utilizadores</h2>

          {users.map((user) => (
            <div key={user.id} style={styles.userRow}>
              <div>
                <strong>{user.full_name}</strong>
                <div style={styles.meta}>{user.email}</div>
              </div>
              <div style={styles.meta}>{user.role}</div>
            </div>
          ))}
        </section>

        {/* ASSIGN DEVICE */}
        <section style={styles.card}>
          <h2 style={styles.subtitle}>Atribuir dispositivo</h2>

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

          <button onClick={assignDevice} style={styles.button}>
            Atribuir
          </button>

          {message && <p style={styles.message}>{message}</p>}
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    padding: "20px",
    color: "#fff",
  },
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "800",
  },
  subtitle: {
    marginBottom: "10px",
  },
  card: {
    background: "#111827",
    padding: "20px",
    borderRadius: "16px",
    border: "1px solid #1f2937",
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
  },
  meta: {
    fontSize: "12px",
    color: "#94a3b8",
  },
  input: {
    width: "100%",
    marginBottom: "10px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  button: {
    padding: "10px",
    background: "#2563eb",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontWeight: "700",
    cursor: "pointer",
  },
  message: {
    marginTop: "10px",
    color: "#22c55e",
  },
};