/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";
type Delivery = "ACTIVE" | "PAUSED" | "WARNING" | "SCHEDULED";

type SyncAdsRequest = {
  adsAccountId?: string;
  datePreset?: DatePreset;
  dateStart?: string;
  dateEnd?: string;
};

type MetaError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaAccountResponse = MetaError & {
  amount_spent?: string;
  spend_cap?: string;
  balance?: string;
  currency?: string;
  account_status?: number;
  timezone_name?: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

type MetaCampaignsResponse = MetaError & {
  data?: MetaCampaign[];
  paging?: { next?: string };
};

type MetaAdset = {
  id: string;
  campaign_id?: string;
  effective_status?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
};

type MetaAdsetsResponse = MetaError & {
  data?: MetaAdset[];
  paging?: { next?: string };
};

type MetaAction = {
  action_type?: string;
  value?: string;
};

type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
};

type MetaInsightsResponse = MetaError & {
  data?: MetaInsight[];
  paging?: { next?: string };
};

type CampaignSnapshotUpsert = {
  ads_account_id: string;
  campaign_id: string;
  campaign_name: string;
  delivery: Delivery;
  budget: number | null;
  spent: number;
  result_count: number;
  purchase_count: number;
  cost_per_result: number | null;
  active_adset_count: number;
  date_preset: DatePreset;
  date_start: string | null;
  date_end: string | null;
  synced_at: string;
  raw: Record<string, unknown>;
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

    const body = (await readJson(req)) as SyncAdsRequest;
    const adsAccountId = body.adsAccountId?.trim();
    const datePreset = body.datePreset ?? "today";
    if (!adsAccountId) {
      return json({ success: false, message: "Thiếu tài khoản quảng cáo cần đồng bộ" }, 400);
    }
    if (!isSupportedDatePreset(datePreset)) {
      return json({ success: false, message: "Khoảng thời gian đồng bộ không hợp lệ" }, 400);
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
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (profileError) throw profileError;
    if (!callerProfile)
      return json({ success: false, message: "Không tìm thấy hồ sơ người dùng" }, 403);

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerProfile.id);
    if (rolesError) throw rolesError;
    const isAdmin = (roles ?? []).some((row) => row.role === "admin");

    if (!isAdmin) {
      const { data: assignment, error: assignmentError } = await admin
        .from("marketing_ads_account_assignments")
        .select("ads_account_id")
        .eq("ads_account_id", adsAccountId)
        .eq("employee_id", callerProfile.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) {
        return json(
          { success: false, message: "Bạn không có quyền đồng bộ tài khoản quảng cáo này" },
          403,
        );
      }
    }

    if (
      !isAdmin &&
      !(roles ?? []).some((row) => row.role === "employee" || row.role === "leader")
    ) {
      return json(
        { success: false, message: "Bạn không có quyền đồng bộ tài khoản quảng cáo này" },
        403,
      );
    }

    const { data: account, error: accountError } = await admin
      .from("marketing_ads_accounts")
      .select("id, account_name, ad_account_id, access_token_encrypted, is_active, token_status")
      .eq("id", adsAccountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || !account.is_active) {
      return json({ success: false, message: "Tài khoản quảng cáo không khả dụng" }, 404);
    }
    if (!account.access_token_encrypted) {
      return json(
        {
          success: false,
          message: "Tài khoản quảng cáo chưa có token đồng bộ",
        },
        400,
      );
    }

    // TODO: replace direct token read with encryption/decryption before production rollout.
    const accessToken = account.access_token_encrypted;
    const accountPath = normalizeMetaAdAccountPath(account.ad_account_id);
    const dateRange = resolveDateRange(datePreset, body.dateStart, body.dateEnd);
    const syncedAt = new Date().toISOString();

    const [accountInfo, campaigns, insights, adsets] = await Promise.all([
      fetchMetaAccountInfo({ accountPath, accessToken, metaApiVersion }),
      fetchMetaCampaigns({ accountPath, accessToken, metaApiVersion }),
      fetchMetaInsights({ accountPath, accessToken, metaApiVersion, dateRange }),
      fetchMetaAdsets({ accountPath, accessToken, metaApiVersion }),
    ]);

    const adsetStatusCounts = countAdsetsByCampaignId(adsets);
    const activeAdsetCount = sumMapValues(adsetStatusCounts.active);
    const insightsByCampaignId = new Map(
      insights
        .filter((insight) => insight.campaign_id)
        .map((insight) => [insight.campaign_id as string, insight]),
    );

    const campaignRows = campaigns.map((campaign) => {
      const insight = insightsByCampaignId.get(campaign.id);
      return mapMetaCampaignToSnapshot({
        accountId: account.id,
        campaign,
        insight,
        activeAdsetCount: adsetStatusCounts.active.get(campaign.id) ?? 0,
        scheduledAdsetCount: adsetStatusCounts.scheduled.get(campaign.id) ?? 0,
        datePreset,
        dateStart: datePreset === "custom" ? dateRange.since : null,
        dateEnd: datePreset === "custom" ? dateRange.until : null,
        syncedAt,
      });
    });

    if (campaignRows.length) {
      const { error: upsertError } = await admin
        .from("marketing_ads_campaign_snapshots")
        .upsert(campaignRows, {
          onConflict: "ads_account_id,campaign_id,date_preset,date_start,date_end",
        });
      if (upsertError) throw upsertError;
    }

    const spendLimit = toNumber(accountInfo.spend_cap);
    const amountSpent = toNumber(accountInfo.amount_spent);
    const remainingBalance = Math.max(spendLimit - amountSpent, 0);
    const updatePayload: Record<string, unknown> = {
      currency: accountInfo.currency ?? "VND",
      timezone_name: accountInfo.timezone_name ?? null,
      spend_limit: spendLimit,
      amount_spent: amountSpent,
      balance: remainingBalance,
      adset_on: activeAdsetCount,
      token_status: "active",
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    };

    const { error: updateAccountError } = await admin
      .from("marketing_ads_accounts")
      .update(updatePayload)
      .eq("id", account.id);
    if (updateAccountError) throw updateAccountError;

    return json({
      success: true,
      message: "Đồng bộ dữ liệu thành công",
      campaignCount: campaignRows.length,
      syncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-ads-account][error]", { message, error });
    return json(
      {
        success: false,
        message: mapSyncErrorMessage(message),
      },
      500,
    );
  }
});

