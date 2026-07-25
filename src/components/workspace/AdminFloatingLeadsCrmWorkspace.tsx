import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FloatingLeadDetailDialog } from "@/components/workspace/FloatingLeadDetailDialog";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  FLOATING_LEAD_BATCH_SIZE,
  bulkUpdateFloatingLeads,
  fetchFloatingLeadProfiles,
  fetchFloatingLeadsPage,
  importFloatingLeadBatch,
  isValidFloatingPhone,
  normalizeFloatingPhone,
  resetFloatingLeads,
  updateAdminFloatingLeadDetails,
  type FloatingLeadCrmRow,
  type FloatingLeadImportRecord,
  type FloatingLeadImportResult,
} from "@/lib/floatingLeadCrm";
import {
  buildFloatingLeadCsvTemplate,
  containsCsvMojibake,
  decodeCsvArrayBuffer,
  FLOATING_LEAD_IMPORT_HEADERS,
  isValidImportedPhone,
  normalizeImportedPhone,
  parseCsvAsStrings,
  rowsToImportObjects,
} from "@/lib/floatingLeadImport";
import { cn } from "@/lib/utils";

type DuplicateStrategy = "skip" | "update" | "insert_anyway";
type ImportBatch = {
  index: number;
  records: FloatingLeadImportRecord[];
  state: "pending" | "running" | "done" | "failed";
  error?: string;
};
type ImportSummary = FloatingLeadImportResult & { processed: number };

const importColumns = FLOATING_LEAD_IMPORT_HEADERS;

