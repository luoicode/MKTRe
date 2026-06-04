import { supabase } from "@/integrations/supabase/client";

export type CampaignDelivery = "ACTIVE" | "PAUSED" | "WARNING" | "SCHEDULED";

export interface AdsCampaign {
  campaignId: string;
  name: string;
  delivery: CampaignDelivery;
  activeAdsetCount: number;
  budget: number;
  spent: number;
  result: number | null;
  purchase: number | null;
}

export interface AdsAccount {
  id: string;
  accountId: string;
  accountName: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
  createdByRole?: string | null;
  lastSyncedAt?: string | null;
  tokenStatus?: string | null;
  isActive?: boolean;
  spendLimit: number;
  amountSpent: number;
  balance: number;
  adsetOn: number;
  campaigns: AdsCampaign[];
}

export interface AdsDashboardData {
  accounts: AdsAccount[];
  syncedAt: string | null;
}

export type AdsDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export interface AdsDateRangeFilter {
  datePreset: AdsDatePreset;
  dateStart?: string;
  dateEnd?: string;
}

export interface AddAdsAccountDraft {
  accountName: string;
  accountId: string;
}

export interface AdsDashboardActionResult {
  ok: boolean;
  message: string;
  account?: AdsAccount | null;
  pausedCount?: number;
  failedCount?: number;
  errors?: { adsetId: string; message: string }[];
}

export interface UpsertAdsAccountTestInput {
  accountName: string;
  adAccountId: string;
  accessToken?: string;
}

export interface UpsertAdsAccountTestResult {
  success: boolean;
  accountId?: string;
  message: string;
}

export interface UpdateAdsAccountTokenInput {
  adsAccountId: string;
  accessToken: string;
}

export interface UpdateAdsAccountTokenResult {
  success: boolean;
  message: string;
}

export interface AdminDeleteAdsAccountResult {
  success: boolean;
  message: string;
}

export interface AdsSystemTokenStatus {
  id: string;
  name: string;
  tokenType: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdByUsername: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  updatedByUsername: string | null;
}

export interface UpsertAdsSystemTokenInput {
  name: string;
  accessToken: string;
}

export interface AdsSystemTokenActionResult {
  success: boolean;
  message: string;
}

interface AdsAccountPublicRow {
  id: string;
  account_name: string;
  ad_account_id: string;
  business_name: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_username?: string | null;
  created_by_role?: string | null;
  currency: string | null;
  timezone_name: string | null;
  spend_limit: number | string | null;
  amount_spent: number | string | null;
  balance: number | string | null;
  adset_on: number | string | null;
  is_active: boolean;
  last_synced_at: string | null;
  token_status?: string | null;
}

interface AdsCampaignSnapshotRow {
  ads_account_id: string;
  campaign_id: string;
  campaign_name: string;
  delivery: string;
  budget: number | string | null;
  spent: number | string | null;
  result_count: number | string | null;
  purchase_count: number | string | null;
  active_adset_count: number | string | null;
  date_preset: string;
  date_start: string | null;
  date_end: string | null;
  synced_at: string;
}

interface AdsSystemTokenPublicRow {
  id: string;
  name: string;
  token_type: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_username: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_by_username: string | null;
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface SelectQuery<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string | boolean | number | null): SelectQuery<T>;
  in(column: string, values: string[]): SelectQuery<T>;
  is(column: string, value: null): SelectQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SelectQuery<T>;
}

interface AdsTableQuery<T> {
  select(columns: string): SelectQuery<T>;
}

interface AdsSupabaseClient {
  from(table: "marketing_ads_accounts_public"): AdsTableQuery<AdsAccountPublicRow>;
  from(table: "marketing_ads_campaign_snapshots"): AdsTableQuery<AdsCampaignSnapshotRow>;
  from(table: "marketing_ads_system_tokens_public"): AdsTableQuery<AdsSystemTokenPublicRow>;
}

const adsSupabase = supabase as unknown as AdsSupabaseClient;

export function stripMetaAdAccountPrefix(adAccountId: string): string {
  return adAccountId.trim().replace(/^act_/i, "");
}

export function normalizeMetaAdAccountId(adAccountId: string): string {
  return `act_${stripMetaAdAccountPrefix(adAccountId)}`;
}

