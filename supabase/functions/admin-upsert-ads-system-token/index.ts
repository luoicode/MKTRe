/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UpsertSystemTokenRequest = {
  name?: string;
  accessToken?: string;
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

    const body = (await readJson(req)) as UpsertSystemTokenRequest;
    const name = body.name?.trim() || "MKTRe System Token";
    const accessToken = body.accessToken?.trim();
    if (!accessToken) {
      return json({ success: false, message: "Access token hệ thống không được để trống" }, 400);
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

    const now = new Date().toISOString();
    const { error: deactivateError } = await admin
      .from("marketing_ads_system_tokens")
      .update({ is_active: false, updated_by: profile.id, updated_at: now })
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;

    const { error: insertError } = await admin.from("marketing_ads_system_tokens").insert({
      name,
      access_token_encrypted: accessToken,
      token_type: "system_user",
      is_active: true,
      created_by: profile.id,
      updated_by: profile.id,
      created_at: now,
      updated_at: now,
    });
    if (insertError) throw insertError;

    return json({
      success: true,
      message: "Đã lưu token hệ thống",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-upsert-ads-system-token][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể lưu token hệ thống. Vui lòng thử lại.",
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
    throw new ResponseError("Không tìm thấy hồ sơ admin active", 403);
  }

  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);
  if (rolesError) throw rolesError;
  if (!(roles ?? []).some((row) => row.role === "admin")) {
    throw new ResponseError("Chỉ Admin được quản lý token hệ thống", 403);
  }

  return profile;
}

class ResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
