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

function normalizeAlert(row, index) {
  const type = row.type || "system";
  const event = row.event || "triggered";
  let level = "normal";

  if (type === "offline" && event === "triggered") level = "alarm";
  else if (event === "triggered") level = "alert";

  return {
    id: row.id || `${row.sent_at || row.created_at || index}`,
    type,
    event,
    level,
    title: row.title || "Evento registado",
    message: row.message || "Sem detalhe adicional.",
    created_at: row.sent_at || row.created_at || null,
    sent_at: row.sent_at || row.created_at || null,
    temperature:
      row.temperature === null || row.temperature === undefined
        ? null
        : Number(row.temperature),
    humidity:
      row.humidity === null || row.humidity === undefined
        ? null
        : Number(row.humidity),
  };
}

export async function GET(_request, context) {
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
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("device_id", deviceId)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return Response.json((data || []).map(normalizeAlert));
  } catch (error) {
    console.error("Erro na API alerts:", error);
    return Response.json(
      { error: "Erro interno ao carregar alertas." },
      { status: 500 }
    );
  }
}