export function getAdsDateFilterValidationError(filter: AdsDateRangeFilter): string {
  if (filter.datePreset !== "custom") return "";
  if (!filter.dateStart || !filter.dateEnd) return "Chọn đủ từ ngày và đến ngày.";
  if (filter.dateStart > filter.dateEnd) return "Từ ngày không được lớn hơn đến ngày.";
  return "";
}

export async function fetchEmployeeAdsAccounts(
  filter: AdsDateRangeFilter = { datePreset: "today" },
): Promise<AdsDashboardData> {
  const validationError = getAdsDateFilterValidationError(filter);
  if (validationError) throw new Error(validationError);

  const { data: accountRows, error: accountsError } = await adsSupabase
    .from("marketing_ads_accounts_public")
    .select(
      "id, account_name, ad_account_id, business_name, currency, timezone_name, spend_limit, amount_spent, balance, adset_on, is_active, last_synced_at",
    )
    .eq("is_active", true)
    .order("account_name", { ascending: true });

  if (accountsError) {
    throw new Error(accountsError.message);
  }

  return fetchAdsDashboardDataForAccountRows(accountRows ?? [], filter);
}

export async function fetchAdminAdsAccounts(
  filter: AdsDateRangeFilter = { datePreset: "today" },
): Promise<AdsDashboardData> {
  const validationError = getAdsDateFilterValidationError(filter);
  if (validationError) throw new Error(validationError);

  const { data: accountRows, error: accountsError } = await adsSupabase
    .from("marketing_ads_accounts_public")
    .select(
      "id, account_name, ad_account_id, business_name, created_by, created_by_name, created_by_username, created_by_role, currency, timezone_name, spend_limit, amount_spent, balance, adset_on, token_status, is_active, last_synced_at",
    )
    .order("account_name", { ascending: true });

  if (accountsError) {
    throw new Error(accountsError.message);
  }

  return fetchAdsDashboardDataForAccountRows(accountRows ?? [], filter);
}

async function fetchAdsDashboardDataForAccountRows(
  safeAccountRows: AdsAccountPublicRow[],
  filter: AdsDateRangeFilter,
) {
  if (!safeAccountRows.length) {
    return {
      accounts: [],
      syncedAt: null,
    };
  }

  const internalAccountIds = safeAccountRows.map((account) => account.id);
  let snapshotsQuery = adsSupabase
    .from("marketing_ads_campaign_snapshots")
    .select(
      "ads_account_id, campaign_id, campaign_name, delivery, budget, spent, result_count, purchase_count, active_adset_count, date_preset, date_start, date_end, synced_at",
    )
    .in("ads_account_id", internalAccountIds)
    .eq("date_preset", filter.datePreset);

  if (filter.datePreset === "custom") {
    snapshotsQuery = snapshotsQuery
      .eq("date_start", filter.dateStart ?? "")
      .eq("date_end", filter.dateEnd ?? "");
  } else {
    snapshotsQuery = snapshotsQuery.is("date_start", null).is("date_end", null);
  }

  const { data: snapshotRows, error: snapshotsError } = await snapshotsQuery.order("synced_at", {
    ascending: false,
  });

  if (snapshotsError) {
    throw new Error(snapshotsError.message);
  }

  const snapshotsByAccountId = groupSnapshotsByAccount(safeLatestSnapshots(snapshotRows ?? []));
  const accounts = safeAccountRows.map((accountRow) =>
    mapAccountRowToDashboardAccount(accountRow, snapshotsByAccountId.get(accountRow.id) ?? []),
  );

  return {
    accounts,
    syncedAt: getLatestSyncTime(safeAccountRows, snapshotRows ?? []),
  };
}

