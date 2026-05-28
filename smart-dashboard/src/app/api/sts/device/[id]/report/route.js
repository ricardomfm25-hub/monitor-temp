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

    const period = request.nextUrl.searchParams.get("period") || "24h";
    const backendUrl = getBackendUrl();
    const token = getBackendToken();

    const res = await fetch(
      `${backendUrl}/api/dashboard/device/${encodeURIComponent(deviceId)}/report?period=${encodeURIComponent(period)}`,
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
