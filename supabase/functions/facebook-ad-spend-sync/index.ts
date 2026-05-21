/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MKTRE_FACEBOOK_AD_ACCOUNT_ID = "2407288503067302";

type SyncRequest = {
  start_date?: string;
  end_date?: string;
  date?: string;
  since?: string;
  until?: string;
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
  campaign_id: string;
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
    const adAccountIds = [MKTRE_FACEBOOK_AD_ACCOUNT_ID];

    if (startDate > endDate) {
      throw new Error(`Invalid date range: since ${startDate} is after until ${endDate}`);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const syncedAt = new Date().toISOString();
    let upserted = 0;
    let totalRawRows = 0;
    let totalDedupedRows = 0;
    let totalDuplicateRows = 0;
    let totalExcludedCoverageRows = 0;
    let totalSpendBeforeExclude = 0;
    let totalSpendAfterExclude = 0;

    for (const adAccountId of adAccountIds) {
      const { rows, pagesFetched } = await fetchCampaignInsights({
        adAccountId,
        accessToken,
        startDate,
        endDate,
        syncedAt,
        onStep: (nextStep) => {
          step = nextStep;
        },
      });
      const totalSpendBefore = sumSpend(rows);
      const { includedRows: syncableRows, excludedRows } = splitCoverageCampaigns(rows);
      const totalSpendAfter = sumSpend(syncableRows);
      const { rows: dedupedRows, duplicateCount } = dedupeSpendRows(syncableRows, syncedAt);
      const topCampaigns = topCampaignSpend(dedupedRows, 20);

      totalRawRows += rows.length;
      totalDedupedRows += dedupedRows.length;
      totalDuplicateRows += duplicateCount;
      totalExcludedCoverageRows += excludedRows.length;
      totalSpendBeforeExclude += totalSpendBefore;
      totalSpendAfterExclude += totalSpendAfter;

      console.log("[facebook-ad-spend-sync][debug]", {
        adAccountId,
        dateRange: { since: startDate, until: endDate },
        pagesFetched,
        rawRowsCount: rows.length,
        excludedCoverageCount: excludedRows.length,
        dedupedRowsCount: dedupedRows.length,
        duplicateCount,
        totalRawSpend: roundMoney(totalSpendBefore),
        excludedSpend: roundMoney(sumSpend(excludedRows)),
        finalSpend: roundMoney(totalSpendAfter),
        excludedCampaigns: summarizeCampaignSpend(excludedRows),
        excludedCampaignNames: Array.from(new Set(excludedRows.map((row) => row.campaign_name))),
        topCampaignSpendAfterExclude: topCampaigns,
      });
      if (!dedupedRows.length) continue;

      step = "upsert_spend_rows";
      const { error } = await supabase
        .from("facebook_ad_spend_campaign_daily")
        .upsert(dedupedRows, { onConflict: "ad_account_id,campaign_id,spend_date" });
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

    return json({
      ok: true,
      upserted,
      start_date: startDate,
      end_date: endDate,
      rawRowsCount: totalRawRows,
      excludedCoverageCount: totalExcludedCoverageRows,
      dedupedRowsCount: totalDedupedRows,
      duplicateCount: totalDuplicateRows,
      totalSpendBeforeExclude: roundMoney(totalSpendBeforeExclude),
      totalSpendAfterExclude: roundMoney(totalSpendAfterExclude),
    });
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
}): Promise<{ rows: SpendUpsertRow[]; pagesFetched: number }> {
  const accountPath = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const params = new URLSearchParams({
    level: "campaign",
    fields: "spend,campaign_id,campaign_name,date_start,date_stop",
    limit: "500",
    time_increment: "1",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    access_token: accessToken,
  });
  let url: string | undefined =
    `https://graph.facebook.com/v20.0/${accountPath}/insights?${params}`;
  const rows: SpendUpsertRow[] = [];
  let pagesFetched = 0;

  while (url) {
    onStep("call_meta_api");
    const response = await fetch(url);
    const responseBody = await response.text();
    pagesFetched += 1;

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
      const campaignName = item.campaign_name ?? fallbackCampaignName;
      rows.push({
        ad_account_id: accountPath,
        campaign_id: item.campaign_id ?? campaignName,
        campaign_name: campaignName,
        spend: Number(item.spend ?? 0),
        spend_date: item.date_start,
        raw: item,
        synced_at: syncedAt,
      });
    }

    url = payload.paging?.next;
  }

  return { rows, pagesFetched };
}

function dedupeSpendRows(rows: SpendUpsertRow[], syncedAt: string) {
  const rowByKey = new Map<string, SpendUpsertRow>();
  let duplicateCount = 0;

  for (const row of rows) {
    const campaignKey = row.campaign_id || row.campaign_name;
    const key = `${row.ad_account_id}::${campaignKey}::${row.spend_date}`;
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
  return splitCoverageCampaigns(rows).includedRows;
}

function splitCoverageCampaigns(rows: SpendUpsertRow[]) {
  const includedRows: SpendUpsertRow[] = [];
  const excludedRows: SpendUpsertRow[] = [];

  for (const row of rows) {
    if (isCoverageCampaign(row.campaign_name)) {
      excludedRows.push(row);
    } else {
      includedRows.push(row);
    }
  }

  return { includedRows, excludedRows };
}

function isCoverageCampaign(campaignName: string) {
  const normalized = normalizeCampaignName(campaignName);
  return normalized.includes("phu");
}

function normalizeCampaignName(campaignName: string) {
  return campaignName
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function sumSpend(rows: SpendUpsertRow[]) {
  return rows.reduce((total, row) => total + Number(row.spend || 0), 0);
}

function summarizeCampaignSpend(rows: SpendUpsertRow[]) {
  return topCampaignSpend(rows, 50);
}

function topCampaignSpend(rows: SpendUpsertRow[], limit: number) {
  const totals = new Map<
    string,
    { campaign_id: string; campaign_name: string; spend: number; rows: number }
  >();

  for (const row of rows) {
    const key = row.campaign_id || row.campaign_name;
    const current = totals.get(key) ?? {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: 0,
      rows: 0,
    };
    current.spend += Number(row.spend || 0);
    current.rows += 1;
    totals.set(key, current);
  }

  return Array.from(totals.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      spend: roundMoney(row.spend),
    }));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
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
