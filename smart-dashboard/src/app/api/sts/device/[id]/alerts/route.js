import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getDeviceId(context) {
  const params = await context.params;
  return params?.id ? decodeURIComponent(params.id) : null;
}

async function requireDeviceAccess(supabase, deviceId, { requireEdit = false } = {}) {
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

  if (profile.role === "super_admin") return { ok: true, user, profile, canEdit: true };

  const { data: access, error: accessError } = await supabase
    .from("device_access")
    .select("can_view, can_edit")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (accessError) {
    return { ok: false, status: 500, error: "Erro ao validar acesso." };
  }

  if (!access?.can_view || (requireEdit && !access?.can_edit)) {
    return { ok: false, status: 403, error: "Sem permissão para este dispositivo." };
  }

  return { ok: true, user, profile, canEdit: Boolean(access.can_edit) };
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

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeConfig(config = {}) {
  const alertState = config.alert_state || {};
  return {
    ...config,
    temp_low_c: parseNumber(config.temp_low_c) ?? 18,
    temp_high_c: parseNumber(config.temp_high_c) ?? 25,
    hum_low: parseNumber(config.hum_low) ?? 30,
    hum_high: parseNumber(config.hum_high) ?? 60,
    alert_state: {
      ...alertState,
      temp_active: Boolean(alertState.temp_active),
      hum_active: Boolean(alertState.hum_active),
      offline_active: Boolean(alertState.offline_active),
    },
  };
}

function isCurrentReadingInsideLimits(device, config) {
  const temp = parseNumber(device?.last_temperature);
  const hum = parseNumber(device?.last_humidity);
  if (temp === null || hum === null) return false;

  return (
    temp >= config.temp_low_c &&
    temp <= config.temp_high_c &&
    hum >= config.hum_low &&
    hum <= config.hum_high
  );
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
    const hoursParam = Number(_request.nextUrl.searchParams.get("hours") || 24);
    const hours = Number.isFinite(hoursParam)
      ? Math.min(Math.max(hoursParam, 1), 24 * 30)
      : 24;
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("device_id", deviceId)
      .or(`sent_at.gte.${sinceIso},created_at.gte.${sinceIso}`)
      .order("sent_at", { ascending: false })
      .limit(500);

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

export async function POST(request, context) {
  const supabase = await createClient();
  const deviceId = await getDeviceId(context);

  if (!deviceId) {
    return Response.json({ error: "Device ID em falta." }, { status: 400 });
  }

  const access = await requireDeviceAccess(supabase, deviceId, { requireEdit: true });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const note = String(body?.note || "Regularizacao manual pelo operador.").slice(0, 240);

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceError) throw deviceError;
    if (!device) {
      return Response.json({ error: "Dispositivo nao encontrado." }, { status: 404 });
    }

    const config = normalizeConfig(device.config || {});
    const nowIso = new Date().toISOString();
    const nextConfig = {
      ...(device.config || {}),
      alert_state: {
        ...config.alert_state,
        temp_active: false,
        hum_active: false,
        offline_active: false,
        temp_last_resolved_at: nowIso,
        hum_last_resolved_at: nowIso,
        offline_last_resolved_at: nowIso,
      },
    };

    const insideLimits = isCurrentReadingInsideLimits(device, config);
    const updatePayload = {
      config: nextConfig,
      updated_at: nowIso,
      status: insideLimits ? "NORMAL" : "ALARM_ACK",
    };

    const { error: updateError } = await supabase
      .from("devices")
      .update(updatePayload)
      .eq("device_id", deviceId);

    if (updateError) throw updateError;

    const { error: insertError } = await supabase.from("alerts").insert([
      {
        device_id: deviceId,
        type: "system",
        event: "resolved",
        title: "Alertas regularizados manualmente",
        message: note,
        temperature: device.last_temperature ?? null,
        humidity: device.last_humidity ?? null,
        sent_at: nowIso,
      },
    ]);

    if (insertError) throw insertError;

    return Response.json({
      message: "Alertas ativos regularizados com sucesso.",
      alert_state: nextConfig.alert_state,
      status: updatePayload.status,
    });
  } catch (error) {
    console.error("Erro na API alerts POST:", error);
    return Response.json(
      { error: "Erro interno ao regularizar alertas." },
      { status: 500 }
    );
  }
}
