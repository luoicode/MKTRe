import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  BadgePercent,
  CheckCircle2,
  ExternalLink,
  PiggyBank,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
  XCircle,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AdsAccount, fetchEmployeeAdsAccounts } from "@/lib/adsDashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employee/budget")({
  component: EmployeeBudgetPage,
});

type BudgetTimeFilter = "this_month" | "last_month" | "custom";

const budgetTimeFilters: Array<{ key: BudgetTimeFilter; label: string }> = [
  { key: "this_month", label: "Tháng này" },
  { key: "last_month", label: "Tháng trước" },
  { key: "custom", label: "Tuỳ chỉnh" },
];

interface BudgetTransaction {
  id: string;
  date: string;
  receivedAmount: number;
  sender: string;
  adAccountId: string;
  adAccountName: string;
  spentAmount: number;
  bankFeePercent: number;
  serviceFeePercent: number;
  accountingUpdated: number;
  difference: number;
  invoiceLink: string;
  confirmed: boolean;
}

interface BudgetFormState {
  date: string;
  receivedAmount: number;
  sender: string;
  adAccountId: string;
  spentAmount: number;
  bankFeePercent: number;
  serviceFeePercent: number;
  invoiceLink: string;
}

const initialTransactions: BudgetTransaction[] = [
  {
    id: "budget-demo-1",
    date: "2026-06-01",
    receivedAmount: 10_000_000,
    sender: "AKA",
    adAccountId: "demo-account-1",
    adAccountName: "INV_AKA_DASNOTRI_HUY_01",
    spentAmount: 13_962_469,
    bankFeePercent: 0,
    serviceFeePercent: 4,
    accountingUpdated: 13_962_469,
    difference: 0,
    invoiceLink: "https://example.com/HD240601001",
    confirmed: true,
  },
  {
    id: "budget-demo-2",
    date: "2026-06-02",
    receivedAmount: 10_000_000,
    sender: "AKA",
    adAccountId: "demo-account-1",
    adAccountName: "INV_AKA_DASNOTRI_HUY_01",
    spentAmount: 958_388,
    bankFeePercent: 0,
    serviceFeePercent: 4,
    accountingUpdated: 958_388,
    difference: 0,
    invoiceLink: "https://example.com/HD240602002",
    confirmed: true,
  },
];

const emptyForm: BudgetFormState = {
  date: toDateInputValue(new Date()),
  receivedAmount: 0,
  sender: "AKA",
  adAccountId: "",
  spentAmount: 0,
  bankFeePercent: 0,
  serviceFeePercent: 4,
  invoiceLink: "",
};

