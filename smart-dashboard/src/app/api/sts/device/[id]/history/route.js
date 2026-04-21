import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "2000";

    const data = await stsBackendFetch(
      `/api/dashboard/device/${params.id}/history?limit=${encodeURIComponent(limit)}`
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao obter histórico do dispositivo." },
      { status: 500 }
    );
  }
}