async function fetchMetaAccountInfo({
  accountPath,
  accessToken,
  metaApiVersion,
}: {
  accountPath: string;
  accessToken: string;
  metaApiVersion: string;
}) {
  const params = new URLSearchParams({
    fields: "amount_spent,spend_cap,balance,currency,account_status,timezone_name",
    access_token: accessToken,
  });
  return fetchMeta<MetaAccountResponse>(
    `https://graph.facebook.com/${metaApiVersion}/${accountPath}?${params}`,
  );
}

async function fetchMetaCampaigns({
  accountPath,
  accessToken,
  metaApiVersion,
}: {
  accountPath: string;
  accessToken: string;
  metaApiVersion: string;
}) {
  const params = new URLSearchParams({
    fields: "id,name,status,effective_status,start_time,stop_time,daily_budget,lifetime_budget",
    limit: "500",
    access_token: accessToken,
  });
  const response = await fetchMetaPages<MetaCampaignsResponse, MetaCampaign>(
    `https://graph.facebook.com/${metaApiVersion}/${accountPath}/campaigns?${params}`,
  );
  return response;
}

async function fetchMetaAdsets({
  accountPath,
  accessToken,
  metaApiVersion,
}: {
  accountPath: string;
  accessToken: string;
  metaApiVersion: string;
}) {
  const params = new URLSearchParams({
    fields: "id,campaign_id,status,effective_status,start_time,end_time",
    limit: "500",
    access_token: accessToken,
  });
  return fetchMetaPages<MetaAdsetsResponse, MetaAdset>(
    `https://graph.facebook.com/${metaApiVersion}/${accountPath}/adsets?${params}`,
  );
}

