import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Plus, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AdsAccount,
  type AdsCampaign,
  type AdsDatePreset,
  type AdsDashboardData,
  fetchEmployeeAdsAccounts,
  getAdsDateFilterValidationError,
  pauseAllActiveAdsets,
  stripMetaAdAccountPrefix,
  syncAdsAccountData,
  upsertAdsAccountTest,
} from "@/lib/adsDashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employee/ads-dashboard")({
  component: AdsDashboardPage,
});

type CampaignFilter = "active" | "all";
type CampaignSortKey =
  | "name"
  | "delivery"
  | "budget"
  | "spent"
  | "result"
  | "purchase"
  | "costPerResult";
type CampaignSortState = { key: CampaignSortKey; direction: "asc" | "desc" } | null;

interface NewAccountForm {
  accountName: string;
  accountId: string;
}

const EMPTY_DASHBOARD_DATA: AdsDashboardData = {
  accounts: [],
  syncedAt: null,
};

const DATE_FILTERS: { key: AdsDatePreset; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "this_week", label: "Tuần này" },
  { key: "this_month", label: "Tháng này" },
  { key: "custom", label: "Tuỳ chỉnh" },
];

const SYNC_CACHE_TTL_MS = 60_000;
const ALL_CAMPAIGNS_PAGE_SIZE = 10;
const MAX_CAMPAIGN_PAGES = 5;

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function AdsDashboardPage() {
  const [datePreset, setDatePreset] = useState<AdsDatePreset>("today");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [dashboardData, setDashboardData] = useState<AdsDashboardData>(EMPTY_DASHBOARD_DATA);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPausingAdsets, setIsPausingAdsets] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState<NewAccountForm>({
    accountName: "",
    accountId: "",
  });
  const successfulSyncCacheRef = useRef(new Map<string, number>());

  const accounts = dashboardData.accounts;
  const currentDateFilter = useMemo(
    () => ({
      datePreset,
      dateStart: datePreset === "custom" ? customDateStart : undefined,
      dateEnd: datePreset === "custom" ? customDateEnd : undefined,
    }),
    [customDateEnd, customDateStart, datePreset],
  );

  const customDateError = useMemo(() => {
    return getAdsDateFilterValidationError(currentDateFilter);
  }, [currentDateFilter]);

  const loadAdsAccounts = useCallback(async () => {
    const data = await fetchEmployeeAdsAccounts(currentDateFilter);
    setDashboardData(data);
    return data;
  }, [currentDateFilter]);

  useEffect(() => {
    let isMounted = true;

    fetchEmployeeAdsAccounts({ datePreset: "today" })
      .then((data) => {
        if (!isMounted) return;
        setDashboardData(data);
        setActiveAccountId(data.accounts[0]?.accountId ?? "");
      })
      .catch(() => {
        if (!isMounted) return;
        toast.error("Không tải được dữ liệu Ads Dashboard.");
        setDashboardData(EMPTY_DASHBOARD_DATA);
      })
      .finally(() => {
        if (isMounted) setIsLoadingAccounts(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accounts.length) {
      setActiveAccountId("");
      return;
    }

    if (!activeAccountId || !accounts.some((account) => account.accountId === activeAccountId)) {
      setActiveAccountId(accounts[0].accountId);
    }
  }, [accounts, activeAccountId]);

  const activeAccount = useMemo(
    () => accounts.find((account) => account.accountId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  const buildSyncCacheKey = useCallback(
    (accountId: string) =>
      [
        accountId,
        currentDateFilter.datePreset,
        currentDateFilter.dateStart ?? "",
        currentDateFilter.dateEnd ?? "",
      ].join("::"),
    [currentDateFilter],
  );

  const syncAndReloadAccount = useCallback(
    async ({ bypassCache = false }: { bypassCache?: boolean } = {}) => {
      if (!activeAccount) return;
      if (datePreset === "custom" && customDateError) {
        toast.error(customDateError);
        return;
      }

      const cacheKey = buildSyncCacheKey(activeAccount.id);
      const lastSyncedAt = successfulSyncCacheRef.current.get(cacheKey);
      const canUseCache =
        !bypassCache &&
        datePreset !== "custom" &&
        typeof lastSyncedAt === "number" &&
        Date.now() - lastSyncedAt < SYNC_CACHE_TTL_MS;

      setIsSyncing(true);
      try {
        if (canUseCache) {
          await loadAdsAccounts();
          return;
        }

        const syncResult = await syncAdsAccountData(activeAccount.id, currentDateFilter);
        if (syncResult.ok) {
          successfulSyncCacheRef.current.set(cacheKey, Date.now());
          toast.success(syncResult.message);
        } else {
          toast.info(syncResult.message);
        }
        await loadAdsAccounts();
      } catch {
        toast.error("Không thể đồng bộ dữ liệu tài khoản quảng cáo.");
      } finally {
        setIsSyncing(false);
      }
    },
    [
      activeAccount,
      buildSyncCacheKey,
      currentDateFilter,
      customDateError,
      datePreset,
      loadAdsAccounts,
    ],
  );

  const handleSyncData = async () => {
    await syncAndReloadAccount({ bypassCache: true });
  };

  const handleDatePresetChange = async (nextPreset: AdsDatePreset) => {
    setDatePreset(nextPreset);
    if (nextPreset === "custom") {
      return;
    }
    if (!activeAccount) return;

    const nextFilter = { datePreset: nextPreset };
    const cacheKey = [activeAccount.id, nextPreset, "", ""].join("::");
    const lastSyncedAt = successfulSyncCacheRef.current.get(cacheKey);
    const canUseCache =
      typeof lastSyncedAt === "number" && Date.now() - lastSyncedAt < SYNC_CACHE_TTL_MS;

    setIsSyncing(true);
    try {
      if (!canUseCache) {
        const syncResult = await syncAdsAccountData(activeAccount.id, nextFilter);
        if (syncResult.ok) {
          successfulSyncCacheRef.current.set(cacheKey, Date.now());
          toast.success(syncResult.message);
        } else {
          toast.info(syncResult.message);
        }
      }
      const data = await fetchEmployeeAdsAccounts(nextFilter);
      setDashboardData(data);
    } catch {
      toast.error("Không thể đồng bộ dữ liệu tài khoản quảng cáo.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectAccount = (accountId: string) => {
    setActiveAccountId(accountId);
  };

  const handleAddAccount = async () => {
    const accountName = newAccountForm.accountName.trim();
    const accountId = newAccountForm.accountId.trim();

    if (!accountName || !accountId) {
      toast.error("Nhập đủ thông tin tài khoản quảng cáo");
      return;
    }
    if (!/^\d+$/.test(accountId)) {
      toast.error("ID tài khoản quảng cáo chỉ gồm phần số");
      return;
    }

    try {
      const result = await upsertAdsAccountTest({
        accountName,
        adAccountId: accountId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      const refreshedData = await fetchEmployeeAdsAccounts(currentDateFilter);
      setDashboardData(refreshedData);
      const createdAccount = refreshedData.accounts.find(
        (account) => account.id === result.accountId,
      );
      setActiveAccountId(createdAccount?.accountId ?? refreshedData.accounts[0]?.accountId ?? "");
      setNewAccountForm({ accountName: "", accountId: "" });
      setAddAccountOpen(false);
      toast.success(result.message);
    } catch {
      toast.error("Không thể thêm tài khoản quảng cáo test.");
    }
  };

  const handlePauseAllActiveAdsets = async () => {
    if (!activeAccount) return;

    setIsPausingAdsets(true);
    try {
      const pauseResult = await pauseAllActiveAdsets(activeAccount.id);
      const shouldRefreshAfterPause =
        !customDateError && (pauseResult.ok || (pauseResult.pausedCount ?? 0) > 0);

      if (shouldRefreshAfterPause) {
        await syncAdsAccountData(activeAccount.id, currentDateFilter);
        await loadAdsAccounts();
      }

      if (pauseResult.ok) {
        toast.success(pauseResult.message);
      } else if ((pauseResult.pausedCount ?? 0) > 0) {
        toast.warning(pauseResult.message);
      } else {
        toast.error(pauseResult.message);
      }
      setPauseConfirmOpen(false);
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không thể tắt nhóm quảng cáo."));
    } finally {
      setIsPausingAdsets(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-2.5 p-3 text-slate-950 md:p-4">
      <AdsDashboardHeader
        customDateEnd={customDateEnd}
        customDateError={customDateError}
        customDateStart={customDateStart}
        datePreset={datePreset}
        hasAccount={Boolean(activeAccount)}
        isSyncing={isSyncing}
        onCustomDateEndChange={setCustomDateEnd}
        onCustomDateStartChange={setCustomDateStart}
        onDatePresetChange={handleDatePresetChange}
        onSync={handleSyncData}
      />

      {isLoadingAccounts ? (
        <section className="rounded-[18px] border border-slate-200/80 bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-medium text-slate-500">Đang tải tài khoản quảng cáo...</p>
        </section>
      ) : accounts.length ? (
        <>
          <AdsAccountTabs
            accounts={accounts}
            activeAccountId={activeAccount?.accountId ?? ""}
            onAddAccount={() => setAddAccountOpen(true)}
            onSelectAccount={handleSelectAccount}
          />

          <AdsKpiCards account={activeAccount} />

          <AdsCampaignTable account={activeAccount} onPauseAll={() => setPauseConfirmOpen(true)} />
        </>
      ) : (
        <AdsEmptyState onAddTestAccount={() => setAddAccountOpen(true)} />
      )}

      <AddAdsAccountModal
        open={addAccountOpen}
        form={newAccountForm}
        onOpenChange={setAddAccountOpen}
        onFormChange={setNewAccountForm}
        onSubmit={handleAddAccount}
      />

      <PauseAllAdsetsModal
        account={activeAccount}
        isSubmitting={isPausingAdsets}
        open={pauseConfirmOpen}
        onConfirm={handlePauseAllActiveAdsets}
        onOpenChange={setPauseConfirmOpen}
      />
    </main>
  );
}

function AdsDashboardHeader({
  customDateEnd,
  customDateError,
  customDateStart,
  datePreset,
  hasAccount,
  isSyncing,
  onCustomDateEndChange,
  onCustomDateStartChange,
  onDatePresetChange,
  onSync,
}: {
  customDateEnd: string;
  customDateError: string;
  customDateStart: string;
  datePreset: AdsDatePreset;
  hasAccount: boolean;
  isSyncing: boolean;
  onCustomDateEndChange: (value: string) => void;
  onCustomDateStartChange: (value: string) => void;
  onDatePresetChange: (preset: AdsDatePreset) => void;
  onSync: () => void;
}) {
  const syncDisabled =
    !hasAccount || isSyncing || (datePreset === "custom" && Boolean(customDateError));

  return (
    <section className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur md:flex md:items-start md:justify-between md:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
          Ads Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Theo dõi nhanh tình trạng tài khoản quảng cáo và hiệu suất chiến dịch
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:justify-end">
        <div className="inline-flex flex-wrap gap-1 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={cn(
                "rounded-[11px] px-2.5 py-1 text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-950",
                datePreset === filter.key && "bg-blue-100 text-blue-700",
              )}
              onClick={() => onDatePresetChange(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-[11px] border-blue-100 bg-slate-50 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          title="Đồng bộ dữ liệu"
          aria-label="Đồng bộ dữ liệu"
          disabled={syncDisabled}
          onClick={onSync}
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        {datePreset === "custom" ? (
          <div className="grid w-full grid-cols-2 gap-2 md:w-auto">
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Từ ngày
              <Input
                type="date"
                value={customDateStart}
                className="h-9 rounded-xl bg-white"
                onChange={(event) => onCustomDateStartChange(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Đến ngày
              <Input
                type="date"
                value={customDateEnd}
                className="h-9 rounded-xl bg-white"
                onChange={(event) => onCustomDateEndChange(event.target.value)}
              />
            </label>
            {customDateError ? (
              <p className="col-span-2 text-xs font-medium text-red-500">{customDateError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AdsEmptyState({ onAddTestAccount }: { onAddTestAccount: () => void }) {
  return (
    <section className="rounded-[18px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <RefreshCw className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-950">
        Chưa có tài khoản quảng cáo nào được kết nối
      </h2>
      <Button
        type="button"
        variant="outline"
        className="mt-5 h-9 gap-1.5 rounded-xl border-blue-100 bg-slate-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-50"
        onClick={onAddTestAccount}
      >
        <Plus className="h-4 w-4" />
        Thêm tài khoản
      </Button>
    </section>
  );
}

function AdsAccountTabs({
  accounts,
  activeAccountId,
  onAddAccount,
  onSelectAccount,
}: {
  accounts: AdsAccount[];
  activeAccountId: string;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
}) {
  return (
    <section className="flex items-center gap-2 overflow-hidden rounded-[18px] border border-slate-200/80 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {accounts.map((account) => (
          <button
            key={account.accountId}
            type="button"
            title={account.accountName}
            className={cn(
              "relative max-w-[260px] shrink-0 truncate rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950",
              account.accountId === activeAccountId && "bg-blue-50 text-slate-950",
            )}
            onClick={() => onSelectAccount(account.accountId)}
          >
            {account.accountName}
            {account.accountId === activeAccountId ? (
              <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-blue-600" />
            ) : null}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 rounded-xl border-blue-100 bg-slate-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-50"
        onClick={onAddAccount}
      >
        <Plus className="h-4 w-4" />
        Thêm tài khoản
      </Button>
    </section>
  );
}

export function AdsKpiCards({ account }: { account: AdsAccount | null }) {
  const activeCampaignCount =
    account?.campaigns.filter((campaign) => getCampaignDeliveryState(campaign).key === "active")
      .length ?? 0;
  const remainingBudget = Math.max((account?.spendLimit ?? 0) - (account?.amountSpent ?? 0), 0);
  const spendPercent =
    account && account.spendLimit > 0
      ? Math.min((account.amountSpent / account.spendLimit) * 100, 100)
      : 0;

  return (
    <section className="grid grid-cols-1 gap-2.5 rounded-[18px] border border-slate-200/80 bg-white p-2.5 shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,2.4fr)]">
      <KpiCard label="Camp ON" value={formatNumber(activeCampaignCount)} />
      <KpiCard label="Adset ON" value={formatNumber(account?.adsetOn ?? 0)} />
      <AccountSpendLimitCard
        amountSpent={account?.amountSpent ?? 0}
        lastSyncedAt={account?.lastSyncedAt ?? null}
        remainingBudget={remainingBudget}
        spendLimit={account?.spendLimit ?? 0}
        spendPercent={spendPercent}
      />
    </section>
  );
}

export function AdsCampaignTable({
  account,
  onPauseAll,
  showPauseAll = true,
}: {
  account: AdsAccount | null;
  onPauseAll?: () => void;
  showPauseAll?: boolean;
}) {
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<CampaignSortState>(null);
  const activeAdsetTotal =
    account?.campaigns.reduce((total, campaign) => total + campaign.activeAdsetCount, 0) ?? 0;
  const visibleCampaigns = useMemo(() => {
    const campaigns = account?.campaigns ?? [];
    const filtered =
      campaignFilter === "all"
        ? campaigns
        : campaigns.filter((campaign) => getCampaignDeliveryState(campaign).key === "active");
    return sortCampaigns(filtered, sortState);
  }, [account, campaignFilter, sortState]);
  const totals = useMemo(() => calculateCampaignTotals(visibleCampaigns), [visibleCampaigns]);
  const totalPages = Math.min(
    Math.ceil(visibleCampaigns.length / ALL_CAMPAIGNS_PAGE_SIZE),
    MAX_CAMPAIGN_PAGES,
  );
  const displayedCampaigns = useMemo(() => {
    const startIndex = (currentPage - 1) * ALL_CAMPAIGNS_PAGE_SIZE;
    return visibleCampaigns.slice(startIndex, startIndex + ALL_CAMPAIGNS_PAGE_SIZE);
  }, [currentPage, visibleCampaigns]);
  const emptyMessage =
    campaignFilter === "active"
      ? "Không có campaign nào có nhóm quảng cáo đang hoạt động"
      : "Chưa có dữ liệu campaign";

  useEffect(() => {
    setCurrentPage(1);
  }, [account?.accountId, account?.campaigns, campaignFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(totalPages, 1));
    }
  }, [currentPage, totalPages]);

  const toggleSort = (key: CampaignSortKey) => {
    setCurrentPage(1);
    setSortState((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  return (
    <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Chiến dịch đang chạy</h2>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(["active", "all"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={cn(
                  "h-7 rounded-lg px-3 text-xs font-semibold transition-colors",
                  campaignFilter === filter
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800",
                )}
                onClick={() => setCampaignFilter(filter)}
              >
                {filter === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div
            className="max-w-[310px] truncate rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500"
            title={account?.accountName ?? ""}
          >
            {account?.accountName ?? "Chưa có tài khoản"}
          </div>
          {account && showPauseAll ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl border-red-100 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
              title="Tắt tất cả nhóm quảng cáo"
              disabled={activeAdsetTotal === 0}
              onClick={onPauseAll}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Tắt tất cả nhóm
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <table className="w-full table-fixed text-sm">
            <CampaignTableColgroup />
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <SortableTh sortKey="name" sortState={sortState} onSort={toggleSort}>
                  Tên Campaign
                </SortableTh>
                <SortableTh sortKey="delivery" sortState={sortState} onSort={toggleSort}>
                  Phân phối
                </SortableTh>
                <SortableTh
                  align="right"
                  sortKey="budget"
                  sortState={sortState}
                  onSort={toggleSort}
                >
                  Ngân sách
                </SortableTh>
                <SortableTh align="right" sortKey="spent" sortState={sortState} onSort={toggleSort}>
                  Đã tiêu
                </SortableTh>
                <SortableTh
                  align="right"
                  sortKey="result"
                  sortState={sortState}
                  onSort={toggleSort}
                >
                  Kết quả
                </SortableTh>
                <SortableTh
                  align="right"
                  sortKey="purchase"
                  sortState={sortState}
                  onSort={toggleSort}
                >
                  Lượt mua
                </SortableTh>
                <SortableTh
                  align="right"
                  sortKey="costPerResult"
                  sortState={sortState}
                  onSort={toggleSort}
                >
                  Chi phí / KQ
                </SortableTh>
              </tr>
            </thead>
          </table>

          <div className="max-h-[min(48vh,520px)] overflow-y-auto border-y border-slate-100">
            <table className="w-full table-fixed text-sm">
              <CampaignTableColgroup />
              <tbody>
                {displayedCampaigns.length ? (
                  displayedCampaigns.map((campaign) => (
                    <tr
                      key={campaign.campaignId}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="max-w-[360px] font-medium leading-snug text-blue-950/90">
                          {campaign.name}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <DeliveryStatus campaign={campaign} />
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                        {formatMoney(campaign.budget)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold text-orange-700">
                        {formatMoney(campaign.spent)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <ResultMetric campaign={campaign} />
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <PurchaseMetric purchase={campaign.purchase} />
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                        {formatCostPerResult(campaign.spent, campaign.result)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-10 text-center text-sm text-slate-500">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <table className="w-full table-fixed text-sm">
            <CampaignTableColgroup />
            <tbody>
              <tr className="bg-blue-50/40 font-semibold">
                <td className="px-3.5 py-2.5">Kết quả từ {visibleCampaigns.length} chiến dịch</td>
                <td className="px-3.5 py-2.5" />
                <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                  {formatMoney(totals.budget)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-orange-700">
                  {formatMoney(totals.spent)}
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  {totals.result ? formatNumber(totals.result) : "—"}
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  {totals.purchase ? `${formatNumber(totals.purchase)} đơn` : "—"}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                  {formatCostPerResult(totals.spent, totals.result)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {visibleCampaigns.length > ALL_CAMPAIGNS_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-xl px-3 text-xs font-semibold"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
          >
            Trước
          </Button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              className={cn(
                "h-8 min-w-8 rounded-xl border px-2 text-xs font-semibold transition-colors",
                currentPage === page
                  ? "border-blue-100 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              )}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-xl px-3 text-xs font-semibold"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
          >
            Sau
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function AddAdsAccountModal({
  open,
  form,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  form: NewAccountForm;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: NewAccountForm) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm tài khoản quảng cáo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tên tài khoản quảng cáo</Label>
            <Input
              value={form.accountName}
              className="rounded-xl"
              placeholder="VD: INV_AKA_DASNOTRI_HỮU HUY_03_29/05/26"
              onChange={(event) => onFormChange({ ...form, accountName: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ID tài khoản quảng cáo</Label>
            <Input
              value={form.accountId}
              className="rounded-xl"
              placeholder="VD: 2407288503067302"
              onChange={(event) =>
                onFormChange({
                  ...form,
                  accountId: stripMetaAdAccountPrefix(event.target.value),
                })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button className="rounded-xl" onClick={onSubmit}>
            Lưu tài khoản
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PauseAllAdsetsModal({
  account,
  isSubmitting,
  open,
  onConfirm,
  onOpenChange,
}: {
  account: AdsAccount | null;
  isSubmitting: boolean;
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const activeAdsetCount =
    account?.campaigns.reduce((total, campaign) => total + campaign.activeAdsetCount, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tắt tất cả nhóm quảng cáo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            Bạn sắp tắt toàn bộ nhóm quảng cáo đang hoạt động trong tài khoản này. Campaign vẫn được
            giữ nguyên, chỉ các nhóm quảng cáo sẽ bị tắt.
          </p>
          <div className="grid gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
            <div>
              <span className="font-semibold">Tài khoản:</span>{" "}
              {account?.accountName ?? "Chưa có tài khoản"}
            </div>
            <div>
              <span className="font-semibold">Số nhóm quảng cáo đang hoạt động:</span>{" "}
              {formatNumber(activeAdsetCount)}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Huỷ
          </Button>
          <Button
            className="rounded-xl bg-red-600 hover:bg-red-700"
            disabled={!account || isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Xác nhận tắt tất cả nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[12.5px] font-medium text-slate-500">{label}</div>
      <div className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
        {value}
      </div>
    </article>
  );
}

function AccountSpendLimitCard({
  amountSpent,
  lastSyncedAt,
  remainingBudget,
  spendLimit,
  spendPercent,
}: {
  amountSpent: number;
  lastSyncedAt: string | null;
  remainingBudget: number;
  spendLimit: number;
  spendPercent: number;
}) {
  return (
    <article className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-semibold text-slate-600">
            Giới hạn chi tiêu cho tài khoản
          </div>
          <div className="mt-1.5 text-lg font-bold tracking-tight text-slate-950 md:text-xl">
            Số tiền còn lại: {formatMoneyWithSpace(remainingBudget)}
          </div>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm">
          {Math.round(spendPercent)}%
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all"
          style={{ width: `${spendPercent}%` }}
        />
      </div>
      <div className="mt-2 text-xs font-medium text-slate-500">
        Đã chi tiêu {formatMoneyWithSpace(amountSpent)} | Giới hạn chi tiêu:{" "}
        {formatMoneyWithSpace(spendLimit)}
      </div>
      <div className="mt-1 text-[11.5px] font-medium text-slate-400">
        Đồng bộ lần cuối: {formatAdsDateTime(lastSyncedAt)}
      </div>
    </article>
  );
}

function CampaignTableColgroup() {
  return (
    <colgroup>
      <col className="w-[31%]" />
      <col className="w-[17%]" />
      <col className="w-[12%]" />
      <col className="w-[12%]" />
      <col className="w-[11%]" />
      <col className="w-[8%]" />
      <col className="w-[9%]" />
    </colgroup>
  );
}

function SortableTh({
  align = "left",
  children,
  onSort,
  sortKey,
  sortState,
}: {
  align?: "left" | "right";
  children: string;
  onSort: (key: CampaignSortKey) => void;
  sortKey: CampaignSortKey;
  sortState: CampaignSortState;
}) {
  const isActive = sortState?.key === sortKey;
  const Icon = !isActive ? ChevronsUpDown : sortState.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="sticky top-0 z-10 bg-slate-50 px-3.5 py-2.5">
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wide transition-colors hover:text-slate-900",
          align === "right" ? "justify-end text-right" : "justify-start text-left",
          isActive ? "text-slate-950" : "text-slate-500",
        )}
        onClick={() => onSort(sortKey)}
      >
        <span>{children}</span>
        <Icon className={cn("h-3.5 w-3.5", isActive ? "opacity-100" : "opacity-45")} />
      </button>
    </th>
  );
}

function DeliveryStatus({ campaign }: { campaign: AdsCampaign }) {
  const item = getCampaignDeliveryState(campaign);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium",
        item.text,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", item.dot)} />
      {item.label}
    </span>
  );
}

function getCampaignDeliveryState(campaign: AdsCampaign) {
  if (campaign.delivery === "SCHEDULED") {
    return {
      key: "scheduled" as const,
      rank: 2,
      label: "Đã lên lịch",
      dot: "bg-amber-500",
      text: "text-amber-700",
    };
  }
  if (campaign.delivery === "ACTIVE" && campaign.activeAdsetCount > 0) {
    return {
      key: "active" as const,
      rank: 1,
      label: "Đang hoạt động",
      dot: "bg-emerald-500",
      text: "text-emerald-700",
    };
  }
  if (campaign.activeAdsetCount === 0 || campaign.delivery === "PAUSED") {
    return {
      key: "adsets_off" as const,
      rank: 3,
      label: "Nhóm quảng cáo: Tắt",
      dot: "bg-slate-400",
      text: "text-slate-500",
    };
  }
  return {
    key: "other" as const,
    rank: 4,
    label: "Trạng thái khác",
    dot: "bg-slate-400",
    text: "text-slate-500",
  };
}

function sortCampaigns(campaigns: AdsCampaign[], sortState: CampaignSortState) {
  const direction = sortState?.direction === "desc" ? -1 : 1;
  return [...campaigns].sort((a, b) => {
    if (!sortState) {
      return (
        getCampaignDeliveryState(a).rank - getCampaignDeliveryState(b).rank ||
        a.name.localeCompare(b.name, "vi")
      );
    }

    const compared = compareCampaignValue(a, b, sortState.key);
    return compared * direction;
  });
}

function compareCampaignValue(a: AdsCampaign, b: AdsCampaign, key: CampaignSortKey) {
  if (key === "name") return a.name.localeCompare(b.name, "vi");
  if (key === "delivery") {
    return (
      getCampaignDeliveryState(a).rank - getCampaignDeliveryState(b).rank ||
      a.name.localeCompare(b.name, "vi")
    );
  }
  if (key === "budget") return a.budget - b.budget;
  if (key === "spent") return a.spent - b.spent;
  if (key === "result") return (a.result ?? 0) - (b.result ?? 0);
  if (key === "purchase") return (a.purchase ?? 0) - (b.purchase ?? 0);
  return getCostPerResultValue(a) - getCostPerResultValue(b);
}

function getCostPerResultValue(campaign: AdsCampaign) {
  if (!campaign.result) return Number.POSITIVE_INFINITY;
  return campaign.spent / campaign.result;
}

function ResultMetric({ campaign }: { campaign: AdsCampaign }) {
  if (!campaign.result) return <span className="text-slate-400">—</span>;
  return <span className="font-bold text-slate-950">{formatNumber(campaign.result)}</span>;
}

function PurchaseMetric({ purchase }: { purchase: number | null }) {
  if (!purchase) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-grid justify-items-end leading-tight">
      <span className="font-bold text-slate-950">{formatNumber(purchase)}</span>
      <span className="text-[11.5px] text-slate-500">đơn</span>
    </span>
  );
}

function calculateCampaignTotals(campaigns: AdsCampaign[]) {
  return campaigns.reduce(
    (total, campaign) => {
      total.budget += campaign.budget;
      total.spent += campaign.spent;
      total.result += campaign.result ?? 0;
      total.purchase += campaign.purchase ?? 0;
      return total;
    },
    { budget: 0, spent: 0, result: 0, purchase: 0 },
  );
}

function formatCostPerResult(spent: number, result: number | null) {
  if (!result) return "—";
  return formatMoney(spent / result);
}

function formatMoney(value: number) {
  return `${currencyFormatter.format(Math.round(value || 0))}đ`;
}

function formatMoneyWithSpace(value: number) {
  return `${currencyFormatter.format(Math.round(value || 0))} đ`;
}

function formatNumber(value: number) {
  return currencyFormatter.format(Math.round(value || 0));
}

function formatAdsDateTime(value: string | null) {
  if (!value) return "Chưa đồng bộ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
