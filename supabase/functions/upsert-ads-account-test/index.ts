/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UpsertAdsAccountTestRequest = {
  accountName?: string;
  adAccountId?: string;
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

    const body = (await readJson(req)) as UpsertAdsAccountTestRequest;
    const accountName = body.accountName?.trim();
    const adAccountId = body.adAccountId?.trim();
    const accessToken = body.accessToken?.trim();

    if (!accountName) {
      return json({ success: false, message: "Tên tài khoản quảng cáo không được để trống" }, 400);
    }
    if (!adAccountId || !/^act_[A-Za-z0-9_]+$/.test(adAccountId)) {
      return json({ success: false, message: "ID tài khoản quảng cáo phải có dạng act_..." }, 400);
    }
    if (!accessToken) {
      return json({ success: false, message: "Access token không được để trống" }, 400);
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

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);
    if (rolesError) throw rolesError;
    const canUseTestFlow = (roles ?? []).some(
      (row) => row.role === "employee" || row.role === "leader",
    );
    if (!canUseTestFlow) {
      return json(
        { success: false, message: "Chỉ nhân viên hoặc Leader Marketing được thêm tài khoản test" },
        403,
      );
    }

    // Phase test only: token is stored in this column as a placeholder.
    // TODO: encrypt/decrypt this value before production rollout.
    const { data: account, error: accountError } = await admin
      .from("marketing_ads_accounts")
      .upsert(
        {
          account_name: accountName,
          ad_account_id: adAccountId,
          access_token_encrypted: accessToken,
          token_status: "test",
          is_active: true,
          created_by: profile.id,
        },
        { onConflict: "ad_account_id" },
      )
      .select("id")
      .single();
    if (accountError) throw accountError;

    const { error: assignmentError } = await admin.from("marketing_ads_account_assignments").upsert(
      {
        ads_account_id: account.id,
        employee_id: profile.id,
        assigned_by: profile.id,
      },
      { onConflict: "ads_account_id,employee_id" },
    );
    if (assignmentError) throw assignmentError;

    return json({
      success: true,
      accountId: account.id,
      message: "Đã thêm tài khoản quảng cáo test",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[upsert-ads-account-test][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể thêm tài khoản quảng cáo test. Vui lòng kiểm tra lại thông tin.",
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
