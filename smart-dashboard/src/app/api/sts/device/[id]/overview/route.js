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

export async function GET(request, context) {
  try {
    const deviceId = await getDeviceIdFromRequest(request, context);

    if (!deviceId) {
      return Response.json({ error: "Device ID em falta." }, { status: 400 });
    }

    const backendUrl = getBackendUrl();
    const token = getBackendToken();

    const res = await fetch(
      `${backendUrl}/api/dashboard/device/${encodeURIComponent(deviceId)}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: token } : {},
      }
    );

    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = {
        error: "Resposta inválida do backend.",
        backendStatus: res.status,
        backendText: text.slice(0, 500),
      };
    }

    return Response.json(data, { status: res.status });
  } catch (error) {
    console.error("Erro na API overview:", error);
    return Response.json({ error: "Erro interno ao carregar resumo." }, { status: 500 });
  }
}