function EmployeeBudgetPage() {
  const [transactions, setTransactions] = useState<BudgetTransaction[]>(initialTransactions);
  const [adsAccounts, setAdsAccounts] = useState<AdsAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [timeFilter, setTimeFilter] = useState<BudgetTimeFilter>("this_month");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BudgetFormState>(emptyForm);

  const loadAdsAccounts = useCallback((showToast = false) => {
    setIsLoadingAccounts(true);
    fetchEmployeeAdsAccounts({ datePreset: "today" })
      .then((data) => {
        setAdsAccounts(data.accounts);
        setActiveAccountId((current) => current || data.accounts[0]?.id || "");
        if (data.accounts[0]) {
          setTransactions((current) =>
            current.map((item) =>
              item.adAccountId === "demo-account-1"
                ? {
                    ...item,
                    adAccountId: data.accounts[0].id,
                    adAccountName: data.accounts[0].accountName,
                  }
                : item,
            ),
          );
        }
        setForm((current) => ({
          ...current,
          adAccountId: current.adAccountId || data.accounts[0]?.id || "",
        }));
        if (showToast) toast.success("Đã tải lại dữ liệu ngân sách");
      })
      .catch(() => {
        setAdsAccounts([]);
        if (showToast) toast.error("Không thể tải lại tài khoản quảng cáo");
      })
      .finally(() => {
        setIsLoadingAccounts(false);
      });
  }, []);

  useEffect(() => {
    loadAdsAccounts();
  }, [loadAdsAccounts]);

  const dateRange = useMemo(
    () => getBudgetDateRange(timeFilter, customDateStart, customDateEnd),
    [customDateEnd, customDateStart, timeFilter],
  );

  const periodLabel = useMemo(() => getPeriodLabel(timeFilter, dateRange), [dateRange, timeFilter]);

  const visibleTransactions = useMemo(
    () =>
      transactions.filter(
        (item) =>
          item.adAccountId === activeAccountId &&
          (!dateRange.start || item.date >= dateRange.start) &&
          (!dateRange.end || item.date <= dateRange.end),
      ),
    [activeAccountId, dateRange.end, dateRange.start, transactions],
  );

  const summary = useMemo(() => {
    const received = visibleTransactions.reduce((sum, item) => sum + item.receivedAmount, 0);
    const spent = visibleTransactions.reduce((sum, item) => sum + item.spentAmount, 0);
    const serviceFee = visibleTransactions.reduce(
      (sum, item) => sum + getServiceFeeAmount(item),
      0,
    );
    return {
      received,
      spent,
      remaining: received - spent,
      serviceFee,
    };
  }, [visibleTransactions]);

  const updateMoneyField = (field: keyof BudgetFormState, value: string) => {
    const parsedValue = parseMoney(value);
    setForm((current) => ({ ...current, [field]: parsedValue }));
  };

  const resetForm = () => {
    setForm({
      ...emptyForm,
      date: toDateInputValue(new Date()),
      adAccountId: activeAccountId || adsAccounts[0]?.id || "",
    });
  };

  const openAddModal = () => {
    setForm((current) => ({
      ...current,
      adAccountId: activeAccountId || adsAccounts[0]?.id || "",
    }));
    setModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) resetForm();
  };

  const saveTransaction = () => {
    if (!form.date) {
      toast.error("Chọn ngày giao dịch");
      return;
    }
    if (!form.sender.trim()) {
      toast.error("Nhập người chuyển");
      return;
    }
    const selectedAccount = adsAccounts.find((account) => account.id === form.adAccountId);
    if (!selectedAccount) {
      toast.error("Chọn tài khoản quảng cáo");
      return;
    }
    if (form.invoiceLink.trim() && !isValidUrl(form.invoiceLink.trim())) {
      toast.error("Link hoá đơn không hợp lệ");
      return;
    }

    const transaction: BudgetTransaction = {
      id: `budget-${Date.now()}`,
      date: form.date,
      receivedAmount: form.receivedAmount,
      sender: form.sender.trim(),
      adAccountId: selectedAccount.id,
      adAccountName: selectedAccount.accountName,
      spentAmount: form.spentAmount,
      bankFeePercent: form.bankFeePercent,
      serviceFeePercent: form.serviceFeePercent,
      accountingUpdated: form.spentAmount,
      difference: 0,
      invoiceLink: form.invoiceLink.trim(),
      confirmed: true,
    };
    setTransactions((current) => [transaction, ...current]);
    setModalOpen(false);
    resetForm();
    toast.success("Đã thêm giao dịch ngân sách");
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 md:px-8">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <WalletCards className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ngân sách Marketing</h1>
              <p className="mt-1 text-sm text-slate-500">
                Theo dõi dòng tiền tài khoản quảng cáo • {periodLabel}
              </p>
            </div>
          </div>
          <Button className="h-11 rounded-2xl px-5 text-sm" onClick={openAddModal}>
            <Plus className="mr-2 h-5 w-5" />
            Thêm giao dịch
          </Button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Tổng tiền nhận"
          value={summary.received}
          icon={TrendingUp}
          tone="green"
        />
        <SummaryCard title="Tổng tiền chi" value={summary.spent} icon={TrendingDown} tone="red" />
        <SummaryCard
          title="Ngân sách còn lại"
          value={summary.remaining}
          icon={PiggyBank}
          tone="blue"
        />
        <SummaryCard
          title="Phí dịch vụ"
          value={summary.serviceFee}
          icon={BadgePercent}
          tone="orange"
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">Bảng ngân sách</h2>
              <p className="mt-1 text-sm text-slate-500">
                Theo dõi tiền nhận, chi phí quảng cáo và đối soát kế toán theo từng hoá đơn.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
              {adsAccounts.length > 0 ? (
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Tài khoản</Label>
                  <Select value={activeAccountId} onValueChange={setActiveAccountId}>
                    <SelectTrigger className="h-11 w-full rounded-2xl bg-white text-sm font-semibold lg:w-[300px]">
                      <SelectValue placeholder="Chọn tài khoản quảng cáo" />
                    </SelectTrigger>
                    <SelectContent>
                      {adsAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.accountName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Thời gian</Label>
                  <Select
                    value={timeFilter}
                    onValueChange={(value) => setTimeFilter(value as BudgetTimeFilter)}
                  >
                    <SelectTrigger className="h-11 w-[170px] rounded-2xl bg-white text-base font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {budgetTimeFilters.map((filter) => (
                        <SelectItem key={filter.key} value={filter.key}>
                          {filter.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-11 rounded-2xl p-0"
                  disabled={isLoadingAccounts}
                  title="Tải lại"
                  onClick={() => loadAdsAccounts(true)}
                >
                  <RefreshCw className={cn("h-5 w-5", isLoadingAccounts && "animate-spin")} />
                </Button>

                {timeFilter === "custom" ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                    <Input
                      type="date"
                      aria-label="Từ ngày"
                      value={customDateStart}
                      onChange={(event) => setCustomDateStart(event.target.value)}
                      className="h-9 w-[150px] rounded-xl bg-white text-sm"
                    />
                    <span className="text-xs font-semibold text-slate-400">đến</span>
                    <Input
                      type="date"
                      aria-label="Đến ngày"
                      value={customDateEnd}
                      onChange={(event) => setCustomDateEnd(event.target.value)}
                      className="h-9 w-[150px] rounded-xl bg-white text-sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {isLoadingAccounts ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Đang tải tài khoản quảng cáo...
          </div>
        ) : adsAccounts.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <WalletCards className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold">
              Chưa có tài khoản quảng cáo. Vui lòng thêm ở Ads Dashboard.
            </p>
          </div>
        ) : (
          <div>
            <table className="w-full table-fixed border-collapse">
              <thead className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white">
                <tr>
                  {[
                    "Ngày",
                    "Số tiền nhận",
                    "Người chuyển",
                    "Số tiền chi",
                    "Phí ngân hàng",
                    "Phí dịch vụ",
                    "KT cập nhật",
                    "Chênh lệch",
                    "Link hoá đơn",
                    "Xác nhận",
                  ].map((column) => (
                    <th
                      key={column}
                      className="px-3 py-3 text-left text-[11px] font-bold uppercase leading-tight tracking-wide"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                      Chưa có giao dịch ngân sách trong khoảng này.
                    </td>
                  </tr>
                ) : (
                  visibleTransactions.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 text-sm transition hover:bg-blue-50/40"
                    >
                      <td className="px-3 py-4 font-semibold">{formatDisplayDate(item.date)}</td>
                      <td className="px-3 py-4 font-bold text-emerald-600">
                        {formatCompactVnd(item.receivedAmount)}
                      </td>
                      <td className="truncate px-3 py-4 text-slate-700" title={item.sender}>
                        {item.sender}
                      </td>
                      <td className="px-3 py-4 font-bold text-rose-600">
                        {formatCompactVnd(item.spentAmount)}
                      </td>
                      <td className="px-3 py-4">{formatCompactVnd(getBankFeeAmount(item))}</td>
                      <td className="px-3 py-4 font-semibold text-orange-600">
                        {formatCompactVnd(getServiceFeeAmount(item))}
                      </td>
                      <td className="px-3 py-4">{formatCompactVnd(item.accountingUpdated)}</td>
                      <td
                        className={cn(
                          "px-3 py-4 font-semibold",
                          item.difference === 0
                            ? "text-slate-500"
                            : item.difference > 0
                              ? "text-amber-600"
                              : "text-rose-600",
                        )}
                      >
                        {formatCompactVnd(item.difference)}
                      </td>
                      <td className="px-3 py-4">
                        {item.invoiceLink ? (
                          <a
                            href={item.invoiceLink}
                            target="_blank"
                            rel="noreferrer"
                            title={item.invoiceLink}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {item.confirmed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-500" />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={modalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle className="text-xl font-bold">Thêm giao dịch mới</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-5">
            <Field label="Ngày giao dịch">
              <Input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, date: event.target.value }))
                }
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField
                label="Số tiền nhận"
                value={form.receivedAmount}
                onChange={(value) => updateMoneyField("receivedAmount", value)}
              />
              <MoneyField
                label="Số tiền chi"
                value={form.spentAmount}
                onChange={(value) => updateMoneyField("spentAmount", value)}
              />
            </div>

            <Field label="Người chuyển">
              <Input
                value={form.sender}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sender: event.target.value }))
                }
                placeholder="AKA hoặc tên khách"
              />
            </Field>

            <Field label="Tài khoản quảng cáo">
              <Select
                value={form.adAccountId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, adAccountId: value }))
                }
                disabled={isLoadingAccounts || adsAccounts.length === 0}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue
                    placeholder={
                      isLoadingAccounts
                        ? "Đang tải tài khoản quảng cáo..."
                        : "Chưa có tài khoản quảng cáo. Vui lòng thêm ở Ads Dashboard."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {adsAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoadingAccounts && adsAccounts.length === 0 ? (
                <p className="text-xs text-amber-600">
                  Chưa có tài khoản quảng cáo. Vui lòng thêm ở Ads Dashboard.
                </p>
              ) : null}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <PercentField
                label="Phí ngân hàng (%)"
                value={form.bankFeePercent}
                onChange={(value) => updatePercentField("bankFeePercent", value, setForm)}
              />
              <PercentField
                label="Phí dịch vụ (%)"
                value={form.serviceFeePercent}
                onChange={(value) => updatePercentField("serviceFeePercent", value, setForm)}
              />
            </div>

            <Field label="Link hoá đơn">
              <Input
                value={form.invoiceLink}
                onChange={(event) =>
                  setForm((current) => ({ ...current, invoiceLink: event.target.value }))
                }
                placeholder="https://..."
              />
            </Field>
          </div>

          <DialogFooter className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => handleModalOpenChange(false)}>
              Huỷ
            </Button>
            <Button onClick={saveTransaction}>Lưu giao dịch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof TrendingUp;
  tone: "green" | "red" | "blue" | "orange";
}) {
  const toneClasses = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight">{formatVnd(value)}</p>
        </div>
        <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input value={formatMoneyInput(value)} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          value={formatPercentInput(value)}
          onChange={(event) => onChange(event.target.value)}
          className="pr-9"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
          %
        </span>
      </div>
    </Field>
  );
}

