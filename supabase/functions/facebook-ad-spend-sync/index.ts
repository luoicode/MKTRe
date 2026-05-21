/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type SyncRequest = {
  start_date?: string;
  end_date?: string;
  date?: string;
  since?: string;
  until?: string;
  ad_account_ids?: string[];
};

type MetaInsightRow = {
  spend?: string;
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

type SpendUpsertRow = {
  ad_account_id: string;
  campaign_name: string;
  spend: number;
  spend_date: string;
  raw: MetaInsightRow | { raw_items: MetaInsightRow[] };
  synced_at: string;
};

type SyncStep =
  | "read_env"
  | "parse_ad_accounts"
  | "call_meta_api"
  | "parse_meta_response"
  | "upsert_spend_rows";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let step: SyncStep = "read_env";

  try {
    step = "read_env";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const accessToken = Deno.env.get("FACEBOOK_MARKETING_ACCESS_TOKEN");
    const configuredAccountIds = readAccountIds(Deno.env.get("FACEBOOK_AD_ACCOUNT_IDS"));

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service environment variables");
    }
    if (!accessToken) {
      throw new Error("Missing FACEBOOK_MARKETING_ACCESS_TOKEN secret");
    }

    step = "parse_ad_accounts";
    const body = await readJson(req);
    const url = new URL(req.url);
    const today = formatYmd(new Date());
    const dateRange = resolveDateRange(url.searchParams, body, today);
    const startDate = dateRange.since;
    const endDate = dateRange.until;
    const adAccountIds = normalizeAccountIds(
      body.ad_account_ids?.length ? body.ad_account_ids : configuredAccountIds,
    );

    if (!adAccountIds.length) {
      throw new Error("Missing FACEBOOK_AD_ACCOUNT_IDS secret or ad_account_ids payload");
    }
    if (startDate > endDate) {
      throw new Error(`Invalid date range: since ${startDate} is after until ${endDate}`);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const syncedAt = new Date().toISOString();
    let upserted = 0;

    for (const adAccountId of adAccountIds) {
      const rows = await fetchCampaignInsights({
        adAccountId,
        accessToken,
        startDate,
        endDate,
        syncedAt,
        onStep: (nextStep) => {
          step = nextStep;
        },
      });
      const syncableRows = excludeCoverageCampaigns(rows);
      const excludedCount = rows.length - syncableRows.length;
      const { rows: dedupedRows, duplicateCount } = dedupeSpendRows(syncableRows, syncedAt);
      console.log("[facebook-ad-spend-sync][dedupe]", {
        adAccountId,
        rawRowsCount: rows.length,
        excludedCoverageCount: excludedCount,
        dedupedRowsCount: dedupedRows.length,
        duplicateCount,
      });
      if (!dedupedRows.length) continue;

      step = "upsert_spend_rows";
      const { error } = await supabase
        .from("facebook_ad_spend_campaign_daily")
        .upsert(dedupedRows, { onConflict: "ad_account_id,campaign_name,spend_date" });
      if (error) {
        console.error("[facebook-ad-spend-sync][supabase_upsert_failed]", {
          table: "facebook_ad_spend_campaign_daily",
          code: error.code,
          message: error.message,
          details: error.details,
        });
        throw new Error(`Supabase upsert failed: ${error.message}`);
      }
      upserted += dedupedRows.length;
    }

    return json({ ok: true, upserted, start_date: startDate, end_date: endDate });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[facebook-ad-spend-sync][error]", {
      name,
      message,
      stack,
      step,
    });
    return json({ ok: false, error: message, name, step }, 500);
  }
});

