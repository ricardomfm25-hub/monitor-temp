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

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "sim"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  }
  return false;
}

function parseLimit(request) {
  const value = Number(request.nextUrl.searchParams.get("limit") || 2000);
  if (!Number.isFinite(value)) return 2000;
  return Math.min(Math.max(Math.floor(value), 1), 25000);
}

function parseHours(request) {
  const value = Number(request.nextUrl.searchParams.get("hours"));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, 24 * 7);
}

async function fetchHistoryRows(supabase, deviceId, request) {
  const limit = parseLimit(request);
  const hours = parseHours(request);
  const ascending = hours !== null;
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize, limit) - 1;
    let query = supabase
      .from("readings")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending })
      .range(from, to);

    if (hours !== null) {
      query = query.gte(
        "created_at",
        new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < to - from + 1) break;
  }

  return ascending ? rows : rows.reverse();
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
    const data = await fetchHistoryRows(supabase, deviceId, request);

    const history = (data || [])
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
        exterior_temperature:
          row.exterior_temperature === null || row.exterior_temperature === undefined
            ? null
            : Number(row.exterior_temperature),
        exterior_humidity:
          row.exterior_humidity === null || row.exterior_humidity === undefined
            ? null
            : Number(row.exterior_humidity),
        exterior_sensor_ok: toBoolean(row.exterior_sensor_ok),
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
        wifi_rssi:
          row.wifi_rssi === null || row.wifi_rssi === undefined
            ? null
            : Number(row.wifi_rssi),
        post_ok_count:
          row.post_ok_count === null || row.post_ok_count === undefined
            ? null
            : Number(row.post_ok_count),
        post_fail_count:
          row.post_fail_count === null || row.post_fail_count === undefined
            ? null
            : Number(row.post_fail_count),
        buffer_count:
          row.buffer_count === null || row.buffer_count === undefined
            ? null
            : Number(row.buffer_count),
        wifi_reconnect_count:
          row.wifi_reconnect_count === null || row.wifi_reconnect_count === undefined
            ? null
            : Number(row.wifi_reconnect_count),
        last_http_status:
          row.last_http_status === null || row.last_http_status === undefined
            ? null
            : Number(row.last_http_status),
        offline_captured: toBoolean(row.offline_captured),
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
