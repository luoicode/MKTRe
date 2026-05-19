/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

// Admin-only: update user role / status / password
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (!callerProfile)
      return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerProfile.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
    }

    const { profile_id, role, status, password, full_name } = await req.json();
    if (!profile_id)
      return Response.json({ error: "Thiếu profile_id" }, { status: 400, headers: corsHeaders });

    const { data: target } = await admin.from("profiles").select("*").eq("id", profile_id).single();
    if (!target)
      return Response.json({ error: "User không tồn tại" }, { status: 404, headers: corsHeaders });

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (full_name) updates.full_name = full_name;
    if (Object.keys(updates).length > 0) {
      await admin.from("profiles").update(updates).eq("id", profile_id);
    }

    if (role) {
      await admin.from("user_roles").delete().eq("user_id", profile_id);
      await admin.from("user_roles").insert({ user_id: profile_id, role });
    }

    if (password) {
      if (password.length < 6) {
        return Response.json(
          { error: "Mật khẩu tối thiểu 6 ký tự" },
          { status: 400, headers: corsHeaders },
        );
      }
      await admin.auth.admin.updateUserById(target.auth_user_id, { password });
    }

    await admin.from("audit_logs").insert({
      actor_id: callerProfile.id,
      action: "update_user",
      entity_type: "profiles",
      entity_id: profile_id,
      old_value: { status: target.status, full_name: target.full_name },
      new_value: { ...updates, role, password_changed: !!password },
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