export async function syncAdsAccountData(
  accountId: string,
  filter: AdsDateRangeFilter = { datePreset: "today" },
): Promise<AdsDashboardActionResult> {
  const validationError = getAdsDateFilterValidationError(filter);
  if (validationError) throw new Error(validationError);

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    message: string;
    campaignCount?: number;
    syncedAt?: string;
  }>("sync-ads-account", {
    body: {
      adsAccountId: accountId,
      datePreset: filter.datePreset,
      dateStart: filter.datePreset === "custom" ? filter.dateStart : undefined,
      dateEnd: filter.datePreset === "custom" ? filter.dateEnd : undefined,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success) {
    return {
      ok: false,
      message:
        data?.message ??
        "Không thể đồng bộ dữ liệu. Vui lòng kiểm tra token hoặc quyền truy cập tài khoản quảng cáo.",
      account: null,
    };
  }

  const refreshedData = await fetchEmployeeAdsAccounts(filter);
  return {
    ok: true,
    message: data.message,
    account: refreshedData.accounts.find((account) => account.id === accountId) ?? null,
  };
}

export async function pauseAllActiveAdsets(accountId: string): Promise<AdsDashboardActionResult> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    message: string;
    successCount?: number;
    failedCount?: number;
    errors?: { adsetId: string; message: string }[];
  }>("pause-adsets", {
    body: {
      accountId,
      adsetIds: [],
    },
  });

  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      let responseMessage = "";
      try {
        const payload = (await response.clone().json()) as { message?: string };
        responseMessage = payload.message ?? "";
      } catch {
        responseMessage = "";
      }
      if (responseMessage) {
        throw new Error(responseMessage);
      }
    }
    throw new Error(error.message || "Không thể tắt nhóm quảng cáo.");
  }

  return {
    ok: Boolean(data?.success),
    message: data?.message ?? "Không thể tắt nhóm quảng cáo.",
    pausedCount: data?.successCount ?? 0,
    failedCount: data?.failedCount ?? 0,
    errors: data?.errors ?? [],
  };
}

