/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeleteAdsAccountRequest = {
  adsAccountId?: string;
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

    const body = (await readJson(req)) as DeleteAdsAccountRequest;
    const adsAccountId = body.adsAccountId?.trim();
    if (!adsAccountId) {
      return json({ success: false, message: "Thiếu tài khoản quảng cáo cần xoá" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, status")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status !== "active") {
      return json({ success: false, message: "Không tìm thấy hồ sơ admin active" }, 403);
    }

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);
    if (rolesError) throw rolesError;
    const isAdmin = (roles ?? []).some((row) => row.role === "admin");
    if (!isAdmin) {
      return json({ success: false, message: "Chỉ Admin được xoá tài khoản quảng cáo" }, 403);
    }

    const { data: account, error: accountError } = await admin
      .from("marketing_ads_accounts")
      .select("id")
      .eq("id", adsAccountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return json({ success: false, message: "Không tìm thấy tài khoản quảng cáo" }, 404);
    }

    const { error: deleteError } = await admin
      .from("marketing_ads_accounts")
      .delete()
      .eq("id", adsAccountId);
    if (deleteError) throw deleteError;

    return json({
      success: true,
      message: "Đã xoá tài khoản quảng cáo",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-delete-ads-account][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể xoá tài khoản quảng cáo. Vui lòng thử lại.",
      },
      500,
    );
  }
});

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
