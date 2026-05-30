import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
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
import {
  type AdsAccount,
  type AdsDashboardData,
  type AdsDatePreset,
  adminDeleteAdsAccount,
  fetchAdminAdsAccounts,
  syncAdsAccountData,
} from "@/lib/adsDashboard";
import { cn } from "@/lib/utils";
import { AdsCampaignTable, AdsKpiCards } from "../employee/ads-dashboard";

export const Route = createFileRoute("/_authenticated/admin/ads-dashboard")({
  component: AdminAdsDashboardPage,
});

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

function AdminAdsDashboardPage() {
  const [datePreset, setDatePreset] = useState<AdsDatePreset>("today");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [dashboardData, setDashboardData] = useState<AdsDashboardData>(EMPTY_DASHBOARD_DATA);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const successfulSyncCacheRef = useRef(new Map<string, number>());
  const accountSelectorRef = useRef<HTMLDivElement>(null);

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

  const accounts = dashboardData.accounts;
  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? accounts[0] ?? null,
    [accounts, activeAccountId],
  );
  const filteredAccounts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) =>
      [
        account.accountName,
        account.accountId,
        account.createdByName ?? "",
        account.createdByUsername ?? "",
        account.createdByRole ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [accounts, search]);

  const loadAccounts = useCallback(async () => {
    const data = await fetchAdminAdsAccounts(currentDateFilter);
    setDashboardData(data);
    return data;
  }, [currentDateFilter]);

  useEffect(() => {
    let isMounted = true;
    fetchAdminAdsAccounts({ datePreset: "today" })
      .then((data) => {
        if (!isMounted) return;
        setDashboardData(data);
        setActiveAccountId(data.accounts[0]?.id ?? "");
      })
      .catch(() => {
        if (!isMounted) return;
        toast.error("Không tải được Ads Dashboard Admin.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
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
    if (!activeAccountId || !accounts.some((account) => account.id === activeAccountId)) {
      setActiveAccountId(accounts[0].id);
    }
  }, [accounts, activeAccountId]);

  useEffect(() => {
    if (!accountSelectorOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountSelectorRef.current?.contains(event.target as Node)) {
        setAccountSelectorOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountSelectorOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountSelectorOpen]);

  const syncSelectedAccount = useCallback(
    async ({ bypassCache = false }: { bypassCache?: boolean } = {}) => {
      if (!activeAccount) return;
      if (datePreset === "custom" && customDateError) {
        toast.error(customDateError);
        return;
      }

      const cacheKey = [
        activeAccount.id,
        currentDateFilter.datePreset,
        currentDateFilter.dateStart ?? "",
        currentDateFilter.dateEnd ?? "",
      ].join("::");
      const lastSyncedAt = successfulSyncCacheRef.current.get(cacheKey);
      const canUseCache =
        !bypassCache &&
        datePreset !== "custom" &&
        typeof lastSyncedAt === "number" &&
        Date.now() - lastSyncedAt < SYNC_CACHE_TTL_MS;

      setIsSyncing(true);
      try {
        if (!canUseCache) {
          const result = await syncAdsAccountData(activeAccount.id, currentDateFilter);
          if (result.ok) {
            successfulSyncCacheRef.current.set(cacheKey, Date.now());
            toast.success(result.message);
          } else {
            toast.info(result.message);
          }
        }
        await loadAccounts();
      } catch {
        toast.error("Không thể đồng bộ dữ liệu tài khoản quảng cáo.");
      } finally {
        setIsSyncing(false);
      }
    },
    [activeAccount, currentDateFilter, customDateError, datePreset, loadAccounts],
  );

  const handleDatePresetChange = async (nextPreset: AdsDatePreset) => {
    setDatePreset(nextPreset);
    if (nextPreset === "custom") return;
    if (!activeAccount) return;

    const nextFilter = { datePreset: nextPreset };
    const cacheKey = [activeAccount.id, nextPreset, "", ""].join("::");
    const lastSyncedAt = successfulSyncCacheRef.current.get(cacheKey);
    const canUseCache =
      typeof lastSyncedAt === "number" && Date.now() - lastSyncedAt < SYNC_CACHE_TTL_MS;

    setIsSyncing(true);
    try {
      if (!canUseCache) {
        const result = await syncAdsAccountData(activeAccount.id, nextFilter);
        if (result.ok) {
          successfulSyncCacheRef.current.set(cacheKey, Date.now());
          toast.success(result.message);
        } else {
          toast.info(result.message);
        }
      }
      const data = await fetchAdminAdsAccounts(nextFilter);
      setDashboardData(data);
    } catch {
      toast.error("Không thể đồng bộ dữ liệu tài khoản quảng cáo.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!activeAccount) return;
    setIsDeleting(true);
    try {
      const result = await adminDeleteAdsAccount(activeAccount.id);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const refreshed = await fetchAdminAdsAccounts(currentDateFilter);
      setDashboardData(refreshed);
      setActiveAccountId(refreshed.accounts[0]?.id ?? "");
      setDeleteOpen(false);
      toast.success(result.message);
    } catch {
      toast.error("Không thể xoá tài khoản quảng cáo.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-2.5 p-3 text-slate-950 md:p-4">
      <section className="rounded-[18px] border border-slate-200/80 bg-white/90 p-3.5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div ref={accountSelectorRef} className="relative max-w-xl">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition-colors hover:bg-white"
                disabled={isLoading || !accounts.length}
                onClick={() => setAccountSelectorOpen((open) => !open)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold text-slate-950">
                    {activeAccount?.accountName ?? "Chọn tài khoản quảng cáo"}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-medium text-slate-500">
                    {activeAccount
                      ? `${activeAccount.accountId} • ${activeAccount.createdByName ?? "—"}`
                      : "Admin quản lý toàn bộ tài khoản quảng cáo"}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                    accountSelectorOpen && "rotate-180",
                  )}
                />
              </button>

              {accountSelectorOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      className="h-9 rounded-xl bg-slate-50 pl-9"
                      placeholder="Tìm tài khoản, ID hoặc người tạo"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-[520px] space-y-1 overflow-auto pr-1">
                    {filteredAccounts.length ? (
                      filteredAccounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          className={cn(
                            "w-full rounded-xl border p-2.5 text-left transition-colors",
                            account.id === activeAccount?.id
                              ? "border-blue-100 bg-blue-50"
                              : "border-transparent hover:bg-slate-50",
                          )}
                          onClick={() => {
                            setActiveAccountId(account.id);
                            setAccountSelectorOpen(false);
                            setSearch("");
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-950">
                                {account.accountName}
                              </span>
                              <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                                {account.accountId}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                {account.createdByName ?? "Chưa rõ người tạo"}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
                                account.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {account.isActive ? "active" : "paused"}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                        Không có tài khoản phù hợp.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex flex-wrap gap-1 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
              {DATE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={cn(
                    "rounded-[11px] px-2.5 py-1 text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-950",
                    datePreset === filter.key && "bg-blue-100 text-blue-700",
                  )}
                  onClick={() => handleDatePresetChange(filter.key)}
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
              disabled={
                !activeAccount || isSyncing || (datePreset === "custom" && Boolean(customDateError))
              }
              onClick={() => syncSelectedAccount({ bypassCache: true })}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            {activeAccount ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 gap-1.5 rounded-xl border-red-100 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá tài khoản
              </Button>
            ) : null}
          </div>
        </div>
        {datePreset === "custom" ? (
          <div className="mt-3 grid gap-2 sm:max-w-md sm:grid-cols-2">
            <Input
              type="date"
              value={customDateStart}
              className="h-9 rounded-xl"
              onChange={(event) => setCustomDateStart(event.target.value)}
            />
            <Input
              type="date"
              value={customDateEnd}
              className="h-9 rounded-xl"
              onChange={(event) => setCustomDateEnd(event.target.value)}
            />
            {customDateError ? (
              <p className="text-xs font-medium text-red-500 sm:col-span-2">{customDateError}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {activeAccount ? (
        <>
          <AdsKpiCards account={activeAccount} />
          <AdsCampaignTable account={activeAccount} showPauseAll={false} />
        </>
      ) : (
        <div className="rounded-[18px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          {isLoading ? (
            <>
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-600" />
              <p className="mt-3 text-sm font-medium text-slate-500">Đang tải tài khoản...</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-950">Chưa có tài khoản quảng cáo nào</h2>
              <p className="mt-2 text-sm text-slate-500">
                Khi employee hoặc leader thêm tài khoản, admin sẽ quản lý tại đây.
              </p>
            </>
          )}
        </div>
      )}

      <DeleteAdsAccountModal
        account={activeAccount}
        isSubmitting={isDeleting}
        open={deleteOpen}
        onConfirm={handleDeleteAccount}
        onOpenChange={setDeleteOpen}
      />
    </main>
  );
}

function DeleteAdsAccountModal({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xoá tài khoản quảng cáo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            Bạn sắp xoá tài khoản quảng cáo này khỏi hệ thống. Hành động này sẽ xoá tài khoản,
            assignment và dữ liệu campaign snapshot liên quan. Không thể hoàn tác.
          </p>
          <div className="grid gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
            <div>
              <span className="font-semibold">Tài khoản:</span> {account?.accountName ?? "—"}
            </div>
            <div>
              <span className="font-semibold">ID:</span> {account?.accountId ?? "—"}
            </div>
            <div>
              <span className="font-semibold">Người tạo:</span> {account?.createdByName ?? "—"}
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
            Xoá vĩnh viễn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
