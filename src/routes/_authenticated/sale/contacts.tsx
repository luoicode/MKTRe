import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  DollarSign,
  Filter,
  GripVertical,
  Heart,
  ImageIcon,
  List,
  Loader2,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  InvoiceBuilder,
  InvoicePreview,
  type InvoiceBuilderSnapshot,
} from "@/components/workspace/InvoiceWorkspace";
import { useAuth } from "@/lib/auth";
import { captureElementAsPngBlob } from "@/lib/captureImage";
import { parseVndInput } from "@/lib/products";
import {
  createSaleCrmOrder,
  createCustomerNote,
  deleteCustomerNote,
  fetchSaleCrmContacts,
  saveSaleCrmQuote,
  updateSaleCrmCustomerDetails,
  updateCustomerStatus,
  updateCustomerNote,
  updateSaleCrmOrderStatus,
  type SaleCrmContact,
  type SaleCrmNote,
  type SaleCrmOrder,
  type SaleCrmStatus,
} from "@/lib/saleCrmContacts";
import { cn } from "@/lib/utils";
import { copyReportImageToClipboard } from "@/utils/reportImageStorage";

export const Route = createFileRoute("/_authenticated/sale/contacts")({
  component: SaleContactsRedirect,
});

function SaleContactsRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/sale/dashboard", replace: true });
  }, [navigate]);

  return null;
}

const ALL_STATUS = "all";
const PAGE_SIZE = 50;
const INDEX_COLUMN_WIDTH = 56;

type StatusFilter = SaleCrmStatus | typeof ALL_STATUS;
type ViewMode = "table" | "kanban";
type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "last_month"
  | "week_to_date"
  | "month_to_date"
  | "custom";
type SaleEditableStatus = Extract<
  SaleCrmStatus,
  | "new"
  | "processing"
  | "called"
  | "quoted"
  | "waiting_shipping"
  | "shipping"
  | "success"
  | "returned"
  | "cancelled"
>;
type ColumnId =
  | "createdAt"
  | "name"
  | "phone"
  | "status"
  | "source"
  | "marketer"
  | "saleTeam"
  | "lastContact"
  | "latestNote"
  | "totalAmount";

const primaryTabs: Array<{ key: StatusFilter; label: string }> = [
  { key: ALL_STATUS, label: "Tất cả" },
  { key: "new", label: "Mới" },
  { key: "processing", label: "Đang xử lí" },
  { key: "called", label: "Đã gọi" },
  { key: "quoted", label: "Báo giá" },
];

const overflowStatuses: Array<{ key: SaleCrmStatus; label: string }> = [
  { key: "waiting_shipping", label: "Chờ giao hàng" },
  { key: "shipping", label: "Đang giao" },
  { key: "success", label: "Hoàn thành" },
  { key: "returned", label: "Hoàn" },
  { key: "cancelled", label: "Huỷ" },
];

const saleEditableStatusOptions: Array<{ key: SaleEditableStatus; label: string }> = [
  { key: "new", label: "Mới" },
  { key: "processing", label: "Đang xử lí" },
  { key: "called", label: "Đã gọi" },
  { key: "quoted", label: "Báo giá" },
  { key: "waiting_shipping", label: "Chờ giao hàng" },
  { key: "shipping", label: "Đang giao" },
  { key: "success", label: "Hoàn thành" },
  { key: "returned", label: "Hoàn" },
  { key: "cancelled", label: "Huỷ" },
];

const saleOrderStatusSteps: Array<{ key: SaleEditableStatus; label: string }> = [
  { key: "new", label: "Mới" },
  { key: "quoted", label: "Báo giá" },
  { key: "processing", label: "Đang xử lí" },
  { key: "waiting_shipping", label: "Chờ giao hàng" },
  { key: "shipping", label: "Đang giao" },
  { key: "success", label: "Hoàn thành" },
  { key: "returned", label: "Hoàn" },
  { key: "cancelled", label: "Huỷ" },
];

const processingChecklistItems = [
  { key: "customer", label: "Xác nhận thông tin khách hàng" },
  { key: "address", label: "Xác nhận địa chỉ" },
  { key: "products", label: "Xác nhận sản phẩm/số lượng" },
  { key: "payment", label: "Kiểm tra thanh toán/COD" },
] as const;

type ProcessingChecklistKey = (typeof processingChecklistItems)[number]["key"];

const datePresetOptions: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "last_7_days", label: "7 ngày qua" },
  { key: "last_30_days", label: "30 ngày qua" },
  { key: "last_90_days", label: "90 ngày qua" },
  { key: "last_month", label: "Tháng trước" },
  { key: "week_to_date", label: "Đầu tuần đến nay" },
  { key: "month_to_date", label: "Đầu tháng đến nay" },
];

const columnMeta: Array<{ id: ColumnId; label: string; width: string }> = [
  { id: "createdAt", label: "Ngày lên số", width: "w-[150px]" },
  { id: "name", label: "Khách hàng", width: "w-[180px]" },
  { id: "phone", label: "Số điện thoại", width: "w-[150px]" },
  { id: "status", label: "Trạng thái", width: "w-[140px]" },
  { id: "source", label: "Nguồn", width: "w-[170px]" },
  { id: "marketer", label: "Marketer", width: "w-[170px]" },
  { id: "saleTeam", label: "Đội ngũ bán hàng", width: "w-[170px]" },
  { id: "lastContact", label: "Liên hệ gần nhất", width: "w-[150px]" },
  { id: "latestNote", label: "Ghi chú gần đây", width: "w-[240px]" },
  { id: "totalAmount", label: "Tổng tiền", width: "w-[130px]" },
];

const requiredColumns: ColumnId[] = ["createdAt", "name", "phone", "status"];
const defaultColumns: ColumnId[] = [
  "createdAt",
  "name",
  "phone",
  "status",
  "source",
  "marketer",
  "saleTeam",
  "lastContact",
  "latestNote",
  "totalAmount",
];

