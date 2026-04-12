"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const nextPath = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (session) {
          router.replace(nextPath);
          router.refresh();
          return;
        }

        setCheckingSession(false);
      } catch {
        if (!isMounted) return;
        setCheckingSession(false);
        setErrorMsg("Não foi possível verificar a sessão.");
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router, supabase, nextPath]);

  async function handleLogin(e) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setErrorMsg("");

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (
          error.message?.toLowerCase().includes("invalid login credentials")
        ) {
          setErrorMsg("Email ou palavra-passe incorretos.");
        } else {
          setErrorMsg("Não foi possível iniciar sessão. Tenta novamente.");
        }
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMsg("Ocorreu um erro inesperado ao iniciar sessão.");
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
          <h1 style={styles.title}>STS Dashboard</h1>
          <p style={styles.subtitle}>Entrar para aceder à monitorização</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="exemplo@empresa.com"
              disabled={loading}
              required
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>
              Palavra-passe
            </label>

            <div style={styles.passwordWrap}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.passwordInput}
                placeholder="Introduz a tua palavra-passe"
                disabled={loading}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={styles.showButton}
                disabled={loading}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
            disabled={loading}
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>

          {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
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
      <LoginPageContent />
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
    maxWidth: "430px",
    background: "rgba(17, 24, 39, 0.92)",
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
  passwordWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  passwordInput: {
    flex: 1,
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
  showButton: {
    border: "1px solid #334155",
    background: "#111c2e",
    color: "#cbd5e1",
    borderRadius: "12px",
    padding: "0 14px",
    minHeight: "44px",
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap",
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
    marginTop: "4px",
    transition: "0.2s ease",
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