import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCw, Square } from "lucide-react";
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
  pauseAllActiveAdsets,
  syncAdsAccountData,
  updateAdsAccountToken,
  upsertAdsAccountTest,
} from "@/lib/adsDashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employee/ads-dashboard")({
  component: AdsDashboardPage,
});

type CampaignFilter = "active" | "all";

interface NewAccountForm {
  accountName: string;
  accountId: string;
  accessToken: string;
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

export function AdsDashboardPage() {
  const [datePreset, setDatePreset] = useState<AdsDatePreset>("today");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [dashboardData, setDashboardData] = useState<AdsDashboardData>(EMPTY_DASHBOARD_DATA);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPausingAdsets, setIsPausingAdsets] = useState(false);
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [updateTokenOpen, setUpdateTokenOpen] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [newAccessToken, setNewAccessToken] = useState("");
  const [newAccountForm, setNewAccountForm] = useState<NewAccountForm>({
    accountName: "",
    accountId: "",
    accessToken: "",
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
    if (datePreset !== "custom") return "";
    if (!customDateStart || !customDateEnd) return "Chọn đủ từ ngày và đến ngày.";
    if (customDateStart > customDateEnd) return "Từ ngày phải nhỏ hơn hoặc bằng đến ngày.";
    return "";
  }, [customDateEnd, customDateStart, datePreset]);

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
      try {
        const data = await fetchEmployeeAdsAccounts({ datePreset: "custom" });
        setDashboardData(data);
      } catch {
        toast.error("Không tải được dữ liệu Ads Dashboard.");
      }
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
    const accessToken = newAccountForm.accessToken.trim();

    if (!accountName || !accountId || !accessToken) {
      toast.error("Nhập đủ thông tin tài khoản quảng cáo");
      return;
    }

