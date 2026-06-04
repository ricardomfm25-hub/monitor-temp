import { createClient } from "@supabase/supabase-js";

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