function updatePercentField(
  field: "bankFeePercent" | "serviceFeePercent",
  value: string,
  setForm: Dispatch<SetStateAction<BudgetFormState>>,
) {
  const parsedValue = parsePercent(value);
  setForm((current) => ({ ...current, [field]: parsedValue }));
}

function getBankFeeAmount(item: BudgetTransaction) {
  return Math.round((item.spentAmount * item.bankFeePercent) / 100);
}

function getServiceFeeAmount(item: BudgetTransaction) {
  return Math.round((item.spentAmount * item.serviceFeePercent) / 100);
}

function parseMoney(value: string) {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

function parsePercent(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatMoneyInput(value: number) {
  return value ? new Intl.NumberFormat("vi-VN").format(value) : "0";
}

function formatPercentInput(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(value))}đ`;
}

function formatCompactVnd(value: number) {
  return formatVnd(value);
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBudgetDateRange(
  filter: BudgetTimeFilter,
  customDateStart: string,
  customDateEnd: string,
) {
  const now = new Date();

  if (filter === "custom") {
    return {
      start: customDateStart,
      end:
        customDateEnd && (!customDateStart || customDateEnd >= customDateStart)
          ? customDateEnd
          : "",
    };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const targetDate =
    filter === "last_month" ? new Date(year, month - 1, 1) : new Date(year, month, 1);
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function getPeriodLabel(
  filter: BudgetTimeFilter,
  dateRange: {
    start: string;
    end: string;
  },
) {
  if (filter === "custom") {
    if (!dateRange.start && !dateRange.end) return "Tuỳ chỉnh";
    const start = dateRange.start ? formatDisplayDate(dateRange.start) : "...";
    const end = dateRange.end ? formatDisplayDate(dateRange.end) : "...";
    return `${start} - ${end}`;
  }

  const [year, month] = dateRange.start.split("-");
  return `Tháng ${Number(month)}/${year}`;
}

function formatDisplayDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}
