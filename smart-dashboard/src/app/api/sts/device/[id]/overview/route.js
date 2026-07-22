import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_CONTRACT = "sts-cold-v2";

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "sim", "ack"].includes(normalized);
  }
  return false;
}

function normalizeDeviceStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!value) return "normal";
  if (value.includes("ack")) return "alarm_ack";
  if (value.includes("sensor")) return "sensor_fail";
  if (value.includes("setup")) return "setup_wifi";
  if (value.includes("offline") || value.includes("no_wifi")) return "offline";
  if (value.includes("alarm") || value.includes("critical")) return "alarm";
  if (value.includes("alert") || value.includes("warning")) return "alert";
  if (value.includes("normal") || value.includes("online") || value.includes("ok")) {
    return "normal";
  }

  return "normal";
}

function resolveTelemetryStatus({
  online = true,
  incomingStatus,
  alarmAck = false,
  alarmMask = null,
  computedStatus = "normal",
}) {
  if (!online) return "offline";

  const normalizedIncoming = normalizeDeviceStatus(incomingStatus);
  const normalizedComputed = normalizeDeviceStatus(computedStatus);
  const numericAlarmMask = parseNumber(alarmMask);
  const hasActiveAlarmMask = numericAlarmMask !== null && numericAlarmMask > 0;
  const computedHasBreach =
    normalizedComputed === "alarm" || normalizedComputed === "alert";

  if (
    normalizedIncoming === "alarm_ack" ||
    (toBoolean(alarmAck) && (hasActiveAlarmMask || computedHasBreach))
  ) {
    return "alarm_ack";
  }

  if (
    normalizedIncoming === "sensor_fail" ||
    normalizedIncoming === "setup_wifi"
  ) {
    return normalizedIncoming;
  }

  if (hasActiveAlarmMask) return "alarm";

  if (normalizedIncoming === "alarm" && computedHasBreach) return "alarm";
  if (normalizedIncoming === "alert" && computedHasBreach) return "alert";

  return normalizedComputed;
}

function normalizeConfig(config = {}) {
  const maintenance = config.maintenance || {};
  return {
    ...config,
    temp_low_c: parseNumber(config.temp_low_c) ?? 18,
    temp_high_c: parseNumber(config.temp_high_c) ?? 25,
    hum_low: parseNumber(config.hum_low) ?? 30,
    hum_high: parseNumber(config.hum_high) ?? 60,
    hyst_c: parseNumber(config.hyst_c) ?? 0.5,
    hyst_hum: parseNumber(config.hyst_hum) ?? 2,
    send_interval_s: parseNumber(config.send_interval_s) ?? 60,
    offline_alert_after_min: parseNumber(config.offline_alert_after_min) ?? 6,
    display_standby_min: parseNumber(config.display_standby_min) ?? 10,
    maintenance: {
      active_until: maintenance.active_until || null,
      started_at: maintenance.started_at || null,
      duration_min: parseNumber(maintenance.duration_min),
      started_by: maintenance.started_by || null,
    },
  };
}

function isMaintenanceActive(config) {
  const ts = config?.maintenance?.active_until
    ? new Date(config.maintenance.active_until).getTime()
    : NaN;
  return Number.isFinite(ts) && ts > Date.now();
}

function getOfflineLimitMs(sendIntervalS, offlineAlertAfterMin) {
  const configuredMs =
    Number.isFinite(Number(offlineAlertAfterMin)) && Number(offlineAlertAfterMin) > 0
      ? Number(offlineAlertAfterMin) * 60 * 1000
      : 6 * 60 * 1000;

  const cadenceGraceMs =
    Number.isFinite(Number(sendIntervalS)) && Number(sendIntervalS) > 0
      ? Number(sendIntervalS) * 1000 * 2.5
      : 0;

  return Math.max(configuredMs, cadenceGraceMs, 180 * 1000);
}

