export const dynamic = "force-dynamic";

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

async function proxyConfig(request, context, method) {
  const deviceId = await getDeviceIdFromRequest(request, context);
  if (!deviceId) return Response.json({ error: "Device ID em falta." }, { status: 400 });

  const backendUrl = getBackendUrl();
  const token = getBackendToken();
  const body = method === "POST" ? await request.json() : null;

  const res = await fetch(`${backendUrl}/api/device/${encodeURIComponent(deviceId)}/config`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "Resposta inválida do backend." };
  }

  return Response.json(data, { status: res.status });
}

export async function GET(request, context) {
  try {
    return await proxyConfig(request, context, "GET");
  } catch (error) {
    console.error("Erro na API config:", error);
    return Response.json({ error: "Erro interno ao carregar configuração." }, { status: 500 });
  }
}

export async function POST(request, context) {
  try {
    return await proxyConfig(request, context, "POST");
  } catch (error) {
    console.error("Erro na API config POST:", error);
    return Response.json({ error: "Erro interno ao guardar configuração." }, { status: 500 });
  }
}
