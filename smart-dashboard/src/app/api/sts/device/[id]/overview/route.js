import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

export async function GET(_, { params }) {
  try {
    const data = await stsBackendFetch(`/api/dashboard/device/${params.id}`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao obter overview do dispositivo." },
      { status: 500 }
    );
  }
}