import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Columns3,
  Copy,
  Eye,
  Filter,
  GripVertical,
  Heart,
  Loader2,
  List,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  createMarketingContact,
  fetchEmployeeMarketingContacts,
  leadChannelOptions,
  type ContactStatus,
  type LeadChannel,
  type MarketingContact,
} from "@/lib/marketingLeadSources";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employee/marketing-contacts")({
  component: MarketingContactsPage,
});

interface ContactFormState {
  name: string;
  phone: string;
  source: LeadChannel;
  note: string;
}

type SampleMarketingContact = Omit<MarketingContact, "notes"> &
  Partial<Pick<MarketingContact, "notes">>;

const ALL_STATUS = "all";
const ALL_SOURCE = "all";
const SALE_RECEIVED_STATUS = "sale_received";
const ALL_SALE_OWNER = "all";
const UNASSIGNED_SALE_OWNER = "unassigned";
const ALL_SALE_TEAM = "all";
const UNASSIGNED_SALE_TEAM = "unassigned";
const ALL_MARKETING_TEAM = "all";
const ALL_PRODUCT = "all";
const ALL_AMOUNT = "all";
const PAGE_SIZE = 50;
const FILTER_PRESET_STORAGE_KEY = "workspace-miz:employee-marketing-contacts-filter-presets";
const COLUMN_CONFIG_STORAGE_KEY = "workspace-miz:employee-marketing-contacts-column-config";
const ALL_CONTACTS_COLUMN_CONFIG_KEY = "all_contacts";

type StatusFilter = ContactStatus | typeof ALL_STATUS | typeof SALE_RECEIVED_STATUS;
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

type ContactColumnId =
  | "createdAt"
  | "name"
  | "phone"
  | "salesOwner"
  | "marketingTeam"
  | "salesTeam"
  | "status"
  | "source"
  | "product"
  | "totalAmount"
  | "note";

type AmountFilterValue = "has_orders" | "no_orders" | "gte_1000000" | "gte_5000000";
type AdvancedFilterGroupId =
  | "source"
  | "status"
  | "saleOwner"
  | "saleTeam"
  | "marketingTeam"
  | "product"
  | "amount";
type ContactViewMode = "table" | "kanban";

const statusOptions: Array<{ key: ContactStatus; label: string }> = [
  { key: "new", label: "Mới" },
  { key: "processing", label: "Đang xử lí" },
  { key: "called", label: "Đã gọi" },
  { key: "resale_received", label: "Resale nhận" },
  { key: "duplicate", label: "Trùng" },
  { key: "success", label: "Đã nhận" },
];

const tabOptions: Array<{ key: StatusFilter; label: string }> = [
  { key: ALL_STATUS, label: "Tất cả" },
  { key: SALE_RECEIVED_STATUS, label: "Sale nhận" },
  ...statusOptions,
];

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

const amountFilterOptions: Array<{ value: AmountFilterValue; label: string }> = [
  { value: "has_orders", label: "Có đơn hàng" },
  { value: "no_orders", label: "Chưa có đơn hàng" },
  { value: "gte_1000000", label: "Từ 1.000.000đ" },
  { value: "gte_5000000", label: "Từ 5.000.000đ" },
];

const requiredContactColumnIds: ContactColumnId[] = ["createdAt", "name", "phone", "status"];

const contactColumnMeta: Array<{ id: ContactColumnId; label: string; width: string }> = [
  { id: "createdAt", label: "Ngày lên số", width: "w-[156px]" },
  { id: "name", label: "Khách hàng", width: "w-[170px]" },
  { id: "phone", label: "Số điện thoại", width: "w-[164px]" },
  { id: "salesOwner", label: "NV Kinh doanh", width: "w-[170px]" },
  { id: "salesTeam", label: "Đội ngũ bán hàng", width: "w-[170px]" },
  { id: "status", label: "Trạng thái", width: "w-[140px]" },
  { id: "source", label: "Nguồn", width: "w-[160px]" },
  { id: "marketingTeam", label: "Team MKT", width: "w-[140px]" },
  { id: "product", label: "Nhãn sản phẩm", width: "w-[150px]" },
  { id: "totalAmount", label: "Tổng tiền", width: "w-[120px]" },
  { id: "note", label: "Ghi chú gần đây", width: "w-[220px]" },
];

const defaultVisibleColumnIds: ContactColumnId[] = [
  "createdAt",
  "name",
  "phone",
  "salesOwner",
  "salesTeam",
  "status",
  "source",
];

function normalizeVisibleColumnIds(columnIds?: ContactColumnId[]) {
  const validColumnIds = new Set(contactColumnMeta.map((column) => column.id));
  const normalized = (columnIds ?? defaultVisibleColumnIds).filter((columnId) =>
    validColumnIds.has(columnId),
  );
  for (const requiredColumnId of requiredContactColumnIds) {
    if (!normalized.includes(requiredColumnId)) normalized.push(requiredColumnId);
  }

  return normalized.filter((columnId, index) => normalized.indexOf(columnId) === index);
}

const emptyForm: ContactFormState = {
  name: "",
  phone: "",
  source: "Facebook mess",
  note: "",
};

const rawSampleMarketingContacts: SampleMarketingContact[] = [
  {
    id: "sample_contact_001",
    createdAt: "2026-06-07",
    createdAtFull: "2026-06-07T09:12:00+07:00",
    name: "Lê Văn Cường",
    email: "cuong.le@example.com",
    phone: "0965111222",
    secondaryPhone: "0334567890",
    salesOwner: "Nguyễn Quang Tải",
    salesTeam: "S25.DT01",
    status: "new",
    source: "Facebook mess",
    sourceName: "Huy - NOTRIGOLD - Facebook Mess",
    sourceUrl: "https://landing.dasnotri.vn/notrigold-facebook-mess",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Khách hỏi combo 3 hũ, muốn tư vấn sau giờ trưa.",
    history: [
      "Lead được tạo từ Facebook mess",
      "Chia cho Nguyễn Quang Tải",
      "Đang chờ Sale liên hệ",
    ],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
  },
  {
    id: "sample_contact_002",
    createdAt: "2026-06-07",
    createdAtFull: "2026-06-07T10:05:00+07:00",
    name: "Nguyễn Thị Mai",
    email: "",
    phone: "0988123456",
    salesOwner: "Phạm Thị Ly Na",
    salesOwnerEmployeeCode: "DT00010",
    salesTeam: "S25.DT02",
    status: "processing",
    source: "Facebook chuyển đổi",
    sourceName: "Huy - NOTRIGOLD - Facebook chuyển đổi",
    sourceUrl: "https://landing.dasnotri.vn/notrigold-cd-b1",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Đã gọi lần 1, khách xin tư vấn lại chiều.",
    saleNote: "Khách quan tâm combo 5 hũ, hẹn gọi lại sau 17h.",
    history: [
      "Lead được tạo từ Facebook chuyển đổi",
      "Chia cho Phạm Thị Ly Na",
      "Chuyển trạng thái Đang xử lí",
    ],
    activityGroups: [
      {
        actor: "Nguyễn Hữu Huy (DT00014 - M26.DT01)",
        actions: [{ content: "Liên hệ được tạo", time: "2026-06-07T10:05:00+07:00" }],
      },
      {
        actor: "Phạm Thị Ly Na (DT00010 - Team Đạt)",
        actions: [{ content: "Nhận số", time: "2026-06-07T10:06:00+07:00" }],
      },
      {
        actor: "Admin 1",
        actions: [
          {
            content: "Chuyển đội ngũ bán hàng: Team Đạt -> Team Dũng",
            time: "2026-06-07T10:30:00+07:00",
          },
          {
            content:
              "Chuyển NVKD: Phạm Thị Ly Na (DT00010 - Team Đạt) -> Tạ Ngọc Tuấn (DT00018 - Team Dũng)",
            time: "2026-06-07T10:30:00+07:00",
          },
        ],
      },
    ],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
    orders: [
      {
        orderCode: "S112385",
        date: "2026-06-01",
        confirmedAt: "2026-06-01T19:55:12+07:00",
        shippingAddress: "THÔN ĐOÀI, XÃ HOÀNG ĐAN, TAM DƯƠNG, VĨNH PHÚC",
        product: "1 x DT - NOTRIGOLD - 1 KG",
        revenue: 390000,
        status: "Đang giao",
        currency: "VND",
        paymentMethod: "COD",
      },
    ],
  },
  {
    id: "sample_contact_003",
    createdAt: "2026-06-06",
    createdAtFull: "2026-06-06T15:44:00+07:00",
    name: "Trần Quốc Huy",
    email: "",
    phone: "0902345678",
    salesOwner: "Nguyễn Quang Vinh",
    salesTeam: "S25.DT01",
    status: "called",
    source: "Tiktok chuyển đổi",
    sourceName: "TikTok NOTRIGOLD - CĐ",
    sourceUrl: "https://landing.dasnotri.vn/tiktok-notrigold",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Khách đã nghe máy, cần follow up combo thùng.",
    history: [
      "Lead được tạo từ Tiktok chuyển đổi",
      "Chia cho Nguyễn Quang Vinh",
      "Chuyển trạng thái Đã gọi",
    ],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
  },
  {
    id: "sample_contact_004",
    createdAt: "2026-06-06",
    createdAtFull: "2026-06-06T16:18:00+07:00",
    name: "Đỗ Minh Tâm",
    email: "tam.do@example.com",
    phone: "0911222333",
    salesOwner: "Tạ Ngọc Tuấn",
    salesTeam: "S25.DT03",
    status: "resale_received",
    source: "Google",
    sourceName: "Google Search - NOTRIGOLD",
    sourceUrl: "https://landing.dasnotri.vn/google-notrigold",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Lead quay lại từ Google, Sale resale đã nhận.",
    history: ["Lead được tạo từ Google", "Chia cho Tạ Ngọc Tuấn", "Chuyển trạng thái Resale nhận"],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
  },
  {
    id: "sample_contact_005",
    createdAt: "2026-06-07",
    createdAtFull: "2026-06-07T11:22:00+07:00",
    name: "Test Trùng",
    email: "",
    phone: "0965111222",
    salesOwner: "—",
    salesTeam: "—",
    status: "duplicate",
    source: "Hotline",
    sourceName: "Hotline NOTRIGOLD",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Số trùng trong vòng 7 ngày nên không đưa vào hàng đợi chia Sale.",
    history: [
      "Lead được tạo từ Hotline",
      "Hệ thống phát hiện trùng số điện thoại",
      "Không đưa vào hàng đợi chia Sale",
    ],
    isDuplicate: true,
    duplicateOfContactId: "sample_contact_001",
    duplicateCheckedAt: "2026-06-07T11:22:00+07:00",
    eligibleForSaleDistribution: false,
  },
  {
    id: "sample_contact_006",
    createdAt: "2026-06-05",
    createdAtFull: "2026-06-05T13:33:00+07:00",
    name: "Hoàng Anh Đức",
    email: "",
    phone: "0933444555",
    salesOwner: "Phạm Thị Ly Na",
    salesOwnerEmployeeCode: "DT00010",
    salesTeam: "S25.DT02",
    status: "success",
    source: "Facebook chuyển đổi",
    sourceName: "NOTRIGOLD - CĐ - B1",
    sourceUrl: "https://landing.dasnotri.vn/notrigold-cd-b1",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Khách đã chốt combo 5 hũ.",
    history: [
      "Lead được tạo từ Facebook chuyển đổi",
      "Chia cho Phạm Thị Ly Na",
      "Chuyển trạng thái Đang xử lí",
      "Chuyển trạng thái Đã nhận",
    ],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
    orders: [
      {
        orderCode: "HD260605001",
        date: "2026-06-05",
        confirmedAt: "2026-06-05T18:12:30+07:00",
        shippingAddress: "SỐ 12 NGÕ 6, CẦU GIẤY, HÀ NỘI",
        product: "Combo 5 hũ Notrigold",
        revenue: 1755000,
        status: "Đã nhận",
        currency: "VND",
        paymentMethod: "COD",
      },
      {
        orderCode: "HD260606004",
        date: "2026-06-06",
        confirmedAt: "2026-06-06T10:20:00+07:00",
        shippingAddress: "SỐ 12 NGÕ 6, CẦU GIẤY, HÀ NỘI",
        product: "Notrizym quà tặng",
        revenue: 0,
        status: "Đã gửi",
        currency: "VND",
        paymentMethod: "COD",
      },
    ],
  },
  {
    id: "sample_contact_007",
    createdAt: "2026-06-04",
    createdAtFull: "2026-06-04T08:15:00+07:00",
    name: "Bùi Lan Hương",
    email: "huong.bui@example.com",
    phone: "0977000111",
    salesOwner: "Chưa phân phối",
    salesTeam: "Chưa phân phối",
    status: "new",
    source: "Tiktok mess",
    sourceName: "TikTok Inbox - NOTRIGOLD",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Chưa phân phối Sale.",
    history: ["Lead được tạo từ Tiktok mess", "Đang chờ hệ thống chia Sale"],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
  },
  {
    id: "sample_contact_008",
    createdAt: "2026-06-03",
    createdAtFull: "2026-06-03T19:03:00+07:00",
    name: "Vũ Thanh Sơn",
    email: "",
    phone: "0888999000",
    salesOwner: "Vũ Trường Đạt",
    salesTeam: "S25.DT01",
    status: "processing",
    source: "Youtube",
    sourceName: "YouTube Shorts - NOTRIGOLD",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Khách xem video, hỏi về cách dùng.",
    history: ["Lead được tạo từ Youtube", "Chia cho Vũ Trường Đạt", "Chuyển trạng thái Đang xử lí"],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
    orders: [
      {
        orderCode: "S112386",
        date: "2026-06-03",
        confirmedAt: "2026-06-03T20:05:44+07:00",
        shippingAddress: "PHƯỜNG 7, QUẬN GÒ VẤP, TP. HỒ CHÍ MINH",
        product: "1 x DT - NOTRIGOLD - 1 KG",
        revenue: 390000,
        status: "Đang giao",
        currency: "VND",
        paymentMethod: "COD",
      },
    ],
  },
  {
    id: "sample_contact_009",
    createdAt: "2026-06-02",
    createdAtFull: "2026-06-02T09:45:00+07:00",
    name: "Phan Khánh Linh",
    email: "",
    phone: "0855123123",
    salesOwner: "Nguyễn Quang Vinh",
    salesTeam: "S25.DT01",
    status: "called",
    source: "Hotline",
    sourceName: "Hotline NOTRIGOLD",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Đã gọi, khách chưa nghe máy lần 2.",
    history: ["Lead được tạo từ Hotline", "Chia cho Nguyễn Quang Vinh", "Chuyển trạng thái Đã gọi"],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
  },
  {
    id: "sample_contact_010",
    createdAt: "2026-06-01",
    createdAtFull: "2026-06-01T12:10:00+07:00",
    name: "Ngô Đức Long",
    email: "",
    phone: "0866777888",
    salesOwner: "Tạ Ngọc Tuấn",
    salesTeam: "S25.DT03",
    status: "success",
    source: "Facebook mess",
    sourceName: "Huy - NOTRIGOLD - Facebook Mess",
    sourceUrl: "https://landing.dasnotri.vn/notrigold-facebook-mess",
    marketerName: "Nguyễn Hữu Huy",
    marketerEmployeeCode: "DT00014",
    marketerCompanyName: "DASNOTRI-01",
    marketingTeam: "M26.DT01",
    product: "NOTRIGOLD",
    note: "Khách đã mua combo 3 hũ.",
    history: [
      "Lead được tạo từ Facebook mess",
      "Chia cho Tạ Ngọc Tuấn",
      "Chuyển trạng thái Đã nhận",
    ],
    isDuplicate: false,
    duplicateOfContactId: null,
    duplicateCheckedAt: "",
    eligibleForSaleDistribution: true,
    orders: [
      {
        orderCode: "HD260601008",
        date: "2026-06-01",
        confirmedAt: "2026-06-01T14:35:09+07:00",
        shippingAddress: "XÃ ĐÔNG LA, HOÀI ĐỨC, HÀ NỘI",
        product: "Combo 3 hũ Notrigold",
        revenue: 1112000,
        status: "Đã nhận",
        currency: "VND",
        paymentMethod: "COD",
      },
    ],
  },
];

