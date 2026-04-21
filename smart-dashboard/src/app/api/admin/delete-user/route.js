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
      .select("id, role, is_active")
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
        { error: "Sem permissão para remover utilizadores." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const targetUserId = String(body.user_id || "").trim();

    if (!targetUserId) {
      return NextResponse.json(
        { error: "user_id é obrigatório." },
        { status: 400 }
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Não podes remover o teu próprio utilizador." },
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

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json(
        { error: `Erro ao ler utilizador alvo: ${targetProfileError.message}` },
        { status: 400 }
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: "Utilizador não encontrado." },
        { status: 404 }
      );
    }

    if (targetProfile.role === "super_admin") {
      return NextResponse.json(
        { error: "Não é permitido remover outro super admin por esta ação." },
        { status: 400 }
      );
    }

    const { error: accessDeleteError } = await supabaseAdmin
      .from("device_access")
      .delete()
      .eq("user_id", targetUserId);

    if (accessDeleteError) {
      return NextResponse.json(
        { error: `Erro ao remover acessos: ${accessDeleteError.message}` },
        { status: 400 }
      );
    }

    const { error: alertsDeleteError } = await supabaseAdmin
      .from("device_alert_recipients")
      .delete()
      .eq("user_id", targetUserId);

    if (alertsDeleteError) {
      return NextResponse.json(
        { error: `Erro ao remover alertas: ${alertsDeleteError.message}` },
        { status: 400 }
      );
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", targetUserId);

    if (profileDeleteError) {
      return NextResponse.json(
        { error: `Erro ao remover perfil: ${profileDeleteError.message}` },
        { status: 400 }
      );
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      targetUserId
    );

    if (authDeleteError) {
      return NextResponse.json(
        {
          error: `Perfil removido, mas houve erro ao remover login: ${authDeleteError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      removed_user_id: targetUserId,
      email: targetProfile.email,
      full_name: targetProfile.full_name,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Erro interno ao remover utilizador." },
      { status: 500 }
    );
  }
}