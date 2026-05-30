/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UpdateAdsAccountTokenRequest = {
  adsAccountId?: string;
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

    const body = (await readJson(req)) as UpdateAdsAccountTokenRequest;
    const adsAccountId = body.adsAccountId?.trim();
    const accessToken = body.accessToken?.trim();

    if (!adsAccountId) {
      return json({ success: false, message: "Thiếu tài khoản quảng cáo cần cập nhật" }, 400);
    }
    if (!accessToken) {
      return json({ success: false, message: "Access token mới không được để trống" }, 400);
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
      return json({ success: false, message: "Không tìm thấy hồ sơ nhân viên active" }, 403);
    }

    const { data: assignment, error: assignmentError } = await admin
      .from("marketing_ads_account_assignments")
      .select("ads_account_id")
      .eq("ads_account_id", adsAccountId)
      .eq("employee_id", profile.id)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return json(
        { success: false, message: "Bạn không có quyền cập nhật token tài khoản này" },
        403,
      );
    }

    // Phase test only: token is stored in this column as a placeholder.
    // TODO: encrypt/decrypt this value before production rollout.
    const { error: updateError } = await admin
      .from("marketing_ads_accounts")
      .update({
        access_token_encrypted: accessToken,
        token_status: "test",
        updated_at: new Date().toISOString(),
      })
      .eq("id", adsAccountId);
    if (updateError) throw updateError;

    return json({
      success: true,
      message: "Đã cập nhật token thành công",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[update-ads-account-token][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể cập nhật token. Vui lòng kiểm tra lại quyền hoặc token mới.",
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
