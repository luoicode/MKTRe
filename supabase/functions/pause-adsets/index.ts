/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PauseAdsetsRequest = {
  accountId?: string;
  adsAccountId?: string;
  adsetIds?: string[];
};

type MetaError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaAdset = {
  id: string;
  effective_status?: string;
  status?: string;
  start_time?: string;
};

type MetaAdsetsResponse = MetaError & {
  data?: MetaAdset[];
  paging?: { next?: string };
};

type PauseError = {
  adsetId: string;
  message: string;
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
    const metaApiVersion = Deno.env.get("META_MARKETING_API_VERSION") ?? "v23.0";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

    const body = (await readJson(req)) as PauseAdsetsRequest;
    const accountId = (body.accountId ?? body.adsAccountId)?.trim();
    const requestedAdsetIds = sanitizeAdsetIds(body.adsetIds ?? []);
    if (!accountId) {
      return json({ success: false, message: "Thiếu tài khoản quảng cáo cần tắt nhóm" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile, error: profileError } = await admin
      .from("profiles")
      .select("id, status")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!callerProfile || callerProfile.status !== "active") {
      return json({ success: false, message: "Không tìm thấy hồ sơ người dùng active" }, 403);
    }

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerProfile.id);
    if (rolesError) throw rolesError;
    const isAdmin = (roles ?? []).some((row) => row.role === "admin");
    const canUseAdsDashboard = (roles ?? []).some(
      (row) => row.role === "employee" || row.role === "leader",
    );

    if (!isAdmin && !canUseAdsDashboard) {
      return json({ success: false, message: "Bạn không có quyền tắt nhóm quảng cáo" }, 403);
    }

    if (!isAdmin) {
      const { data: assignment, error: assignmentError } = await admin
        .from("marketing_ads_account_assignments")
        .select("ads_account_id")
        .eq("ads_account_id", accountId)
        .eq("employee_id", callerProfile.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) {
        return json({ success: false, message: "Bạn không có quyền tắt nhóm tài khoản này" }, 403);
      }
    }

    const { data: account, error: accountError } = await admin
      .from("marketing_ads_accounts")
      .select("id, account_name, ad_account_id, access_token_encrypted, is_active")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || !account.is_active) {
      return json({ success: false, message: "Tài khoản quảng cáo không khả dụng" }, 404);
    }
    if (!account.access_token_encrypted) {
      return json({ success: false, message: "Tài khoản quảng cáo chưa có token" }, 400);
    }

    // TODO: replace direct token read with encryption/decryption before production rollout.
    const accessToken = account.access_token_encrypted;
    const accountPath = normalizeMetaAdAccountPath(account.ad_account_id);
    const adsetIds = requestedAdsetIds.length
      ? requestedAdsetIds
      : await fetchActiveAdsetIds({ accountPath, accessToken, metaApiVersion });

    if (!adsetIds.length) {
      return json({
        success: true,
        message: "Không có nhóm quảng cáo đang hoạt động để tắt",
        successCount: 0,
        failedCount: 0,
        errors: [],
      });
    }

    const errors: PauseError[] = [];
    let successCount = 0;

    for (const adsetId of adsetIds) {
      try {
        await pauseMetaAdset({ adsetId, accessToken, metaApiVersion });
        successCount += 1;
      } catch (error) {
        errors.push({
          adsetId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const failedCount = errors.length;
    return json({
      success: successCount > 0 && failedCount === 0,
      message:
        failedCount > 0
          ? `Đã tắt ${successCount}/${adsetIds.length} nhóm quảng cáo`
          : `Đã tắt ${successCount} nhóm quảng cáo`,
      successCount,
      failedCount,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[pause-adsets][error]", { message });
    return json(
      {
        success: false,
        message: "Không thể tắt nhóm quảng cáo. Vui lòng kiểm tra token hoặc quyền Meta.",
        successCount: 0,
        failedCount: 0,
        errors: [{ adsetId: "-", message }],
      },
      500,
    );
  }
});

async function fetchActiveAdsetIds({
  accountPath,
  accessToken,
  metaApiVersion,
}: {
  accountPath: string;
  accessToken: string;
  metaApiVersion: string;
}) {
  const params = new URLSearchParams({
    fields: "id,status,effective_status,start_time",
    limit: "500",
    access_token: accessToken,
  });
  const adsets = await fetchMetaPages<MetaAdsetsResponse, MetaAdset>(
    `https://graph.facebook.com/${metaApiVersion}/${accountPath}/adsets?${params}`,
  );
  return adsets
    .filter((adset) => !isFutureMetaTime(adset.start_time))
    .filter((adset) => isMetaActiveStatus(adset.effective_status ?? adset.status))
    .map((adset) => adset.id);
}

async function pauseMetaAdset({
  adsetId,
  accessToken,
  metaApiVersion,
}: {
  adsetId: string;
  accessToken: string;
  metaApiVersion: string;
}) {
  const params = new URLSearchParams({
    status: "PAUSED",
    access_token: accessToken,
  });
  const response = await fetch(`https://graph.facebook.com/${metaApiVersion}/${adsetId}`, {
    method: "POST",
    body: params,
  });
  const text = await response.text();
  let payload: MetaError & { success?: boolean };
  try {
    payload = JSON.parse(text) as MetaError & { success?: boolean };
  } catch {
    throw new Error(`Meta response parse failed with status ${response.status}`);
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Meta API failed with status ${response.status}`);
  }
  return payload;
}

async function fetchMetaPages<T extends MetaError & { data?: U[]; paging?: { next?: string } }, U>(
  initialUrl: string,
) {
  const rows: U[] = [];
  let url: string | undefined = initialUrl;
  while (url) {
    const payload = await fetchMeta<T>(url);
    rows.push(...(payload.data ?? []));
    url = payload.paging?.next;
  }
  return rows;
}

async function fetchMeta<T extends MetaError>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  let payload: T;
  try {
    payload = JSON.parse(text) as T;
  } catch {
    throw new Error(`Meta response parse failed with status ${response.status}`);
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Meta API failed with status ${response.status}`);
  }
  return payload;
}

function sanitizeAdsetIds(adsetIds: string[]) {
  return Array.from(
    new Set(adsetIds.map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_]+$/.test(id))),
  );
}

function normalizeMetaAdAccountPath(adAccountId: string) {
  const normalized = adAccountId.trim();
  return normalized.startsWith("act_") ? normalized : `act_${normalized}`;
}

function isMetaActiveStatus(status?: string) {
  return status?.toUpperCase() === "ACTIVE";
}

function isFutureMetaTime(value?: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
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
