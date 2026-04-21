import { NextResponse } from "next/server";
import { stsBackendFetch } from "@/lib/sts-backend";

export async function GET(request, context) {
  try {
    const idFromParams = context?.params?.id;
    const idFromUrl = request.nextUrl.pathname.split("/").slice(-2, -1)[0];

    return NextResponse.json({
      debug: true,
      idFromParams,
      idFromUrl,
      pathname: request.nextUrl.pathname,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Erro debug overview." },
      { status: 500 }
    );
  }
}