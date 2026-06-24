import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUMERIC_FIELDS = [
  "temp_low_c",
  "temp_high_c",
  "hum_low",
  "hum_high",
  "hyst_c",
  "hyst_hum",
  "send_interval_s",
  "display_standby_min",
];

const MIN_SEND_INTERVAL_SECONDS = 5;
const MAX_SEND_INTERVAL_SECONDS = 60;

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeConfig(config = {}) {
  return {
    ...config,
    temp_low_c: parseNumber(config.temp_low_c) ?? 18,
    temp_high_c: parseNumber(config.temp_high_c) ?? 25,
    hum_low: parseNumber(config.hum_low) ?? 30,
    hum_high: parseNumber(config.hum_high) ?? 60,
    hyst_c: parseNumber(config.hyst_c) ?? 0.5,
    hyst_hum: parseNumber(config.hyst_hum) ?? 2,
    send_interval_s: Math.min(
      Math.max(parseNumber(config.send_interval_s) ?? 30, MIN_SEND_INTERVAL_SECONDS),
      MAX_SEND_INTERVAL_SECONDS
    ),
    display_standby_min: parseNumber(config.display_standby_min) ?? 10,
  };
}

function sanitizeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

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

  if (profile.role === "super_admin") {
    return { ok: true, user, profile, canEdit: true };
  }

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

function validateConfig(config) {
  const errors = [];

  if (config.temp_low_c >= config.temp_high_c) {
    errors.push("A temperatura mínima deve ser inferior à máxima.");
  }

  if (config.hum_low >= config.hum_high) {
    errors.push("A humidade mínima deve ser inferior à máxima.");
  }

  if (config.hyst_c < 0 || config.hyst_hum < 0) {
    errors.push("A histerese não pode ser negativa.");
  }

  if (
    config.send_interval_s < MIN_SEND_INTERVAL_SECONDS ||
    config.send_interval_s > MAX_SEND_INTERVAL_SECONDS
  ) {
    errors.push(
      `O intervalo de envio deve estar entre ${MIN_SEND_INTERVAL_SECONDS} e ${MAX_SEND_INTERVAL_SECONDS} segundos.`
    );
  }

  if (config.display_standby_min < 0) {
    errors.push("O standby do display não pode ser negativo.");
  }

  return errors;
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
    const { data: device, error } = await supabase
      .from("devices")
      .select("device_id, name, location, config, config_version, updated_at")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) throw error;
    if (!device) {
      return Response.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    return Response.json({
      device_id: device.device_id,
      name: device.name || deviceId,
      location: device.location || "Localização por definir",
      config: normalizeConfig(device.config || {}),
      config_version: device.config_version ?? 1,
      updated_at: device.updated_at || null,
      can_edit: access.canEdit,
    });
  } catch (error) {
    console.error("Erro na API config GET:", error);
    return Response.json(
      { error: "Erro interno ao carregar configuração." },
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Payload inválido." }, { status: 400 });
    }

    const { data: device, error: fetchError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!device) {
      return Response.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    const nextConfig = normalizeConfig(device.config || {});

    for (const field of NUMERIC_FIELDS) {
      if (body[field] !== undefined) {
        const numeric = parseNumber(body[field]);
        if (numeric === null) {
          return Response.json(
            { error: `Valor inválido em ${field}.` },
            { status: 400 }
          );
        }
        nextConfig[field] = numeric;
      }
    }

    const validationErrors = validateConfig(nextConfig);
    if (validationErrors.length) {
      return Response.json({ error: validationErrors.join(" ") }, { status: 400 });
    }

    const payload = {
      config: {
        ...(device.config || {}),
        ...nextConfig,
      },
      config_version: Number(device.config_version || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      payload.name = sanitizeText(body.name, deviceId);
    }

    if (body.location !== undefined) {
      payload.location = sanitizeText(body.location, "Localização por definir");
    }

    const { data: updated, error: updateError } = await supabase
      .from("devices")
      .update(payload)
      .eq("device_id", deviceId)
      .select("device_id, name, location, config, config_version, updated_at")
      .single();

    if (updateError) throw updateError;

    return Response.json({
      message: "Configuração atualizada com sucesso.",
      device_id: updated.device_id,
      name: updated.name || deviceId,
      location: updated.location || "Localização por definir",
      config: normalizeConfig(updated.config || {}),
      config_version: updated.config_version,
      updated_at: updated.updated_at,
    });
  } catch (error) {
    console.error("Erro na API config POST:", error);
    return Response.json(
      { error: "Erro interno ao guardar configuração." },
      { status: 500 }
    );
  }
}
