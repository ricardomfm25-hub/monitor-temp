import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

export async function GET(_, { params }) {
  try {
    const data = await stsBackendFetch(`/api/device/${params.id}/config`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao obter configuração do dispositivo." },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const body = await request.json();

    const data = await stsBackendFetch(`/api/device/${params.id}/config`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro ao atualizar configuração do dispositivo." },
      { status: 500 }
    );
  }
}