const sampleMarketingContacts: MarketingContact[] = rawSampleMarketingContacts.map((contact) => ({
  ...contact,
  notes: contact.notes ?? [],
}));

interface StoredMarketingContactFilters {
  statusDropdownFilter?: StatusFilter | ContactStatus[];
  sourceFilter?: string | string[];
  saleOwnerFilter?: string | string[];
  saleTeamFilter?: string | string[];
  marketingTeamFilter?: string | string[];
  productFilter?: string | string[];
  amountFilter?: string | string[];
  searchTerm?: string;
  datePreset?: DatePreset;
  activeDatePreset?: DatePreset;
  appliedDateRange?: { startDate: string; endDate: string };
  visibleColumnIds?: ContactColumnId[];
}

interface SavedMarketingContactFilterPreset extends StoredMarketingContactFilters {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

interface AdvancedFilterGroupConfig {
  id: AdvancedFilterGroupId;
  label: string;
  allLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
}

function MarketingContactsPage() {
  const { profile } = useAuth();
  const initialDateRange = useMemo(() => getDatePresetRange("month_to_date"), []);
  const [contacts, setContacts] = useState<MarketingContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [fetchingContacts, setFetchingContacts] = useState(false);
  const hasLoadedContactsRef = useRef(false);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>(ALL_STATUS);
  const [statusDropdownFilter, setStatusDropdownFilter] = useState<ContactStatus[]>([]);
  const [activeDatePreset, setActiveDatePreset] = useState<DatePreset>("month_to_date");
  const [appliedDateRange, setAppliedDateRange] = useState(initialDateRange);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [draftDatePreset, setDraftDatePreset] = useState<DatePreset>("month_to_date");
  const [draftDateStart, setDraftDateStart] = useState(initialDateRange.startDate);
  const [draftDateEnd, setDraftDateEnd] = useState(initialDateRange.endDate);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [activeAdvancedFilterGroup, setActiveAdvancedFilterGroup] =
    useState<AdvancedFilterGroupId>("source");
  const [draftSourceFilter, setDraftSourceFilter] = useState<string[]>([]);
  const [draftStatusFilter, setDraftStatusFilter] = useState<ContactStatus[]>([]);
  const [draftSaleOwnerFilter, setDraftSaleOwnerFilter] = useState<string[]>([]);
  const [draftSaleTeamFilter, setDraftSaleTeamFilter] = useState<string[]>([]);
  const [draftMarketingTeamFilter, setDraftMarketingTeamFilter] = useState<string[]>([]);
  const [draftProductFilter, setDraftProductFilter] = useState<string[]>([]);
  const [draftAmountFilter, setDraftAmountFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [saleOwnerFilter, setSaleOwnerFilter] = useState<string[]>([]);
  const [saleTeamFilter, setSaleTeamFilter] = useState<string[]>([]);
  const [marketingTeamFilter, setMarketingTeamFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [amountFilter, setAmountFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [contactsReloadKey, setContactsReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [savedPresets, setSavedPresets] = useState<SavedMarketingContactFilterPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [morePresetsOpen, setMorePresetsOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [deletePresetConfirmOpen, setDeletePresetConfirmOpen] = useState(false);
  const [copyPresetOpen, setCopyPresetOpen] = useState(false);
  const [copyPresetName, setCopyPresetName] = useState("");
  const [panelPresetName, setPanelPresetName] = useState("");
  const [panelPresetDescription, setPanelPresetDescription] = useState("");
  const [panelPresetDefault, setPanelPresetDefault] = useState(false);
  const [panelDatePreset, setPanelDatePreset] = useState<DatePreset>("month_to_date");
  const [panelDateStart, setPanelDateStart] = useState(initialDateRange.startDate);
  const [panelDateEnd, setPanelDateEnd] = useState(initialDateRange.endDate);
  const [panelSourceFilter, setPanelSourceFilter] = useState<string[]>([]);
  const [panelStatusFilter, setPanelStatusFilter] = useState<ContactStatus[]>([]);
  const [panelSaleOwnerFilter, setPanelSaleOwnerFilter] = useState<string[]>([]);
  const [panelSaleTeamFilter, setPanelSaleTeamFilter] = useState<string[]>([]);
  const [panelMarketingTeamFilter, setPanelMarketingTeamFilter] = useState<string[]>([]);
  const [panelProductFilter, setPanelProductFilter] = useState<string[]>([]);
  const [panelAmountFilter, setPanelAmountFilter] = useState<string[]>([]);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [columnConfigByPreset, setColumnConfigByPreset] = useState<
    Record<string, ContactColumnId[]>
  >(() => loadStoredColumnConfigByPreset());
  const columnConfigByPresetRef = useRef(columnConfigByPreset);
  const [visibleColumnIds, setVisibleColumnIds] =
    useState<ContactColumnId[]>(defaultVisibleColumnIds);
  const [draftVisibleColumnIds, setDraftVisibleColumnIds] =
    useState<ContactColumnId[]>(defaultVisibleColumnIds);
  const [draggingColumnId, setDraggingColumnId] = useState<ContactColumnId | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<MarketingContact | null>(null);
  const [viewMode, setViewMode] = useState<ContactViewMode>("table");
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const profileWithHrFields = profile as
    | (NonNullable<typeof profile> & MarketingContactsProfileSnapshot)
    | null;
  const profileId = profile?.id ?? null;
  const profileFullName = profile?.full_name ?? null;
  const profileEmployeeCode = profileWithHrFields?.employee_code ?? null;
  const profileCompanyName = profileWithHrFields?.company_name ?? null;
  const profileSnapshot = useMemo<MarketingContactsProfileSnapshot | null>(() => {
    if (!profileId || !profileFullName) return null;
    return {
      full_name: profileFullName,
      employee_code: profileEmployeeCode,
      company_name: profileCompanyName,
    };
  }, [profileCompanyName, profileEmployeeCode, profileFullName, profileId]);

  useEffect(() => {
    columnConfigByPresetRef.current = columnConfigByPreset;
  }, [columnConfigByPreset]);

  const persistColumnConfigByPreset = useCallback(
    (nextConfig: Record<string, ContactColumnId[]>) => {
      setColumnConfigByPreset(nextConfig);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
      }
    },
    [],
  );

  const applyPresetFilters = useCallback((preset: SavedMarketingContactFilterPreset) => {
    const presetDatePreset = getStoredDatePreset(preset);
    const presetRange = getStoredDateRange(preset);
    setActiveStatus(ALL_STATUS);
    setStatusDropdownFilter(normalizeStatusFilterValues(preset.statusDropdownFilter));
    setSourceFilter(normalizeStringFilterValues(preset.sourceFilter, ALL_SOURCE));
    setSaleOwnerFilter(normalizeStringFilterValues(preset.saleOwnerFilter, ALL_SALE_OWNER));
    setSaleTeamFilter(normalizeStringFilterValues(preset.saleTeamFilter, ALL_SALE_TEAM));
    setMarketingTeamFilter(
      normalizeStringFilterValues(preset.marketingTeamFilter, ALL_MARKETING_TEAM),
    );
    setProductFilter(normalizeStringFilterValues(preset.productFilter, ALL_PRODUCT));
    setAmountFilter(normalizeStringFilterValues(preset.amountFilter, ALL_AMOUNT));
    setSearchTerm(preset.searchTerm ?? "");
    setActiveDatePreset(presetDatePreset);
    setAppliedDateRange(presetRange);
    setVisibleColumnIds(
      resolvePresetVisibleColumnIds(
        preset.id,
        columnConfigByPresetRef.current,
        preset.visibleColumnIds,
      ),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(FILTER_PRESET_STORAGE_KEY);
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as SavedMarketingContactFilterPreset[];
      if (Array.isArray(stored)) {
        const normalizedPresets = stored
          .filter((preset) => preset.id && preset.name)
          .map(normalizeSavedMarketingContactPreset);
        if (JSON.stringify(stored) !== JSON.stringify(normalizedPresets)) {
          window.localStorage.setItem(FILTER_PRESET_STORAGE_KEY, JSON.stringify(normalizedPresets));
        }
        setSavedPresets(normalizedPresets);
        const defaultPreset = normalizedPresets.find((preset) => preset.isDefault);
        if (defaultPreset) {
          setSelectedPresetId(defaultPreset.id);
          applyPresetFilters(defaultPreset);
        }
      }
    } catch (error) {
      console.error("[marketing-contacts][restore-filter-presets]", error);
      window.localStorage.removeItem(FILTER_PRESET_STORAGE_KEY);
    }
  }, [applyPresetFilters]);

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      if (!profileId) {
        if (active) {
          setContacts([]);
          setLoadingContacts(false);
        }
        return;
      }

      if (!hasLoadedContactsRef.current) {
        setLoadingContacts(true);
      } else {
        setFetchingContacts(true);
      }
      try {
        const rows = await fetchEmployeeMarketingContacts();
        if (active) {
          setContacts(withSampleMarketingContacts(rows, profileSnapshot));
          hasLoadedContactsRef.current = true;
        }
      } catch (error) {
        console.error("[marketing-contacts][load]", error);
        toast.error("Không tải được liên hệ khách hàng");
        if (active) {
          setContacts((current) =>
            current.length > 0 ? current : getProfileAwareSampleContacts(profileSnapshot),
          );
          hasLoadedContactsRef.current = true;
        }
      } finally {
        if (active) {
          setLoadingContacts(false);
          setFetchingContacts(false);
        }
      }
    }

    void loadContacts();

    return () => {
      active = false;
    };
  }, [contactsReloadKey, profileId, profileSnapshot]);

  const saleOwnerOptions = useMemo(() => {
    return Array.from(
      new Set(
        contacts
          .map((contact) => contact.salesOwner)
          .filter((owner) => owner && !isUnassignedValue(owner)),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [contacts]);

  const saleTeamOptions = useMemo(() => {
    return Array.from(
      new Set(
        contacts
          .map((contact) => contact.salesTeam)
          .filter((team) => team && !isUnassignedValue(team)),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [contacts]);

  const marketingTeamOptions = useMemo(() => {
    return Array.from(
      new Set(
        contacts
          .map((contact) => contact.marketingTeam)
          .filter((team) => team && !isUnassignedValue(team)),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [contacts]);

  const productOptions = useMemo(() => {
    return Array.from(
      new Set(contacts.map((contact) => contact.product).filter((product) => product?.trim())),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [contacts]);

  const baseContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const matchesSource = sourceFilter.length === 0 || sourceFilter.includes(contact.source);
      const matchesSaleOwner =
        saleOwnerFilter.length === 0 ||
        (saleOwnerFilter.includes(UNASSIGNED_SALE_OWNER) &&
          isUnassignedValue(contact.salesOwner)) ||
        saleOwnerFilter.includes(contact.salesOwner);
      const matchesSaleTeam =
        saleTeamFilter.length === 0 ||
        (saleTeamFilter.includes(UNASSIGNED_SALE_TEAM) && isUnassignedValue(contact.salesTeam)) ||
        saleTeamFilter.includes(contact.salesTeam);
      const matchesMarketingTeam =
        marketingTeamFilter.length === 0 || marketingTeamFilter.includes(contact.marketingTeam);
      const matchesProduct = productFilter.length === 0 || productFilter.includes(contact.product);
      const matchesAmount = matchesContactAmountFilter(contact, amountFilter);
      const matchesDate =
        contact.createdAt >= appliedDateRange.startDate &&
        contact.createdAt <= appliedDateRange.endDate;
      return (
        matchesSource &&
        matchesSaleOwner &&
        matchesSaleTeam &&
        matchesMarketingTeam &&
        matchesProduct &&
        matchesAmount &&
        matchesDate
      );
    });
  }, [
    appliedDateRange.endDate,
    appliedDateRange.startDate,
    amountFilter,
    contacts,
    marketingTeamFilter,
    productFilter,
    saleOwnerFilter,
    saleTeamFilter,
    sourceFilter,
  ]);

  const appliedFilterContacts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return baseContacts.filter((contact) => {
      const effectiveStatus = contact.isDuplicate ? "duplicate" : contact.status;
      const matchesDropdownStatus =
        statusDropdownFilter.length === 0 || statusDropdownFilter.includes(effectiveStatus);
      const matchesSearch =
        !normalizedSearch ||
        contact.name.toLowerCase().includes(normalizedSearch) ||
        contact.phone.includes(normalizedSearch) ||
        contact.email.toLowerCase().includes(normalizedSearch);
      return matchesDropdownStatus && matchesSearch;
    });
  }, [baseContacts, searchTerm, statusDropdownFilter]);

  const statusCounts = useMemo(() => {
    const byStatus = Object.fromEntries(statusOptions.map((status) => [status.key, 0])) as Record<
      ContactStatus,
      number
    >;
    for (const contact of appliedFilterContacts) {
      const key = contact.isDuplicate ? "duplicate" : contact.status;
      byStatus[key] += 1;
    }
    const saleReceived = byStatus.new + byStatus.processing + byStatus.called;
    return {
      total: appliedFilterContacts.length,
      saleReceived,
      ...byStatus,
    };
  }, [appliedFilterContacts]);

  const filteredContacts = useMemo(() => {
    return appliedFilterContacts.filter((contact) => {
      const effectiveStatus = contact.isDuplicate ? "duplicate" : contact.status;
      if (activeStatus === SALE_RECEIVED_STATUS) {
        return (
          effectiveStatus === "new" ||
          effectiveStatus === "processing" ||
          effectiveStatus === "called"
        );
      }
      return activeStatus === ALL_STATUS || effectiveStatus === activeStatus;
    });
  }, [activeStatus, appliedFilterContacts]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE));
  const filteredContactsTotalAmount = useMemo(
    () => filteredContacts.reduce((total, contact) => total + getContactTotalAmount(contact), 0),
    [filteredContacts],
  );
  const paginatedContacts = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return filteredContacts.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredContacts, page]);
  const tableMinWidth = useMemo(
    () => getContactTableMinWidth(visibleColumnIds),
    [visibleColumnIds],
  );
  const kanbanColumns = useMemo(
    () => buildKanbanContactColumns(filteredContacts),
    [filteredContacts],
  );

  const draftCalendarBaseDate = useMemo(
    () => parseDateKey(draftDateStart) ?? startOfLocalDay(new Date()),
    [draftDateStart],
  );

  const hasActiveFilters = useMemo(() => {
    const defaultRange = getDatePresetRange("month_to_date");
    return (
      activeStatus !== ALL_STATUS ||
      statusDropdownFilter.length > 0 ||
      sourceFilter.length > 0 ||
      saleOwnerFilter.length > 0 ||
      saleTeamFilter.length > 0 ||
      marketingTeamFilter.length > 0 ||
      productFilter.length > 0 ||
      amountFilter.length > 0 ||
      activeDatePreset !== "month_to_date" ||
      appliedDateRange.startDate !== defaultRange.startDate ||
      appliedDateRange.endDate !== defaultRange.endDate ||
      searchTerm.trim().length > 0
    );
  }, [
    activeDatePreset,
    activeStatus,
    appliedDateRange.endDate,
    appliedDateRange.startDate,
    amountFilter,
    marketingTeamFilter,
    productFilter,
    saleOwnerFilter,
    saleTeamFilter,
    searchTerm,
    sourceFilter,
    statusDropdownFilter,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    activeStatus,
    appliedDateRange,
    amountFilter,
    marketingTeamFilter,
    productFilter,
    saleOwnerFilter,
    saleTeamFilter,
    searchTerm,
    sourceFilter,
    statusDropdownFilter,
  ]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const resetForm = () => setForm(emptyForm);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) resetForm();
  };

  const handleCreateContact = async () => {
    if (!form.name.trim()) {
      toast.error("Nhập tên khách hàng");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Nhập số điện thoại");
      return;
    }
    if (!profile?.id) {
      toast.error("Không xác định được tài khoản hiện tại");
      return;
    }

    try {
      const newContact = await createMarketingContact({
        name: form.name.trim(),
        phone: form.phone.trim(),
        source: form.source,
        note: form.note.trim(),
        ownerUserId: profile.id,
      });

      setContacts((current) => [newContact, ...current]);
      setCreateOpen(false);
      resetForm();
      toast.success("Đã tạo liên hệ khách hàng");
    } catch (error) {
      console.error("[marketing-contacts][create]", error);
      toast.error("Không tạo được liên hệ khách hàng");
    }
  };

  const handleDatePresetSelect = (preset: DatePreset) => {
    const nextRange = getDatePresetRange(preset);
    setDraftDatePreset(preset);
    setDraftDateStart(nextRange.startDate);
    setDraftDateEnd(nextRange.endDate);
  };

  const handleApplyDateRange = () => {
    if (!draftDateStart || !draftDateEnd) {
      toast.error("Chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }
    if (draftDateStart > draftDateEnd) {
      toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }
    const nextRange =
      draftDatePreset === "custom"
        ? { startDate: draftDateStart, endDate: draftDateEnd }
        : getDatePresetRange(draftDatePreset);
    setActiveDatePreset(draftDatePreset);
    setAppliedDateRange(nextRange);
    setDateFilterOpen(false);
  };

  const handleOpenDateFilter = () => {
    const currentRange =
      activeDatePreset === "custom" ? appliedDateRange : getDatePresetRange(activeDatePreset);
    setDraftDatePreset(activeDatePreset);
    setDraftDateStart(currentRange.startDate);
    setDraftDateEnd(currentRange.endDate);
    setDateFilterOpen(true);
  };

  const handleOpenAdvancedFilters = () => {
    setDraftSourceFilter([...sourceFilter]);
    setDraftStatusFilter([...statusDropdownFilter]);
    setDraftSaleOwnerFilter([...saleOwnerFilter]);
    setDraftSaleTeamFilter([...saleTeamFilter]);
    setDraftMarketingTeamFilter([...marketingTeamFilter]);
    setDraftProductFilter([...productFilter]);
    setDraftAmountFilter([...amountFilter]);
    setActiveAdvancedFilterGroup("source");
    setAdvancedFilterOpen(true);
  };

  const handleApplyAdvancedFilters = () => {
    setSourceFilter([...draftSourceFilter]);
    setStatusDropdownFilter([...draftStatusFilter]);
    setSaleOwnerFilter([...draftSaleOwnerFilter]);
    setSaleTeamFilter([...draftSaleTeamFilter]);
    setMarketingTeamFilter([...draftMarketingTeamFilter]);
    setProductFilter([...draftProductFilter]);
    setAmountFilter([...draftAmountFilter]);
    setAdvancedFilterOpen(false);
  };

  const handleRefreshContacts = () => {
    setContactsReloadKey((current) => current + 1);
  };

  const resetAllFilters = () => {
    const defaultRange = getDatePresetRange("month_to_date");
    setSelectedPresetId(null);
    setActiveStatus(ALL_STATUS);
    setStatusDropdownFilter([]);
    setSourceFilter([]);
    setSaleOwnerFilter([]);
    setSaleTeamFilter([]);
    setMarketingTeamFilter([]);
    setProductFilter([]);
    setAmountFilter([]);
    setSearchTerm("");
    setActiveDatePreset("month_to_date");
    setAppliedDateRange(defaultRange);
    setVisibleColumnIds(resolveAllContactsVisibleColumnIds(columnConfigByPreset));
  };

  const activeFilterChips = useMemo(() => {
    const defaultRange = getDatePresetRange("month_to_date");
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (
      activeDatePreset !== "month_to_date" ||
      appliedDateRange.startDate !== defaultRange.startDate ||
      appliedDateRange.endDate !== defaultRange.endDate
    ) {
      chips.push({
        key: "date",
        label: getDateFilterChipLabel(activeDatePreset, appliedDateRange),
        onRemove: () => {
          setActiveDatePreset("month_to_date");
          setAppliedDateRange(defaultRange);
        },
      });
    }

    sourceFilter.forEach((source) => {
      chips.push({
        key: `source-${source}`,
        label: `Nguồn là ${source}`,
        onRemove: () => setSourceFilter((current) => current.filter((item) => item !== source)),
      });
    });

    statusDropdownFilter.forEach((status) => {
      chips.push({
        key: `status-${status}`,
        label: `Trạng thái là ${getStatusLabel(status)}`,
        onRemove: () =>
          setStatusDropdownFilter((current) => current.filter((item) => item !== status)),
      });
    });

    saleOwnerFilter.forEach((owner) => {
      chips.push({
        key: `saleOwner-${owner}`,
        label: `NVKD là ${owner === UNASSIGNED_SALE_OWNER ? "Chưa phân phối" : owner}`,
        onRemove: () => setSaleOwnerFilter((current) => current.filter((item) => item !== owner)),
      });
    });

    saleTeamFilter.forEach((team) => {
      chips.push({
        key: `saleTeam-${team}`,
        label: `Đội Sale là ${team === UNASSIGNED_SALE_TEAM ? "Chưa phân phối" : team}`,
        onRemove: () => setSaleTeamFilter((current) => current.filter((item) => item !== team)),
      });
    });

    marketingTeamFilter.forEach((team) => {
      chips.push({
        key: `marketingTeam-${team}`,
        label: `Team MKT là ${team}`,
        onRemove: () =>
          setMarketingTeamFilter((current) => current.filter((item) => item !== team)),
      });
    });

    productFilter.forEach((product) => {
      chips.push({
        key: `product-${product}`,
        label: `Nhãn sản phẩm là ${product}`,
        onRemove: () => setProductFilter((current) => current.filter((item) => item !== product)),
      });
    });

    amountFilter.forEach((amount) => {
      chips.push({
        key: `amount-${amount}`,
        label: `Tổng tiền là ${getAmountFilterLabel(amount)}`,
        onRemove: () => setAmountFilter((current) => current.filter((item) => item !== amount)),
      });
    });

    const normalizedSearch = searchTerm.trim();
    if (normalizedSearch) {
      chips.push({
        key: "search",
        label: `Tìm kiếm chứa "${normalizedSearch}"`,
        onRemove: () => setSearchTerm(""),
      });
    }

    return chips;
  }, [
    activeDatePreset,
    amountFilter,
    appliedDateRange,
    marketingTeamFilter,
    productFilter,
    saleOwnerFilter,
    saleTeamFilter,
    searchTerm,
    sourceFilter,
    statusDropdownFilter,
  ]);

  const isPresetActive = useCallback(
    (preset: SavedMarketingContactFilterPreset) => {
      const presetDatePreset = getStoredDatePreset(preset);
      const presetRange = getStoredDateRange(preset);
      return (
        activeStatus === ALL_STATUS &&
        areStringArraysEqual(
          normalizeStatusFilterValues(preset.statusDropdownFilter),
          statusDropdownFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.sourceFilter, ALL_SOURCE),
          sourceFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.saleOwnerFilter, ALL_SALE_OWNER),
          saleOwnerFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.saleTeamFilter, ALL_SALE_TEAM),
          saleTeamFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.marketingTeamFilter, ALL_MARKETING_TEAM),
          marketingTeamFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.productFilter, ALL_PRODUCT),
          productFilter,
        ) &&
        areStringArraysEqual(
          normalizeStringFilterValues(preset.amountFilter, ALL_AMOUNT),
          amountFilter,
        ) &&
        (preset.searchTerm ?? "") === searchTerm &&
        presetDatePreset === activeDatePreset &&
        presetRange.startDate === appliedDateRange.startDate &&
        presetRange.endDate === appliedDateRange.endDate
      );
    },
    [
      activeDatePreset,
      activeStatus,
      amountFilter,
      appliedDateRange.endDate,
      appliedDateRange.startDate,
      marketingTeamFilter,
      productFilter,
      saleOwnerFilter,
      saleTeamFilter,
      searchTerm,
      sourceFilter,
      statusDropdownFilter,
    ],
  );