async function fetchMetaInsights({
  accountPath,
  accessToken,
  metaApiVersion,
  dateRange,
}: {
  accountPath: string;
  accessToken: string;
  metaApiVersion: string;
  dateRange: { since: string; until: string };
}) {
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,actions,cost_per_action_type",
    limit: "500",
    time_range: JSON.stringify(dateRange),
    access_token: accessToken,
  });
  return fetchMetaPages<MetaInsightsResponse, MetaInsight>(
    `https://graph.facebook.com/${metaApiVersion}/${accountPath}/insights?${params}`,
  );
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
    console.error("[sync-ads-account][meta_parse_failed]", { status: response.status, text });
    throw new Error(`Meta response parse failed with status ${response.status}`);
  }
  if (!response.ok || payload.error) {
    console.error("[sync-ads-account][meta_failed]", {
      status: response.status,
      error: payload.error,
    });
    throw new Error(payload.error?.message ?? `Meta API failed with status ${response.status}`);
  }
  return payload;
}

function mapMetaCampaignToSnapshot({
  accountId,
  campaign,
  insight,
  activeAdsetCount,
  scheduledAdsetCount,
  datePreset,
  dateStart,
  dateEnd,
  syncedAt,
}: {
  accountId: string;
  campaign: MetaCampaign;
  insight?: MetaInsight;
  activeAdsetCount: number;
  scheduledAdsetCount: number;
  datePreset: DatePreset;
  dateStart: string | null;
  dateEnd: string | null;
  syncedAt: string;
}): CampaignSnapshotUpsert {
  const spent = toNumber(insight?.spend);
  const resultCount = getResultCount(campaign.name, insight?.actions ?? []);
  const purchaseCount = getPurchaseCount(insight?.actions ?? []);
  const costPerResult = resultCount > 0 ? spent / resultCount : null;

  return {
    ads_account_id: accountId,
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    delivery: normalizeDelivery(
      campaign.effective_status ?? campaign.status,
      campaign.start_time,
      scheduledAdsetCount,
    ),
    budget: getCampaignBudget(campaign),
    spent,
    result_count: resultCount,
    purchase_count: purchaseCount,
    cost_per_result: costPerResult,
    active_adset_count: activeAdsetCount,
    date_preset: datePreset,
    date_start: dateStart,
    date_end: dateEnd,
    synced_at: syncedAt,
    raw: {
      campaign,
      insight: insight ?? null,
    },
  };
}

function countAdsetsByCampaignId(adsets: MetaAdset[]) {
  const active = new Map<string, number>();
  const scheduled = new Map<string, number>();

  for (const adset of adsets) {
    if (!adset.campaign_id) {
      continue;
    }

    if (isFutureMetaTime(adset.start_time)) {
      scheduled.set(adset.campaign_id, (scheduled.get(adset.campaign_id) ?? 0) + 1);
      continue;
    }

    if (isMetaActiveStatus(adset.effective_status ?? adset.status)) {
      active.set(adset.campaign_id, (active.get(adset.campaign_id) ?? 0) + 1);
    }
  }

  return { active, scheduled };
}

function sumMapValues(values: Map<string, number>) {
  let total = 0;
  values.forEach((value) => {
    total += value;
  });
  return total;
}

function getResultCount(campaignName: string, actions: MetaAction[]) {
  const normalizedName = normalizeVietnamese(campaignName);
  if (normalizedName.includes("mess")) {
    return getFirstActionValue(actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "onsite_conversion.messaging_user_subscribed",
    ]);
  }

  if (
    normalizedName.includes(" cd ") ||
    normalizedName.includes("cd") ||
    normalizedName.includes("cđ")
  ) {
    return getActionValueByPrefix(actions, "offsite_complete_registration_add_meta");
  }

  return 0;
}

function getPurchaseCount(actions: MetaAction[]) {
  return sumActions(actions, [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
  ]);
}

