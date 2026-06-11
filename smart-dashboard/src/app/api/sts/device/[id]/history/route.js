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
      .select("*")
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
        device_status: row.device_status,
        alarm_ack: row.alarm_ack,
        alarm_ack_count:
          row.alarm_ack_count === null || row.alarm_ack_count === undefined
            ? null
            : Number(row.alarm_ack_count),
        alarm_ack_time: row.alarm_ack_time,
        alarm_ack_age_s:
          row.alarm_ack_age_s === null || row.alarm_ack_age_s === undefined
            ? null
            : Number(row.alarm_ack_age_s),
        alarm_event_count:
          row.alarm_event_count === null || row.alarm_event_count === undefined
            ? null
            : Number(row.alarm_event_count),
        alarm_event_time: row.alarm_event_time,
        alarm_event_age_s:
          row.alarm_event_age_s === null || row.alarm_event_age_s === undefined
            ? null
            : Number(row.alarm_event_age_s),
        alarm_mask:
          row.alarm_mask === null || row.alarm_mask === undefined
            ? null
            : Number(row.alarm_mask),
        alarm_reason: row.alarm_reason,
        telemetry_seq:
          row.telemetry_seq === null || row.telemetry_seq === undefined
            ? null
            : Number(row.telemetry_seq),
        sample_age_s:
          row.sample_age_s === null || row.sample_age_s === undefined
            ? null
            : Number(row.sample_age_s),
        sample_epoch:
          row.sample_epoch === null || row.sample_epoch === undefined
            ? null
            : Number(row.sample_epoch),
        delivery_attempts:
          row.delivery_attempts === null || row.delivery_attempts === undefined
            ? null
            : Number(row.delivery_attempts),
        offline_captured: Boolean(row.offline_captured),
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