export async function upsertAdsAccountTest(
  input: UpsertAdsAccountTestInput,
): Promise<UpsertAdsAccountTestResult> {
  const normalizedInput = {
    ...input,
    adAccountId: normalizeMetaAdAccountId(input.adAccountId),
  };

  const { data, error } = await supabase.functions.invoke<UpsertAdsAccountTestResult>(
    "upsert-ads-account-test",
    {
      body: normalizedInput,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: Boolean(data?.success),
    accountId: data?.accountId,
    message: data?.message ?? "Không thể thêm tài khoản quảng cáo test",
  };
}

export async function updateAdsAccountToken(
  input: UpdateAdsAccountTokenInput,
): Promise<UpdateAdsAccountTokenResult> {
  const { data, error } = await supabase.functions.invoke<UpdateAdsAccountTokenResult>(
    "update-ads-account-token",
    {
      body: input,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: Boolean(data?.success),
    message: data?.message ?? "Không thể cập nhật token",
  };
}

export async function adminDeleteAdsAccount(
  accountId: string,
): Promise<AdminDeleteAdsAccountResult> {
  const { data, error } = await supabase.functions.invoke<AdminDeleteAdsAccountResult>(
    "admin-delete-ads-account",
    {
      body: {
        adsAccountId: accountId,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: Boolean(data?.success),
    message: data?.message ?? "Không thể xoá tài khoản quảng cáo",
  };
}

export async function fetchAdsSystemTokenStatus(): Promise<AdsSystemTokenStatus | null> {
  const { data, error } = await adsSupabase
    .from("marketing_ads_system_tokens_public")
    .select(
      "id, name, token_type, is_active, created_at, updated_at, created_by, created_by_name, created_by_username, updated_by, updated_by_name, updated_by_username",
    )
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];
  return row ? mapSystemTokenRow(row) : null;
}

export async function adminUpsertAdsSystemToken(
  input: UpsertAdsSystemTokenInput,
): Promise<AdsSystemTokenActionResult> {
  const { data, error } = await supabase.functions.invoke<AdsSystemTokenActionResult>(
    "admin-upsert-ads-system-token",
    {
      body: input,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: Boolean(data?.success),
    message: data?.message ?? "Không thể lưu token hệ thống",
  };
}

export async function adminDeleteAdsSystemToken(
  tokenId: string,
): Promise<AdsSystemTokenActionResult> {
  const { data, error } = await supabase.functions.invoke<AdsSystemTokenActionResult>(
    "admin-delete-ads-system-token",
    {
      body: {
        tokenId,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: Boolean(data?.success),
    message: data?.message ?? "Không thể xoá token hệ thống",
  };
}

export function createTestAdsAccount(draft: AddAdsAccountDraft): AdsAccount {
  return {
    id: draft.accountId,
    accountId: draft.accountId,
    accountName: draft.accountName,
    spendLimit: 0,
    amountSpent: 0,
    balance: 0,
    adsetOn: 0,
    campaigns: [],
  };
}

function mapAccountRowToDashboardAccount(
  accountRow: AdsAccountPublicRow,
  snapshots: AdsCampaignSnapshotRow[],
): AdsAccount {
  const campaigns = snapshots.map(mapSnapshotRowToCampaign);
  const spendLimit = toNumber(accountRow.spend_limit);
  const rawAmountSpent = toNumber(accountRow.amount_spent);
  const rawBalance = toNumber(accountRow.balance);
  const amountSpent = rawAmountSpent > 0 ? rawAmountSpent : Math.max(spendLimit - rawBalance, 0);
  const balance = rawBalance > 0 ? rawBalance : Math.max(spendLimit - amountSpent, 0);

  return {
    id: accountRow.id,
    accountId: accountRow.ad_account_id,
    accountName: accountRow.account_name,
    createdById: accountRow.created_by ?? null,
    createdByName: accountRow.created_by_name ?? null,
    createdByUsername: accountRow.created_by_username ?? null,
    createdByRole: accountRow.created_by_role ?? null,
    isActive: accountRow.is_active,
    lastSyncedAt: accountRow.last_synced_at,
    tokenStatus: accountRow.token_status ?? null,
    spendLimit,
    amountSpent,
    balance,
    adsetOn: toNumber(accountRow.adset_on),
    campaigns,
  };
}

function mapSnapshotRowToCampaign(snapshot: AdsCampaignSnapshotRow): AdsCampaign {
  return {
    campaignId: snapshot.campaign_id,
    name: snapshot.campaign_name,
    delivery: normalizeCampaignDelivery(snapshot.delivery),
    activeAdsetCount: toNumber(snapshot.active_adset_count),
    budget: toNumber(snapshot.budget),
    spent: toNumber(snapshot.spent),
    result: toNullableNumber(snapshot.result_count),
    purchase: toNullableNumber(snapshot.purchase_count),
  };
}

function mapSystemTokenRow(row: AdsSystemTokenPublicRow): AdsSystemTokenStatus {
  return {
    id: row.id,
    name: row.name,
    tokenType: row.token_type,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdByUsername: row.created_by_username,
    updatedById: row.updated_by,
    updatedByName: row.updated_by_name,
    updatedByUsername: row.updated_by_username,
  };
}

function safeLatestSnapshots(rows: AdsCampaignSnapshotRow[]) {
  const latestByKey = new Map<string, AdsCampaignSnapshotRow>();

  for (const row of rows) {
    const key = [
      row.ads_account_id,
      row.campaign_id,
      row.date_preset,
      row.date_start ?? "",
      row.date_end ?? "",
    ].join(":");
    const existing = latestByKey.get(key);
    if (!existing || new Date(row.synced_at).getTime() > new Date(existing.synced_at).getTime()) {
      latestByKey.set(key, row);
    }
  }

  return [...latestByKey.values()];
}

function groupSnapshotsByAccount(rows: AdsCampaignSnapshotRow[]) {
  const grouped = new Map<string, AdsCampaignSnapshotRow[]>();

  for (const row of rows) {
    const existing = grouped.get(row.ads_account_id) ?? [];
    existing.push(row);
    grouped.set(row.ads_account_id, existing);
  }

  return grouped;
}

function getLatestSyncTime(accounts: AdsAccountPublicRow[], snapshots: AdsCampaignSnapshotRow[]) {
  const times = [
    ...accounts.map((account) => account.last_synced_at),
    ...snapshots.map((snapshot) => snapshot.synced_at),
  ].filter((value): value is string => Boolean(value));

  if (!times.length) return null;

  return times.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  );
}

function normalizeCampaignDelivery(delivery: string): CampaignDelivery {
  const normalized = delivery.toUpperCase();
  if (
    normalized === "ACTIVE" ||
    normalized === "PAUSED" ||
    normalized === "WARNING" ||
    normalized === "SCHEDULED"
  ) {
    return normalized;
  }
  if (normalized === "CAMPAIGN_PAUSED" || normalized === "ADSET_PAUSED") return "PAUSED";
  if (normalized === "PENDING_REVIEW" || normalized === "IN_PROCESS" || normalized === "PENDING")
    return "SCHEDULED";
  if (normalized === "WITH_ISSUES" || normalized === "DISAPPROVED") return "WARNING";
  return "PAUSED";
}

function toNumber(value: number | string | null) {
  if (value === null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null) {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : null;
}