async function fetchCampaignInsights({
  adAccountId,
  accessToken,
  startDate,
  endDate,
  syncedAt,
  onStep,
}: {
  adAccountId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  syncedAt: string;
  onStep: (step: SyncStep) => void;
}): Promise<SpendUpsertRow[]> {
  const accountPath = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const params = new URLSearchParams({
    level: "campaign",
    fields: "spend,campaign_id,campaign_name,date_start,date_stop",
    time_increment: "1",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    access_token: accessToken,
  });
  let url: string | undefined =
    `https://graph.facebook.com/v20.0/${accountPath}/insights?${params}`;
  const rows: SpendUpsertRow[] = [];

  while (url) {
    onStep("call_meta_api");
    const response = await fetch(url);
    const responseBody = await response.text();

    onStep("parse_meta_response");
    let payload: MetaInsightsResponse;
    try {
      payload = JSON.parse(responseBody) as MetaInsightsResponse;
    } catch (error) {
      console.error("[facebook-ad-spend-sync][meta_response_parse_failed]", {
        status: response.status,
        body: responseBody,
      });
      throw error;
    }

    if (!response.ok || payload.error) {
      console.error("[facebook-ad-spend-sync][meta_api_failed]", {
        status: response.status,
        body: responseBody,
      });
      throw new Error(payload.error?.message ?? `Meta API failed with status ${response.status}`);
    }

    for (const item of payload.data ?? []) {
      if (!item.date_start) continue;
      const fallbackCampaignName = item.campaign_id ? `campaign_${item.campaign_id}` : "Không tên";
      rows.push({
        ad_account_id: accountPath,
        campaign_name: item.campaign_name ?? fallbackCampaignName,
        spend: Number(item.spend ?? 0),
        spend_date: item.date_start,
        raw: item,
        synced_at: syncedAt,
      });
    }

    url = payload.paging?.next;
  }

  return rows;
}

function dedupeSpendRows(rows: SpendUpsertRow[], syncedAt: string) {
  const rowByKey = new Map<string, SpendUpsertRow>();
  let duplicateCount = 0;

  for (const row of rows) {
    const key = `${row.ad_account_id}::${row.campaign_name}::${row.spend_date}`;
    const existing = rowByKey.get(key);
    if (!existing) {
      rowByKey.set(key, { ...row, synced_at: syncedAt });
      continue;
    }

    duplicateCount += 1;
    const rawItems = getRawItems(existing.raw);
    rawItems.push(...getRawItems(row.raw));
    rowByKey.set(key, {
      ...existing,
      spend: existing.spend + row.spend,
      raw: { raw_items: rawItems },
      synced_at: syncedAt,
    });
  }

  return {
    rows: Array.from(rowByKey.values()),
    duplicateCount,
  };
}

function excludeCoverageCampaigns(rows: SpendUpsertRow[]) {
  return rows.filter((row) => !row.campaign_name.toLowerCase().includes("phủ"));
}

function getRawItems(raw: SpendUpsertRow["raw"]): MetaInsightRow[] {
  if ("raw_items" in raw) return raw.raw_items;
  return [raw];
}

function resolveDateRange(searchParams: URLSearchParams, body: SyncRequest, today: string) {
  const queryDate = searchParams.get("date")?.trim();
  const bodyDate = body.date?.trim();
  const date = queryDate || bodyDate;
  if (date) {
    assertYmd(date, "date");
    return { since: date, until: date };
  }

  const since = searchParams.get("since")?.trim() || body.since?.trim() || body.start_date?.trim();
  const until = searchParams.get("until")?.trim() || body.until?.trim() || body.end_date?.trim();
  const defaultSince = `${today.slice(0, 8)}01`;
  const resolvedSince = since || defaultSince;
  const resolvedUntil = until || today;

  assertYmd(resolvedSince, "since");
  assertYmd(resolvedUntil, "until");

  return { since: resolvedSince, until: resolvedUntil };
}

function assertYmd(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${field}; expected YYYY-MM-DD`);
  }
}

async function readJson(req: Request): Promise<SyncRequest> {
  if (req.method === "GET") return {};
  try {
    return (await req.json()) as SyncRequest;
  } catch {
    return {};
  }
}

function normalizeAccountIds(accountIds: string[]) {
  return accountIds.map((id) => id.trim()).filter(Boolean);
}

function readAccountIds(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function formatYmd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
