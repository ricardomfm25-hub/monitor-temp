import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

export async function GET(_request, context) {
  try {
    const { id } = await context.params;
    const data = await stsBackendFetch(`/api/dashboard/device/${encodeURIComponent(id)}/alerts`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao obter alertas do dispositivo." },
      { status: 500 }
    );
  }
}