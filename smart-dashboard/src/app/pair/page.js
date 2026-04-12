"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

function PairPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const initialCode = (searchParams.get("code") || "").trim().toUpperCase();

  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState(initialCode);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [devicePreview, setDevicePreview] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("neutral");

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!session?.user) {
          const next = `/pair${initialCode ? `?code=${encodeURIComponent(initialCode)}` : ""}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }

        setUser(session.user);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error("Não foi possível carregar o perfil.");
        }

        if (!profileData) {
          throw new Error("O utilizador não tem perfil criado.");
        }

        if (!profileData.is_active) {
          throw new Error("O utilizador está inativo.");
        }

        setProfile(profileData);
        setCheckingSession(false);
      } catch (error) {
        if (!isMounted) return;
        setMessage(error?.message || "Erro ao verificar sessão.");
        setMessageType("error");
        setCheckingSession(false);
      }
    }

    boot();

    return () => {
      isMounted = false;
    };
  }, [supabase, router, initialCode]);

  useEffect(() => {
    let isMounted = true;

    async function loadDevicePreview() {
      const code = pairingCode.trim().toUpperCase();

      if (!code || checkingSession) {
        setDevicePreview(null);
        return;
      }

      const { data, error } = await supabase
        .from("devices")
        .select("device_id, name, location, pairing_code, pairing_status")
        .eq("pairing_code", code)
        .maybeSingle();

      if (!isMounted) return;

      if (error || !data) {
        setDevicePreview(null);
        return;
      }

      setDevicePreview(data);
    }

    loadDevicePreview();

    return () => {
      isMounted = false;
    };
  }, [pairingCode, checkingSession, supabase]);

  const canPair =
    profile?.role === "super_admin" || profile?.role === "client_admin";

  async function handlePair() {
    if (loading) return;

    const code = pairingCode.trim().toUpperCase();

    if (!code) {
      setMessage("Introduz um código válido.");
      setMessageType("error");
      return;
    }

    if (!user) {
      setMessage("Sessão inválida. Inicia sessão novamente.");
      setMessageType("error");
      return;
    }

    if (!canPair) {
      setMessage("Só administradores podem associar dispositivos.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("neutral");

    try {
      const { data: deviceData, error: deviceError } = await supabase
        .from("devices")
        .select("*")
        .eq("pairing_code", code)
        .maybeSingle();

      if (deviceError) {
        throw new Error("Erro ao validar o dispositivo.");
      }

      if (!deviceData) {
        throw new Error("Código de associação inválido.");
      }

      if (String(deviceData.pairing_status || "").toLowerCase() === "assigned") {
        throw new Error("Este dispositivo já foi associado.");
      }

      const { data: existingAccess, error: accessCheckError } = await supabase
        .from("device_access")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_id", deviceData.device_id)
        .maybeSingle();

      if (accessCheckError) {
        throw new Error("Erro ao verificar acessos existentes.");
      }

      if (!existingAccess) {
        const { error: insertAccessError } = await supabase
          .from("device_access")
          .insert({
            user_id: user.id,
            device_id: deviceData.device_id,
            can_view: true,
            can_edit: true,
          });

        if (insertAccessError) {
          throw new Error("Erro ao criar acesso ao dispositivo.");
        }
      }

      const { error: updateDeviceError } = await supabase
        .from("devices")
        .update({
          pairing_status: "assigned",
          paired_at: new Date().toISOString(),
          paired_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", deviceData.device_id);

      if (updateDeviceError) {
        throw new Error("Erro ao finalizar a associação do dispositivo.");
      }

      setMessage("Dispositivo associado com sucesso.");
      setMessageType("success");

      setTimeout(() => {
        router.replace(
          `/onboarding/device?device_id=${encodeURIComponent(deviceData.device_id)}`
        );
        router.refresh();
      }, 700);
    } catch (error) {
      setMessage(error?.message || "Não foi possível associar o dispositivo.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.statusWrap}>
            <div style={styles.spinner} />
            <p style={styles.subtitle}>A verificar sessão...</p>
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
          <h1 style={styles.title}>Associar dispositivo</h1>
          <p style={styles.subtitle}>
            Lê o QR Code ou introduz o código de associação
          </p>
        </div>

        <div style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="pairingCode" style={styles.label}>
              Código do dispositivo
            </label>
            <input
              id="pairingCode"
              type="text"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              style={styles.input}
              placeholder="STS-ABC123"
              disabled={loading}
            />
          </div>

          {devicePreview ? (
            <div style={styles.previewCard}>
              <div style={styles.previewTitle}>
                {devicePreview.name || devicePreview.device_id}
              </div>
              <div style={styles.previewMeta}>{devicePreview.device_id}</div>
              <div style={styles.previewMeta}>
                {devicePreview.location || "Localização por definir"}
              </div>
              <div style={styles.previewMeta}>
                Estado pairing: {devicePreview.pairing_status || "unassigned"}
              </div>
            </div>
          ) : (
            <div style={styles.previewCardMuted}>
              Introduz ou lê um código válido para pré-visualizar o dispositivo.
            </div>
          )}

          <button
            type="button"
            onClick={handlePair}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
              ...(!canPair ? styles.buttonDisabled : {}),
            }}
            disabled={loading || !canPair}
          >
            {loading ? "A associar..." : "Associar dispositivo"}
          </button>

          {!canPair ? (
            <div style={styles.warn}>
              O teu perfil não tem permissão para associar dispositivos.
            </div>
          ) : null}

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

          <button
            type="button"
            onClick={() => router.push("/")}
            style={styles.secondaryButton}
          >
            Voltar à dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

export default function PairPage() {
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
      <PairPageContent />
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
    maxWidth: "520px",
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
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
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
  previewCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "16px",
    padding: "14px",
  },
  previewCardMuted: {
    background: "#0f172a",
    border: "1px dashed #334155",
    borderRadius: "16px",
    padding: "14px",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 700,
  },
  previewTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f8fafc",
    marginBottom: "8px",
  },
  previewMeta: {
    fontSize: "13px",
    color: "#94a3b8",
    marginBottom: "4px",
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
  },
  secondaryButton: {
    border: "1px solid #334155",
    background: "#111c2e",
    color: "#cbd5e1",
    borderRadius: "12px",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "14px",
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
  warn: {
    color: "#fcd34d",
    fontSize: "13px",
    fontWeight: 700,
    background: "rgba(120, 53, 15, 0.18)",
    border: "1px solid rgba(245, 158, 11, 0.25)",
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