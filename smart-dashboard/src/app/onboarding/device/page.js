"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).replace(",", ".");
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric;
}

function toInputValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return String(value);
}

function OnboardingDevicePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const deviceId = searchParams.get("device_id") || "";

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [device, setDevice] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("neutral");

  const [form, setForm] = useState({
    name: "",
    location: "",
    temp_low_c: "",
    temp_high_c: "",
    hum_low: "",
    hum_high: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        if (!deviceId) {
          throw new Error("Dispositivo inválido.");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.replace(`/login?next=${encodeURIComponent(`/onboarding/device?device_id=${deviceId}`)}`);
          return;
        }

        if (!isMounted) return;
        setUser(session.user);

        const { data: accessData, error: accessError } = await supabase
          .from("device_access")
          .select("id, can_view, can_edit")
          .eq("user_id", session.user.id)
          .eq("device_id", deviceId)
          .maybeSingle();

        if (accessError) {
          throw new Error("Não foi possível validar o acesso ao dispositivo.");
        }

        if (!accessData?.can_view) {
          throw new Error("Não tens acesso a este dispositivo.");
        }

        const { data: deviceData, error: deviceError } = await supabase
          .from("devices")
          .select("*")
          .eq("device_id", deviceId)
          .maybeSingle();

        if (deviceError) {
          throw new Error("Não foi possível carregar o dispositivo.");
        }

        if (!deviceData) {
          throw new Error("Dispositivo não encontrado.");
        }

        if (!isMounted) return;

        const config = deviceData.config || {};

        setDevice(deviceData);
        setForm({
          name: deviceData.name || "",
          location: deviceData.location || "",
          temp_low_c: toInputValue(config.temp_low_c ?? 17),
          temp_high_c: toInputValue(config.temp_high_c ?? 25),
          hum_low: toInputValue(config.hum_low ?? 50),
          hum_high: toInputValue(config.hum_high ?? 80),
        });

        setChecking(false);
      } catch (error) {
        if (!isMounted) return;
        setMessage(error?.message || "Erro ao carregar onboarding.");
        setMessageType("error");
        setChecking(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [supabase, router, deviceId]);

  async function handleSave() {
    if (saving || !device) return;

    const tempLow = parseNumber(form.temp_low_c);
    const tempHigh = parseNumber(form.temp_high_c);
    const humLow = parseNumber(form.hum_low);
    const humHigh = parseNumber(form.hum_high);

    if (
      !form.name.trim() ||
      !form.location.trim() ||
      tempLow === null ||
      tempHigh === null ||
      humLow === null ||
      humHigh === null
    ) {
      setMessage("Preenche todos os campos com valores válidos.");
      setMessageType("error");
      return;
    }

    if (tempLow >= tempHigh) {
      setMessage("A temperatura mínima deve ser inferior à máxima.");
      setMessageType("error");
      return;
    }

    if (humLow >= humHigh) {
      setMessage("A humidade mínima deve ser inferior à máxima.");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType("neutral");

    try {
      const currentConfig = device.config || {};

      const newConfig = {
        ...currentConfig,
        temp_low_c: tempLow,
        temp_high_c: tempHigh,
        hum_low: humLow,
        hum_high: humHigh,
      };

      const { error } = await supabase
        .from("devices")
        .update({
          name: form.name.trim(),
          location: form.location.trim(),
          config: newConfig,
          config_version: Number(device?.config_version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", device.device_id);

      if (error) {
        throw new Error("Não foi possível guardar a configuração inicial.");
      }

      setMessage("Configuração concluída com sucesso.");
      setMessageType("success");

      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 700);
    } catch (error) {
      setMessage(
        error?.message || "Ocorreu um erro ao guardar a configuração."
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.statusWrap}>
            <div style={styles.spinner} />
            <p style={styles.subtitle}>A preparar configuração do dispositivo...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.badge}>Smart Temp Systems</div>
          <h1 style={styles.title}>Configuração inicial</h1>
          <p style={styles.subtitle}>
            Finaliza a configuração do dispositivo antes de entrar na dashboard
          </p>
        </div>

        {device ? (
          <div style={styles.deviceBox}>
            <div style={styles.deviceBoxTitle}>
              {device.name || device.device_id}
            </div>
            <div style={styles.deviceBoxMeta}>{device.device_id}</div>
          </div>
        ) : null}

        <div style={styles.form}>
          <div style={styles.gridTwo}>
            <div style={styles.field}>
              <label style={styles.label}>Nome do dispositivo</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                style={styles.input}
                placeholder="Ex: Frigorífico principal"
                disabled={saving}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Localização</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, location: e.target.value }))
                }
                style={styles.input}
                placeholder="Ex: Cozinha"
                disabled={saving}
              />
            </div>
          </div>

          <div style={styles.gridTwo}>
            <div style={styles.field}>
              <label style={styles.label}>Temperatura mínima (°C)</label>
              <input
                type="number"
                step="0.1"
                value={form.temp_low_c}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, temp_low_c: e.target.value }))
                }
                style={styles.input}
                disabled={saving}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Temperatura máxima (°C)</label>
              <input
                type="number"
                step="0.1"
                value={form.temp_high_c}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, temp_high_c: e.target.value }))
                }
                style={styles.input}
                disabled={saving}
              />
            </div>
          </div>

          <div style={styles.gridTwo}>
            <div style={styles.field}>
              <label style={styles.label}>Humidade mínima (%)</label>
              <input
                type="number"
                step="1"
                value={form.hum_low}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, hum_low: e.target.value }))
                }
                style={styles.input}
                disabled={saving}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Humidade máxima (%)</label>
              <input
                type="number"
                step="1"
                value={form.hum_high}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, hum_high: e.target.value }))
                }
                style={styles.input}
                disabled={saving}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            style={{
              ...styles.button,
              ...(saving ? styles.buttonDisabled : {}),
            }}
            disabled={saving}
          >
            {saving ? "A guardar..." : "Concluir configuração"}
          </button>

          {message ? (
            <div
              style={
                messageType === "success"
                  ? styles.success
                  : messageType === "error"
                  ? styles.error
                  : styles.info
              }
            >
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function OnboardingDevicePage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <div style={styles.card}>
            <div style={styles.statusWrap}>
              <div style={styles.spinner} />
              <p style={styles.subtitle}>A carregar...</p>
            </div>
          </div>
        </main>
      }
    >
      <OnboardingDevicePageContent />
    </Suspense>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #162235 0%, #0b1220 45%, #060c16 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    color: "#f8fafc",
  },
  card: {
    width: "100%",
    maxWidth: "760px",
    background: "rgba(17, 24, 39, 0.94)",
    border: "1px solid #1f2937",
    borderRadius: "24px",
    padding: "28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },
  header: {
    marginBottom: "22px",
  },
  badge: {
    display: "inline-block",
    marginBottom: "10px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#93c5fd",
    background: "rgba(37, 99, 235, 0.12)",
    border: "1px solid rgba(59, 130, 246, 0.25)",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: "8px 0 0 0",
    color: "#94a3b8",
    fontSize: "14px",
  },
  deviceBox: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "18px",
  },
  deviceBoxTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
    marginBottom: "6px",
  },
  deviceBoxMeta: {
    fontSize: "13px",
    color: "#94a3b8",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },
  label: {
    fontSize: "12px",
    color: "#8fa1b9",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
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
  button: {
    border: "1px solid #2563eb",
    background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
    transition: "0.2s ease",
    marginTop: "4px",
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  error: {
    color: "#fca5a5",
    fontSize: "13px",
    fontWeight: 700,
    background: "rgba(127, 29, 29, 0.18)",
    border: "1px solid rgba(248, 113, 113, 0.25)",
    padding: "10px 12px",
    borderRadius: "12px",
  },
  success: {
    color: "#86efac",
    fontSize: "13px",
    fontWeight: 700,
    background: "rgba(20, 83, 45, 0.22)",
    border: "1px solid rgba(34, 197, 94, 0.25)",
    padding: "10px 12px",
    borderRadius: "12px",
  },
  info: {
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: 700,
    background: "rgba(30, 41, 59, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    padding: "10px 12px",
    borderRadius: "12px",
  },
  statusWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "18px 0",
  },
  spinner: {
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    border: "3px solid #1e293b",
    borderTop: "3px solid #60a5fa",
    animation: "spin 1s linear infinite",
  },
};