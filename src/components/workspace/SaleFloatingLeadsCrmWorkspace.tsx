import { useDeferredValue, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { FloatingLeadDetailDialog } from "@/components/workspace/FloatingLeadDetailDialog";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { fetchFloatingLeadsPage, type FloatingLeadCrmRow } from "@/lib/floatingLeadCrm";
import { cn } from "@/lib/utils";

const statusOptions = [
  "Chưa gọi",
  "Không nghe máy",
  "Hẹn gọi lại",
  "Đang cân nhắc",
  "Đã bị chốt",
  "Không mua",
  "Khách trêu",
];

export function SaleFloatingLeadsCrmWorkspace() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("all");
  const [crop, setCrop] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [detailLead, setDetailLead] = useState<FloatingLeadCrmRow | null>(null);
  const normalizedRange = normalizeDateRange(range);

  const leadsQuery = useQuery({
    queryKey: [
      "sale-floating-leads-crm",
      page,
      pageSize,
      deferredSearch,
      status,
      normalizedRange.from,
      normalizedRange.to,
      crop,
      sourceType,
    ],
    queryFn: () =>
      fetchFloatingLeadsPage({
        page,
        pageSize,
        search: deferredSearch,
        status,
        from: normalizedRange.from,
        to: normalizedRange.to,
        crop,
        sourceType,
      }),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => leadsQuery.data?.rows ?? [], [leadsQuery.data?.rows]);
  const total = leadsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const crops = useMemo(() => uniqueValues(rows.map((row) => row.loai_cay_trong)), [rows]);
  const sources = useMemo(() => uniqueValues(rows.map((row) => row.source_type)), [rows]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sale-floating-leads-crm"] });
  };
  const copyPhone = async (phone: string) => {
    await navigator.clipboard.writeText(phone);
    toast.success("Đã copy số điện thoại");
  };

  return (
    <div className="space-y-4 pb-4">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div>
            <h1 className="text-xl font-black text-slate-950">Kho thả nổi</h1>
            <p className="text-sm text-slate-500">
              Theo dõi và chăm sóc lead trong phạm vi được phân công.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 pl-9"
                placeholder="Tìm tên hoặc số điện thoại"
              />
            </div>
            <DateRangeFilter
              value={range}
              onChange={(value) => {
                setRange(value);
                setPage(1);
              }}
              hideLabel
            />
            <FilterSelect
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              placeholder="Trạng thái"
              options={statusOptions}
            />
            <FilterSelect
              value={crop}
              onChange={(value) => {
                setCrop(value);
                setPage(1);
              }}
              placeholder="Cây trồng"
              options={crops}
            />
            <FilterSelect
              value={sourceType}
              onChange={(value) => {
                setSourceType(value);
                setPage(1);
              }}
              placeholder="Nguồn"
              options={sources}
            />
            <Button
              size="icon"
              variant="outline"
              disabled={leadsQuery.isFetching}
              onClick={() => void leadsQuery.refetch()}
              aria-label="Làm mới"
            >
              <RefreshCw className={cn("h-4 w-4", leadsQuery.isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-290px)] min-h-80 overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs font-bold text-slate-500 shadow-sm">
                <tr>
                  <th className="w-14 px-3 py-3">STT</th>
                  <th className="px-3 py-3">Ngày</th>
                  <th className="px-3 py-3">Khách hàng</th>
                  <th className="px-3 py-3">Số điện thoại</th>
                  <th className="px-3 py-3">Cây trồng</th>
                  <th className="px-3 py-3">Diện tích</th>
                  <th className="px-3 py-3">Số lần gọi</th>
                  <th className="px-3 py-3">Lần gọi gần nhất</th>
                  <th className="px-3 py-3">Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {leadsQuery.isLoading ? (
                  <tr>
                    <td colSpan={9} className="h-64 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/40"
                      onClick={() => setDetailLead(row)}
                    >
                      <td className="px-3 py-2.5 text-slate-500">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{formatDate(row.lead_date)}</td>
                      <td className="px-3 py-2.5 font-semibold">{row.customer_name || "—"}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="font-semibold text-blue-600"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyPhone(row.phone);
                          }}
                        >
                          {row.phone}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">{row.loai_cay_trong || "—"}</td>
                      <td className="px-3 py-2.5">{row.dien_tich || "—"}</td>
                      <td className="px-3 py-2.5 text-center">{row.call_count}</td>
                      <td className="px-3 py-2.5">
                        {row.last_called_at
                          ? `${formatDateTime(row.last_called_at)} · ${row.latest_call_result || "—"}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge value={row.status} />
                      </td>
                    </tr>
                  ))
                )}
                {!leadsQuery.isLoading && !rows.length ? (
                  <tr>
                    <td colSpan={9} className="h-64 text-center text-slate-500">
                      Chưa có lead phù hợp.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm">
            <span>
              Tổng số lead: <strong>{total}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50/trang</SelectItem>
                  <SelectItem value="100">100/trang</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Trước
              </Button>
              <span>
                Trang {page}/{totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <FloatingLeadDetailDialog
        lead={detailLead}
        open={!!detailLead}
        editable
        onOpenChange={(open) => !open && setDetailLead(null)}
        onUpdated={() => void refresh()}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả {placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-bold",
        value === "Đã bị chốt"
          ? "bg-green-100 text-green-700"
          : value === "Hẹn gọi lại"
            ? "bg-amber-100 text-amber-700"
            : "bg-blue-50 text-blue-700",
      )}
    >
      {value}
    </span>
  );
}
function uniqueValues(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => !!value))).sort();
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
