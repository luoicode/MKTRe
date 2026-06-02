import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileSpreadsheet, Receipt, Search } from "lucide-react";
import { toast } from "sonner";

import { TablePagination } from "@/components/TablePagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportInvoicesToExcel,
  fetchAdminInvoices,
  formatDateTime,
  formatInvoiceMoney,
  summarizeInvoiceProducts,
  type InvoiceWithItems,
} from "@/lib/invoices";
import { usePagination } from "@/lib/usePagination";

type DateFilter = "today" | "yesterday" | "this_week" | "this_month" | "custom";

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "this_week", label: "Tuần này" },
  { value: "this_month", label: "Tháng này" },
  { value: "custom", label: "Tuỳ chỉnh" },
];

export function AdminInvoicesWorkspace() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [search, setSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithItems | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: fetchAdminInvoices,
  });

  const customDateInvalid =
    dateFilter === "custom" && (!dateStart || !dateEnd || dateStart > dateEnd);

  const filteredInvoices = useMemo(() => {
    if (customDateInvalid) return [];
    const range = getDateRange(dateFilter, dateStart, dateEnd);
    const normalizedSearch = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const invoiceDate = invoice.invoice_date || invoice.created_at.slice(0, 10);
      const inDateRange = invoiceDate >= range.start && invoiceDate <= range.end;
      if (!inDateRange) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        invoice.invoice_code,
        invoice.customer_name,
        invoice.customer_phone,
        invoice.customer_address,
        summarizeInvoiceProducts(invoice),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [customDateInvalid, dateEnd, dateFilter, dateStart, invoices, search]);

  const invoicePagination = usePagination({
    items: filteredInvoices,
    resetKey: `${dateFilter}-${dateStart}-${dateEnd}-${search}`,
  });

  const handleExportExcel = () => {
    if (customDateInvalid) {
      toast.error("Chọn đủ khoảng ngày hợp lệ trước khi xuất Excel");
      return;
    }
    exportInvoicesToExcel(filteredInvoices, `hoa-don-ban-hang-${todayIso()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 p-4">
      <Card className="mb-4 rounded-2xl border-slate-200/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Hoá Đơn Bán Hàng</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Danh sách tất cả hoá đơn đã tạo
              </p>
            </div>
          </div>
          <Button className="rounded-xl" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Xuất Excel
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Danh sách hoá đơn</h2>
              <p className="text-sm text-muted-foreground">
                Tìm kiếm và lọc theo ngày tạo hoá đơn.
              </p>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  className="w-full rounded-xl pl-9 lg:w-80"
                  placeholder="Tìm mã, khách hàng, số điện thoại, sản phẩm..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select
                value={dateFilter}
                onValueChange={(value) => setDateFilter(value as DateFilter)}
              >
                <SelectTrigger className="w-full rounded-xl lg:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dateFilter === "custom" ? (
                <>
                  <Input
                    type="date"
                    value={dateStart}
                    className="rounded-xl lg:w-40"
                    onChange={(event) => setDateStart(event.target.value)}
                  />
                  <Input
                    type="date"
                    value={dateEnd}
                    className="rounded-xl lg:w-40"
                    onChange={(event) => setDateEnd(event.target.value)}
                  />
                </>
              ) : null}
            </div>
          </div>

          {customDateInvalid ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Chọn đủ Từ ngày / Đến ngày và đảm bảo Từ ngày không lớn hơn Đến ngày.
            </div>
          ) : null}
        </CardContent>

        <div className="max-h-[calc(100vh-308px)] overflow-y-auto overflow-x-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[230px]" />
              <col className="w-[170px]" />
              <col />
              <col className="w-[160px]" />
              <col className="w-[170px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-600 shadow-[inset_0_-1px_0_#dbe3ed]">
              <tr>
                <th className="px-4 py-3">Mã hoá đơn</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Số điện thoại</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
                <th className="px-4 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Đang tải hoá đơn...
                  </td>
                </tr>
              ) : invoicePagination.paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Chưa có hoá đơn trong khoảng này.
                  </td>
                </tr>
              ) : (
                invoicePagination.paginatedItems.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td
                      className="whitespace-nowrap px-4 py-3 font-semibold"
                      title={invoice.invoice_code}
                    >
                      {invoice.invoice_code || "—"}
                    </td>
                    <EllipsisCell value={formatDateTime(invoice.created_at)} />
                    <EllipsisCell value={invoice.customer_name} />
                    <EllipsisCell value={invoice.customer_phone} />
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-950">
                      {formatInvoiceMoney(invoice.final_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        title="Xem chi tiết"
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={invoicePagination.page}
          totalPages={invoicePagination.totalPages}
          onPageChange={invoicePagination.setPage}
        />
      </Card>

      <InvoiceDetailDialog
        invoice={selectedInvoice}
        open={Boolean(selectedInvoice)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoice(null);
        }}
      />
    </div>
  );
}

function EllipsisCell({ value, className = "" }: { value: string; className?: string }) {
  return (
    <td className={`px-4 py-3 ${className}`} title={value}>
      <div className="truncate whitespace-nowrap">{value || "—"}</div>
    </td>
  );
}

function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithItems | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>Chi tiết hoá đơn</DialogTitle>
        </DialogHeader>
        {invoice ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 md:grid-cols-2">
              <Info label="Mã hoá đơn" value={invoice.invoice_code} />
              <Info label="Ngày tạo" value={formatDateTime(invoice.created_at)} />
              <Info label="Khách hàng" value={invoice.customer_name} />
              <Info label="Số điện thoại" value={invoice.customer_phone} />
              <div className="md:col-span-2">
                <Info label="Địa chỉ" value={invoice.customer_address} />
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Sản phẩm</th>
                    <th className="px-4 py-3 text-right">SL</th>
                    <th className="px-4 py-3 text-right">Đơn giá</th>
                    <th className="px-4 py-3 text-right">Tổng</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{item.combo_name}</p>
                        <p className="text-xs text-muted-foreground">{item.product_name}</p>
                      </td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">
                        {formatInvoiceMoney(item.unit_price)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatInvoiceMoney(item.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-sm space-y-2 rounded-2xl border bg-white p-4 text-sm">
              <MoneyRow label="Tổng" value={invoice.subtotal_amount} />
              <MoneyRow label="Chiết khấu" value={-invoice.discount_amount} />
              <MoneyRow label="Tổng tiền" value={invoice.final_amount} strong />
            </div>
            {invoice.invoice_image_url ? (
              <img
                src={invoice.invoice_image_url}
                alt={invoice.invoice_code}
                className="mx-auto max-h-[60vh] rounded-2xl border bg-white"
              />
            ) : (
              <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                Hoá đơn này chưa có ảnh preview lưu trên hệ thống.
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value || "—"}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${strong ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{formatInvoiceMoney(value)}</span>
    </div>
  );
}

function getDateRange(filter: DateFilter, customStart: string, customEnd: string) {
  const today = startOfDay(new Date());
  if (filter === "yesterday") {
    const yesterday = addDays(today, -1);
    return { start: toIsoDate(yesterday), end: toIsoDate(yesterday) };
  }
  if (filter === "this_week") {
    const day = today.getDay() || 7;
    return { start: toIsoDate(addDays(today, 1 - day)), end: toIsoDate(today) };
  }
  if (filter === "this_month") {
    return {
      start: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: toIsoDate(today),
    };
  }
  if (filter === "custom") return { start: customStart, end: customEnd };
  return { start: toIsoDate(today), end: toIsoDate(today) };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return toIsoDate(new Date());
}