  const persistPresets = (nextPresets: SavedMarketingContactFilterPreset[]) => {
    setSavedPresets(nextPresets);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FILTER_PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
    }
  };

  const selectedPreset = useMemo(
    () => savedPresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [savedPresets, selectedPresetId],
  );

  const orderedSavedPresets = useMemo(() => {
    const defaultPresets = savedPresets.filter((preset) => preset.isDefault);
    const otherPresets = savedPresets.filter((preset) => !preset.isDefault);
    return [...defaultPresets, ...otherPresets];
  }, [savedPresets]);

  const { visibleSavedPresets, hiddenSavedPresets } = useMemo(() => {
    const visible: SavedMarketingContactFilterPreset[] = [];
    const addVisible = (preset?: SavedMarketingContactFilterPreset | null) => {
      if (!preset || visible.some((item) => item.id === preset.id)) return;
      visible.push(preset);
    };

    orderedSavedPresets.filter((preset) => preset.isDefault).forEach(addVisible);
    addVisible(orderedSavedPresets.find((preset) => preset.id === selectedPresetId));

    for (const preset of orderedSavedPresets) {
      if (visible.length >= 3) break;
      addVisible(preset);
    }

    return {
      visibleSavedPresets: visible,
      hiddenSavedPresets: orderedSavedPresets.filter(
        (preset) => !preset.isDefault && !visible.some((item) => item.id === preset.id),
      ),
    };
  }, [orderedSavedPresets, selectedPresetId]);

  const loadPresetIntoPanel = (preset: SavedMarketingContactFilterPreset) => {
    const presetDatePreset = getStoredDatePreset(preset);
    const presetRange = getStoredDateRange(preset);
    setSelectedPresetId(preset.id);
    setPanelPresetName(preset.name);
    setPanelPresetDescription(preset.description ?? "");
    setPanelPresetDefault(Boolean(preset.isDefault));
    setPanelDatePreset(presetDatePreset);
    setPanelDateStart(presetRange.startDate);
    setPanelDateEnd(presetRange.endDate);
    setPanelSourceFilter(normalizeStringFilterValues(preset.sourceFilter, ALL_SOURCE));
    setPanelStatusFilter(normalizeStatusFilterValues(preset.statusDropdownFilter));
    setPanelSaleOwnerFilter(normalizeStringFilterValues(preset.saleOwnerFilter, ALL_SALE_OWNER));
    setPanelSaleTeamFilter(normalizeStringFilterValues(preset.saleTeamFilter, ALL_SALE_TEAM));
    setPanelMarketingTeamFilter(
      normalizeStringFilterValues(preset.marketingTeamFilter, ALL_MARKETING_TEAM),
    );
    setPanelProductFilter(normalizeStringFilterValues(preset.productFilter, ALL_PRODUCT));
    setPanelAmountFilter(normalizeStringFilterValues(preset.amountFilter, ALL_AMOUNT));
    setPanelSearchTerm(preset.searchTerm ?? "");
  };

  const resetPanelForm = () => {
    setSelectedPresetId(null);
    setPanelPresetName("");
    setPanelPresetDescription("");
    setPanelPresetDefault(false);
    setPanelDatePreset("custom");
    setPanelDateStart("");
    setPanelDateEnd("");
    setPanelSourceFilter([]);
    setPanelStatusFilter([]);
    setPanelSaleOwnerFilter([]);
    setPanelSaleTeamFilter([]);
    setPanelMarketingTeamFilter([]);
    setPanelProductFilter([]);
    setPanelAmountFilter([]);
    setPanelSearchTerm("");
  };

  const handleOpenFilterPanel = () => {
    const activePreset =
      selectedPreset && isPresetActive(selectedPreset)
        ? selectedPreset
        : savedPresets.find((preset) => isPresetActive(preset));
    if (!activePreset) {
      resetPanelForm();
      setFilterPanelOpen(true);
      return;
    }
    loadPresetIntoPanel(activePreset);
    setFilterPanelOpen(true);
  };

  const handlePanelDatePresetSelect = (preset: DatePreset) => {
    setPanelDatePreset(preset);
    if (preset === "custom") return;
    const nextRange = getDatePresetRange(preset);
    setPanelDateStart(nextRange.startDate);
    setPanelDateEnd(nextRange.endDate);
  };

  const buildPanelPresetPayload = (
    preset: SavedMarketingContactFilterPreset,
  ): SavedMarketingContactFilterPreset => ({
    ...preset,
    name: panelPresetName.trim().slice(0, 50),
    description: panelPresetDescription.trim(),
    isDefault: panelPresetDefault,
    datePreset: panelDatePreset,
    activeDatePreset: panelDatePreset,
    appliedDateRange:
      panelDatePreset === "custom"
        ? { startDate: panelDateStart, endDate: panelDateEnd }
        : undefined,
    sourceFilter: panelSourceFilter,
    statusDropdownFilter: panelStatusFilter,
    saleOwnerFilter: panelSaleOwnerFilter,
    saleTeamFilter: panelSaleTeamFilter,
    marketingTeamFilter: panelMarketingTeamFilter,
    productFilter: panelProductFilter,
    amountFilter: panelAmountFilter,
    searchTerm: panelSearchTerm.trim(),
  });

  const handleSavePanelPreset = () => {
    const normalizedName = panelPresetName.trim().slice(0, 50);
    if (!normalizedName) {
      toast.error("Nhập tên bộ lọc.");
      return;
    }
    if (!panelDateStart || !panelDateEnd) {
      toast.error("Chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }
    if (panelDateStart > panelDateEnd) {
      toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }

    if (!selectedPreset) {
      const newPreset: SavedMarketingContactFilterPreset = {
        id: `preset_${Date.now()}`,
        name: normalizedName,
        description: panelPresetDescription.trim(),
        isDefault: panelPresetDefault,
        datePreset: panelDatePreset,
        activeDatePreset: panelDatePreset,
        appliedDateRange:
          panelDatePreset === "custom"
            ? { startDate: panelDateStart, endDate: panelDateEnd }
            : undefined,
        sourceFilter: panelSourceFilter,
        statusDropdownFilter: panelStatusFilter,
        saleOwnerFilter: panelSaleOwnerFilter,
        saleTeamFilter: panelSaleTeamFilter,
        marketingTeamFilter: panelMarketingTeamFilter,
        productFilter: panelProductFilter,
        amountFilter: panelAmountFilter,
        searchTerm: panelSearchTerm.trim(),
        visibleColumnIds,
      };
      const nextPresets = panelPresetDefault
        ? [newPreset, ...savedPresets.map((preset) => ({ ...preset, isDefault: false }))]
        : [newPreset, ...savedPresets];
      persistPresets(nextPresets);
      persistColumnConfigByPreset({
        ...columnConfigByPreset,
        [newPreset.id]: normalizeVisibleColumnIds(visibleColumnIds),
      });
      setSelectedPresetId(newPreset.id);
      applyPresetFilters(newPreset);
      toast.success("Đã lưu bộ lọc.");
      return;
    }

    const shouldReapply = isPresetActive(selectedPreset);
    const updatedPreset = buildPanelPresetPayload(selectedPreset);
    const nextPresets = savedPresets.map((preset) => {
      if (preset.id === selectedPreset.id) return updatedPreset;
      return panelPresetDefault ? { ...preset, isDefault: false } : preset;
    });
    persistPresets(nextPresets);
    setSelectedPresetId(updatedPreset.id);
    if (shouldReapply) applyPresetFilters(updatedPreset);
    toast.success("Đã lưu chỉnh sửa bộ lọc.");
  };

  const handleConfirmDeletePreset = () => {
    if (!selectedPreset) return;
    const shouldReset = isPresetActive(selectedPreset);
    const nextPresets = savedPresets.filter((preset) => preset.id !== selectedPreset.id);
    const { [selectedPreset.id]: _removedColumnConfig, ...nextColumnConfig } = columnConfigByPreset;
    persistPresets(nextPresets);
    persistColumnConfigByPreset(nextColumnConfig);
    setDeletePresetConfirmOpen(false);
    setFilterPanelOpen(false);
    setSelectedPresetId(null);
    if (shouldReset) resetAllFilters();
    toast.success("Đã xoá bộ lọc.");
  };

  const handleSavePresetCopy = () => {
    if (!selectedPreset) return;
    const normalizedName = copyPresetName.trim().slice(0, 50);
    if (!normalizedName) return;
    const copiedPreset: SavedMarketingContactFilterPreset = {
      ...buildPanelPresetPayload(selectedPreset),
      id: `preset_${Date.now()}`,
      name: normalizedName,
      isDefault: false,
    };
    const nextPresets = [copiedPreset, ...savedPresets];
    persistPresets(nextPresets);
    persistColumnConfigByPreset({
      ...columnConfigByPreset,
      [copiedPreset.id]: resolvePresetVisibleColumnIds(
        selectedPreset.id,
        columnConfigByPreset,
        selectedPreset.visibleColumnIds,
      ),
    });
    setCopyPresetOpen(false);
    setCopyPresetName("");
    loadPresetIntoPanel(copiedPreset);
    toast.success("Đã lưu bản sao bộ lọc.");
  };

  const handleOpenColumnConfig = () => {
    setDraftVisibleColumnIds(normalizeVisibleColumnIds(visibleColumnIds));
    setColumnSearch("");
    setColumnConfigOpen(true);
  };

  const handleApplyColumnConfig = () => {
    const normalizedColumns = normalizeVisibleColumnIds(draftVisibleColumnIds);
    const configKey = selectedPresetId ?? ALL_CONTACTS_COLUMN_CONFIG_KEY;
    persistColumnConfigByPreset({
      ...columnConfigByPreset,
      [configKey]: normalizedColumns,
    });
    setVisibleColumnIds(normalizedColumns);
    setColumnConfigOpen(false);
  };

  const toggleDraftColumn = (columnId: ContactColumnId) => {
    if (requiredContactColumnIds.includes(columnId)) return;
    setDraftVisibleColumnIds((current) =>
      current.includes(columnId) ? current.filter((id) => id !== columnId) : [...current, columnId],
    );
  };

  const removeDraftColumn = (columnId: ContactColumnId) => {
    if (requiredContactColumnIds.includes(columnId)) return;
    setDraftVisibleColumnIds((current) => current.filter((id) => id !== columnId));
  };

  const moveDraftColumn = (fromColumnId: ContactColumnId, toColumnId: ContactColumnId) => {
    if (fromColumnId === toColumnId) return;
    setDraftVisibleColumnIds((current) => {
      const fromIndex = current.indexOf(fromColumnId);
      const toIndex = current.indexOf(toColumnId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [movedColumn] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedColumn);
      return next;
    });
  };

  const copyPhoneNumber = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Đã copy số điện thoại");
    } catch {
      toast.error("Không copy được SĐT");
    }
  };

  const renderPhoneCell = (phone: string) => (
    <span className="group relative inline-flex max-w-full align-middle">
      <button
        type="button"
        className="block max-w-full cursor-pointer truncate text-left font-medium tabular-nums text-blue-600 transition hover:text-blue-700"
        onClick={() => void copyPhoneNumber(phone)}
      >
        {phone}
      </button>
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-lg group-hover:block">
        Click để copy số điện thoại
      </span>
    </span>
  );

  const renderContactCell = (columnId: ContactColumnId, contact: MarketingContact) => {
    switch (columnId) {
      case "createdAt":
        return (
          <span className="block whitespace-nowrap text-slate-600">
            {formatDateTime(contact.createdAtFull || contact.createdAt)}
          </span>
        );
      case "name":
        return (
          <p className="truncate font-semibold text-slate-950" title={contact.name}>
            {contact.name}
          </p>
        );
      case "phone":
        return renderPhoneCell(contact.phone);
      case "salesOwner":
        if (isDuplicateContact(contact)) return <span className="text-slate-500">—</span>;
        return (
          <span
            className="block truncate font-medium text-slate-700"
            title={formatSalesOwnerTableDisplay(contact)}
          >
            {formatSalesOwnerTableDisplay(contact)}
          </span>
        );
      case "marketingTeam":
        return (
          <span className="block truncate text-slate-600" title={contact.marketingTeam}>
            {contact.marketingTeam || "—"}
          </span>
        );
      case "salesTeam":
        if (isDuplicateContact(contact)) return <span className="text-slate-500">—</span>;
        return (
          <span className="block truncate text-slate-600" title={contact.salesTeam}>
            {isUnassignedValue(contact.salesTeam) ? "Chưa phân phối" : contact.salesTeam}
          </span>
        );
      case "status":
        return <StatusPill status={isDuplicateContact(contact) ? "duplicate" : contact.status} />;
      case "source":
        return (
          <span className="block truncate text-slate-600" title={contact.source}>
            {contact.source}
          </span>
        );
      case "product":
        return (
          <span className="block truncate text-slate-600" title={contact.product || "—"}>
            {contact.product || "—"}
          </span>
        );
      case "totalAmount":
        return (
          <span className="block text-right font-semibold text-slate-900">
            {formatContactTotalAmount(contact)}
          </span>
        );
      case "note": {
        const recentNote = getContactRecentNote(contact);
        return (
          <span className="block truncate text-slate-600" title={recentNote}>
            {recentNote || "—"}
          </span>
        );
      }
      default:
        return null;
    }
  };

  const renderTableColGroup = () => (
    <colgroup>
      <col className="w-[44px]" />
      <col className="w-[48px]" />
      {visibleColumnIds.map((columnId) => {
        const column = contactColumnMeta.find((item) => item.id === columnId);
        if (!column) return null;
        return <col key={column.id} className={column.width} />;
      })}
    </colgroup>
  );

  const renderDetailButton = (contact: MarketingContact) => (
    <Button
      variant="ghost"
      size="icon"
      title="Xem chi tiết"
      className="h-8 w-8 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600"
      onClick={() => setDetailContact(contact)}
    >
      <Eye className="h-4 w-4" />
    </Button>
  );

  const advancedFilterGroups = useMemo<AdvancedFilterGroupConfig[]>(
    () => [
      {
        id: "source" as const,
        label: "Nguồn",
        allLabel: "Tất cả nguồn",
        values: draftSourceFilter,
        onChange: setDraftSourceFilter,
        options: leadChannelOptions.map((source) => ({ value: source, label: source })),
      },
      {
        id: "status" as const,
        label: "Trạng thái",
        allLabel: "Tất cả trạng thái",
        values: draftStatusFilter,
        onChange: (values: string[]) => setDraftStatusFilter(values as ContactStatus[]),
        options: statusOptions.map((status) => ({
          value: status.key,
          label: status.label,
          color: status.key,
        })),
      },
      {
        id: "saleOwner" as const,
        label: "NVKD / Nhân viên kinh doanh",
        allLabel: "Tất cả NVKD",
        values: draftSaleOwnerFilter,
        onChange: setDraftSaleOwnerFilter,
        options: [
          { value: UNASSIGNED_SALE_OWNER, label: "Chưa phân phối" },
          ...saleOwnerOptions.map((owner) => ({ value: owner, label: owner })),
        ],
      },
      {
        id: "saleTeam" as const,
        label: "Đội ngũ bán hàng",
        allLabel: "Tất cả đội Sale",
        values: draftSaleTeamFilter,
        onChange: setDraftSaleTeamFilter,
        options: [
          { value: UNASSIGNED_SALE_TEAM, label: "Chưa phân phối" },
          ...saleTeamOptions.map((team) => ({ value: team, label: team })),
        ],
      },
      {
        id: "marketingTeam" as const,
        label: "Team MKT",
        allLabel: "Tất cả Team MKT",
        values: draftMarketingTeamFilter,
        onChange: setDraftMarketingTeamFilter,
        options: marketingTeamOptions.map((team) => ({ value: team, label: team })),
      },
      {
        id: "product" as const,
        label: "Nhãn sản phẩm",
        allLabel: "Tất cả sản phẩm",
        values: draftProductFilter,
        onChange: setDraftProductFilter,
        options: productOptions.map((product) => ({ value: product, label: product })),
      },
      {
        id: "amount" as const,
        label: "Tổng tiền",
        allLabel: "Tất cả tổng tiền",
        values: draftAmountFilter,
        onChange: setDraftAmountFilter,
        options: amountFilterOptions,
      },
    ],
    [
      draftAmountFilter,
      draftMarketingTeamFilter,
      draftProductFilter,
      draftSaleOwnerFilter,
      draftSaleTeamFilter,
      draftSourceFilter,
      draftStatusFilter,
      marketingTeamOptions,
      productOptions,
      saleOwnerOptions,
      saleTeamOptions,
    ],
  );

  const activeAdvancedGroup =
    advancedFilterGroups.find((group) => group.id === activeAdvancedFilterGroup) ??
    advancedFilterGroups[0];

  return (
    <div className="flex h-[calc(100dvh-88px)] max-h-[calc(100dvh-88px)] min-h-0 flex-col overflow-hidden bg-slate-50 px-3 py-2 text-slate-950 md:px-5">
      <section className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Liên hệ khách hàng</h1>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-9 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold shadow-sm shadow-blue-600/15 hover:bg-blue-700"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Tạo liên hệ
          </Button>
        </div>
      </section>

      <section className="mt-2 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              <button
                type="button"
                onClick={resetAllFilters}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition",
                  selectedPresetId === null && !hasActiveFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
                )}
              >
                Tất cả liên hệ
              </button>
              {visibleSavedPresets.map((preset) => {
                const presetActive = selectedPresetId === preset.id && isPresetActive(preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      applyPresetFilters(preset);
                    }}
                    className={cn(
                      "inline-flex h-9 max-w-[260px] items-center gap-2 overflow-hidden rounded-lg border px-3 text-sm font-medium text-slate-700 transition",
                      presetActive
                        ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-slate-200 hover:border-blue-200 hover:text-blue-700",
                    )}
                    title={preset.name}
                  >
                    {preset.isDefault ? (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    ) : null}
                    <span className="truncate">{preset.name}</span>
                  </button>
                );
              })}
              {hiddenSavedPresets.length > 0 ? (
                <Popover open={morePresetsOpen} onOpenChange={setMorePresetsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                    >
                      + Xem thêm
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={6}
                    className="w-64 rounded-xl border-slate-200 p-1.5 shadow-xl"
                  >
                    <div className="max-h-72 overflow-y-auto">
                      {hiddenSavedPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                          title={preset.name}
                          onClick={() => {
                            setSelectedPresetId(preset.id);
                            applyPresetFilters(preset);
                            setMorePresetsOpen(false);
                          }}
                        >
                          <span className="truncate">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Chỉnh sửa bộ lọc"
              className="h-9 w-9 rounded-lg border-slate-200"
              onClick={handleOpenFilterPanel}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-slate-100 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                  title={chip.label}
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetAllFilters}
              className="self-start text-sm font-semibold text-slate-600 hover:text-blue-700 lg:self-center"
            >
              Xóa
            </button>
          </div>
        ) : null}

        <div className="mt-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 overflow-x-auto">
            <div className="inline-flex min-w-max rounded-xl bg-slate-100 p-1">
              {tabOptions.map((tab) => {
                const count =
                  tab.key === ALL_STATUS
                    ? statusCounts.total
                    : tab.key === SALE_RECEIVED_STATUS
                      ? statusCounts.saleReceived
                      : statusCounts[tab.key];
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveStatus(tab.key)}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition",
                      activeStatus === tab.key
                        ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none",
                        activeStatus === tab.key
                          ? "bg-blue-50 text-blue-700"
                          : "bg-white text-slate-500",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {fetchingContacts && !loadingContacts ? (
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang cập nhật
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Làm mới danh sách"
              className="h-9 w-9 rounded-lg border-slate-200"
              disabled={loadingContacts || fetchingContacts}
              onClick={handleRefreshContacts}
            >
              <RefreshCw className={cn("h-4 w-4", fetchingContacts && "animate-spin")} />
            </Button>
            <Popover open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={`Lọc theo ngày lên số: ${formatDate(appliedDateRange.startDate)} - ${formatDate(
                    appliedDateRange.endDate,
                  )}`}
                  className="h-9 w-9 rounded-lg border-slate-200"
                  onClick={handleOpenDateFilter}
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
                      {datePresetOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => handleDatePresetSelect(option.key)}
                          className={cn(
                            "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                            draftDatePreset === option.key
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                          )}
                        >
                          <span>{option.label}</span>
                          {draftDatePreset === option.key ? <Check className="h-4 w-4" /> : null}
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
                          new Date(
                            draftCalendarBaseDate.getFullYear(),
                            draftCalendarBaseDate.getMonth(),
                            1,
                          )
                        }
                        startDate={draftDateStart}
                        endDate={draftDateEnd}
                        onPickDate={(dateKey) => {
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
                        }}
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
                        onPickDate={(dateKey) => {
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
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <Button
                        variant="ghost"
                        className="rounded-xl text-slate-600"
                        onClick={() => {
                          setDraftDatePreset("month_to_date");
                          const range = getDatePresetRange("month_to_date");
                          setDraftDateStart(range.startDate);
                          setDraftDateEnd(range.endDate);
                        }}
                      >
                        Mặc định
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setDateFilterOpen(false)}>
                          Đóng
                        </Button>
                        <Button onClick={handleApplyDateRange}>Áp dụng</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={advancedFilterOpen} onOpenChange={setAdvancedFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Bộ lọc nâng cao"
                  className={cn(
                    "h-9 w-9 rounded-lg border-slate-200",
                    (sourceFilter.length > 0 ||
                      statusDropdownFilter.length > 0 ||
                      saleOwnerFilter.length > 0 ||
                      saleTeamFilter.length > 0 ||
                      marketingTeamFilter.length > 0 ||
                      productFilter.length > 0 ||
                      amountFilter.length > 0) &&
                      "border-blue-300 bg-blue-50 text-blue-700",
                  )}
                  onClick={handleOpenAdvancedFilters}
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
                      {advancedFilterGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setActiveAdvancedFilterGroup(group.id)}
                          className={cn(
                            "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold transition",
                            activeAdvancedFilterGroup === group.id
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-white hover:text-slate-950",
                          )}
                        >
                          <span className="truncate">{group.label}</span>
                          <span className="inline-flex items-center gap-2">
                            {group.values.length > 0 ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                                {group.values.length}
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
                        {activeAdvancedGroup.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Lọc bao gồm các giá trị đã chọn.
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                      <button
                        type="button"
                        className={cn(
                          "mb-1 flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                          activeAdvancedGroup.values.length === 0
                            ? "bg-cyan-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50",
                        )}
                        onClick={() => activeAdvancedGroup.onChange([])}
                      >
                        <span>{activeAdvancedGroup.allLabel}</span>
                        {activeAdvancedGroup.values.length === 0 ? (
                          <Check className="h-4 w-4" />
                        ) : null}
                      </button>
                      {activeAdvancedGroup.options.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                          Chưa có dữ liệu cho bộ lọc này.
                        </div>
                      ) : (
                        activeAdvancedGroup.options.map((option) => {
                          const selected = activeAdvancedGroup.values.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition",
                                selected
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-slate-700 hover:bg-slate-50",
                              )}
                              onClick={() => {
                                activeAdvancedGroup.onChange(
                                  selected
                                    ? activeAdvancedGroup.values.filter(
                                        (item) => item !== option.value,
                                      )
                                    : [...activeAdvancedGroup.values, option.value],
                                );
                              }}
                            >
                              <span className="inline-flex min-w-0 items-center gap-2">
                                {option.color ? <StatusDot status={option.color} /> : null}
                                <span className="truncate">{option.label}</span>
                              </span>
                              {selected ? <Check className="h-4 w-4" /> : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
                      <Button variant="outline" onClick={() => setAdvancedFilterOpen(false)}>
                        Đóng
                      </Button>
                      <Button onClick={handleApplyAdvancedFilters}>Áp dụng</Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
              type="button"
              variant="outline"
              size="icon"
              title="Cấu hình cột"
              className="h-9 w-9 rounded-lg border-slate-200"
              onClick={handleOpenColumnConfig}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-2">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm tên, SĐT..."
              className="h-9 rounded-xl border-slate-200 pl-9 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-hidden">
          {viewMode === "table" ? (
            <div className="h-full overflow-auto">
              <table
                className="table-fixed border-separate border-spacing-0 text-left text-[13px]"
                style={{ minWidth: tableMinWidth, width: "100%" }}
              >
                {renderTableColGroup()}
                <thead className="sticky top-0 z-10 text-xs font-semibold text-slate-500">
                  <tr className="h-10 border-b border-slate-200">
                    <th
                      className="sticky left-0 z-30 bg-slate-50 px-2.5 py-2 text-center shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                      aria-label="Xem chi tiết"
                    />
                    <th className="sticky left-[44px] z-30 bg-slate-50 px-2.5 py-2 shadow-[4px_0_10px_-8px_rgba(15,23,42,0.45),0_1px_0_0_rgba(226,232,240,1)]">
                      #
                    </th>
                    {visibleColumnIds.map((columnId) => {
                      const column = contactColumnMeta.find((item) => item.id === columnId);
                      if (!column) return null;
                      return (
                        <th
                          key={column.id}
                          className="whitespace-nowrap bg-slate-50 px-2.5 py-2 shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                        >
                          {column.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingContacts ? (
                    <tr>
                      <td
                        colSpan={2 + visibleColumnIds.length}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        Đang tải liên hệ khách hàng...
                      </td>
                    </tr>
                  ) : filteredContacts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2 + visibleColumnIds.length}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        Chưa có liên hệ khách hàng phù hợp.
                      </td>
                    </tr>
                  ) : (
                    paginatedContacts.map((contact, index) => (
                      <tr key={contact.id} className="group h-11 transition hover:bg-slate-50/80">
                        <td className="sticky left-0 z-20 bg-white px-2.5 py-1.5 text-center align-middle transition group-hover:bg-slate-50">
                          {renderDetailButton(contact)}
                        </td>
                        <td className="sticky left-[44px] z-20 bg-white px-2.5 py-1.5 align-middle text-slate-500 shadow-[4px_0_10px_-8px_rgba(15,23,42,0.45)] transition group-hover:bg-slate-50">
                          {(page - 1) * PAGE_SIZE + index + 1}
                        </td>
                        {visibleColumnIds.map((columnId) => (
                          <td key={columnId} className="px-2.5 py-1.5 align-middle">
                            {renderContactCell(columnId, contact)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-full overflow-auto bg-slate-50/60 p-3">
              {loadingContacts ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Đang tải liên hệ khách hàng...
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                  Chưa có liên hệ khách hàng phù hợp.
                </div>
              ) : (
                <div className="grid h-full min-w-[980px] grid-cols-4 gap-3">
                  {kanbanColumns.map((column) => (
                    <div
                      key={column.key}
                      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-3">
                        <span className="text-sm font-semibold text-slate-800">{column.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset",
                            getKanbanColumnCountTone(column.key),
                          )}
                        >
                          {column.contacts.length}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {column.contacts.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                            Trống
                          </div>
                        ) : (
                          column.contacts.map((contact) => (
                            <KanbanContactCard
                              key={contact.id}
                              contact={contact}
                              onOpen={() => setDetailContact(contact)}
                              onCopyPhone={copyPhoneNumber}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Tổng số liên hệ: {filteredContacts.length}</span>
            <span>Tổng tiền: {formatCurrency(filteredContactsTotalAmount)}</span>
          </div>
          {filteredContacts.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Trước
              </Button>
              <span className="min-w-[92px] text-center font-medium text-slate-700">
                Trang {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Sau
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {filterPanelOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/20"
          onClick={() => setFilterPanelOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-[430px] flex-col border-l border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Chỉnh sửa bộ lọc</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cập nhật điều kiện cho preset đang chọn.
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

            <>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Tên bộ lọc</Label>
                      <span className="text-xs font-medium text-slate-400">
                        {panelPresetName.length}/50
                      </span>
                    </div>
                    <Input
                      value={panelPresetName}
                      maxLength={50}
                      onChange={(event) => setPanelPresetName(event.target.value.slice(0, 50))}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mô tả</Label>
                    <Textarea
                      value={panelPresetDescription}
                      onChange={(event) => setPanelPresetDescription(event.target.value)}
                      className="min-h-20 resize-none rounded-xl"
                      placeholder="Mô tả ngắn cho bộ lọc này..."
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                    <Checkbox
                      checked={panelPresetDefault}
                      onCheckedChange={(checked) => setPanelPresetDefault(Boolean(checked))}
                    />
                    <span>Đặt làm mặc định khi vào trang</span>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-3 text-sm font-semibold text-slate-950">Điều kiện lọc</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Ngày</Label>
                      <Select
                        value={panelDatePreset}
                        onValueChange={(value) => handlePanelDatePresetSelect(value as DatePreset)}
                      >
                        <SelectTrigger className="h-10 rounded-xl bg-white text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {datePresetOptions.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Tuỳ chỉnh</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Từ ngày</Label>
                        <Input
                          type="date"
                          value={panelDateStart}
                          onChange={(event) => {
                            setPanelDatePreset("custom");
                            setPanelDateStart(event.target.value);
                          }}
                          className="h-10 rounded-xl bg-white text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Đến ngày</Label>
                        <Input
                          type="date"
                          value={panelDateEnd}
                          onChange={(event) => {
                            setPanelDatePreset("custom");
                            setPanelDateEnd(event.target.value);
                          }}
                          className="h-10 rounded-xl bg-white text-sm"
                        />
                      </div>
                    </div>
                    <MultiSelectFilter
                      label="Nguồn"
                      allLabel="Tất cả nguồn"
                      values={panelSourceFilter}
                      options={leadChannelOptions.map((source) => ({
                        value: source,
                        label: source,
                      }))}
                      onChange={setPanelSourceFilter}
                    />
                    <MultiSelectFilter
                      label="Trạng thái"
                      allLabel="Tất cả trạng thái"
                      values={panelStatusFilter}
                      options={statusOptions.map((status) => ({
                        value: status.key,
                        label: status.label,
                        color: status.key,
                      }))}
                      onChange={(values) => setPanelStatusFilter(values as ContactStatus[])}
                    />
                    <MultiSelectFilter
                      label="NVKD"
                      allLabel="Tất cả NVKD"
                      values={panelSaleOwnerFilter}
                      options={[
                        { value: UNASSIGNED_SALE_OWNER, label: "Chưa phân phối" },
                        ...saleOwnerOptions.map((owner) => ({ value: owner, label: owner })),
                      ]}
                      onChange={setPanelSaleOwnerFilter}
                    />
                    <MultiSelectFilter
                      label="Đội Sale"
                      allLabel="Tất cả đội Sale"
                      values={panelSaleTeamFilter}
                      options={[
                        { value: UNASSIGNED_SALE_TEAM, label: "Chưa phân phối" },
                        ...saleTeamOptions.map((team) => ({ value: team, label: team })),
                      ]}
                      onChange={setPanelSaleTeamFilter}
                    />
                    <MultiSelectFilter
                      label="Team MKT"
                      allLabel="Tất cả Team MKT"
                      values={panelMarketingTeamFilter}
                      options={marketingTeamOptions.map((team) => ({ value: team, label: team }))}
                      onChange={setPanelMarketingTeamFilter}
                    />
                    <MultiSelectFilter
                      label="Nhãn sản phẩm"
                      allLabel="Tất cả sản phẩm"
                      values={panelProductFilter}
                      options={productOptions.map((product) => ({
                        value: product,
                        label: product,
                      }))}
                      onChange={setPanelProductFilter}
                    />
                    <MultiSelectFilter
                      label="Tổng tiền"
                      allLabel="Tất cả tổng tiền"
                      values={panelAmountFilter}
                      options={amountFilterOptions}
                      onChange={setPanelAmountFilter}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Tìm kiếm</Label>
                      <Input
                        value={panelSearchTerm}
                        onChange={(event) => setPanelSearchTerm(event.target.value)}
                        className="h-10 rounded-xl bg-white text-sm"
                        placeholder="Tên, SĐT, email..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 px-5 py-4">
                {selectedPreset ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setDeletePresetConfirmOpen(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Xoá bộ lọc
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => {
                        setCopyPresetName("");
                        setCopyPresetOpen(true);
                      }}
                    >
                      Lưu bản sao
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  className="w-full rounded-xl"
                  disabled={!panelPresetName.trim()}
                  onClick={handleSavePanelPreset}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {selectedPreset ? "Lưu chỉnh sửa" : "Lưu bộ lọc mới"}
                </Button>
              </div>
            </>
          </aside>
        </div>
      ) : null}

      <Dialog open={deletePresetConfirmOpen} onOpenChange={setDeletePresetConfirmOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá bộ lọc</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">Bạn có chắc muốn xoá bộ lọc này không?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePresetConfirmOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleConfirmDeletePreset}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyPresetOpen} onOpenChange={setCopyPresetOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lưu bản sao bộ lọc</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label>Tên bộ lọc mới</Label>
              <span className="text-xs font-medium text-slate-400">{copyPresetName.length}/50</span>
            </div>
            <Input
              value={copyPresetName}
              maxLength={50}
              onChange={(event) => setCopyPresetName(event.target.value.slice(0, 50))}
              className="h-10 rounded-xl"
              placeholder="Ví dụ: Data trùng tuần này"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyPresetOpen(false)}>
              Hủy
            </Button>
            <Button disabled={!copyPresetName.trim()} onClick={handleSavePresetCopy}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={columnConfigOpen} onOpenChange={setColumnConfigOpen}>
        <DialogContent className="rounded-2xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Cấu hình cột</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={columnSearch}
                  onChange={(event) => setColumnSearch(event.target.value)}
                  placeholder="Tìm cột..."
                  className="h-9 rounded-xl pl-9"
                />
              </div>
              <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
                {contactColumnMeta
                  .filter((column) =>
                    column.label.toLowerCase().includes(columnSearch.trim().toLowerCase()),
                  )
                  .map((column) => {
                    const isRequired = requiredContactColumnIds.includes(column.id);
                    return (
                      <label
                        key={column.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50",
                          isRequired && "cursor-not-allowed",
                        )}
                      >
                        <Checkbox
                          checked={draftVisibleColumnIds.includes(column.id)}
                          disabled={isRequired}
                          onCheckedChange={() => toggleDraftColumn(column.id)}
                        />
                        <span className="font-medium text-slate-700">{column.label}</span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">Cột hiển thị</p>
              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {draftVisibleColumnIds.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                    Chưa chọn cột hiển thị.
                  </div>
                ) : (
                  draftVisibleColumnIds.map((columnId) => {
                    const column = contactColumnMeta.find((item) => item.id === columnId);
                    if (!column) return null;
                    const isRequired = requiredContactColumnIds.includes(column.id);
                    return (
                      <div
                        key={column.id}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 transition",
                          draggingColumnId === column.id && "border-blue-200 bg-blue-50/60",
                        )}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const fromColumnId = event.dataTransfer.getData(
                            "text/plain",
                          ) as ContactColumnId;
                          moveDraftColumn(fromColumnId, column.id);
                          setDraggingColumnId(null);
                        }}
                      >
                        <button
                          type="button"
                          draggable
                          className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                          title={`Kéo để đổi vị trí cột ${column.label}`}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", column.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDraggingColumnId(column.id);
                          }}
                          onDragEnd={() => setDraggingColumnId(null)}
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
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="mr-auto rounded-xl text-slate-600"
              onClick={() => setDraftVisibleColumnIds(defaultVisibleColumnIds)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Mặc định
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setColumnConfigOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleApplyColumnConfig}>Áp dụng</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo liên hệ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tên khách hàng</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="h-10 rounded-xl"
                  placeholder="Phạm Thị Ly Na"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Số điện thoại</Label>
                <Input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  className="h-10 rounded-xl"
                  placeholder="0988123456"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nguồn</Label>
              <Select
                value={form.source}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, source: value as LeadChannel }))
                }
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadChannelOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Ghi chú</Label>
              <Textarea
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({ ...current, note: event.target.value }))
                }
                className="min-h-24 resize-none rounded-xl"
                placeholder="Ghi chú thêm về nhu cầu khách hàng..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateOpenChange(false)}>
              Hủy
            </Button>
            <Button onClick={handleCreateContact}>
              <Plus className="mr-2 h-4 w-4" />
              Tạo liên hệ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailContact)}
        onOpenChange={(open) => !open && setDetailContact(null)}
      >
        <DialogContent className="flex max-h-[85vh] w-[92vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl p-0">
          {detailContact ? (
            <ContactDetailContent contact={detailContact} onClose={() => setDetailContact(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: ContactStatus }) {
  const option = statusOptions.find((item) => item.key === status);
  const colorClass = {
    new: "bg-blue-50 text-blue-700 ring-blue-100",
    processing: "bg-amber-50 text-amber-700 ring-amber-100",
    called: "bg-violet-50 text-violet-700 ring-violet-100",
    resale_received: "bg-teal-50 text-teal-700 ring-teal-100",
    duplicate: "bg-rose-50 text-rose-700 ring-rose-100",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  }[status];

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        colorClass,
      )}
    >
      {option?.label ?? status}
    </span>
  );
}

function KanbanContactCard({
  contact,
  onOpen,
  onCopyPhone,
}: {
  contact: MarketingContact;
  onOpen: () => void;
  onCopyPhone: (phone: string) => Promise<void>;
}) {
  const duplicate = isDuplicateContact(contact);
  const orderAmount = getContactTotalAmount(contact);
  const hasOrder = orderAmount > 0;
  const isOldCustomer =
    contact.status === "resale_received" ||
    contact.note.toLowerCase().includes("khách cũ") ||
    contact.history.some((item) => item.toLowerCase().includes("khách cũ"));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950" title={contact.name}>
            {contact.name}
          </p>
          <span
            role="button"
            tabIndex={0}
            className="mt-1 block w-fit max-w-full cursor-pointer truncate text-xs font-semibold tabular-nums text-blue-600 hover:text-blue-700"
            title="Click để copy số điện thoại"
            onClick={(event) => {
              event.stopPropagation();
              void onCopyPhone(contact.phone);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                void onCopyPhone(contact.phone);
              }
            }}
          >
            {contact.phone}
          </span>
        </div>
        <StatusPill status={duplicate ? "duplicate" : contact.status} />
      </div>

      <dl className="mt-2 space-y-1 text-[11px] leading-5">
        <div className="flex justify-between gap-2">
          <dt className="font-semibold text-slate-700">Ngày lên số</dt>
          <dd className="truncate font-medium text-slate-600">
            {formatDateTime(contact.createdAtFull || contact.createdAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-semibold text-slate-700">Marketer</dt>
          <dd className="truncate font-medium text-slate-600">{contact.marketerName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-semibold text-slate-700">NVKD</dt>
          <dd className="truncate font-medium text-slate-600">
            {duplicate ? "—" : formatSalesOwnerTableDisplay(contact)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-semibold text-slate-700">Ngày nhận gần đây</dt>
          <dd className="truncate font-medium text-slate-600">
            {getContactRecentReceivedDate(contact)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Ghi chú gần đây</dt>
          <dd className="line-clamp-2 text-slate-600">{getContactRecentNote(contact)}</dd>
        </div>
      </dl>

      <div className="mt-2 flex h-5 items-center gap-2">
        {hasOrder ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px]">
              $
            </span>
            <span className="tabular-nums">{formatCurrency(orderAmount)}</span>
          </span>
        ) : null}
        {isOldCustomer ? <Heart className="h-4 w-4 fill-rose-100 text-rose-500" /> : null}
      </div>
    </button>
  );
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
  const copyPhone = async () => {
    if (!normalizedPhone) return;
    try {
      await navigator.clipboard.writeText(normalizedPhone);
      toast.success("Đã copy SĐT");
    } catch {
      toast.error("Không copy được SĐT");
    }
  };

  if (!normalizedPhone) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-medium text-slate-900">{normalizedPhone}</span>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        title="Copy SĐT"
        onClick={copyPhone}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <CarrierBadge phone={normalizedPhone} />
    </span>
  );
}

function ContactDetailContent({
  contact,
  onClose,
}: {
  contact: MarketingContact;
  onClose: () => void;
}) {
  const duplicateContact = isDuplicateContact(contact);
  const effectiveStatus = duplicateContact ? "duplicate" : contact.status;
  const hasSaleDistribution =
    !duplicateContact &&
    (!isUnassignedValue(contact.salesOwner) || !isUnassignedValue(contact.salesTeam));
  const timelineGroups = buildContactTimelineGroups(contact);
  const noteHistory = buildContactNoteHistory(contact);

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-12 pr-8">
          <div className="min-w-0">
            <DialogTitle className="truncate text-xl font-semibold text-slate-950">
              {contact.name}
            </DialogTitle>
          </div>
          <StatusPill status={effectiveStatus} />
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-5 py-4">
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-h-0 space-y-4 pr-1">
            <div className="grid gap-3 md:grid-cols-2">
              <DetailSectionCard title="Thông tin lead">
                <DetailField label="Ngày lên số" value={formatDateTime(contact.createdAtFull)} />
                <DetailField label="SĐT" value={<DetailPhoneValue phone={contact.phone} />} />
                <DetailField
                  label="SĐT phụ"
                  value={<DetailPhoneValue phone={contact.secondaryPhone} />}
                />
                <DetailField label="Trạng thái" value={<StatusPill status={effectiveStatus} />} />
              </DetailSectionCard>

              <DetailSectionCard title="Nguồn Marketing">
                <DetailField label="Marketer" value={formatContactActor(contact)} />
                <DetailField label="Team" value={contact.marketingTeam} />
                <DetailField
                  label="Công ty"
                  value={contact.marketerCompanyName?.trim() || "Chưa cập nhật"}
                />
                <DetailField label="Sản phẩm" value={contact.product} />
                <DetailField label="Nguồn" value={contact.sourceName} />
                <DetailField label="Nguồn URL" value={contact.sourceUrl?.trim() || "—"} />
              </DetailSectionCard>

              <DetailSectionCard title="Phân phối Sale" className="md:col-span-2">
                <DetailField
                  label="NVKD"
                  value={hasSaleDistribution ? formatSalesOwnerDisplay(contact) : "Chưa phân phối"}
                />
                <DetailField
                  label="Đội ngũ bán hàng"
                  value={hasSaleDistribution ? contact.salesTeam : "Chưa phân phối"}
                />
                <DetailField label="Ghi chú gần đây" value={getContactRecentNote(contact)} />
              </DetailSectionCard>

              <DetailSectionCard title="Lịch sử ghi chú" className="md:col-span-2">
                {noteHistory.length ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="w-[44px] px-3 py-2 text-center">#</th>
                          <th className="w-[150px] px-3 py-2">Được tạo vào</th>
                          <th className="px-3 py-2">Nội dung</th>
                          <th className="w-[150px] px-3 py-2">Được tạo bởi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {noteHistory.map((note, index) => (
                          <tr key={note.id}>
                            <td className="px-3 py-2 text-center font-medium text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {formatDateTime(note.createdAt) || "—"}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-800">{note.content}</td>
                            <td className="px-3 py-2 text-slate-600">{note.createdBy || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Chưa có lịch sử ghi chú.
                  </p>
                )}
              </DetailSectionCard>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-slate-950">Lịch sử mua hàng</p>
              {contact.orders?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="text-xs font-semibold uppercase text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="w-[108px] py-2 pr-3">Mã đơn hàng</th>
                        <th className="w-[220px] py-2 pr-3">Địa chỉ nhận hàng</th>
                        <th className="w-[132px] py-2 pr-3">Ngày xác nhận</th>
                        <th className="w-[104px] py-2 pr-3 text-center">Trạng thái cuối</th>
                        <th className="w-[170px] py-2 pr-3">Chi tiết đơn hàng</th>
                        <th className="w-[100px] py-2 pr-3 text-right">Tổng tiền</th>
                        <th className="w-[82px] py-2 pr-3 text-center">Đơn vị tiền tệ</th>
                        <th className="w-[118px] py-2 text-center">Phương thức thanh toán</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contact.orders.slice(0, 5).map((order) => (
                        <tr key={order.orderCode}>
                          <td className="py-2 pr-3 font-medium text-slate-900">
                            {order.orderCode}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">
                            {order.shippingAddress || "—"}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">
                            {order.confirmedAt
                              ? formatDateTime(order.confirmedAt)
                              : formatDate(order.date)}
                          </td>
                          <td className="py-2 pr-3 text-center">
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              {order.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-slate-700">{order.product}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-slate-900">
                            {formatCurrency(order.revenue)}
                          </td>
                          <td className="py-2 pr-3 text-center text-slate-600">
                            {order.currency || "VND"}
                          </td>
                          <td className="py-2 text-center text-slate-600">
                            {order.paymentMethod || "COD"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Chưa có lịch sử mua hàng.
                </p>
              )}
            </div>
          </div>

          <aside className="flex min-h-[240px] min-w-0 flex-col self-start rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold text-slate-950">Lịch sử hoạt động</p>
            </div>
            <div className="space-y-3 p-4">
              {timelineGroups.length > 0 ? (
                timelineGroups.map((group, index) => (
                  <div
                    key={`${group.actor}-${index}`}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <p className="mb-2 text-sm font-semibold text-slate-950">{group.actor}</p>
                    <div className="space-y-2">
                      {group.actions.map((action, actionIndex) => (
                        <div
                          key={`${action.content}-${actionIndex}`}
                          className="flex gap-2 text-sm"
                        >
                          <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">{action.content}</p>
                            {action.time ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatDateTime(action.time)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Chưa có lịch sử hoạt động.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </>
  );
}

function DetailSectionCard({
  title,
  tone = "default",
  className,
  children,
}: {
  title: string;
  tone?: "default" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3.5",
        tone === "danger" ? "border-rose-100" : "border-slate-200",
        className,
      )}
    >
      <p
        className={cn(
          "mb-3 text-xs font-semibold uppercase tracking-wide",
          tone === "danger" ? "text-rose-700" : "text-slate-500",
        )}
      >
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | ReactNode | null | undefined;
}) {
  if (typeof value === "string" && !value.trim()) return null;
  if (value === null || value === undefined) return null;

  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 font-medium text-slate-900">{value}</span>
    </div>
  );
}

function buildContactTimelineGroups(contact: MarketingContact) {
  if (contact.activityGroups?.length) {
    return contact.activityGroups
      .map((group) => ({
        actor: group.actor,
        actions: group.actions.filter((action) => action.content.trim()),
      }))
      .filter((group) => group.actor.trim() && group.actions.length);
  }

  const groups: NonNullable<MarketingContact["activityGroups"]> = [
    {
      actor: formatContactActor(contact),
      actions: [
        {
          content: "Liên hệ được tạo",
          time: contact.createdAtFull,
        },
      ],
    },
  ];

  if (!contact.isDuplicate && !isUnassignedValue(contact.salesOwner)) {
    groups.push({
      actor: formatSaleActor(contact),
      actions: [
        {
          content: "Nhận số",
          time: null,
        },
      ],
    });
  }

  const systemActions: Array<{ content: string; time: string | null }> = contact.history
    .filter((content) => !content.trim().toLowerCase().startsWith("lead được tạo"))
    .map((content) => ({
      content,
      time: null,
    }));

  if (contact.isDuplicate) {
    systemActions.push({
      content: "Hệ thống đánh dấu trùng",
      time: contact.duplicateCheckedAt,
    });
  }

  if (systemActions.length) {
    groups.push({
      actor: "Hệ thống",
      actions: systemActions,
    });
  }

  return groups.filter((group) => group.actions.length);
}

function buildContactNoteHistory(contact: MarketingContact) {
  const noteHistory = [...(contact.noteHistory ?? [])]
    .filter((note) => note.content.trim() && !isEmptyNoteText(note.content))
    .map((note, index) => ({
      ...note,
      id: note.id || `${contact.id}-note-${index}`,
      createdBy: note.createdBy?.trim() || "—",
    }));

  return noteHistory.sort((left, right) => {
    const leftTime = getSortableDateTime(left.createdAt);
    const rightTime = getSortableDateTime(right.createdAt);
    return rightTime - leftTime;
  });
}

function isEmptyNoteText(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "chưa có ghi chú." || normalized === "chưa có ghi chú gần đây.";
}

function getSortableDateTime(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatSaleActor(contact: MarketingContact) {
  if (isUnassignedValue(contact.salesOwner)) return "Chưa phân phối";
  const employeeCode = contact.salesOwnerEmployeeCode?.trim();
  const ownerLabel = employeeCode ? `${contact.salesOwner} (${employeeCode})` : contact.salesOwner;
  if (!isUnassignedValue(contact.salesTeam)) {
    return employeeCode
      ? `${contact.salesOwner} (${employeeCode} - ${contact.salesTeam})`
      : `${contact.salesOwner} (${contact.salesTeam})`;
  }
  return ownerLabel;
}

function formatSalesOwnerDisplay(contact: MarketingContact) {
  if (isUnassignedValue(contact.salesOwner)) return "Chưa phân phối";
  const employeeCode = contact.salesOwnerEmployeeCode?.trim();
  return employeeCode ? `${contact.salesOwner} (${employeeCode})` : contact.salesOwner;
}

function formatSalesOwnerTableDisplay(contact: MarketingContact) {
  if (isUnassignedValue(contact.salesOwner)) return "Chưa phân phối";
  return contact.salesOwner;
}

function isDuplicateContact(contact: MarketingContact) {
  return contact.isDuplicate || contact.status === "duplicate";
}

function getContactTotalAmount(contact: MarketingContact) {
  return (contact.orders ?? []).reduce((total, order) => total + (Number(order.revenue) || 0), 0);
}

function getContactTableMinWidth(columnIds: ContactColumnId[]) {
  const visibleWidth = columnIds.reduce((total, columnId) => {
    const width = contactColumnMeta.find((column) => column.id === columnId)?.width ?? "";
    const parsedWidth = Number(width.match(/\d+/)?.[0] ?? 150);
    return total + parsedWidth;
  }, 92);

  return Math.max(760, visibleWidth);
}

function buildKanbanContactColumns(contacts: MarketingContact[]) {
  const columns: Array<{ key: ContactStatus; label: string; contacts: MarketingContact[] }> = [
    { key: "new", label: "Số mới", contacts: [] },
    { key: "duplicate", label: "Trùng", contacts: [] },
    { key: "called", label: "Đã gọi", contacts: [] },
    { key: "processing", label: "Đang xử lí", contacts: [] },
  ];
  const columnByStatus = new Map(columns.map((column) => [column.key, column]));

  for (const contact of contacts) {
    const status = isDuplicateContact(contact) ? "duplicate" : contact.status;
    columnByStatus.get(status)?.contacts.push(contact);
  }

  return columns;
}

function getKanbanColumnCountTone(status: ContactStatus) {
  return {
    new: "bg-blue-50 text-blue-700 ring-blue-100",
    duplicate: "bg-rose-50 text-rose-700 ring-rose-100",
    called: "bg-violet-50 text-violet-700 ring-violet-100",
    processing: "bg-amber-50 text-amber-700 ring-amber-100",
    resale_received: "bg-teal-50 text-teal-700 ring-teal-100",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  }[status];
}

function getContactRecentReceivedDate(contact: MarketingContact) {
  const assignedAction = contact.activityGroups
    ?.flatMap((group) => group.actions)
    .find((action) => /nhận số|chia cho/i.test(action.content));
  return assignedAction?.time ? formatDateTime(assignedAction.time) : "—";
}

function getContactRecentNote(contact: MarketingContact) {
  return (
    contact.latest_note?.trim() ||
    contact.notes?.[0]?.content?.trim() ||
    contact.saleNote?.trim() ||
    contact.note?.trim() ||
    "Chưa có ghi chú."
  );
}

function matchesContactAmountFilter(contact: MarketingContact, filters: string[]) {
  if (filters.length === 0) return true;
  const totalAmount = getContactTotalAmount(contact);
  return filters.some((filter) => {
    switch (filter) {
      case "has_orders":
        return totalAmount > 0;
      case "no_orders":
        return totalAmount <= 0;
      case "gte_1000000":
        return totalAmount >= 1000000;
      case "gte_5000000":
        return totalAmount >= 5000000;
      default:
        return false;
    }
  });
}

function getAmountFilterLabel(value: string) {
  return amountFilterOptions.find((option) => option.value === value)?.label ?? value;
}

function formatContactTotalAmount(contact: MarketingContact) {
  const total = getContactTotalAmount(contact);
  return total > 0 ? formatCurrency(total) : "—";
}

function formatContactActor(contact: MarketingContact) {
  const employeeCode = contact.marketerEmployeeCode?.trim() || "Chưa có mã NV";
  const team = contact.marketingTeam?.trim() || "Chưa có team";
  return `${contact.marketerName || "Chưa cập nhật"} (${employeeCode} - ${team})`;
}

function StatusDot({ status }: { status: ContactStatus }) {
  const colorClass = {
    new: "bg-blue-500",
    processing: "bg-amber-500",
    called: "bg-violet-500",
    resale_received: "bg-teal-500",
    duplicate: "bg-rose-500",
    success: "bg-emerald-500",
  }[status];

  return <span className={cn("h-2 w-2 rounded-full", colorClass)} />;
}

interface MultiSelectOption {
  value: string;
  label: string;
  color?: ContactStatus;
}

function MultiSelectFilter({
  label,
  allLabel,
  values,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOptions = options.filter((option) => values.includes(option.value));

  const toggleValue = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const removeValue = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="relative space-y-1.5">
      <Label className="text-xs font-semibold text-slate-500">{label}</Label>
      <div
        role="button"
        tabIndex={0}
        className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selectedOptions.length === 0 ? (
            <span className="text-slate-700">{allLabel}</span>
          ) : (
            selectedOptions.slice(0, 2).map((option) => (
              <span
                key={option.value}
                className="inline-flex max-w-[170px] items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
              >
                <span className="truncate">{option.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded-full text-blue-500 hover:text-blue-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeValue(option.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      removeValue(option.value);
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
          {selectedOptions.length > 2 ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              +{selectedOptions.length - 2}
            </span>
          ) : null}
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition",
            open ? "rotate-90 text-blue-500" : "",
          )}
        />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-medium transition",
              values.length === 0 ? "bg-cyan-50 text-blue-700" : "text-slate-700 hover:bg-slate-50",
            )}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            <span>{allLabel}</span>
            {values.length === 0 ? <Check className="h-4 w-4" /> : null}
          </button>
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-medium transition",
                  selected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50",
                )}
                onClick={() => toggleValue(option.value)}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  {option.color ? <StatusDot status={option.color} /> : null}
                  <span className="truncate">{option.label}</span>
                </span>
                {selected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getStatusLabel(status: StatusFilter) {
  if (status === ALL_STATUS) return "Tất cả trạng thái";
  return statusOptions.find((option) => option.key === status)?.label ?? status;
}

function normalizeStringFilterValues(value: string | string[] | undefined, allValue: string) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(rawValues.filter((item) => item && item !== allValue)));
}

function normalizeStatusFilterValues(value: StatusFilter | ContactStatus[] | undefined) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const statusKeys = new Set(statusOptions.map((option) => option.key));
  return Array.from(
    new Set(
      rawValues.filter(
        (item): item is ContactStatus =>
          item !== ALL_STATUS && statusKeys.has(item as ContactStatus),
      ),
    ),
  );
}

function areStringArraysEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;
  const sortedFirst = [...first].sort();
  const sortedSecond = [...second].sort();
  return sortedFirst.every((item, index) => item === sortedSecond[index]);
}

interface MarketingContactsProfileSnapshot {
  full_name?: string | null;
  employee_code?: string | null;
  company_name?: string | null;
}

function getProfileAwareSampleContacts(profile?: MarketingContactsProfileSnapshot | null) {
  const profileName = profile?.full_name?.trim();
  const profileEmployeeCode = profile?.employee_code?.trim();
  const profileCompanyName = profile?.company_name?.trim();

  return sampleMarketingContacts.map((contact) => {
    if (profileName && contact.marketerName.trim() === profileName) {
      return {
        ...contact,
        marketerEmployeeCode:
          profileEmployeeCode ||
          getKnownSampleEmployeeCode(contact.marketerName, contact.marketerEmployeeCode),
        marketerCompanyName: profileCompanyName || contact.marketerCompanyName,
        activityGroups: contact.activityGroups?.map((group) => ({
          ...group,
          actor:
            group.actor.startsWith(contact.marketerName) && profileEmployeeCode
              ? `${contact.marketerName} (${profileEmployeeCode} - ${contact.marketingTeam})`
              : group.actor,
        })),
      };
    }

    return {
      ...contact,
      marketerEmployeeCode: getKnownSampleEmployeeCode(
        contact.marketerName,
        contact.marketerEmployeeCode,
      ),
      activityGroups: contact.activityGroups?.map((group) => ({
        ...group,
        actor: group.actor,
      })),
    };
  });
}

function getKnownSampleEmployeeCode(name: string, fallback?: string | null) {
  if (name.trim() === "Nguyễn Hữu Huy") return "DT00014";
  return fallback ?? null;
}

function withSampleMarketingContacts(
  rows: MarketingContact[],
  profile?: MarketingContactsProfileSnapshot | null,
) {
  const existingIds = new Set(rows.map((row) => row.id));
  const missingSamples = getProfileAwareSampleContacts(profile).filter(
    (sample) => !existingIds.has(sample.id),
  );
  return [...rows, ...missingSamples];
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
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

function isUnassignedValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "—" ||
    normalized.includes("chưa phân bổ") ||
    normalized.includes("chưa phân phối") ||
    normalized.includes("đang tự động chia")
  );
}

function getDatePresetRange(preset: DatePreset): { startDate: string; endDate: string } {
  const today = startOfLocalDay(new Date());
  const startOfWeek = getMonday(today);

  switch (preset) {
    case "today":
      return { startDate: toDateKey(today), endDate: toDateKey(today) };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { startDate: toDateKey(yesterday), endDate: toDateKey(yesterday) };
    }
    case "last_7_days":
      return { startDate: toDateKey(addDays(today, -6)), endDate: toDateKey(today) };
    case "last_30_days":
      return { startDate: toDateKey(addDays(today, -29)), endDate: toDateKey(today) };
    case "last_90_days":
      return { startDate: toDateKey(addDays(today, -89)), endDate: toDateKey(today) };
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: toDateKey(start), endDate: toDateKey(end) };
    }
    case "week_to_date":
      return { startDate: toDateKey(startOfWeek), endDate: toDateKey(today) };
    case "month_to_date": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toDateKey(start), endDate: toDateKey(today) };
    }
    case "custom":
    default:
      return { startDate: toDateKey(today), endDate: toDateKey(today) };
  }
}

function getDatePresetLabel(preset: DatePreset) {
  if (preset === "custom") return "Tuỳ chỉnh";
  return datePresetOptions.find((option) => option.key === preset)?.label ?? "Tuỳ chỉnh";
}

function getDateFilterChipLabel(preset: DatePreset, range: { startDate: string; endDate: string }) {
  if (preset !== "custom") return `Ngày lên số là ${getDatePresetLabel(preset)}`;
  return `Ngày lên số là ${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
}

function isDatePreset(value: unknown): value is DatePreset {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "last_7_days" ||
    value === "last_30_days" ||
    value === "last_90_days" ||
    value === "last_month" ||
    value === "week_to_date" ||
    value === "month_to_date" ||
    value === "custom"
  );
}

function getStoredDatePreset(preset: StoredMarketingContactFilters & { name?: string }) {
  const explicitPreset = preset.datePreset ?? preset.activeDatePreset;
  if (isDatePreset(explicitPreset) && explicitPreset !== "custom") return explicitPreset;

  const inferredPreset = inferDynamicDatePresetFromName(preset.name);
  if (inferredPreset) return inferredPreset;
  if (isDatePreset(explicitPreset)) return explicitPreset;
  if (preset.appliedDateRange) return "custom";
  return "month_to_date";
}

function getStoredDateRange(preset: StoredMarketingContactFilters & { name?: string }) {
  const datePreset = getStoredDatePreset(preset);
  if (datePreset !== "custom") return getDatePresetRange(datePreset);
  if (isValidStoredDateRange(preset.appliedDateRange)) return preset.appliedDateRange;
  return getDatePresetRange("today");
}

function normalizeSavedMarketingContactPreset(
  preset: SavedMarketingContactFilterPreset,
): SavedMarketingContactFilterPreset {
  const datePreset = getStoredDatePreset(preset);
  return {
    ...preset,
    datePreset,
    activeDatePreset: datePreset,
    appliedDateRange: datePreset === "custom" ? getStoredDateRange(preset) : undefined,
    visibleColumnIds: normalizeVisibleColumnIds(preset.visibleColumnIds),
  };
}

function loadStoredColumnConfigByPreset() {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(COLUMN_CONFIG_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, ContactColumnId[]>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, ContactColumnId[]>>(
      (configByPreset, [presetKey, columnIds]) => {
        if (!presetKey || !Array.isArray(columnIds)) return configByPreset;
        configByPreset[presetKey] = normalizeVisibleColumnIds(columnIds);
        return configByPreset;
      },
      {},
    );
  } catch (error) {
    console.error("[marketing-contacts][restore-column-config]", error);
    window.localStorage.removeItem(COLUMN_CONFIG_STORAGE_KEY);
    return {};
  }
}

function resolvePresetVisibleColumnIds(
  presetId: string,
  configByPreset: Record<string, ContactColumnId[]>,
  fallbackColumnIds?: ContactColumnId[],
) {
  return normalizeVisibleColumnIds(configByPreset[presetId] ?? fallbackColumnIds);
}

function resolveAllContactsVisibleColumnIds(configByPreset: Record<string, ContactColumnId[]>) {
  return normalizeVisibleColumnIds(configByPreset[ALL_CONTACTS_COLUMN_CONFIG_KEY]);
}

function inferDynamicDatePresetFromName(name?: string) {
  const normalizedName = normalizePresetName(name ?? "");
  const presetByName: Record<string, DatePreset> = {
    "hom nay": "today",
    "hom qua": "yesterday",
    "7 ngay qua": "last_7_days",
    "30 ngay qua": "last_30_days",
    "90 ngay qua": "last_90_days",
    "thang truoc": "last_month",
    "dau tuan den nay": "week_to_date",
    "dau thang den nay": "month_to_date",
  };
  return presetByName[normalizedName];
}

function normalizePresetName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function isValidStoredDateRange(
  range: StoredMarketingContactFilters["appliedDateRange"],
): range is { startDate: string; endDate: string } {
  return Boolean(
    range &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.endDate),
  );
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMonday(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateKey: string) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function parseDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getCalendarCells(monthDate: Date) {
  const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const firstCellDate = addDays(firstDayOfMonth, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => ({
    date: addDays(firstCellDate, index),
  }));
}
