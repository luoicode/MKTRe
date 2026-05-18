// Admin-only: create a new user with profile + role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INTERNAL_AUTH_DOMAIN = "mktre.local";

function normalizeLoginName(value: string) {
  const raw = value.trim().toLowerCase();
  const localPart = raw.includes("@") ? raw.split("@")[0] : raw;
  return localPart.replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // Verify caller is admin
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (!callerProfile)
      return Response.json({ error: "No profile" }, { status: 403, headers: corsHeaders });

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerProfile.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) {
      return Response.json(
        { error: "Forbidden: chỉ Admin được tạo tài khoản" },
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const { full_name, username, password, role, status } = body as {
      full_name: string;
      username: string;
      password: string;
      role: "admin" | "manager" | "leader" | "employee";
      status?: "active" | "inactive";
    };

    if (!full_name || !username || !password || !role) {
      return Response.json(
        { error: "Thiếu thông tin bắt buộc" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (password.length < 6) {
      return Response.json(
        { error: "Mật khẩu tối thiểu 6 ký tự" },
        { status: 400, headers: corsHeaders },
      );
    }

    const normalizedUsername = normalizeLoginName(username);
    if (!normalizedUsername) {
      return Response.json(
        { error: "Tài khoản đăng nhập không hợp lệ" },
        { status: 400, headers: corsHeaders },
      );
    }
    const email = `${normalizedUsername}@${INTERNAL_AUTH_DOMAIN}`;

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id")
      .or(`username.eq.${normalizedUsername},email.eq.${email}`)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;
    if (existingProfile) {
      return Response.json(
        { error: "Tài khoản đăng nhập đã tồn tại" },
        { status: 409, headers: corsHeaders },
      );
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: normalizedUsername, full_name },
    });
    if (createErr) {
      if (createErr.message?.toLowerCase().includes("already")) {
        return Response.json(
          { error: "Tài khoản đăng nhập đã tồn tại" },
          { status: 409, headers: corsHeaders },
        );
      }
      throw createErr;
    }

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .insert({
        auth_user_id: created.user!.id,
        full_name,
        username: normalizedUsername,
        email,
        status: status ?? "active",
      })
      .select()
      .single();
    if (profErr) {
      // rollback
      await admin.auth.admin.deleteUser(created.user!.id);
      throw profErr;
    }

    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: profile.id, role });
    if (roleErr) throw roleErr;

    await admin.from("audit_logs").insert({
      actor_id: callerProfile.id,
      action: "create_user",
      entity_type: "profiles",
      entity_id: profile.id,
      new_value: {
        username: normalizedUsername,
        email,
        full_name,
        role,
        status: status ?? "active",
      },
    });

    return Response.json({ ok: true, profile }, { headers: corsHeaders });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