export function AdminFloatingLeadsCrmWorkspace() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("all");
  const [marketingId, setMarketingId] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailLead, setDetailLead] = useState<FloatingLeadCrmRow | null>(null);
  const [editLead, setEditLead] = useState<FloatingLeadCrmRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhones, setManualPhones] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const normalizedRange = normalizeDateRange(range);

  const profilesQuery = useQuery({
    queryKey: ["floating-lead-profile-options"],
    queryFn: async () => {
      const [sales, marketers] = await Promise.all([
        fetchFloatingLeadProfiles("sale"),
        fetchFloatingLeadProfiles("marketing"),
      ]);
      return { sales, marketers };
    },
  });
  const leadsQuery = useQuery({
    queryKey: [
      "admin-floating-leads-crm",
      page,
      pageSize,
      deferredSearch,
      status,
      marketingId,
      saleId,
      normalizedRange.from,
      normalizedRange.to,
      sourceType,
    ],
    queryFn: () =>
      fetchFloatingLeadsPage({
        page,
        pageSize,
        search: deferredSearch,
        status,
        marketingId,
        saleId,
        from: normalizedRange.from,
        to: normalizedRange.to,
        sourceType,
      }),
    placeholderData: (previous) => previous,
  });
  const rows = useMemo(() => leadsQuery.data?.rows ?? [], [leadsQuery.data?.rows]);
  const total = leadsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sources = useMemo(() => uniqueValues(rows.map((row) => row.source_type)), [rows]);
  const allPageSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-floating-leads-crm"] });
    setSelectedIds(new Set());
  };

  const bulkMutation = useMutation({
    mutationFn: ({
      action,
      value,
      ids = [...selectedIds],
    }: {
      action: "delete" | "assign_sale" | "status";
      value?: string;
      ids?: string[];
    }) => bulkUpdateFloatingLeads(ids, action, value),
    onSuccess: async (count) => {
      await invalidate();
      toast.success(`Đã cập nhật ${count} lead`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật lead"),
  });
  const resetMutation = useMutation({
    mutationFn: () => resetFloatingLeads(),
    onSuccess: async (count) => {
      await invalidate();
      setResetOpen(false);
      toast.success(`Đã reset toàn bộ ${count} lead trong kho`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Không thể reset kho"),
  });
  const editMutation = useMutation({
    mutationFn: () => {
      if (!editLead) throw new Error("Không tìm thấy lead");
      return updateAdminFloatingLeadDetails(editLead);
    },
    onSuccess: async () => {
      await invalidate();
      setEditLead(null);
      toast.success("Đã cập nhật lead");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật lead"),
  });
  const manualMutation = useMutation({
    mutationFn: async () => {
      const records = manualPhones
        .split(/\r?\n/)
        .map((value, index) => ({ index, phone: normalizeFloatingPhone(value) }))
        .filter((item) => item.phone);
      if (!records.length) throw new Error("Nhập ít nhất một số điện thoại");
      if (records.length > FLOATING_LEAD_BATCH_SIZE)
        throw new Error("Chỉ được thêm tối đa 100 số/lần");
      const invalid = records.filter((item) => !isValidFloatingPhone(item.phone));
      if (invalid.length) throw new Error(`Có ${invalid.length} số điện thoại không hợp lệ`);
      return importFloatingLeadBatch({
        records: records.map((item) => ({
          row_index: item.index + 1,
          customer_name: "",
          phone: item.phone,
          address: "",
          loai_cay_trong: "",
          dien_tich: "",
          tinh_trang_cay_trong: "",
          giai_doan_cay_trong: "",
          source_type: "manual",
        })),
        duplicateStrategy: "skip",
        importId: crypto.randomUUID(),
        fileName: "manual-entry",
      });
    },
    onSuccess: async (result) => {
      await invalidate();
      setManualPhones("");
      setManualOpen(false);
      toast.success(`Đã thêm ${result.inserted} số`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Không thể thêm số"),
  });

  const togglePage = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => (checked ? next.add(row.id) : next.delete(row.id)));
      return next;
    });
  };
  const exportRows = (exportRowsValue: FloatingLeadCrmRow[]) => {
    const worksheet = XLSX.utils.json_to_sheet(
      exportRowsValue.map((row, index) => ({
        STT: index + 1,
        customer_name: row.customer_name,
        phone: row.phone,
        address: row.address,
        loai_cay_trong: row.loai_cay_trong,
        dien_tich: row.dien_tich,
        marketing: row.created_by_name,
        sale: row.assigned_sale_name,
        status: row.status,
        latest_call: row.latest_call_result,
        source_type: row.source_type,
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Floating Leads");
    XLSX.writeFile(workbook, `floating-leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-4">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-950">Kho thả nổi</h1>
              <p className="text-sm text-slate-500">
                Quản lý lead, import dữ liệu và phân phối cho Sale
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setResetOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Reset kho
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" /> Nhập Excel/CSV
              </Button>
              <Button className="gap-2" onClick={() => setManualOpen(true)}>
                <Plus className="h-4 w-4" /> Thêm số
              </Button>
            </div>
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
              options={[
                "Chưa gọi",
                "Không nghe máy",
                "Hẹn gọi lại",
                "Đang cân nhắc",
                "Đã bị chốt",
                "Không mua",
                "Khách trêu",
              ]}
            />
            <FilterSelect
              value={marketingId}
              onChange={(value) => {
                setMarketingId(value);
                setPage(1);
              }}
              placeholder="Marketing"
              options={(profilesQuery.data?.marketers ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <FilterSelect
              value={saleId}
              onChange={(value) => {
                setSaleId(value);
                setPage(1);
              }}
              placeholder="Sale"
              options={(profilesQuery.data?.sales ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <FilterSelect
              value={sourceType}
              onChange={(value) => {
                setSourceType(value);
                setPage(1);
              }}
              placeholder="Nguồn import"
              options={sources}
            />
            <Button
              size="icon"
              variant="outline"
              disabled={leadsQuery.isFetching}
              onClick={() => leadsQuery.refetch()}
            >
              <RefreshCw className={cn("h-4 w-4", leadsQuery.isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-sm">
          <strong>Đã chọn {selectedIds.size} lead</strong>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => bulkMutation.mutate({ action: "delete" })}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Xóa
          </Button>
          <BulkSelect
            label="Gán cho Sale"
            options={profilesQuery.data?.sales ?? []}
            onSelect={(value) => bulkMutation.mutate({ action: "assign_sale", value })}
          />
          <BulkSelect
            label="Đổi trạng thái"
            options={[
              "Chưa gọi",
              "Không nghe máy",
              "Hẹn gọi lại",
              "Đang cân nhắc",
              "Đã bị chốt",
              "Không mua",
              "Khách trêu",
            ].map((value) => ({ id: value, name: value }))}
            onSelect={(value) => bulkMutation.mutate({ action: "status", value })}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportRows(rows.filter((row) => selectedIds.has(row.id)))}
          >
            <Download className="mr-1 h-4 w-4" /> Xuất Excel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="mr-1 h-4 w-4" /> Bỏ chọn
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-330px)] min-h-80 overflow-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs font-bold text-slate-500 shadow-sm">
                <tr>
                  <th className="w-12 px-3 py-3">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={(value) => togglePage(value === true)}
                    />
                  </th>
                  <th className="w-14 px-3 py-3">STT</th>
                  <th className="px-3 py-3">Ngày</th>
                  <th className="px-3 py-3">Khách hàng</th>
                  <th className="px-3 py-3">Số điện thoại</th>
                  <th className="px-3 py-3">Cây trồng</th>
                  <th className="px-3 py-3">Diện tích</th>
                  <th className="px-3 py-3">Marketing</th>
                  <th className="px-3 py-3">Sale phụ trách</th>
                  <th className="px-3 py-3">Lần gọi gần nhất</th>
                  <th className="px-3 py-3">Tình trạng</th>
                  <th className="w-24 px-3 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {leadsQuery.isLoading ? (
                  <tr>
                    <td colSpan={12} className="h-64 text-center">
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
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={(value) =>
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (value === true) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{formatDate(row.lead_date)}</td>
                      <td className="px-3 py-2.5 font-semibold">{row.customer_name || "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-600">{row.phone}</td>
                      <td className="px-3 py-2.5">{row.loai_cay_trong || "—"}</td>
                      <td className="px-3 py-2.5">{row.dien_tich || "—"}</td>
                      <td className="px-3 py-2.5">{row.created_by_name || "—"}</td>
                      <td className="px-3 py-2.5">{row.assigned_sale_name || "Chưa phân công"}</td>
                      <td className="px-3 py-2.5">
                        {row.last_called_at
                          ? `${formatDateTime(row.last_called_at)} · ${row.latest_call_result || "—"}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge value={row.status} />
                      </td>
                      <td
                        className="px-3 py-2.5 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button size="icon" variant="ghost" onClick={() => setEditLead({ ...row })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => bulkMutation.mutate({ action: "delete", ids: [row.id] })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
                {!leadsQuery.isLoading && !rows.length ? (
                  <tr>
                    <td colSpan={12} className="h-64 text-center text-slate-500">
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
        editable={false}
        onOpenChange={(open) => !open && setDetailLead(null)}
      />
      <ImportFloatingLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onCompleted={invalidate}
      />
      <ManualLeadDialog
        open={manualOpen}
        value={manualPhones}
        pending={manualMutation.isPending}
        onChange={setManualPhones}
        onOpenChange={setManualOpen}
        onSave={() => manualMutation.mutate()}
      />
      <EditLeadDialog
        lead={editLead}
        pending={editMutation.isPending}
        onChange={setEditLead}
        onOpenChange={(open) => !open && setEditLead(null)}
        onSave={() => editMutation.mutate()}
      />
      <ConfirmResetDialog
        open={resetOpen}
        pending={resetMutation.isPending}
        onOpenChange={setResetOpen}
        onConfirm={() => resetMutation.mutate()}
      />
    </div>
  );
}

function ImportFloatingLeadsDialog({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<FloatingLeadImportRecord[]>([]);
  const [invalidRows, setInvalidRows] = useState<
    Array<{ row_index: number; phone: string; reason: string }>
  >([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [encodingInvalid, setEncodingInvalid] = useState(false);

  const parseFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
    let rawRows: Record<string, string>[];
    let selectedEncoding = "not-applicable";
    let utf8DecodeSucceeded = false;

    if (isCsv) {
      const decoded = decodeCsvArrayBuffer(buffer);
      selectedEncoding = decoded.encoding;
      utf8DecodeSucceeded = decoded.utf8DecodeSucceeded;
      rawRows = rowsToImportObjects(parseCsvAsStrings(decoded.text));
    } else {
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellText: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      rawRows = rowsToImportObjects(rows);
    }

    const seen = new Set<string>();
    let duplicates = 0;
    const invalid: Array<{ row_index: number; phone: string; reason: string }> = [];
    const parsed = rawRows.map((row, index) => {
      const phone = normalizeImportedPhone(row.phone);
      if (!isValidImportedPhone(phone))
        invalid.push({
          row_index: index + 2,
          phone,
          reason: "Số điện thoại không hợp lệ",
        });
      if (phone && seen.has(phone)) duplicates += 1;
      if (phone) seen.add(phone);
      return {
        row_index: index + 2,
        customer_name: String(row.customer_name ?? "").trim(),
        phone,
        address: String(row.address ?? "").trim(),
        loai_cay_trong: String(row.loai_cay_trong ?? "").trim(),
        dien_tich: String(row.dien_tich ?? "").trim(),
        tinh_trang_cay_trong: String(row.tinh_trang_cay_trong ?? "").trim(),
        giai_doan_cay_trong: String(row.giai_doan_cay_trong ?? "").trim(),
        source_type: "excel_csv",
      };
    });
    const suspiciousCells = utf8DecodeSucceeded
      ? []
      : parsed.flatMap((record) =>
          importColumns
            .filter((column) => containsCsvMojibake(String(record[column] ?? "")))
            .map((column) => ({ row: record.row_index, column, value: String(record[column] ?? "") })),
        );
    const validRows = parsed.filter((record) => isValidImportedPhone(record.phone)).length;
    const encodingWarning = isCsv && !utf8DecodeSucceeded && suspiciousCells.length > 0;
    console.debug("[floating-leads-import] CSV encoding", {
      encoding: selectedEncoding,
      utf8DecodeSucceeded,
      suspiciousCells,
      validRows,
    });
    setFileName(file.name);
    setRecords(parsed);
    setInvalidRows(invalid);
    setDuplicateCount(duplicates);
    setEncodingInvalid(encodingWarning);
    setSummary(null);
    setBatches([]);
  };
  const runImport = async (retryIndexes?: number[]) => {
    if (encodingInvalid) {
      toast.error("File CSV đang sai bảng mã. Hãy lưu lại dưới định dạng CSV UTF-8.");
      return;
    }
    const validRecords = records.filter((record) => isValidImportedPhone(record.phone));
    const chunks = chunkRecords(validRecords).map((chunk, index) => ({
      index,
      records: chunk,
      state: "pending" as const,
    }));
    const target = retryIndexes
      ? chunks.filter((batch) => retryIndexes.includes(batch.index))
      : chunks;
    setBatches(chunks);
    setRunning(true);
    const importId = crypto.randomUUID();
    const nextSummary: ImportSummary = summary ?? {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: invalidRows.length,
      errors: [...invalidRows],
      processed: 0,
    };
    for (const batch of target) {
      setBatches((current) =>
        current.map((item) => (item.index === batch.index ? { ...item, state: "running" } : item)),
      );
      try {
        const result = await importFloatingLeadBatch({
          records: batch.records,
          duplicateStrategy: strategy,
          importId,
          fileName,
        });
        nextSummary.inserted += result.inserted;
        nextSummary.updated += result.updated;
        nextSummary.skipped += result.skipped;
        nextSummary.failed += result.failed;
        nextSummary.errors.push(...result.errors);
        nextSummary.processed += batch.records.length;
        setBatches((current) =>
          current.map((item) => (item.index === batch.index ? { ...item, state: "done" } : item)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Batch lỗi";
        nextSummary.failed += batch.records.length;
        nextSummary.processed += batch.records.length;
        nextSummary.errors.push(
          ...batch.records.map((record) => ({
            row_index: record.row_index,
            phone: record.phone,
            reason: message,
          })),
        );
        setBatches((current) =>
          current.map((item) =>
            item.index === batch.index ? { ...item, state: "failed", error: message } : item,
          ),
        );
      }
      setSummary({ ...nextSummary, errors: [...nextSummary.errors] });
    }
    setRunning(false);
    await onCompleted();
  };
  const reset = () => {
    setFileName("");
    setRecords([]);
    setInvalidRows([]);
    setDuplicateCount(0);
    setBatches([]);
    setSummary(null);
    setEncodingInvalid(false);
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([buildFloatingLeadCsvTemplate()], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mau-kho-tha-noi.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const downloadErrors = () => {
    if (!summary?.errors.length) return;
    const sheet = XLSX.utils.json_to_sheet(summary.errors);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "loi-import-kho-tha-noi.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value && !running) reset();
      }}
    >
      <DialogContent className="flex max-h-[88vh] w-[min(94vw,980px)] max-w-none flex-col overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Nhập Excel/CSV</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {!records.length ? (
            <button
              type="button"
              className="flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center hover:bg-blue-50"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void parseFile(file);
              }}
            >
              <UploadCloud className="h-10 w-10 text-blue-600" />
              <strong className="mt-3">Kéo thả file hoặc bấm để chọn</strong>
              <span className="mt-1 text-sm text-slate-500">Hỗ trợ .csv, .xlsx, .xls</span>
              <input
                ref={fileRef}
                className="hidden"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void parseFile(file);
                }}
              />
            </button>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <ImportStat label="Tổng dòng" value={records.length} />
                <ImportStat
                  label="Hợp lệ"
                  value={records.length - invalidRows.length}
                  tone="green"
                />
                <ImportStat label="Lỗi" value={invalidRows.length} tone="red" />
                <ImportStat label="Trùng trong file" value={duplicateCount} tone="amber" />
              </div>
              {encodingInvalid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  File CSV đang sai bảng mã. Hãy lưu lại dưới định dạng CSV UTF-8.
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label>Xử lý số trùng</Label>
                  <Select
                    value={strategy}
                    onValueChange={(value) => setStrategy(value as DuplicateStrategy)}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Bỏ qua</SelectItem>
                      <SelectItem value="update">Cập nhật dữ liệu cũ</SelectItem>
                      <SelectItem value="insert_anyway">Vẫn thêm mới</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="pb-2 text-sm text-slate-500">
                  {fileName} · batch {FLOATING_LEAD_BATCH_SIZE} dòng
                </span>
              </div>
              <div className="overflow-auto rounded-xl border">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Dòng", ...importColumns].map((column) => (
                        <th key={column} className="px-3 py-2 text-left">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 20).map((record) => (
                      <tr
                        key={record.row_index}
                        className={cn(
                          "border-t",
                          !isValidImportedPhone(record.phone) && "bg-red-50",
                        )}
                      >
                        <td className="px-3 py-2">{record.row_index}</td>
                        {importColumns.map((column) => (
                          <td key={column} className="max-w-48 truncate px-3 py-2">
                            {record[column]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary ? (
                <div className="space-y-2 rounded-xl border bg-slate-50 p-4">
                  <Progress
                    value={
                      records.length ? Math.min(100, (summary.processed / records.length) * 100) : 0
                    }
                  />
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      Đã xử lý:{" "}
                      <b>
                        {summary.processed}/{records.length}
                      </b>
                    </span>
                    <span className="text-green-700">
                      Thêm: <b>{summary.inserted}</b>
                    </span>
                    <span className="text-blue-700">
                      Cập nhật: <b>{summary.updated}</b>
                    </span>
                    <span className="text-amber-700">
                      Bỏ qua: <b>{summary.skipped}</b>
                    </span>
                    <span className="text-red-700">
                      Lỗi: <b>{summary.failed}</b>
                    </span>
                  </div>
                  {summary.errors.length ? (
                    <Button size="sm" variant="outline" onClick={downloadErrors}>
                      <Download className="mr-1 h-4 w-4" /> Tải danh sách lỗi
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {batches.some((batch) => batch.state === "failed") ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    runImport(
                      batches
                        .filter((batch) => batch.state === "failed")
                        .map((batch) => batch.index),
                    )
                  }
                >
                  Retry batch lỗi
                </Button>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={downloadTemplate}>
            Tải file mẫu
          </Button>
          <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {records.length ? (
            <Button
              disabled={running || encodingInvalid || records.length === invalidRows.length}
              onClick={() => runImport()}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Bắt đầu nhập
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualLeadDialog({
  open,
  value,
  pending,
  onChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm số vào kho</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Mỗi dòng một số, tối đa 100 số</Label>
          <Textarea
            rows={10}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="0988123456\n0911222333"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={pending} onClick={onSave}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu số
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function EditLeadDialog({
  lead,
  pending,
  onChange,
  onOpenChange,
  onSave,
}: {
  lead: FloatingLeadCrmRow | null;
  pending: boolean;
  onChange: (lead: FloatingLeadCrmRow | null) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  if (!lead) return null;
  const field = (key: keyof FloatingLeadCrmRow, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        value={String(lead[key] ?? "")}
        onChange={(event) => onChange({ ...lead, [key]: event.target.value })}
      />
    </div>
  );
  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa lead</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("customer_name", "Khách hàng")}
          {field("phone", "Số điện thoại")}
          {field("address", "Địa chỉ")}
          {field("loai_cay_trong", "Loại cây trồng")}
          {field("dien_tich", "Diện tích")}
          {field("tinh_trang_cay_trong", "Tình trạng cây")}
          {field("giai_doan_cay_trong", "Giai đoạn cây")}
          {field("source_type", "Nguồn")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={pending} onClick={onSave}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ConfirmResetDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset toàn bộ kho thả nổi?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Toàn bộ lead hiện có sẽ được ẩn bằng soft delete. Dữ liệu không bị hard delete và vẫn có
          thể khôi phục trong database.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            Reset toàn bộ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả {placeholder}</SelectItem>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
function BulkSelect({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: Array<{ id: string; name: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger className="h-8 w-44 bg-white">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function ImportStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "red" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "green" && "border-green-200 bg-green-50",
        tone === "red" && "border-red-200 bg-red-50",
        tone === "amber" && "border-amber-200 bg-amber-50",
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
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
function chunkRecords(records: FloatingLeadImportRecord[]) {
  const chunks: FloatingLeadImportRecord[][] = [];
  for (let index = 0; index < records.length; index += FLOATING_LEAD_BATCH_SIZE)
    chunks.push(records.slice(index, index + FLOATING_LEAD_BATCH_SIZE));
  return chunks;
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