function getCommunicationHealth(readings, config, lastSeen) {
  const expectedIntervalMs = Math.max(1, Number(config.send_interval_s || 60)) * 1000;
  const expectedReadings = Math.max(1, Math.round((24 * 60 * 60 * 1000) / expectedIntervalMs));
  const timestamps = (readings || [])
    .map((row) => new Date(row.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const gaps = timestamps.slice(1).map((value, index) => value - timestamps[index]);
  const offlineLimitMs = getOfflineLimitMs(
    config.send_interval_s,
    config.offline_alert_after_min
  );
  const maxGapMs = gaps.length ? Math.max(...gaps) : null;
  const degradedGapCount = gaps.filter(
    (gap) => gap >= Math.max(expectedIntervalMs * 3, 3 * 60 * 1000)
  ).length;
  const severeGapCount = gaps.filter((gap) => gap >= offlineLimitMs).length;
  const deliveryPct = Math.min(100, Math.round((timestamps.length / expectedReadings) * 100));
  const lastDelayMs = lastSeen ? Math.max(0, Date.now() - new Date(lastSeen).getTime()) : null;
  const degraded =
    severeGapCount > 0 ||
    degradedGapCount >= 2 ||
    (lastDelayMs !== null && lastDelayMs >= Math.min(5 * 60 * 1000, offlineLimitMs * 0.7));

  return {
    score: Math.max(0, Math.min(100, deliveryPct - degradedGapCount * 2 - severeGapCount * 8)),
    label: lastDelayMs !== null && lastDelayMs > offlineLimitMs
      ? "Offline"
      : degraded
      ? "Comunicação degradada"
      : deliveryPct >= 98
      ? "Excelente"
      : "Estável",
    tone: lastDelayMs !== null && lastDelayMs > offlineLimitMs
      ? "bad"
      : degraded
      ? "warn"
      : "good",
    delivery_pct: deliveryPct,
    expected_readings: expectedReadings,
    received_readings: timestamps.length,
    expected_interval_ms: expectedIntervalMs,
    offline_threshold_ms: offlineLimitMs,
    last_delay_ms: lastDelayMs,
    max_gap_ms: maxGapMs,
    relevant_gap_count: degradedGapCount,
    severe_gap_count: severeGapCount,
  };
}

function getStatus({ online, temperature, humidity, config }) {
  if (!online) return "offline";

  const temp = parseNumber(temperature);
  const hum = parseNumber(humidity);

  if (temp === null || hum === null) return "normal";

  const tempCritical =
    temp > config.temp_high_c + 2 || temp < config.temp_low_c - 2;
  const humCritical = hum > config.hum_high + 5 || hum < config.hum_low - 5;

  if (tempCritical || humCritical) return "alarm";

  const tempAlert = temp > config.temp_high_c || temp < config.temp_low_c;
  const humAlert = hum > config.hum_high || hum < config.hum_low;

  return tempAlert || humAlert ? "alert" : "normal";
}

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

  if (!access?.can_view) {
    return { ok: false, status: 403, error: "Sem permissão para este dispositivo." };
  }

  return { ok: true, user, profile, canEdit: Boolean(access.can_edit) };
}

function getDiagnostics(device, config) {
  const diagnostics = {
    ...(device?.diagnostics || {}),
    ...(device?.telemetry || {}),
  };

  const communicationDiagnostics = config.communication_diagnostics || {};
  return {
    api_contract: device?.api_contract || config.api_contract || API_CONTRACT,
    firmware_version:
      device?.firmware_version ||
      device?.fw_version ||
      device?.firmware ||
      diagnostics.firmware_version ||
      diagnostics.fw_version ||
      diagnostics.firmware ||
      config.firmware_version ||
      config.fw_version ||
      config.firmware ||
      null,
    sensor_status:
      device?.sensor_status || diagnostics.sensor_status || config.sensor_status || null,
    uptime_s: device?.uptime_s ?? diagnostics.uptime_s ?? null,
    power_state: device?.power_state ?? diagnostics.power_state ?? null,
    battery_pct:
      device?.battery_pct ??
      device?.battery ??
      diagnostics.battery_pct ??
      diagnostics.battery ??
      null,
    diagnostics,
    hardware_diagnostics:
      device?.hardware_diagnostics ||
      diagnostics.hardware_diagnostics ||
      config.hardware_diagnostics ||
      null,
    maintenance_active: isMaintenanceActive(config),
    communication_diagnostics: communicationDiagnostics,
    wifi_rssi:
      communicationDiagnostics.wifi_rssi ??
      device?.wifi_rssi ??
      diagnostics.wifi_rssi ??
      null,
    buffer_count: communicationDiagnostics.buffer_count ?? null,
    post_ok_count: communicationDiagnostics.post_ok_count ?? null,
    post_fail_count: communicationDiagnostics.post_fail_count ?? null,
    wifi_reconnect_count: communicationDiagnostics.wifi_reconnect_count ?? null,
    last_http_status: communicationDiagnostics.last_http_status ?? null,
    boot_count: communicationDiagnostics.boot_count ?? null,
    reset_reason: communicationDiagnostics.reset_reason ?? null,
    free_heap: communicationDiagnostics.free_heap ?? null,
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
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceError) throw deviceError;
    if (!device) {
      return Response.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: latestReading, error: latestError },
      { count: alerts24h, error: alertsError },
      { count: readings24h, error: readingsError },
      { data: communicationRows, error: communicationRowsError },
    ] = await Promise.all([
      supabase
        .from("readings")
        .select("temperature, humidity, created_at, device_status, alarm_ack, alarm_mask")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("device_id", deviceId)
        .gte("sent_at", since24hIso),
      supabase
        .from("readings")
        .select("*", { count: "exact", head: true })
        .eq("device_id", deviceId)
        .gte("created_at", since24hIso),
      supabase
        .from("readings")
        .select("created_at")
        .eq("device_id", deviceId)
        .gte("created_at", since24hIso)
        .order("created_at", { ascending: true })
        .limit(2500),
    ]);

    if (latestError) throw latestError;
    if (alertsError) throw alertsError;
    if (readingsError) throw readingsError;
    if (communicationRowsError) throw communicationRowsError;

    const config = normalizeConfig(device.config || {});
    const contactTimes = [
      device.last_seen,
      latestReading?.created_at,
    ]
      .map((value) => (value ? new Date(value).getTime() : null))
      .filter((value) => Number.isFinite(value));
    const lastSeen = contactTimes.length
      ? new Date(Math.max(...contactTimes)).toISOString()
      : null;
    const lastSeenTs = lastSeen ? new Date(lastSeen).getTime() : null;
    const lastSeenSeconds = lastSeenTs
      ? Math.max(0, Math.floor((Date.now() - lastSeenTs) / 1000))
      : null;
    const online =
      lastSeenTs !== null &&
      Date.now() - lastSeenTs <=
        getOfflineLimitMs(config.send_interval_s, config.offline_alert_after_min);
    const latestReadingTs = latestReading?.created_at
      ? new Date(latestReading.created_at).getTime()
      : NaN;
    const deviceLastSeenTs = device?.last_seen
      ? new Date(device.last_seen).getTime()
      : NaN;
    const latestReadingIsNewer =
      Number.isFinite(latestReadingTs) &&
      (!Number.isFinite(deviceLastSeenTs) || latestReadingTs >= deviceLastSeenTs);

    const temperature =
      latestReadingIsNewer
        ? parseNumber(latestReading?.temperature) ?? parseNumber(device.last_temperature)
        : parseNumber(device.last_temperature) ?? parseNumber(latestReading?.temperature);
    const humidity =
      latestReadingIsNewer
        ? parseNumber(latestReading?.humidity) ?? parseNumber(device.last_humidity)
        : parseNumber(device.last_humidity) ?? parseNumber(latestReading?.humidity);
    const computedStatus = getStatus({ online, temperature, humidity, config });
    const status = resolveTelemetryStatus({
      online,
      incomingStatus: latestReading?.device_status || device.status,
      alarmAck: latestReading?.alarm_ack,
      alarmMask: latestReading?.alarm_mask,
      computedStatus,
    });
    const diagnostics = getDiagnostics(device, config);
    const communicationHealth = getCommunicationHealth(
      communicationRows,
      config,
      lastSeen
    );

    return Response.json({
      device_id: deviceId,
      name: device.name || deviceId,
      location: device.location || "Localização por definir",
      config,
      config_version: device.config_version ?? 1,
      temperature,
      humidity,
      last_temperature: temperature,
      last_humidity: humidity,
      status,
      online,
      last_seen: lastSeen,
      last_seen_seconds: lastSeenSeconds,
      alerts_24h: alerts24h ?? 0,
      total_readings_24h: readings24h ?? 0,
      backend_status: "connected",
      updated_at: device.updated_at || lastSeen,
      predictive_status: device.predictive_status || null,
      communication_health: communicationHealth,
      ...diagnostics,
    });
  } catch (error) {
    console.error("Erro na API overview:", error);
    return Response.json(
      { error: "Erro interno ao carregar overview." },
      { status: 500 }
    );
  }
}