    try {
      const result = await upsertAdsAccountTest({
        accountName,
        adAccountId: accountId,
        accessToken,
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
      setNewAccountForm({ accountName: "", accountId: "", accessToken: "" });
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
      if (pauseResult.ok) {
        setDashboardData((current) => ({
          ...current,
          accounts: current.accounts.map((account) =>
            account.accountId === activeAccount.accountId
              ? {
                  ...account,
                  campaigns: account.campaigns.map((campaign) =>
                    campaign.activeAdsetCount > 0 ? { ...campaign, activeAdsetCount: 0 } : campaign,
                  ),
                }
              : account,
          ),
        }));
        toast.success(pauseResult.message);
      } else {
        toast.info(pauseResult.message);
      }
      setPauseConfirmOpen(false);
    } catch {
      toast.error("Không thể tắt nhóm quảng cáo.");
    } finally {
      setIsPausingAdsets(false);
    }
  };

  const handleUpdateToken = async () => {
    if (!activeAccount) return;
    const accessToken = newAccessToken.trim();
    if (!accessToken) {
      toast.error("Nhập access token mới");
      return;
    }

    setIsUpdatingToken(true);
    try {
      const result = await updateAdsAccountToken({
        adsAccountId: activeAccount.id,
        accessToken,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      const refreshedData = await fetchEmployeeAdsAccounts(currentDateFilter);
      setDashboardData(refreshedData);
      setNewAccessToken("");
      setUpdateTokenOpen(false);
      toast.success(result.message);
    } catch {
      toast.error("Không thể cập nhật token.");
    } finally {
      setIsUpdatingToken(false);
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
            onUpdateToken={() => setUpdateTokenOpen(true)}
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

      <UpdateAdsAccountTokenModal
        account={activeAccount}
        accessToken={newAccessToken}
        isSubmitting={isUpdatingToken}
        open={updateTokenOpen}
        onAccessTokenChange={setNewAccessToken}
        onOpenChange={(open) => {
          setUpdateTokenOpen(open);
          if (!open) setNewAccessToken("");
        }}
        onSubmit={handleUpdateToken}
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
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        Khi Leader Marketing gán tài khoản quảng cáo, dữ liệu sẽ hiển thị tại đây.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-5 h-9 gap-1.5 rounded-xl border-blue-100 bg-slate-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-50"
        onClick={onAddTestAccount}
      >
        <Plus className="h-4 w-4" />
        Thêm tài khoản test
      </Button>
    </section>
  );
}

function AdsAccountTabs({
  accounts,
  activeAccountId,
  onAddAccount,
  onSelectAccount,
  onUpdateToken,
}: {
  accounts: AdsAccount[];
  activeAccountId: string;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onUpdateToken: () => void;
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
      <Button
        type="button"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 rounded-xl border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        onClick={onUpdateToken}
      >
        <KeyRound className="h-4 w-4" />
        Cập nhật token
      </Button>
    </section>
  );
}

export function AdsKpiCards({ account }: { account: AdsAccount | null }) {
  const activeCampaignCount =
    account?.campaigns.filter((campaign) => campaign.delivery === "ACTIVE").length ?? 0;
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
  const activeAdsetTotal =
    account?.campaigns.reduce((total, campaign) => total + campaign.activeAdsetCount, 0) ?? 0;
  const visibleCampaigns = useMemo(() => {
    const campaigns = account?.campaigns ?? [];
    if (campaignFilter === "all") return campaigns;
    return campaigns.filter((campaign) => campaign.activeAdsetCount > 0);
  }, [account, campaignFilter]);
  const totals = useMemo(() => calculateCampaignTotals(visibleCampaigns), [visibleCampaigns]);
  const totalPages =
    campaignFilter === "all"
      ? Math.min(Math.ceil(visibleCampaigns.length / ALL_CAMPAIGNS_PAGE_SIZE), MAX_CAMPAIGN_PAGES)
      : 1;
  const displayedCampaigns = useMemo(() => {
    if (campaignFilter !== "all") return visibleCampaigns;
    const startIndex = (currentPage - 1) * ALL_CAMPAIGNS_PAGE_SIZE;
    return visibleCampaigns.slice(startIndex, startIndex + ALL_CAMPAIGNS_PAGE_SIZE);
  }, [campaignFilter, currentPage, visibleCampaigns]);
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

      <div className="max-h-[min(58vh,620px)] overflow-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3.5 py-2.5">Tên Campaign</th>
              <th className="px-3.5 py-2.5">Phân phối</th>
              <th className="px-3.5 py-2.5 text-right">Ngân sách</th>
              <th className="px-3.5 py-2.5 text-right">Đã tiêu</th>
              <th className="px-3.5 py-2.5 text-right">Kết quả</th>
              <th className="px-3.5 py-2.5 text-right">Lượt mua</th>
              <th className="px-3.5 py-2.5 text-right">Chi phí / KQ</th>
            </tr>
          </thead>
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
                    <DeliveryStatus activeAdsetCount={campaign.activeAdsetCount} />
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
            <tr className="bg-blue-50/40 font-semibold">
              <td className="border-t border-slate-300 px-3.5 py-2.5">
                Kết quả từ {visibleCampaigns.length} chiến dịch
              </td>
              <td className="border-t border-slate-300 px-3.5 py-2.5" />
              <td className="whitespace-nowrap border-t border-slate-300 px-3.5 py-2.5 text-right">
                {formatMoney(totals.budget)}
              </td>
              <td className="whitespace-nowrap border-t border-slate-300 px-3.5 py-2.5 text-right text-orange-700">
                {formatMoney(totals.spent)}
              </td>
              <td className="border-t border-slate-300 px-3.5 py-2.5 text-right">
                {totals.result ? formatNumber(totals.result) : "—"}
              </td>
              <td className="border-t border-slate-300 px-3.5 py-2.5 text-right">
                {totals.purchase ? `${formatNumber(totals.purchase)} đơn` : "—"}
              </td>
              <td className="whitespace-nowrap border-t border-slate-300 px-3.5 py-2.5 text-right">
                {formatCostPerResult(totals.spent, totals.result)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {campaignFilter === "all" && visibleCampaigns.length > ALL_CAMPAIGNS_PAGE_SIZE ? (
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
              placeholder="act_2407288503067302"
              onChange={(event) => onFormChange({ ...form, accountId: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Access token</Label>
            <Input
              value={form.accessToken}
              type="password"
              className="rounded-xl"
              placeholder="EAAB..."
              onChange={(event) => onFormChange({ ...form, accessToken: event.target.value })}
            />
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Token chỉ dùng để test hiển thị dữ liệu. Giai đoạn sau Leader Marketing sẽ quản lý tài
            khoản quảng cáo và gán cho nhân viên.
          </p>
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

function PauseAllAdsetsModal({
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

function UpdateAdsAccountTokenModal({
  account,
  accessToken,
  isSubmitting,
  open,
  onAccessTokenChange,
  onOpenChange,
  onSubmit,
}: {
  account: AdsAccount | null;
  accessToken: string;
  isSubmitting: boolean;
  open: boolean;
  onAccessTokenChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cập nhật Access Token</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">
              {account?.accountName ?? "Chưa có tài khoản"}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-500">
              {account?.accountId ?? "—"}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Access token mới</Label>
            <Input
              value={accessToken}
              type="password"
              className="rounded-xl"
              placeholder="EAAB..."
              onChange={(event) => onAccessTokenChange(event.target.value)}
            />
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Token mới sẽ thay thế token cũ. Hệ thống không hiển thị lại token đã lưu.
          </p>
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
          <Button className="rounded-xl" disabled={!account || isSubmitting} onClick={onSubmit}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Lưu token
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
  remainingBudget,
  spendLimit,
  spendPercent,
}: {
  amountSpent: number;
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
    </article>
  );
}

function DeliveryStatus({ activeAdsetCount }: { activeAdsetCount: number }) {
  const item =
    activeAdsetCount > 0
      ? { label: "Đang hoạt động", dot: "bg-emerald-500", text: "text-emerald-700" }
      : { label: "Nhóm quảng cáo: Tắt", dot: "bg-slate-400", text: "text-slate-500" };
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

function ResultMetric({ campaign }: { campaign: AdsCampaign }) {
  if (!campaign.result) return <span className="text-slate-400">—</span>;
  const type = getCampaignType(campaign.name);
  const label =
    type === "MESS" ? "khách hàng tiềm năng" : type === "CONVERSION" ? "lượt hoàn tất đăng ký" : "";
  return (
    <span className="inline-grid justify-items-end leading-tight">
      <span className="font-bold text-slate-950">{formatNumber(campaign.result)}</span>
      {label ? <span className="text-[11.5px] text-slate-500">{label}</span> : null}
    </span>
  );
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

function getCampaignType(name: string) {
  const normalized = name.toUpperCase();
  if (normalized.includes("MESS")) return "MESS";
  if (normalized.includes("CĐ") || normalized.includes("CD")) return "CONVERSION";
  return "OTHER";
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
