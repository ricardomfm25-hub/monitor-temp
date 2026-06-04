export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createClient } from "@/utils/supabase/server";

function getBackendUrl() {
  return process.env.STS_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

function getBackendToken() {
  return process.env.STS_BACKEND_API_TOKEN || "";
}

async function getDeviceIdFromRequest(request, context) {
  const params = await context.params;
  const fromParams = params?.id;
  if (fromParams) return fromParams;

  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const index = parts.findIndex((p) => p === "device");
  if (index >= 0 && parts[index + 1]) return parts[index + 1];

  return null;
}

async function requireDeviceAccess(supabase, deviceId) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, error: "Erro ao validar perfil." };
  }

  if (!profile || !profile.is_active) {
    return { ok: false, status: 403, error: "Utilizador sem acesso ativo." };
  }

  if (profile.role === "super_admin") return { ok: true };

  const { data: access, error: accessError } = await supabase
    .from("device_access")
    .select("can_view")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (accessError) {
    return { ok: false, status: 500, error: "Erro ao validar acesso." };
  }

  if (!access?.can_view) {
    return { ok: false, status: 403, error: "Sem permissão para este dispositivo." };
  }

  return { ok: true };
}

export async function GET(request, context) {
  try {
    const supabase = await createClient();
    const deviceId = await getDeviceIdFromRequest(request, context);

    if (!deviceId) {
      return Response.json({ error: "Device ID em falta." }, { status: 400 });
    }

    const access = await requireDeviceAccess(supabase, deviceId);
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const period = request.nextUrl.searchParams.get("period") || "24h";
    const backendUrl = getBackendUrl();
    const token = getBackendToken();

    const res = await fetch(
      `${backendUrl}/api/device/${encodeURIComponent(deviceId)}/report?period=${encodeURIComponent(period)}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: token } : {},
      }
    );

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok || contentType.includes("application/json")) {
      const text = await res.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { error: text || "Resposta invalida do backend." };
      }

      return Response.json(data || { error: "Nao foi possivel gerar o relatorio." }, { status: res.status });
    }

    const bytes = await res.arrayBuffer();

    return new Response(bytes, {
      status: res.status,
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="${deviceId}_relatorio_${period}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro na API report:", error);
    return Response.json({ error: "Erro interno ao gerar relatorio." }, { status: 500 });
  }
}
