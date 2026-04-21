import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

function getDeviceIdFromRequest(request, context) {
  const fromParams = context?.params?.id;
  if (fromParams) return fromParams;

  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const deviceIndex = parts.findIndex((part) => part === "device");

  if (deviceIndex >= 0 && parts[deviceIndex + 1]) {
    return parts[deviceIndex + 1];
  }

  return null;
}

export async function GET(request, context) {
  try {
    const id = getDeviceIdFromRequest(request, context);
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "2000";

    if (!id) {
      return NextResponse.json(
        { error: "Device ID não encontrado na route." },
        { status: 400 }
      );
    }

    const data = await stsBackendFetch(
      `/api/dashboard/device/${encodeURIComponent(id)}/history?limit=${encodeURIComponent(limit)}`
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao obter histórico do dispositivo." },
      { status: 500 }
    );
  }
}