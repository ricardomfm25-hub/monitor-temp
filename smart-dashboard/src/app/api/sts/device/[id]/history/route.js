import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getDeviceId(context) {
  const params = await context.params;
  return params?.id ? decodeURIComponent(params.id) : null;
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

function parseLimit(request) {
  const value = Number(request.nextUrl.searchParams.get("limit") || 2000);
  if (!Number.isFinite(value)) return 2000;
  return Math.min(Math.max(Math.floor(value), 1), 5000);
}

export async function GET(request, context) {
  const supabase = await createClient();
  const deviceId = await getDeviceId(context);

  if (!deviceId) {
    return Response.json({ error: "Device ID em falta." }, { status: 400 });
  }

  const access = await requireDeviceAccess(supabase, deviceId);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  try {
    const limit = parseLimit(request);
    const { data, error } = await supabase
      .from("readings")
      .select("temperature, humidity, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const history = (data || [])
      .reverse()
      .map((row) => ({
        created_at: row.created_at,
        timestamp: new Date(row.created_at).getTime(),
        temperature:
          row.temperature === null || row.temperature === undefined
            ? null
            : Number(row.temperature),
        humidity:
          row.humidity === null || row.humidity === undefined
            ? null
            : Number(row.humidity),
      }))
      .filter((row) => Number.isFinite(row.timestamp));

    return Response.json(history);
  } catch (error) {
    console.error("Erro na API history:", error);
    return Response.json(
      { error: "Erro interno ao carregar histórico." },
      { status: 500 }
    );
  }
}