function sumActions(actions: MetaAction[], preferredTypes: string[]) {
  const preferred = new Set(preferredTypes.map((type) => type.toLowerCase()));
  return actions.reduce((total, action) => {
    const type = action.action_type?.toLowerCase();
    if (!type || !preferred.has(type)) return total;
    return total + toNumber(action.value);
  }, 0);
}

function getFirstActionValue(actions: MetaAction[], preferredTypes: string[]) {
  const actionByType = new Map(
    actions
      .filter((action) => action.action_type)
      .map((action) => [action.action_type!.toLowerCase(), action]),
  );

  for (const preferredType of preferredTypes) {
    const action = actionByType.get(preferredType.toLowerCase());
    if (action) return toNumber(action.value);
  }

  return 0;
}

function getActionValueByPrefix(actions: MetaAction[], actionTypePrefix: string) {
  const normalizedPrefix = actionTypePrefix.toLowerCase();
  const action = actions.find((item) =>
    item.action_type?.toLowerCase().startsWith(normalizedPrefix),
  );

  return action ? toNumber(action.value) : 0;
}

function normalizeDelivery(status?: string, startTime?: string, scheduledAdsetCount = 0): Delivery {
  if (isFutureMetaTime(startTime)) return "SCHEDULED";
  if (scheduledAdsetCount > 0) return "SCHEDULED";
  const normalized = status?.toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "PENDING_REVIEW" || normalized === "IN_PROCESS" || normalized === "PENDING") {
    return "SCHEDULED";
  }
  if (
    normalized === "PAUSED" ||
    normalized === "CAMPAIGN_PAUSED" ||
    normalized === "ADSET_PAUSED"
  ) {
    return "PAUSED";
  }
  return "WARNING";
}

function isMetaActiveStatus(status?: string) {
  return status?.toUpperCase() === "ACTIVE";
}

function isFutureMetaTime(value?: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function getCampaignBudget(campaign: MetaCampaign) {
  const budget = campaign.daily_budget ?? campaign.lifetime_budget;
  return budget ? toNumber(budget) : null;
}

function resolveDateRange(datePreset: DatePreset, dateStart?: string, dateEnd?: string) {
  const now = new Date();
  const today = formatYmd(now);
  if (datePreset === "custom") {
    if (!dateStart || !dateEnd) {
      throw new Error("Custom date range requires dateStart and dateEnd");
    }
    assertYmd(dateStart, "dateStart");
    assertYmd(dateEnd, "dateEnd");
    return { since: dateStart, until: dateEnd };
  }
  if (datePreset === "yesterday") {
    const yesterday = addDays(now, -1);
    const ymd = formatYmd(yesterday);
    return { since: ymd, until: ymd };
  }
  if (datePreset === "this_week") {
    return { since: startOfWeekYmd(now), until: today };
  }
  if (datePreset === "this_month") {
    return { since: `${today.slice(0, 8)}01`, until: today };
  }
  return { since: today, until: today };
}

function isSupportedDatePreset(value: string): value is DatePreset {
  return ["today", "yesterday", "this_week", "this_month", "custom"].includes(value);
}

function normalizeMetaAdAccountPath(adAccountId: string) {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

function normalizeVietnamese(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekYmd(date: Date) {
  const local = new Date(date);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diff);
  return formatYmd(local);
}

function formatYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function assertYmd(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${field}; expected YYYY-MM-DD`);
  }
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function mapSyncErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("token") ||
    normalized.includes("permission") ||
    normalized.includes("oauth") ||
    normalized.includes("access")
  ) {
    return "Không thể đồng bộ dữ liệu. Vui lòng kiểm tra token hoặc quyền truy cập tài khoản quảng cáo.";
  }
  if (normalized.includes("rate")) {
    return "Meta đang giới hạn tần suất đồng bộ. Vui lòng thử lại sau.";
  }
  return "Không thể đồng bộ dữ liệu. Vui lòng thử lại sau.";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