interface SavedSaleContactFilterPreset {
  id: string;
  name: string;
  description?: string;
  datePreset: DatePreset;
  customStartDate?: string;
  customEndDate?: string;
  statusFilter: StatusFilter;
  sourceFilter: string[];
  search?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

function getSaleSavedFiltersStorageKey(profileId?: string | null) {
  return `workspace:saved-filters:sale-contacts:${profileId || "anonymous"}`;
}

function SaleContactsPage() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUS);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [activeAdvancedGroup, setActiveAdvancedGroup] = useState<"source" | "amount">("source");
  const [selectedContact, setSelectedContact] = useState<SaleCrmContact | null>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(defaultColumns);
  const [savedPresets, setSavedPresets] = useState<SavedSaleContactFilterPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [panelPresetId, setPanelPresetId] = useState<string | null>(null);
  const [panelName, setPanelName] = useState("");
  const [panelDescription, setPanelDescription] = useState("");
  const [panelDefault, setPanelDefault] = useState(false);
  const [panelDatePreset, setPanelDatePreset] = useState<DatePreset>("custom");
  const [panelStartDate, setPanelStartDate] = useState("");
  const [panelEndDate, setPanelEndDate] = useState("");
  const [panelStatusFilter, setPanelStatusFilter] = useState<StatusFilter>(ALL_STATUS);
  const [panelSourceFilter, setPanelSourceFilter] = useState<string[]>([]);
  const [panelSearch, setPanelSearch] = useState("");

  const queryKey = ["sale-crm-contacts", profile?.id];
  const {
    data: contacts = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchSaleCrmContacts(profile!.id),
    enabled: Boolean(profile?.id && role === "sale"),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (role && role !== "sale") {
      navigate({ to: "/sale/dashboard", replace: true });
    }
  }, [navigate, role]);

  useEffect(() => {
    if (!selectedContact) return;
    const refreshedContact = contacts.find((contact) => contact.id === selectedContact.id);
    if (refreshedContact && refreshedContact !== selectedContact) {
      setSelectedContact(refreshedContact);
    }
  }, [contacts, selectedContact]);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customStartDate, customEndDate),
    [datePreset, customStartDate, customEndDate],
  );

  const dateFilteredContacts = useMemo(
    () => contacts.filter((contact) => isInDateRange(contact.createdAt, dateRange)),
    [contacts, dateRange],
  );

  const baseFilteredContacts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return dateFilteredContacts.filter((contact) => {
      const latestSource = contact.sources[0];
      const sourceValue = latestSource?.sourceChannel || latestSource?.sourceName || "";
      if (sourceFilter.length > 0 && !sourceFilter.includes(sourceValue)) return false;
      if (!keyword) return true;
      return [contact.name, contact.phone, contact.assignedSaleName, contact.saleTeamName]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [dateFilteredContacts, search, sourceFilter]);

  const filteredContacts = useMemo(
    () =>
      baseFilteredContacts.filter((contact) =>
        statusFilter === ALL_STATUS ? true : contact.status === statusFilter,
      ),
    [baseFilteredContacts, statusFilter],
  );

  const tabCounts = useMemo(() => {
    const counts = new Map<StatusFilter, number>();
    counts.set(ALL_STATUS, baseFilteredContacts.length);
    for (const status of [
      ...primaryTabs.filter((tab) => tab.key !== ALL_STATUS),
      ...overflowStatuses,
    ]) {
      counts.set(
        status.key,
        baseFilteredContacts.filter((contact) => contact.status === status.key).length,
      );
    }
    return counts;
  }, [baseFilteredContacts]);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const contact of contacts) {
      const latestSource = contact.sources[0];
      const value = latestSource?.sourceChannel || latestSource?.sourceName;
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "vi"));
  }, [contacts]);

  const persistSalePresets = (nextPresets: SavedSaleContactFilterPreset[]) => {
    const sorted = [...nextPresets].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    setSavedPresets(sorted);
    if (profile?.id) {
      localStorage.setItem(getSaleSavedFiltersStorageKey(profile.id), JSON.stringify(sorted));
    }
  };

  const applySalePreset = (preset: SavedSaleContactFilterPreset) => {
    setDatePreset(preset.datePreset);
    setCustomStartDate(preset.customStartDate ?? "");
    setCustomEndDate(preset.customEndDate ?? "");
    setSourceFilter(preset.sourceFilter ?? []);
    setStatusFilter(preset.statusFilter ?? ALL_STATUS);
    setSearch(preset.search ?? "");
    setSelectedPresetId(preset.id);
  };

  const resetSaleFilters = () => {
    setDatePreset("custom");
    setCustomStartDate("");
    setCustomEndDate("");
    setSourceFilter([]);
    setStatusFilter(ALL_STATUS);
    setSearch("");
    setSelectedPresetId(null);
  };

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(getSaleSavedFiltersStorageKey(profile.id));
      const parsed = raw ? (JSON.parse(raw) as SavedSaleContactFilterPreset[]) : [];
      const validPresets = Array.isArray(parsed)
        ? parsed.filter((preset) => preset?.id && preset?.name)
        : [];
      setSavedPresets(validPresets);
      const defaultPreset = validPresets.find((preset) => preset.isDefault);
      if (defaultPreset) {
        applySalePreset(defaultPreset);
      } else {
        setSelectedPresetId(null);
      }
    } catch {
      setSavedPresets([]);
      setSelectedPresetId(null);
    }
  }, [profile?.id]);

  const paginatedContacts = filteredContacts.slice(0, PAGE_SIZE);
  const totalAmount = filteredContacts.reduce(
    (sum, contact) =>
      sum +
      contact.orders.reduce(
        (orderSum, order) => orderSum + (isRevenueOrder(order.status) ? order.amount : 0),
        0,
      ),
    0,
  );

  const refreshContacts = () => {
    void refetch();
  };

  const openContact = (contact: SaleCrmContact) => {
    setSelectedContact(contact);
  };

  const closeContact = () => {
    setSelectedContact(null);
  };

  const loadFilterPanel = (preset?: SavedSaleContactFilterPreset) => {
    setPanelPresetId(preset?.id ?? null);
    setPanelName(preset?.name ?? "");
    setPanelDescription(preset?.description ?? "");
    setPanelDefault(Boolean(preset?.isDefault));
    setPanelDatePreset(preset?.datePreset ?? datePreset);
    setPanelStartDate(preset?.customStartDate ?? customStartDate);
    setPanelEndDate(preset?.customEndDate ?? customEndDate);
    setPanelStatusFilter(preset?.statusFilter ?? statusFilter);
    setPanelSourceFilter(preset?.sourceFilter ?? sourceFilter);
    setPanelSearch(preset?.search ?? search);
  };

  const handleOpenFilterPanel = () => {
    const activePreset = savedPresets.find((preset) => preset.id === selectedPresetId);
    loadFilterPanel(activePreset);
    setFilterPanelOpen(true);
  };

  const handleSaveFilterPanel = () => {
    const name = panelName.trim();
    if (!name) {
      toast.error("Nhập tên bộ lọc trước khi lưu.");
      return;
    }

    const now = new Date().toISOString();
    const nextPreset: SavedSaleContactFilterPreset = {
      id: panelPresetId ?? `sale_filter_${Date.now()}`,
      name,
      description: panelDescription.trim(),
      datePreset: panelDatePreset,
      customStartDate: panelStartDate,
      customEndDate: panelEndDate,
      statusFilter: panelStatusFilter,
      sourceFilter: panelSourceFilter,
      search: panelSearch.trim(),
      isDefault: panelDefault,
      createdAt: savedPresets.find((preset) => preset.id === panelPresetId)?.createdAt ?? now,
      updatedAt: now,
    };

    const nextPresets = [
      ...savedPresets.filter((preset) => preset.id !== nextPreset.id),
      nextPreset,
    ].map((preset) =>
      panelDefault && preset.id !== nextPreset.id ? { ...preset, isDefault: false } : preset,
    );

    persistSalePresets(nextPresets);
    applySalePreset(nextPreset);
    setFilterPanelOpen(false);
    toast.success(panelPresetId ? "Đã lưu bộ lọc." : "Đã tạo bộ lọc.");
  };

  const handleDeleteFilterPanel = () => {
    if (!panelPresetId) {
      setFilterPanelOpen(false);
      return;
    }
    const nextPresets = savedPresets.filter((preset) => preset.id !== panelPresetId);
    persistSalePresets(nextPresets);
    if (selectedPresetId === panelPresetId) resetSaleFilters();
    setFilterPanelOpen(false);
    toast.success("Đã xoá bộ lọc.");
  };

  if (role !== "sale") {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="shrink-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Phone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Liên hệ khách hàng</h1>
          </div>
          {isFetching ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang cập nhật
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative shrink-0 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
          <button
            type="button"
            onClick={resetSaleFilters}
            className={cn(
              "inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition",
              selectedPresetId === null &&
                statusFilter === ALL_STATUS &&
                sourceFilter.length === 0 &&
                datePreset === "custom" &&
                !customStartDate &&
                !customEndDate &&
                !search.trim()
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
            )}
          >
            Tất cả liên hệ
          </button>
          {savedPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applySalePreset(preset)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
                selectedPresetId === preset.id
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
              )}
            >
              {preset.isDefault ? <span aria-hidden="true">⭐</span> : null}
              {preset.name}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Chỉnh sửa bộ lọc"
            className="ml-auto h-9 w-9 rounded-lg border-slate-200"
            onClick={handleOpenFilterPanel}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        {sourceFilter.length > 0 || statusFilter !== ALL_STATUS || search.trim() ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2">
            {sourceFilter.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() =>
                  setSourceFilter((current) => current.filter((item) => item !== source))
                }
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"
              >
                Nguồn là {source}
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ))}
            {statusFilter !== ALL_STATUS ? (
              <button
                type="button"
                onClick={() => setStatusFilter(ALL_STATUS)}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"
              >
                Trạng thái là {getSaleStatusLabel(statusFilter as SaleCrmStatus)}
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ) : null}
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"
              >
                Tìm kiếm chứa “{search.trim()}”
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSourceFilter([]);
                setStatusFilter(ALL_STATUS);
                setSearch("");
                setSelectedPresetId(null);
              }}
              className="ml-auto text-sm font-semibold text-slate-600 hover:text-blue-700"
            >
              Xóa
            </button>
          </div>
        ) : null}

        <div className="mt-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 overflow-x-auto">
            <div className="inline-flex min-w-max items-center rounded-xl bg-slate-100 p-1">
              {primaryTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition",
                    statusFilter === tab.key
                      ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none",
                      statusFilter === tab.key
                        ? "bg-blue-50 text-blue-700"
                        : "bg-white text-slate-500",
                    )}
                  >
                    {tabCounts.get(tab.key) ?? 0}
                  </span>
                </button>
              ))}
              <StatusOverflowDropdown
                activeStatus={statusFilter}
                counts={tabCounts}
                onSelect={setStatusFilter}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isFetching && !isLoading ? (
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang cập nhật
              </span>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              title="Làm mới danh sách"
              className="h-9 w-9 rounded-lg border-slate-200"
              disabled={isLoading || isFetching}
              onClick={refreshContacts}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <DateFilter
              datePreset={datePreset}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onPresetChange={setDatePreset}
              onStartChange={setCustomStartDate}
              onEndChange={setCustomEndDate}
            />
            <AdvancedFilterPopover
              open={advancedFilterOpen}
              sourceOptions={sourceOptions}
              sourceFilter={sourceFilter}
              activeGroup={activeAdvancedGroup}
              onOpenChange={setAdvancedFilterOpen}
              onActiveGroupChange={setActiveAdvancedGroup}
              onSourceFilterChange={setSourceFilter}
            />
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Xem dạng bảng"
                className={cn(
                  "h-8 w-8 rounded-md",
                  viewMode === "table" && "bg-blue-50 text-blue-700 hover:bg-blue-50",
                )}
                onClick={() => setViewMode("table")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Xem dạng Kanban"
                className={cn(
                  "h-8 w-8 rounded-md",
                  viewMode === "kanban" && "bg-blue-50 text-blue-700 hover:bg-blue-50",
                )}
                onClick={() => setViewMode("kanban")}
              >
                <Columns3 className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon"
              title="Cấu hình cột"
              className="h-9 w-9 rounded-lg border-slate-200"
              onClick={() => setColumnDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên, SĐT..."
              className="h-9 rounded-xl border-slate-200 pl-9 text-sm"
            />
          </div>
        </div>
        {filterPanelOpen ? (
          <div className="absolute right-3 top-12 z-50 flex max-h-[min(640px,calc(100vh-12rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">Chỉnh sửa bộ lọc</h2>
                <p className="text-xs text-slate-500">
                  {panelPresetId ? "Cập nhật preset đang chọn." : "Lưu bộ lọc mới cho riêng bạn."}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => setFilterPanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sale-filter-name">Tên bộ lọc</Label>
                  <span className="text-xs text-slate-400">{panelName.length}/50</span>
                </div>
                <Input
                  id="sale-filter-name"
                  value={panelName}
                  maxLength={50}
                  onChange={(event) => setPanelName(event.target.value)}
                  placeholder="Ví dụ: Khách cần gọi lại"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-filter-description">Mô tả</Label>
                <Textarea
                  id="sale-filter-description"
                  value={panelDescription}
                  onChange={(event) => setPanelDescription(event.target.value)}
                  placeholder="Mô tả ngắn cho bộ lọc này..."
                  className="min-h-20 rounded-xl"
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <Checkbox
                  checked={panelDefault}
                  onCheckedChange={(checked) => setPanelDefault(checked === true)}
                />
                Đặt làm mặc định khi vào trang
              </label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-3 text-sm font-bold text-slate-950">Điều kiện lọc</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Ngày</Label>
                    <select
                      value={panelDatePreset}
                      onChange={(event) => setPanelDatePreset(event.target.value as DatePreset)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400"
                    >
                      <option value="custom">Tuỳ chỉnh</option>
                      {datePresetOptions.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Từ ngày</Label>
                      <Input
                        type="date"
                        value={panelStartDate}
                        onChange={(event) => {
                          setPanelDatePreset("custom");
                          setPanelStartDate(event.target.value);
                        }}
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        value={panelEndDate}
                        onChange={(event) => {
                          setPanelDatePreset("custom");
                          setPanelEndDate(event.target.value);
                        }}
                        className="h-10 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trạng thái</Label>
                    <select
                      value={panelStatusFilter}
                      onChange={(event) => setPanelStatusFilter(event.target.value as StatusFilter)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400"
                    >
                      <option value={ALL_STATUS}>Tất cả</option>
                      {[
                        ...primaryTabs.filter((tab) => tab.key !== ALL_STATUS),
                        ...overflowStatuses,
                      ].map((status) => (
                        <option key={status.key} value={status.key}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nguồn</Label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {sourceOptions.length ? (
                        sourceOptions.map((source) => {
                          const checked = panelSourceFilter.includes(source);
                          return (
                            <label
                              key={source}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) =>
                                  setPanelSourceFilter((current) =>
                                    nextChecked === true
                                      ? [...current, source].filter(
                                          (item, index, array) => array.indexOf(item) === index,
                                        )
                                      : current.filter((item) => item !== source),
                                  )
                                }
                              />
                              <span className="truncate">{source}</span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="px-2 py-3 text-center text-sm text-slate-500">
                          Chưa có dữ liệu nguồn.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tìm kiếm</Label>
                    <Input
                      value={panelSearch}
                      onChange={(event) => setPanelSearch(event.target.value)}
                      placeholder="Tìm tên, SĐT..."
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 py-3">
              {panelPresetId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDeleteFilterPanel}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Xoá
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setFilterPanelOpen(false)}
                >
                  Huỷ
                </Button>
              )}
              <Button type="button" className="rounded-xl" onClick={handleSaveFilterPanel}>
                Lưu
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {viewMode === "table" ? (
        <SaleContactsTable
          contacts={paginatedContacts}
          totalCount={filteredContacts.length}
          totalAmount={totalAmount}
          visibleColumns={visibleColumns}
          loading={isLoading}
          onOpenContact={openContact}
        />
      ) : (
        <SaleContactsKanban contacts={filteredContacts} onOpenContact={openContact} />
      )}

      <ColumnConfigDialog
        open={columnDialogOpen}
        visibleColumns={visibleColumns}
        onOpenChange={setColumnDialogOpen}
        onApply={setVisibleColumns}
      />

      <SaleContactDetailDialog
        contact={selectedContact}
        actor={
          profile
            ? {
                id: profile.id,
                fullName: profile.full_name,
                username: profile.username,
                email: profile.email,
              }
            : null
        }
        queryKey={queryKey}
        onClose={closeContact}
        onUpdated={(updatedId) => {
          void queryClient.invalidateQueries({ queryKey });
          if (selectedContact?.id === updatedId) {
            const updatedContact = contacts.find((contact) => contact.id === updatedId);
            if (updatedContact) setSelectedContact(updatedContact);
          }
        }}
      />
    </div>
  );
}

function SaleContactsTable({
  contacts,
  totalCount,
  totalAmount,
  visibleColumns,
  loading,
  onOpenContact,
}: {
  contacts: SaleCrmContact[];
  totalCount: number;
  totalAmount: number;
  visibleColumns: ColumnId[];
  loading: boolean;
  onOpenContact: (contact: SaleCrmContact) => void;
}) {
  return (
    <section className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          className="table-fixed border-separate border-spacing-0 text-left text-[13px]"
          style={{ minWidth: "1280px", width: "100%" }}
        >
          <thead className="text-xs font-semibold text-slate-500">
            <tr className="h-10 border-b border-slate-200">
              <th
                className="sticky left-0 top-0 z-50 rounded-tl-2xl bg-slate-50 p-0 text-center shadow-[6px_0_12px_-12px_rgba(15,23,42,0.35),0_1px_0_0_rgba(226,232,240,0.9)]"
                style={{ width: INDEX_COLUMN_WIDTH, minWidth: INDEX_COLUMN_WIDTH }}
              >
                #
              </th>
              {visibleColumns.map((columnId) => {
                const column = columnMeta.find((item) => item.id === columnId);
                if (!column) return null;
                return (
                  <th
                    key={column.id}
                    className={cn(
                      "sticky top-0 z-40 whitespace-nowrap bg-slate-50 px-2.5 py-2 shadow-[0_1px_0_0_rgba(226,232,240,1)]",
                      column.width,
                    )}
                  >
                    {column.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={visibleColumns.length + 1}
                >
                  Đang tải liên hệ khách hàng...
                </td>
              </tr>
            ) : contacts.length ? (
              contacts.map((contact, index) => (
                <tr
                  key={contact.id}
                  className="group h-11 cursor-pointer transition hover:bg-slate-50/80"
                  onClick={() => onOpenContact(contact)}
                >
                  <td
                    className="sticky left-0 z-30 bg-white p-0 text-center align-middle text-slate-500 shadow-[6px_0_12px_-12px_rgba(15,23,42,0.35)] transition group-hover:bg-slate-50"
                    style={{ width: INDEX_COLUMN_WIDTH, minWidth: INDEX_COLUMN_WIDTH }}
                  >
                    {index + 1}
                  </td>
                  {visibleColumns.map((columnId) => (
                    <td
                      key={`${contact.id}-${columnId}`}
                      className={cn(
                        "border-b border-slate-100 px-2.5 py-1.5 align-middle text-slate-700",
                        columnMeta.find((item) => item.id === columnId)?.width,
                      )}
                    >
                      <ContactCell contact={contact} columnId={columnId} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={visibleColumns.length + 1}
                >
                  Chưa có liên hệ phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 text-sm font-medium text-slate-600">
        <span>Tổng số liên hệ: {totalCount}</span>
        <span>Tổng tiền: {formatCurrency(totalAmount)}</span>
        <span className="ml-auto">Trang 1 / 1</span>
      </div>
    </section>
  );
}

function ContactCell({ contact, columnId }: { contact: SaleCrmContact; columnId: ColumnId }) {
  const latestSource = contact.sources[0];
  const latestNote = contact.notes[0]?.note || "—";
  const orderAmount = contact.orders.reduce(
    (sum, order) => sum + (isRevenueOrder(order.status) ? order.amount : 0),
    0,
  );

  if (columnId === "createdAt") return <span>{formatDateTime(contact.createdAt)}</span>;
  if (columnId === "name")
    return <span className="font-semibold text-slate-950">{contact.name}</span>;
  if (columnId === "phone") return <PhoneCopyText phone={contact.phone} />;
  if (columnId === "status") return <StatusBadge status={contact.status} />;
  if (columnId === "source")
    return <span>{latestSource?.sourceChannel || latestSource?.sourceName || "—"}</span>;
  if (columnId === "marketer") return <span>{latestSource?.marketerName || "—"}</span>;
  if (columnId === "saleTeam") return <span>{contact.saleTeamName || "—"}</span>;
  if (columnId === "lastContact") return <span>{formatDateTime(contact.lastContactAt)}</span>;
  if (columnId === "latestNote") return <span className="line-clamp-1">{latestNote}</span>;
  if (columnId === "totalAmount")
    return <span>{orderAmount ? formatCurrency(orderAmount) : "—"}</span>;
  return null;
}

function PhoneCopyText({ phone }: { phone: string }) {
  const copyPhone = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await copyTextToClipboard(phone);
      toast.success("Đã copy số điện thoại");
      event.currentTarget.blur();
    } catch {
      toast.error("Không copy được số điện thoại");
    }
  };

  return (
    <button
      type="button"
      title="Click để copy số điện thoại"
      onClick={copyPhone}
      className="inline-flex cursor-pointer select-none items-center text-left font-semibold tabular-nums text-blue-600 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
    >
      {phone || "—"}
    </button>
  );
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that block Clipboard API access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

function detectVietnameseCarrier(phone: string) {
  const normalized = phone
    .replace(/[^\d+]/g, "")
    .replace(/^\+84/, "0")
    .replace(/^84/, "0");
  const prefix3 = normalized.slice(0, 3);
  const prefix4 = normalized.slice(0, 4);

  if (
    ["086", "096", "097", "098"].includes(prefix3) ||
    ["032", "033", "034", "035", "036", "037", "038", "039"].includes(prefix3)
  ) {
    return "Viettel";
  }

  if (
    ["088", "091", "094"].includes(prefix3) ||
    ["083", "084", "085", "081", "082"].includes(prefix3)
  ) {
    return "Vinaphone";
  }

  if (
    ["089", "090", "093"].includes(prefix3) ||
    ["070", "076", "077", "078", "079"].includes(prefix3)
  ) {
    return "Mobifone";
  }

  if (["092", "056", "058"].includes(prefix3)) {
    return "Vietnamobile";
  }

  if (["099", "059"].includes(prefix3) || prefix4 === "0199") {
    return "Không xác định";
  }

  return "Không xác định";
}

function CarrierBadge({ phone }: { phone: string }) {
  const carrier = detectVietnameseCarrier(phone);
  const carrierClass =
    carrier === "Viettel"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : carrier === "Vinaphone"
        ? "bg-blue-50 text-blue-700 ring-blue-100"
        : carrier === "Mobifone"
          ? "bg-cyan-50 text-cyan-700 ring-cyan-100"
          : carrier === "Vietnamobile"
            ? "bg-amber-50 text-amber-700 ring-amber-100"
            : "bg-slate-50 text-slate-500 ring-slate-200";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        carrierClass,
      )}
    >
      {carrier}
    </span>
  );
}

function DetailPhoneValue({ phone }: { phone?: string | null }) {
  const normalizedPhone = phone?.trim();
  if (!normalizedPhone) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <PhoneCopyText phone={normalizedPhone} />
      <CarrierBadge phone={normalizedPhone} />
    </span>
  );
}

function SaleContactsKanban({
  contacts,
  onOpenContact,
}: {
  contacts: SaleCrmContact[];
  onOpenContact: (contact: SaleCrmContact) => void;
}) {
  const columns: Array<{ key: SaleCrmStatus; label: string }> = [
    { key: "new", label: "Mới" },
    { key: "processing", label: "Đang xử lí" },
    { key: "called", label: "Đã gọi" },
    { key: "quoted", label: "Báo giá" },
  ];

  return (
    <section className="mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-full overflow-auto bg-slate-50/60 p-3">
        <div className="grid h-full min-w-[980px] grid-cols-4 gap-3">
          {columns.map((column) => {
            const columnContacts = contacts.filter((contact) => contact.status === column.key);
            return (
              <div
                key={column.key}
                className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-3">
                  <h2 className="text-sm font-semibold text-slate-800">{column.label}</h2>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset",
                      statusBadgeClass(column.key),
                    )}
                  >
                    {columnContacts.length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {columnContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => onOpenContact(contact)}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-950">{contact.name}</p>
                          <PhoneCopyText phone={contact.phone} />
                        </div>
                        <StatusBadge status={contact.status} />
                      </div>
                      <KanbanField label="Ngày lên số" value={formatDateTime(contact.createdAt)} />
                      <KanbanField
                        label="Marketer"
                        value={contact.sources[0]?.marketerName || "—"}
                      />
                      <KanbanField label="NVKD" value={contact.assignedSaleName || "—"} />
                      <KanbanField
                        label="Ngày nhận gần đây"
                        value={formatDateTime(contact.assignments[0]?.assignedAt)}
                      />
                      <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">
                        {contact.notes[0]?.note || "Chưa có ghi chú."}
                      </p>
                      {contact.orders.some((order) => isRevenueOrder(order.status)) ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(
                            contact.orders.reduce(
                              (sum, order) =>
                                sum + (isRevenueOrder(order.status) ? order.amount : 0),
                              0,
                            ),
                          )}
                        </span>
                      ) : null}
                      {contact.customerType ? (
                        <span className="ml-1 mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
                          <Heart className="h-3.5 w-3.5" />
                          Khách cũ
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {!columnContacts.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Trống
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function KanbanField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 grid grid-cols-[110px_1fr] gap-2 text-xs">
      <span className="font-bold text-slate-600">{label}</span>
      <span className="text-right font-medium text-slate-700">{value || "—"}</span>
    </div>
  );
}

function StatusOverflowDropdown({
  activeStatus,
  counts,
  onSelect,
}: {
  activeStatus: StatusFilter;
  counts: Map<StatusFilter, number>;
  onSelect: (status: StatusFilter) => void;
}) {
  const activeOverflow = overflowStatuses.find((status) => status.key === activeStatus);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition",
            activeOverflow
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-900",
          )}
        >
          {activeOverflow?.label ?? "Khác"}
          <span
            className={cn(
              "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none",
              activeOverflow ? "bg-blue-50 text-blue-700" : "bg-white text-slate-500",
            )}
          >
            {activeOverflow
              ? (counts.get(activeOverflow.key) ?? 0)
              : overflowStatuses.reduce((sum, status) => sum + (counts.get(status.key) ?? 0), 0)}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-56 rounded-xl border-slate-200 p-1.5 shadow-xl"
      >
        {overflowStatuses.map((status) => (
          <button
            key={status.key}
            type="button"
            onClick={() => onSelect(status.key)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
              activeStatus === status.key
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", statusDotClass(status.key))} />
              <span className="truncate">{status.label}</span>
            </span>
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none",
                activeStatus === status.key
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {counts.get(status.key) ?? 0}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function AdvancedFilterPopover({
  open,
  sourceOptions,
  sourceFilter,
  activeGroup,
  onOpenChange,
  onActiveGroupChange,
  onSourceFilterChange,
}: {
  open: boolean;
  sourceOptions: string[];
  sourceFilter: string[];
  activeGroup: "source" | "amount";
  onOpenChange: (open: boolean) => void;
  onActiveGroupChange: (group: "source" | "amount") => void;
  onSourceFilterChange: (values: string[]) => void;
}) {
  const groups: Array<{
    id: "source" | "amount";
    label: string;
    count: number;
  }> = [
    { id: "source", label: "Nguồn", count: sourceFilter.length },
    { id: "amount", label: "Tổng tiền", count: 0 },
  ];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Bộ lọc nâng cao"
          className={cn(
            "h-9 w-9 rounded-lg border-slate-200",
            sourceFilter.length > 0 && "border-blue-300 bg-blue-50 text-blue-700",
          )}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200 p-0 shadow-xl"
      >
        <div className="grid max-h-[560px] overflow-hidden sm:grid-cols-[230px_minmax(0,1fr)]">
          <div className="border-b border-slate-100 bg-slate-50 p-2 sm:border-b-0 sm:border-r">
            <div className="space-y-1">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onActiveGroupChange(group.id)}
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold transition",
                    activeGroup === group.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-white hover:text-slate-950",
                  )}
                >
                  <span>{group.label}</span>
                  <span className="inline-flex items-center gap-2">
                    {group.count ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                        {group.count}
                      </span>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-950">
                {activeGroup === "source" ? "Nguồn" : "Tổng tiền"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Lọc bao gồm các giá trị đã chọn.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeGroup === "source" ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      "mb-1 flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                      sourceFilter.length === 0
                        ? "bg-cyan-50 text-blue-700"
                        : "text-slate-700 hover:bg-slate-50",
                    )}
                    onClick={() => onSourceFilterChange([])}
                  >
                    <span>Tất cả nguồn</span>
                    {sourceFilter.length === 0 ? <Check className="h-4 w-4" /> : null}
                  </button>
                  {sourceOptions.length ? (
                    sourceOptions.map((source) => {
                      const selected = sourceFilter.includes(source);
                      return (
                        <button
                          key={source}
                          type="button"
                          className={cn(
                            "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                            selected
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50",
                          )}
                          onClick={() =>
                            onSourceFilterChange(
                              selected
                                ? sourceFilter.filter((item) => item !== source)
                                : [...sourceFilter, source],
                            )
                          }
                        >
                          <span className="truncate">{source}</span>
                          {selected ? <Check className="h-4 w-4" /> : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Chưa có dữ liệu nguồn.
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  Bộ lọc tổng tiền sẽ dùng khi có nhu cầu phân nhóm doanh thu.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
              <Button onClick={() => onOpenChange(false)}>Áp dụng</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MonthCalendar({
  monthDate,
  startDate,
  endDate,
  onPickDate,
}: {
  monthDate: Date;
  startDate: string;
  endDate: string;
  onPickDate: (dateKey: string) => void;
}) {
  const cells = getCalendarCells(monthDate);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 text-center text-sm font-semibold text-slate-950">
        Thg {monthDate.getMonth() + 1} {monthDate.getFullYear()}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isCurrentMonth = cell.date.getMonth() === monthDate.getMonth();
          const dateKey = toDateKey(cell.date);
          const isSelected = dateKey === startDate || dateKey === endDate;
          const isInRange = Boolean(
            startDate && endDate && dateKey >= startDate && dateKey <= endDate,
          );

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onPickDate(dateKey)}
              className={cn(
                "h-8 rounded-lg text-sm font-medium transition",
                isSelected
                  ? "bg-blue-600 text-white shadow-sm"
                  : isInRange
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-100",
                !isCurrentMonth && !isSelected ? "text-slate-300" : "",
              )}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateFilter({
  datePreset,
  customStartDate,
  customEndDate,
  onPresetChange,
  onStartChange,
  onEndChange,
}: {
  datePreset: DatePreset;
  customStartDate: string;
  customEndDate: string;
  onPresetChange: (preset: DatePreset) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftDatePreset, setDraftDatePreset] = useState<DatePreset>(datePreset);
  const initialRange = resolveDateRange(datePreset, customStartDate, customEndDate);
  const [draftDateStart, setDraftDateStart] = useState(initialRange.startDate);
  const [draftDateEnd, setDraftDateEnd] = useState(initialRange.endDate);
  const [draftCalendarBaseDate, setDraftCalendarBaseDate] = useState(
    new Date(initialRange.startDate || toDateKey(new Date())),
  );

  useEffect(() => {
    if (!open) return;
    const nextRange = resolveDateRange(datePreset, customStartDate, customEndDate);
    setDraftDatePreset(datePreset);
    setDraftDateStart(nextRange.startDate);
    setDraftDateEnd(nextRange.endDate);
    setDraftCalendarBaseDate(new Date(nextRange.startDate || toDateKey(new Date())));
  }, [customEndDate, customStartDate, datePreset, open]);

  const handlePresetSelect = (preset: DatePreset) => {
    const nextRange = resolveDateRange(preset, customStartDate, customEndDate);
    setDraftDatePreset(preset);
    setDraftDateStart(nextRange.startDate);
    setDraftDateEnd(nextRange.endDate);
    setDraftCalendarBaseDate(new Date(nextRange.startDate || toDateKey(new Date())));
  };

  const handlePickDate = (dateKey: string) => {
    setDraftDatePreset("custom");
    if (!draftDateStart || (draftDateStart && draftDateEnd)) {
      setDraftDateStart(dateKey);
      setDraftDateEnd("");
      return;
    }
    if (dateKey < draftDateStart) {
      setDraftDateEnd(draftDateStart);
      setDraftDateStart(dateKey);
    } else {
      setDraftDateEnd(dateKey);
    }
  };

  const handleApply = () => {
    onPresetChange(draftDatePreset);
    onStartChange(draftDateStart);
    onEndChange(draftDateEnd);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg border-slate-200"
          title="Lọc theo ngày"
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(850px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200 p-0 shadow-xl"
      >
        <div className="grid gap-0 sm:grid-cols-[210px_minmax(0,1fr)]">
          <div className="border-b border-slate-100 p-3 sm:border-b-0 sm:border-r">
            <div className="space-y-1">
              {datePresetOptions.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetSelect(preset.key)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                    draftDatePreset === preset.key
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                  )}
                >
                  <span>{preset.label}</span>
                  {draftDatePreset === preset.key ? <Check className="h-4 w-4" /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Input
                type="date"
                value={draftDateStart}
                onChange={(event) => {
                  setDraftDatePreset("custom");
                  setDraftDateStart(event.target.value);
                }}
                className="h-10 rounded-xl border-slate-200 text-sm"
              />
              <span className="hidden text-slate-400 sm:block">→</span>
              <Input
                type="date"
                value={draftDateEnd}
                onChange={(event) => {
                  setDraftDatePreset("custom");
                  setDraftDateEnd(event.target.value);
                }}
                className="h-10 rounded-xl border-slate-200 text-sm"
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <MonthCalendar
                monthDate={
                  new Date(draftCalendarBaseDate.getFullYear(), draftCalendarBaseDate.getMonth(), 1)
                }
                startDate={draftDateStart}
                endDate={draftDateEnd}
                onPickDate={handlePickDate}
              />
              <MonthCalendar
                monthDate={
                  new Date(
                    draftCalendarBaseDate.getFullYear(),
                    draftCalendarBaseDate.getMonth() + 1,
                    1,
                  )
                }
                startDate={draftDateStart}
                endDate={draftDateEnd}
                onPickDate={handlePickDate}
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <Button
                variant="ghost"
                className="rounded-xl text-slate-600"
                onClick={() => handlePresetSelect("month_to_date")}
              >
                Mặc định
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Đóng
                </Button>
                <Button type="button" onClick={handleApply}>
                  Áp dụng
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnConfigDialog({
  open,
  visibleColumns,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  visibleColumns: ColumnId[];
  onOpenChange: (open: boolean) => void;
  onApply: (columns: ColumnId[]) => void;
}) {
  const [draftColumns, setDraftColumns] = useState<ColumnId[]>(visibleColumns);
  const [columnSearch, setColumnSearch] = useState("");
  const [draggingColumnId, setDraggingColumnId] = useState<ColumnId | null>(null);
  const [dragHandleColumnId, setDragHandleColumnId] = useState<ColumnId | null>(null);

  const toggleColumn = (columnId: ColumnId, checked: boolean) => {
    if (!checked && requiredColumns.includes(columnId)) return;
    setDraftColumns((current) =>
      checked
        ? [...current, columnId].filter((id, index, array) => array.indexOf(id) === index)
        : current.filter((id) => id !== columnId),
    );
  };

  const removeDraftColumn = (columnId: ColumnId) => {
    if (requiredColumns.includes(columnId)) return;
    setDraftColumns((current) => current.filter((id) => id !== columnId));
  };

  const moveDraftColumn = (fromColumnId: ColumnId, toColumnId: ColumnId) => {
    if (fromColumnId === toColumnId) return;
    setDraftColumns((current) => {
      const fromIndex = current.indexOf(fromColumnId);
      const toIndex = current.indexOf(toColumnId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setDraftColumns(visibleColumns);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[82vh] w-[min(92vw,900px)] max-w-none flex-col rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle>Cấu hình cột</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_330px]">
          <div className="flex min-h-0 flex-col gap-3 rounded-2xl border border-slate-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={columnSearch}
                onChange={(event) => setColumnSearch(event.target.value)}
                placeholder="Tìm cột..."
                className="h-9 rounded-xl pl-9"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {columnMeta
                .filter((column) =>
                  column.label.toLowerCase().includes(columnSearch.trim().toLowerCase()),
                )
                .map((column) => (
                  <label
                    key={column.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50",
                      requiredColumns.includes(column.id) && "cursor-not-allowed",
                    )}
                  >
                    <Checkbox
                      checked={draftColumns.includes(column.id)}
                      disabled={requiredColumns.includes(column.id)}
                      onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
                    />
                    <span className="font-medium text-slate-700">{column.label}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-950">Cột hiển thị</p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {draftColumns.map((columnId) => {
                const column = columnMeta.find((item) => item.id === columnId);
                if (!column) return null;
                const isRequired = requiredColumns.includes(column.id);
                return (
                  <div
                    key={column.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 transition",
                      draggingColumnId === column.id && "border-blue-200 bg-blue-50/60",
                    )}
                    draggable
                    onDragStart={(event) => {
                      if (dragHandleColumnId !== column.id) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.setData("text/plain", column.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingColumnId(column.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const fromColumnId = event.dataTransfer.getData("text/plain") as ColumnId;
                      moveDraftColumn(fromColumnId, column.id);
                      setDraggingColumnId(null);
                      setDragHandleColumnId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingColumnId(null);
                      setDragHandleColumnId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                      title={`Kéo để đổi vị trí cột ${column.label}`}
                      onMouseDown={() => setDragHandleColumnId(column.id)}
                      onMouseUp={() => setDragHandleColumnId(null)}
                      onMouseLeave={() => {
                        if (!draggingColumnId) setDragHandleColumnId(null);
                      }}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                      {column.label}
                    </span>
                    {!isRequired ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title={`Ẩn cột ${column.label}`}
                        onClick={() => removeDraftColumn(column.id)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="mr-auto rounded-xl text-slate-600"
            onClick={() => setDraftColumns(defaultColumns)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Mặc định
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                onApply(normalizeColumns(draftColumns));
                onOpenChange(false);
              }}
            >
              Áp dụng
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaleContactDetailDialog({
  contact,
  actor,
  queryKey,
  onClose,
  onUpdated,
}: {
  contact: SaleCrmContact | null;
  actor: { id: string; fullName: string; username?: string | null; email?: string | null } | null;
  queryKey: readonly unknown[];
  onClose: () => void;
  onUpdated: (customerId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [noteContent, setNoteContent] = useState("");
  const [editingNote, setEditingNote] = useState<SaleCrmNote | null>(null);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [orderPreviewOpen, setOrderPreviewOpen] = useState(false);
  const [orderPreviewBlob, setOrderPreviewBlob] = useState<Blob | null>(null);
  const [orderPreviewUrl, setOrderPreviewUrl] = useState("");
  const [isCapturingOrderPreview, setIsCapturingOrderPreview] = useState(false);
  const [quoteOrderId, setQuoteOrderId] = useState<string | null>(null);
  const [actualStatus, setActualStatus] = useState<SaleCrmStatus>("new");
  const [viewStatus, setViewStatus] = useState<SaleCrmStatus>("new");
  const [quoteSnapshot, setQuoteSnapshot] = useState<InvoiceBuilderSnapshot | null>(null);
  const initializedContactIdRef = useRef<string | null>(null);
  const orderPreviewRef = useRef<HTMLDivElement | null>(null);
  const [processingChecklist, setProcessingChecklist] = useState<
    Record<ProcessingChecklistKey, boolean>
  >({
    customer: false,
    address: true,
    products: true,
    payment: true,
  });

  const activeContact = contact;
  const latestSource = activeContact?.sources[0];

  useEffect(() => {
    if (!activeContact) {
      initializedContactIdRef.current = null;
      setQuoteSnapshot(null);
      return;
    }
    if (initializedContactIdRef.current === activeContact.id) return;
    initializedContactIdRef.current = activeContact.id;
    setNoteFormOpen(false);
    setEditingNote(null);
    setNoteContent("");
    setOrderPreviewOpen(false);
    const persistedOrder = activeContact.orders.find(
      (order) =>
        isEditableOrderStatus(order.status) &&
        Boolean(parseInvoiceBuilderSnapshot(order.orderSnapshot)),
    );
    const persistedSnapshot = persistedOrder
      ? parseInvoiceBuilderSnapshot(persistedOrder.orderSnapshot)
      : activeContact.orders
          .map((order) => parseInvoiceBuilderSnapshot(order.orderSnapshot))
          .find((snapshot): snapshot is InvoiceBuilderSnapshot => Boolean(snapshot));
    setQuoteOrderId(persistedOrder?.id ?? null);
    setActualStatus(activeContact.status);
    setViewStatus(activeContact.status);
    setQuoteSnapshot(
      persistedSnapshot ? hydrateQuoteDraftFromContact(persistedSnapshot, activeContact) : null,
    );
    setProcessingChecklist({
      customer: false,
      address: true,
      products: true,
      payment: true,
    });
  }, [activeContact]);

  useEffect(
    () => () => {
      if (orderPreviewUrl) URL.revokeObjectURL(orderPreviewUrl);
    },
    [orderPreviewUrl],
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    if (activeContact) onUpdated(activeContact.id);
  };

  const patchContactCache = (
    status: SaleCrmStatus,
    snapshot: InvoiceBuilderSnapshot,
    order: SaleCrmOrder,
  ) => {
    queryClient.setQueryData<SaleCrmContact[]>(queryKey, (current) =>
      current?.map((item) =>
        item.id === activeContact?.id
          ? {
              ...item,
              name: snapshot.customerName,
              phone: snapshot.customerPhone,
              address: snapshot.customerAddress,
              status,
              updatedAt: new Date().toISOString(),
              orders: [order, ...item.orders.filter((itemOrder) => itemOrder.id !== order.id)],
            }
          : item,
      ),
    );
  };

  const noteMutation = useMutation({
    mutationFn: async () => {
      if (!activeContact || !actor) return;
      if (editingNote) {
        await updateCustomerNote(editingNote.id, activeContact.id, noteContent, actor);
      } else {
        await createCustomerNote(activeContact.id, noteContent, actor);
      }
    },
    onSuccess: async () => {
      setNoteContent("");
      setEditingNote(null);
      setNoteFormOpen(false);
      toast.success(editingNote ? "Đã cập nhật ghi chú" : "Đã thêm ghi chú");
      await invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (note: SaleCrmNote) => {
      if (!activeContact || !actor) return;
      await deleteCustomerNote(note.id, activeContact.id, actor);
    },
    onSuccess: async () => {
      toast.success("Đã xoá ghi chú");
      await invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeWorkflowView = (status: SaleEditableStatus) => {
    if (!["new", "quoted", "processing"].includes(status)) return;
    if (status === "quoted" && activeContact) {
      setQuoteSnapshot((current) =>
        current
          ? hydrateQuoteDraftFromContact(current, activeContact)
          : createQuoteDraftFromContact(activeContact),
      );
    }
    setViewStatus(status);
  };

  const openQuoteScreen = () => {
    if (activeContact) {
      setQuoteSnapshot((current) =>
        current
          ? hydrateQuoteDraftFromContact(current, activeContact)
          : createQuoteDraftFromContact(activeContact),
      );
    }
    setViewStatus("quoted");
  };

  const handleQuoteSnapshotChange = useCallback(
    (snapshot: InvoiceBuilderSnapshot) => {
      setQuoteSnapshot(
        activeContact ? hydrateQuoteDraftFromContact(snapshot, activeContact) : snapshot,
      );
    },
    [activeContact],
  );

  const handleSaveDraft = async (snapshot: InvoiceBuilderSnapshot) => {
    if (!activeContact || !actor) throw new Error("Không tìm thấy hồ sơ Sale.");
    const persistedSnapshot = hydrateQuoteDraftFromContact(snapshot, activeContact);
    setQuoteSnapshot(persistedSnapshot);
    await updateSaleCrmCustomerDetails(activeContact.id, {
      customerName: persistedSnapshot.customerName,
      phone: persistedSnapshot.customerPhone,
      address: persistedSnapshot.customerAddress,
    });
    const currentQuote = activeContact.orders.find(
      (order) => order.id === quoteOrderId || isQuoteOrderStatus(order.status),
    );
    const orderCode = currentQuote?.orderCode || `BG${Date.now().toString().slice(-8)}`;
    const savedQuoteId = await saveSaleCrmQuote(
      {
        orderId: currentQuote?.id ?? quoteOrderId ?? undefined,
        customerId: activeContact.id,
        orderCode,
        productName: persistedSnapshot.productSummary || "Báo giá",
        quantity: persistedSnapshot.lines.reduce(
          (sum, line) => sum + (line.productId ? Number(line.quantity || 0) : 0),
          0,
        ),
        amount: persistedSnapshot.total,
        orderDate: persistedSnapshot.invoiceDate,
        orderSnapshot: persistedSnapshot,
      },
      actor,
    );
    setQuoteOrderId(savedQuoteId);
    if (actualStatus !== "quoted") {
      await updateCustomerStatus(activeContact.id, "quoted", actor);
    }
    setActualStatus("quoted");
    setViewStatus("quoted");
    patchContactCache("quoted", persistedSnapshot, {
      id: savedQuoteId,
      customerId: activeContact.id,
      orderCode,
      productName: persistedSnapshot.productSummary || "Báo giá",
      quantity: persistedSnapshot.lines.reduce(
        (sum, line) => sum + (line.productId ? Number(line.quantity || 0) : 0),
        0,
      ),
      amount: persistedSnapshot.total,
      status: "quoted",
      orderDate: persistedSnapshot.invoiceDate,
      createdAt: currentQuote?.createdAt ?? new Date().toISOString(),
      orderSnapshot: persistedSnapshot,
    });
    await invalidate();
  };

  const handleCreateOrder = async (
    snapshot: InvoiceBuilderSnapshot,
    invoice: { invoice_code: string; invoice_date: string },
  ) => {
    if (!activeContact || !actor) throw new Error("Không tìm thấy hồ sơ Sale.");
    const persistedSnapshot = hydrateQuoteDraftFromContact(snapshot, activeContact);
    setQuoteSnapshot(persistedSnapshot);
    await updateSaleCrmCustomerDetails(activeContact.id, {
      customerName: persistedSnapshot.customerName,
      phone: persistedSnapshot.customerPhone,
      address: persistedSnapshot.customerAddress,
    });
    const orderId = await createSaleCrmOrder(
      {
        orderId: quoteOrderId ?? undefined,
        customerId: activeContact.id,
        orderCode: invoice.invoice_code,
        productName: persistedSnapshot.productSummary || "Đơn hàng",
        quantity: persistedSnapshot.lines.reduce(
          (sum, line) => sum + (line.productId ? Number(line.quantity || 0) : 0),
          0,
        ),
        amount: persistedSnapshot.total,
        status: "processing",
        orderDate: invoice.invoice_date,
        orderSnapshot: persistedSnapshot,
      },
      actor,
    );
    await updateCustomerStatus(activeContact.id, "processing", actor);
    setActualStatus("processing");
    setViewStatus("processing");
    setQuoteOrderId(orderId);
    patchContactCache("processing", persistedSnapshot, {
      id: orderId,
      customerId: activeContact.id,
      orderCode: invoice.invoice_code,
      productName: persistedSnapshot.productSummary || "Đơn hàng",
      quantity: persistedSnapshot.lines.reduce(
        (sum, line) => sum + (line.productId ? Number(line.quantity || 0) : 0),
        0,
      ),
      amount: persistedSnapshot.total,
      status: "processing",
      orderDate: invoice.invoice_date,
      createdAt: new Date().toISOString(),
      orderSnapshot: persistedSnapshot,
    });
    await invalidate();
  };

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      if (!activeContact || !actor) throw new Error("Không tìm thấy hồ sơ Sale.");
      const latestOrder = activeContact.orders[0];
      if (latestOrder) {
        await updateSaleCrmOrderStatus(latestOrder.id, activeContact.id, "Huỷ", actor);
      }
      await updateCustomerStatus(activeContact.id, "cancelled", actor);
    },
    onSuccess: async () => {
      setActualStatus("cancelled");
      setViewStatus("cancelled");
      toast.success("Đã huỷ đơn");
      await invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!activeContact) return null;

  const latestNote = activeContact.notes[0]?.note || "Chưa có ghi chú.";
  const latestOrder = activeContact.orders[0];
  const totalOrderAmount = activeContact.orders.reduce(
    (sum, order) => sum + (isRevenueOrder(order.status) ? order.amount : 0),
    0,
  );
  const retainedOrderLines = quoteSnapshot?.lines.filter((line) => line.productId) ?? [];
  const sortedActivities = [...activeContact.activities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const activeStepIndex = Math.max(
    saleOrderStatusSteps.findIndex((step) => step.key === viewStatus),
    0,
  );
  const showQuoteBuilder = viewStatus === "quoted";
  const showDetailScreen = !showQuoteBuilder;
  const showProcessingScreen = viewStatus === "processing";
  const showDefaultDetailScreen = showDetailScreen && !showProcessingScreen;
  const canShowOrderTotal =
    viewStatus !== "new" && (totalOrderAmount > 0 || (quoteSnapshot?.total ?? 0) > 0);
  const completedChecklistItems = processingChecklistItems.filter(
    (item) => processingChecklist[item.key],
  ).length;
  const checklistProgress = Math.round(
    (completedChecklistItems / processingChecklistItems.length) * 100,
  );
  const processingOrderAmount = quoteSnapshot?.total ?? latestOrder?.amount ?? totalOrderAmount;
  const processingCustomerName = quoteSnapshot?.customerName || activeContact.name;
  const processingCustomerPhone = quoteSnapshot?.customerPhone || activeContact.phone;
  const processingCustomerAddress = quoteSnapshot?.customerAddress || activeContact.address;
  const processingOrderNote = quoteSnapshot?.orderNote || quoteSnapshot?.internalNote || latestNote;
  const customerAddress = quoteSnapshot?.customerAddress?.trim() || activeContact.address || "—";
  const invoicePrintSnapshot =
    quoteSnapshot ??
    (latestOrder
      ? {
          ...createQuoteDraftFromContact(activeContact),
          invoiceDate: latestOrder.orderDate?.slice(0, 10) || toDateKey(new Date()),
          lines: [
            {
              id: latestOrder.id,
              parentId: "",
              productId: latestOrder.id,
              displayName: latestOrder.productName || "Đơn hàng",
              quantity: String(latestOrder.quantity || 1),
              unit: "sản phẩm",
              unitPrice: String(
                latestOrder.amount / Math.max(Number(latestOrder.quantity || 1), 1),
              ),
              total: String(latestOrder.amount),
              discount: "0",
              totalAfterDiscount: String(latestOrder.amount),
              gift: "",
              nextVoucher: "",
              imageUrl: "",
            },
          ],
          subtotal: latestOrder.amount,
          total: latestOrder.amount,
          productSummary: latestOrder.productName || "Đơn hàng",
        }
      : null);
  const previewLines = invoicePrintSnapshot?.lines ?? [];
  const previewProductImages = Array.from(
    new Set(previewLines.map((line) => line.imageUrl).filter(Boolean)),
  ).slice(0, 3);

  const openCurrentOrderPreview = async () => {
    if (!invoicePrintSnapshot || !orderPreviewRef.current) {
      toast.error("Chưa có dữ liệu đơn hàng để in.");
      return;
    }

    setIsCapturingOrderPreview(true);
    try {
      const blob = await captureElementAsPngBlob({
        target: orderPreviewRef.current,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const nextUrl = URL.createObjectURL(blob);
      setOrderPreviewBlob(blob);
      setOrderPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextUrl;
      });
      setOrderPreviewOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCapturingOrderPreview(false);
    }
  };

  const copyCurrentOrderPreview = async () => {
    if (!orderPreviewBlob) return;
    const copied = await copyReportImageToClipboard(orderPreviewBlob);
    if (copied) {
      toast.success("Đã copy ảnh hoá đơn");
    } else {
      toast.error("Trình duyệt không hỗ trợ copy ảnh hoá đơn.");
    }
  };

  return (
    <>
      <Dialog open={Boolean(activeContact)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] w-[94vw] max-w-[1320px] flex-col overflow-hidden rounded-3xl p-0">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 pb-4 pt-5">
            <div className="flex items-center justify-between gap-12 pr-8">
              <DialogTitle className="truncate text-2xl font-bold text-slate-950">
                {activeContact.name}
              </DialogTitle>
              <StatusBadge status={actualStatus} />
            </div>
            <div className="mt-4 grid grid-cols-8 overflow-hidden rounded-full bg-slate-50 p-1">
              {saleOrderStatusSteps.map((step, index) => {
                const canSelect = ["new", "quoted", "processing"].includes(step.key);
                return (
                  <button
                    type="button"
                    key={step.key}
                    disabled={!canSelect}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      changeWorkflowView(step.key);
                    }}
                    className={cn(
                      "relative flex h-8 items-center justify-center px-2 text-xs font-semibold text-slate-500 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
                      index === activeStepIndex && "rounded-full bg-blue-100 text-blue-800",
                      index < activeStepIndex && viewStatus !== "cancelled" && "text-blue-700",
                      canSelect
                        ? "cursor-pointer transition-colors hover:bg-blue-50 hover:text-blue-700"
                        : "cursor-not-allowed opacity-55",
                    )}
                  >
                    {step.label}
                    {index < saleOrderStatusSteps.length - 1 ? (
                      <ChevronRight className="absolute -right-1 h-3.5 w-3.5 text-slate-300" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </DialogHeader>

          <div
            className={cn(
              "min-h-0 flex-1 bg-slate-50 px-6 py-5",
              showQuoteBuilder ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {showQuoteBuilder ? (
              <InvoiceBuilder
                mode="embedded"
                initialSnapshot={quoteSnapshot}
                initialCustomer={{
                  name: activeContact.name,
                  phone: activeContact.phone,
                  address: activeContact.address,
                  note: latestNote === "Chưa có ghi chú." ? "" : latestNote,
                  productName:
                    latestSource?.productName?.trim() || inferProductName(latestSource?.sourceName),
                }}
                saveDraftLabel="Lưu báo giá"
                createButtonLabel="Tạo đơn hàng"
                hideResetAction
                embeddedActivityContent={
                  <DetailCard title="LỊCH SỬ HOẠT ĐỘNG">
                    <div className="max-h-[350px] space-y-3 overflow-y-auto pr-1">
                      {sortedActivities.length ? (
                        sortedActivities.map((activity) => (
                          <div key={activity.id} className="border-l-2 border-blue-100 pl-3">
                            <p className="font-bold text-slate-900">{activity.actorName}</p>
                            <p className="mt-1 text-sm font-medium text-slate-700">
                              {activity.description}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(activity.createdAt)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                          Chưa có lịch sử hoạt động.
                        </div>
                      )}
                    </div>
                  </DetailCard>
                }
                onSnapshotChange={handleQuoteSnapshotChange}
                onSaveDraft={handleSaveDraft}
                onCreateOrder={handleCreateOrder}
              />
            ) : null}

            {showProcessingScreen ? (
              <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
                <div className="min-h-0 space-y-5">
                  <DetailCard title="ĐƠN HÀNG ĐANG XỬ LÍ">
                    {latestOrder || quoteSnapshot ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-slate-600">
                          <span>
                            Mã đơn:{" "}
                            <strong className="text-slate-900">
                              {latestOrder?.orderCode || "—"}
                            </strong>
                          </span>
                          <span>
                            Trạng thái: <strong className="text-slate-900">Đang xử lí</strong>
                          </span>
                          <span>
                            Ngày tạo:{" "}
                            <strong className="text-slate-900">
                              {latestOrder?.createdAt
                                ? formatDateTime(latestOrder.createdAt)
                                : quoteSnapshot?.invoiceDate
                                  ? formatDateTime(quoteSnapshot.invoiceDate)
                                  : "—"}
                            </strong>
                          </span>
                          <span>
                            Tổng tiền:{" "}
                            <strong className="text-slate-900">
                              {formatCurrency(processingOrderAmount)}
                            </strong>
                          </span>
                          <span>
                            COD:{" "}
                            <strong className="text-slate-900">
                              {formatCurrency(processingOrderAmount)}
                            </strong>
                          </span>
                          <span>
                            Sale:{" "}
                            <strong className="text-slate-900">
                              {activeContact.assignedSaleName || "—"}
                            </strong>
                          </span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                              <tr>
                                <th className="px-3 py-2.5">Sản phẩm</th>
                                <th className="px-3 py-2.5">Số lượng</th>
                                <th className="px-3 py-2.5">Đơn giá</th>
                                <th className="px-3 py-2.5">Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {retainedOrderLines.length ? (
                                retainedOrderLines.map((line) => (
                                  <tr key={line.id} className="border-t border-slate-100">
                                    <td className="px-3 py-3 font-medium text-slate-900">
                                      {line.displayName || "—"}
                                    </td>
                                    <td className="px-3 py-3">{Number(line.quantity || 0)}</td>
                                    <td className="px-3 py-3">
                                      {formatCurrency(parseVndInput(line.unitPrice))}
                                    </td>
                                    <td className="px-3 py-3 font-semibold text-slate-900">
                                      {formatCurrency(parseVndInput(line.totalAfterDiscount))}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr className="border-t border-slate-100">
                                  <td className="px-3 py-3 font-medium text-slate-900">
                                    {latestOrder?.productName ||
                                      quoteSnapshot?.productSummary ||
                                      "—"}
                                  </td>
                                  <td className="px-3 py-3">{latestOrder?.quantity || 1}</td>
                                  <td className="px-3 py-3">
                                    {formatCurrency(
                                      processingOrderAmount /
                                        Math.max(latestOrder?.quantity || 1, 1),
                                    )}
                                  </td>
                                  <td className="px-3 py-3 font-semibold text-slate-900">
                                    {formatCurrency(processingOrderAmount)}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                        Chưa có đơn hàng đang xử lí.
                      </div>
                    )}
                  </DetailCard>

                  <DetailCard title="THÔNG TIN NHẬN HÀNG">
                    <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                      <DetailRow label="Họ tên" value={processingCustomerName} />
                      <DetailRow
                        label="Số điện thoại"
                        value={<DetailPhoneValue phone={processingCustomerPhone} />}
                      />
                      <DetailRow label="Địa chỉ" value={processingCustomerAddress || "—"} />
                      <DetailRow label="Xã/phường" value={quoteSnapshot?.wardName || "—"} />
                      <DetailRow label="Quận/huyện" value={quoteSnapshot?.districtName || "—"} />
                      <DetailRow label="Tỉnh/thành" value={quoteSnapshot?.provinceName || "—"} />
                      <DetailRow label="Quốc gia" value="Việt Nam" />
                      <div className="sm:col-span-2">
                        <DetailRow label="Ghi chú đơn hàng" value={processingOrderNote} />
                      </div>
                    </div>
                  </DetailCard>

                  <DetailCard
                    title="LỊCH SỬ GHI CHÚ"
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg px-2.5 text-blue-700"
                        onClick={() => {
                          setEditingNote(null);
                          setNoteContent("");
                          setNoteFormOpen(true);
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Ghi chú
                      </Button>
                    }
                  >
                    <div className="space-y-3">
                      {noteFormOpen ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <Label>{editingNote ? "Sửa ghi chú" : "Thêm ghi chú"}</Label>
                          <Textarea
                            value={noteContent}
                            onChange={(event) => setNoteContent(event.target.value)}
                            placeholder="Nhập ghi chú chăm sóc khách hàng..."
                            className="mt-2 min-h-20 bg-white"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingNote(null);
                                setNoteContent("");
                                setNoteFormOpen(false);
                              }}
                            >
                              Hủy
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => noteMutation.mutate()}
                              disabled={noteMutation.isPending || !noteContent.trim()}
                            >
                              {editingNote ? "Lưu ghi chú" : "Thêm ghi chú"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                            <tr>
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Được tạo vào</th>
                              <th className="px-3 py-2">Nội dung</th>
                              <th className="px-3 py-2">Được tạo bởi</th>
                              <th className="px-3 py-2 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeContact.notes.length ? (
                              activeContact.notes.map((note, index) => (
                                <tr key={note.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2">{index + 1}</td>
                                  <td className="px-3 py-2">{formatDateTime(note.createdAt)}</td>
                                  <td className="px-3 py-2">{note.note}</td>
                                  <td className="px-3 py-2">{note.createdBy}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingNote(note);
                                          setNoteContent(note.note);
                                          setNoteFormOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:text-red-700"
                                        onClick={() => deleteNoteMutation.mutate(note)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                                  Chưa có lịch sử ghi chú.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </DetailCard>
                </div>

                <div className="min-h-0 space-y-5">
                  <DetailCard
                    title="CHECKLIST XỬ LÝ ĐƠN"
                    action={
                      <span className="text-sm font-bold text-slate-800">{checklistProgress}%</span>
                    }
                  >
                    <div className="space-y-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-[width]"
                          style={{ width: `${checklistProgress}%` }}
                        />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {processingChecklistItems.map((item) => {
                          const checked = processingChecklist[item.key];
                          return (
                            <label
                              key={item.key}
                              className="flex cursor-pointer items-center gap-3 py-3 text-sm font-medium text-slate-800"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  setProcessingChecklist((current) => ({
                                    ...current,
                                    [item.key]: value === true,
                                  }))
                                }
                              />
                              <span className={checked ? "text-slate-500 line-through" : ""}>
                                {item.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </DetailCard>

                  <DetailCard title="LỊCH SỬ HOẠT ĐỘNG">
                    <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                      {sortedActivities.length ? (
                        sortedActivities.map((activity) => (
                          <div key={activity.id} className="border-l-2 border-blue-100 pl-3">
                            <p className="font-bold text-slate-900">{activity.actorName}</p>
                            <p className="mt-1 text-sm font-medium text-slate-700">
                              {activity.description}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(activity.createdAt)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                          Chưa có lịch sử hoạt động.
                        </div>
                      )}
                    </div>
                  </DetailCard>
                </div>
              </div>
            ) : null}

            {showDefaultDetailScreen ? (
              <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
                <div className="min-h-0 space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailCard title="THÔNG TIN">
                      <DetailRow
                        label="Ngày lên số"
                        value={formatDateTime(activeContact.createdAt)}
                      />
                      <DetailRow label="NVKD" value={activeContact.assignedSaleName || "—"} />
                      <DetailRow
                        label="Đội ngũ bán hàng"
                        value={activeContact.saleTeamName || "—"}
                      />
                      <DetailRow label="Marketer" value={formatSaleMarketerDisplay(latestSource)} />
                      <DetailRow label="Team" value={latestSource?.marketingTeam?.trim() || "—"} />
                      <DetailRow label="Kênh" value={latestSource?.sourceChannel?.trim() || "—"} />
                      <DetailRow
                        label="Nguồn URL"
                        value={latestSource?.landingUrl?.trim() || "—"}
                      />
                    </DetailCard>

                    <DetailCard title="KHÁCH HÀNG">
                      <DetailRow label="Tên" value={activeContact.name} />
                      <DetailRow
                        label="SĐT"
                        value={<DetailPhoneValue phone={activeContact.phone} />}
                      />
                      <DetailRow
                        label="SĐT phụ"
                        value={<DetailPhoneValue phone={activeContact.secondaryPhone} />}
                      />
                      <DetailRow label="Địa chỉ" value={customerAddress} />
                      <DetailRow label="Ghi chú gần đây" value={latestNote} />
                    </DetailCard>
                  </div>

                  <DetailCard
                    title="LỊCH SỬ GHI CHÚ"
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg px-2.5 text-blue-700"
                        onClick={() => {
                          setEditingNote(null);
                          setNoteContent("");
                          setNoteFormOpen(true);
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Ghi chú
                      </Button>
                    }
                  >
                    <div className="space-y-3">
                      {noteFormOpen ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <Label>{editingNote ? "Sửa ghi chú" : "Thêm ghi chú"}</Label>
                          <Textarea
                            value={noteContent}
                            onChange={(event) => setNoteContent(event.target.value)}
                            placeholder="Nhập ghi chú chăm sóc khách hàng..."
                            className="mt-2 min-h-20 bg-white"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingNote(null);
                                setNoteContent("");
                                setNoteFormOpen(false);
                              }}
                            >
                              Hủy
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => noteMutation.mutate()}
                              disabled={noteMutation.isPending || !noteContent.trim()}
                            >
                              {editingNote ? "Lưu ghi chú" : "Thêm ghi chú"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                            <tr>
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Được tạo vào</th>
                              <th className="px-3 py-2">Nội dung</th>
                              <th className="px-3 py-2">Được tạo bởi</th>
                              <th className="px-3 py-2 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeContact.notes.length ? (
                              activeContact.notes.map((note, index) => (
                                <tr key={note.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2">{index + 1}</td>
                                  <td className="px-3 py-2">{formatDateTime(note.createdAt)}</td>
                                  <td className="px-3 py-2">{note.note}</td>
                                  <td className="px-3 py-2">{note.createdBy}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingNote(note);
                                          setNoteContent(note.note);
                                          setNoteFormOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:text-red-700"
                                        onClick={() => deleteNoteMutation.mutate(note)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                                  Chưa có lịch sử ghi chú.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </DetailCard>

                  <DetailCard title="LỊCH SỬ ĐƠN HÀNG">
                    {activeContact.orders.length ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Mã đơn</th>
                              <th className="px-3 py-2">Ngày</th>
                              <th className="px-3 py-2">Sản phẩm</th>
                              <th className="px-3 py-2">Doanh thu</th>
                              <th className="px-3 py-2">Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeContact.orders.slice(0, 5).map((order) => (
                              <tr key={order.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">
                                  {order.orderCode || "—"}
                                </td>
                                <td className="px-3 py-2">{formatDateTime(order.orderDate)}</td>
                                <td className="px-3 py-2">{order.productName || "—"}</td>
                                <td className="px-3 py-2">{formatCurrency(order.amount)}</td>
                                <td className="px-3 py-2">{getOrderStatusLabel(order.status)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                        Chưa có lịch sử đơn hàng.
                      </div>
                    )}
                  </DetailCard>
                </div>

                <DetailCard title="LỊCH SỬ HOẠT ĐỘNG" className="self-start">
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {sortedActivities.length ? (
                      sortedActivities.map((activity) => (
                        <div key={activity.id} className="border-l-2 border-blue-100 pl-3">
                          <p className="font-bold text-slate-900">{activity.actorName}</p>
                          <p className="mt-1 text-sm font-medium text-slate-700">
                            {activity.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(activity.createdAt)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                        Chưa có lịch sử hoạt động.
                      </div>
                    )}
                  </div>
                </DetailCard>
              </div>
            ) : null}
          </div>

          {!showQuoteBuilder ? (
            <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-3">
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                {canShowOrderTotal ? (
                  <p className="text-lg font-bold text-slate-950">
                    {viewStatus === "processing"
                      ? `Tổng tiền: ${formatCurrency(processingOrderAmount)} | COD: ${formatCurrency(processingOrderAmount)}`
                      : `Tổng tiền: ${formatCurrency(totalOrderAmount)}`}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  {viewStatus === "processing" ? (
                    <>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={openCurrentOrderPreview}
                        disabled={isCapturingOrderPreview || !invoicePrintSnapshot}
                      >
                        {isCapturingOrderPreview ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ImageIcon className="mr-2 h-4 w-4" />
                        )}
                        In hoá đơn
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => cancelOrderMutation.mutate()}
                        disabled={cancelOrderMutation.isPending || actualStatus !== "processing"}
                      >
                        Huỷ đơn
                      </Button>
                    </>
                  ) : null}
                  {viewStatus === "new" ? (
                    <Button className="rounded-xl" onClick={openQuoteScreen}>
                      Tiếp tục
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={orderPreviewOpen} onOpenChange={setOrderPreviewOpen}>
        <DialogContent className="max-w-[min(92vw,980px)] rounded-3xl">
          <DialogHeader>
            <DialogTitle>In hoá đơn của {activeContact.name}</DialogTitle>
          </DialogHeader>
          {orderPreviewUrl ? (
            <div className="flex max-h-[72vh] items-center justify-center rounded-2xl border bg-slate-50 p-3">
              <img
                src={orderPreviewUrl}
                alt="Preview hoá đơn"
                className="max-h-[68vh] max-w-full rounded-xl bg-white object-contain"
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={copyCurrentOrderPreview}>
              <Copy className="mr-2 h-4 w-4" />
              Copy ảnh
            </Button>
            <Button onClick={() => setOrderPreviewOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {invoicePrintSnapshot ? (
        <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden="true">
          <InvoicePreview
            ref={orderPreviewRef}
            customerName={invoicePrintSnapshot.customerName || activeContact.name}
            customerPhone={invoicePrintSnapshot.customerPhone || activeContact.phone}
            customerAddress={invoicePrintSnapshot.customerAddress || activeContact.address}
            invoiceDate={invoicePrintSnapshot.invoiceDate}
            hotline=""
            lines={previewLines}
            productImages={previewProductImages}
            subtotal={invoicePrintSnapshot.subtotal}
            discount={invoicePrintSnapshot.discount}
            total={invoicePrintSnapshot.total}
          />
        </div>
      ) : null}
    </>
  );
}

function DetailCard({
  title,
  className,
  action,
  children,
}: {
  title: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-3.5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 font-medium text-slate-900">{value || "—"}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: SaleCrmStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold",
        statusBadgeClass(status),
      )}
    >
      {getSaleStatusLabel(status)}
    </span>
  );
}

function getSaleStatusLabel(status: SaleCrmStatus) {
  return (
    saleEditableStatusOptions.find((option) => option.key === status)?.label ??
    overflowStatuses.find((option) => option.key === status)?.label ??
    primaryTabs.find((option) => option.key === status)?.label ??
    status
  );
}

function statusBadgeClass(status: SaleCrmStatus) {
  if (status === "new") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "called") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "quoted") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "waiting_shipping") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (status === "shipping") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "returned") return "border-green-200 bg-green-50 text-green-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusDotClass(status: SaleCrmStatus) {
  if (status === "new") return "bg-blue-500";
  if (status === "processing") return "bg-amber-500";
  if (status === "called") return "bg-violet-500";
  if (status === "success") return "bg-emerald-500";
  if (status === "quoted") return "bg-indigo-500";
  if (status === "waiting_shipping") return "bg-yellow-500";
  if (status === "shipping") return "bg-orange-500";
  if (status === "returned") return "bg-green-500";
  if (status === "cancelled") return "bg-slate-500";
  return "bg-slate-500";
}

function inferProductName(sourceName?: string | null) {
  const source = sourceName?.trim();
  if (!source) return "—";
  const knownProducts = ["NOTRIGOLD", "NOTRI GOLD", "NOTRIGOLD 1KG"];
  return (
    knownProducts.find((product) => source.toUpperCase().includes(product.toUpperCase())) ?? "—"
  );
}

function formatSaleMarketerDisplay(source?: SaleCrmContact["sources"][number]) {
  const marketerName = source?.marketerName?.trim() || "—";
  const employeeCode = source?.marketerEmployeeCode?.trim();
  const team = source?.marketingTeam?.trim();
  if (!employeeCode || !team) return marketerName;
  return `${marketerName} (${employeeCode} - ${team})`;
}

function normalizeColumns(columnIds: ColumnId[]) {
  const unique = columnIds.filter((columnId, index) => columnIds.indexOf(columnId) === index);
  for (const requiredColumn of requiredColumns) {
    if (!unique.includes(requiredColumn)) unique.push(requiredColumn);
  }
  return unique.filter((columnId) => columnMeta.some((column) => column.id === columnId));
}

function resolveDateRange(preset: DatePreset, startDate: string, endDate: string) {
  const now = new Date();
  const today = toDateKey(now);
  if (preset === "today") return { startDate: today, endDate: today };
  if (preset === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const key = toDateKey(yesterday);
    return { startDate: key, endDate: key };
  }
  if (preset === "last_7_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { startDate: toDateKey(start), endDate: today };
  }
  if (preset === "last_30_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { startDate: toDateKey(start), endDate: today };
  }
  if (preset === "last_90_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    return { startDate: toDateKey(start), endDate: today };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: toDateKey(start), endDate: toDateKey(end) };
  }
  if (preset === "week_to_date") {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { startDate: toDateKey(start), endDate: today };
  }
  if (preset === "custom") return { startDate, endDate };
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: toDateKey(start), endDate: today };
}

function getCalendarCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstWeekDay = firstDay.getDay() || 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstWeekDay + 1);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return { date };
  });
}

function isInDateRange(value: string, range: { startDate: string; endDate: string }) {
  const key = toDateKey(new Date(value));
  if (range.startDate && key < range.startDate) return false;
  if (range.endDate && key > range.endDate) return false;
  return true;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(value))}đ`;
}

function createQuoteDraftFromContact(contact: SaleCrmContact): InvoiceBuilderSnapshot {
  const latestNote = contact.notes[0]?.note ?? "";
  const invoiceDate = toDateKey(new Date());

  return {
    customerName: contact.name,
    customerPhone: contact.phone,
    customerAddress: contact.address,
    streetAddress: contact.address,
    provinceId: "",
    provinceName: "",
    districtId: "",
    districtName: "",
    wardId: "",
    wardName: "",
    invoiceDate,
    internalNote: latestNote,
    orderNote: "",
    discountType: "percent",
    discountValue: "",
    shippingFeeValue: "",
    lines: [],
    subtotal: 0,
    discount: 0,
    shippingFee: 0,
    total: 0,
    productSummary: "",
  };
}

function hydrateQuoteDraftFromContact(
  snapshot: InvoiceBuilderSnapshot,
  contact: SaleCrmContact,
): InvoiceBuilderSnapshot {
  const latestNote = contact.notes[0]?.note ?? "";
  const streetAddress =
    snapshot.streetAddress.trim() || snapshot.customerAddress.trim() || contact.address || "";

  return {
    ...snapshot,
    customerName: snapshot.customerName.trim() || contact.name,
    customerPhone: snapshot.customerPhone.trim() || contact.phone,
    customerAddress: snapshot.customerAddress.trim() || contact.address || streetAddress,
    streetAddress,
    internalNote: snapshot.internalNote.trim() || latestNote,
  };
}

function parseInvoiceBuilderSnapshot(value: unknown): InvoiceBuilderSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<InvoiceBuilderSnapshot>;
  if (
    typeof snapshot.customerName !== "string" ||
    typeof snapshot.customerPhone !== "string" ||
    !Array.isArray(snapshot.lines)
  ) {
    return null;
  }
  return snapshot as InvoiceBuilderSnapshot;
}

function normalizeOrderStatus(status: string) {
  return status.trim().toLowerCase().replaceAll("-", "_");
}

function isQuoteOrderStatus(status: string) {
  return ["quoted", "quote", "draft", "báo giá", "báo_giá", "bao_gia"].includes(
    normalizeOrderStatus(status),
  );
}

function isEditableOrderStatus(status: string) {
  const normalized = normalizeOrderStatus(status);
  return (
    isQuoteOrderStatus(status) ||
    ["processing", "đang xử lí", "đang xử lý", "đang_xử_lí", "dang_xu_ly"].includes(normalized)
  );
}

function getOrderStatusLabel(status: string) {
  const normalized = normalizeOrderStatus(status);
  if (isQuoteOrderStatus(status)) return "Báo giá";
  if (["processing", "đang xử lí", "đang xử lý", "đang_xử_lí", "dang_xu_ly"].includes(normalized)) {
    return "Đang xử lí";
  }
  return status || "—";
}

function isRevenueOrder(status: string) {
  const normalized = status.trim().toLowerCase();
  return [
    "processing",
    "đang xử lí",
    "đang xử lý",
    "waiting_shipping",
    "chờ giao hàng",
    "shipping",
    "đang giao",
    "success",
    "hoàn thành",
    "returned",
    "hoàn",
  ].includes(normalized);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Có lỗi xảy ra.";
}
