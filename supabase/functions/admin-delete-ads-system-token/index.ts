/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeleteSystemTokenRequest = {
  tokenId?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

    const body = (await readJson(req)) as DeleteSystemTokenRequest;
    const tokenId = body.tokenId?.trim();
    if (!tokenId) {
      return json({ success: false, message: "Thiếu token hệ thống cần xoá" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const profile = await getActiveAdminProfile(admin, userData.user.id);

    const { error: updateError } = await admin
      .from("marketing_ads_system_tokens")
      .update({
        is_active: false,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenId);
    if (updateError) throw updateError;

    return json({
      success: true,
      message: "Đã xoá token hệ thống",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-delete-ads-system-token][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể xoá token hệ thống. Vui lòng thử lại.",
      },
      500,
    );
  }
});

async function getActiveAdminProfile(admin: ReturnType<typeof createClient>, authUserId: string) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.status !== "active") {
    throw new Error("Không tìm thấy hồ sơ admin active");
  }

  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);
  if (rolesError) throw rolesError;
  if (!(roles ?? []).some((row) => row.role === "admin")) {
    throw new Error("Chỉ Admin được quản lý token hệ thống");
  }

  return profile;
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
