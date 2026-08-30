import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin env vars em falta.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userClient = createServerClient(
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
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (
      profileError ||
      !profile ||
      profile.role !== "super_admin" ||
      !profile.is_active
    ) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    const password = String(body?.password || "");

    if (!userId || !password) {
      return Response.json(
        { error: "User ID e password sao obrigatorios." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "A password deve ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from("profiles")
      .update({
        can_change_password: false,
        password_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Erro interno ao atualizar password." },
      { status: 500 }
    );
  }
}
