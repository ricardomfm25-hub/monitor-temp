import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function POST(req) {
  try {
    const cookieStore = await cookies();

    const supabaseUserClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseUserClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

   if (profileError) {
  return NextResponse.json(
    { error: `Erro ao ler perfil: ${profileError.message}` },
    { status: 403 }
  );
}

    if (!profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 403 }
      );
    }

    if (profile.role !== "super_admin" || !profile.is_active) {
      return NextResponse.json(
        { error: "Sem permissão para criar utilizadores." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "viewer").trim();

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: "Nome, email e password são obrigatórios." },
        { status: 400 }
      );
    }

    if (!["viewer", "client_admin"].includes(role)) {
      return NextResponse.json(
        { error: "Role inválido." },
        { status: 400 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY não definida." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: "Já existe um utilizador com esse email." },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: authError?.message || "Erro ao criar utilizador no Auth." },
        { status: 400 }
      );
    }

    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role,
        is_active: true,
        client_id: null,
      });

    if (profileInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: `Erro ao criar perfil: ${profileInsertError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user_id: authData.user.id,
      email,
      full_name,
      role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Erro interno ao criar utilizador." },
      { status: 500 }
    );
  }
}