import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, FileSpreadsheet, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { captureElementAsPngUrl } from "@/lib/captureImage";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportPreviewModal } from "@/components/workspace/sale/ReportPreviewModal";
import {
  calculateSaleComputedMetrics,
  emptySaleReportForm,
  formatSaleDate,
  formatSaleInteger,
  formatSalePercent,
  formatSaleRatioCurrency,
  formatSaleVnd,
  parseSaleNumber,
  saleReportFieldLabels,
  saleReportSlots,
  sumSaleForms,
  type SaleReportFormValues,
  type SaleReportSlotId,
} from "@/lib/saleReportUtils";
import {
  canEditSaleSubmittedReport,
  fetchSaleReportsForDate,
  findPreferredSaleSlot,
  getSaleSlotStatus,
  reportsToForms,
  saleFormToPayload,
  todayYmd,
  type SaleSlotStatus,
} from "@/lib/saleReports";

const initialForms = saleReportSlots.reduce<Record<SaleReportSlotId, SaleReportFormValues>>(
  (acc, slot) => ({ ...acc, [slot.id]: { ...emptySaleReportForm } }),
  {} as Record<SaleReportSlotId, SaleReportFormValues>,
);

export function SaleReportForm() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const reportDate = useMemo(() => todayYmd(), []);
  const [now, setNow] = useState(() => new Date());
  const [activeSlot, setActiveSlot] = useState<SaleReportSlotId>("morning");
  const [forms, setForms] = useState(initialForms);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewMode, setPreviewMode] = useState<"capture" | "submit">("capture");
  const previewRef = useRef<HTMLDivElement | null>(null);
  const activeSlotConfig =
    saleReportSlots.find((slot) => slot.id === activeSlot) ?? saleReportSlots[0];
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["sale-reports", profile?.id, reportDate],
    enabled: !!profile,
    queryFn: () => fetchSaleReportsForDate(profile!.id, reportDate),
  });
  const { reportsBySlot } = useMemo(() => reportsToForms(reports), [reports]);
  const slotStatuses = useMemo(
    () =>
      saleReportSlots.reduce<Record<SaleReportSlotId, SaleSlotStatus>>(
        (acc, slot) => ({
          ...acc,
          [slot.id]: getSaleSlotStatus({
            report: reportsBySlot[slot.id],
            slotId: slot.id,
            reportDate,
            slotTime: slot.time,
            now,
          }),
        }),
        {} as Record<SaleReportSlotId, SaleSlotStatus>,
      ),
    [now, reportDate, reportsBySlot],
  );
  const activeSlotStatus = slotStatuses[activeSlot];
  const activeReport = reportsBySlot[activeSlot];
  const activeSubmittedEditable = canEditSaleSubmittedReport(activeReport, now);
  const activeSlotEditable = activeSlotStatus === "available" || activeSubmittedEditable;
  const activeValues = forms[activeSlot];
  const activeMetrics = calculateSaleComputedMetrics(activeValues);
  const dailyTotals = useMemo(() => sumSaleForms(forms), [forms]);
  const saleName = profile?.full_name || profile?.username || "NVKD";
  const reportFilename = `bao-cao-sale-${formatSaleFileDate(today)}.png`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loaded = reportsToForms(reports);
    setForms(loaded.forms);
  }, [reports]);

  useEffect(() => {
    const preferredSlot = findPreferredSaleSlot(reportsBySlot, reportDate, now);
    if (
      slotStatuses[preferredSlot] === "available" &&
      (slotStatuses[activeSlot] === "not_open" ||
        slotStatuses[activeSlot] === "locked" ||
        (slotStatuses[activeSlot] === "submitted" &&
          !canEditSaleSubmittedReport(reportsBySlot[activeSlot], now)))
    ) {
      setActiveSlot(preferredSlot);
    }
  }, [activeSlot, now, reportDate, reportsBySlot, slotStatuses]);

  const updateActiveField = (field: keyof SaleReportFormValues, value: string) => {
    setForms((current) => ({
      ...current,
      [activeSlot]: {
        ...current[activeSlot],
        [field]: value,
      },
    }));
  };

  const handleSave = async (submit = false) => {
    if (!profile) return false;
    if (!activeSlotEditable) {
      toast.error(
        activeSlotStatus === "submitted"
          ? "Khung này đã hết thời gian chỉnh sửa, không thể sửa lại."
          : "Khung này chưa mở hoặc đã khóa theo thời gian báo cáo.",
      );
      return false;
    }
    setSaving(true);
    const payload = saleFormToPayload({
      userId: profile.id,
      reportDate,
      slotId: activeSlot,
      status: submit ? "submitted" : "draft",
      values: activeValues,
      submittedAt:
        submit && activeReport?.status === "submitted" ? activeReport.submitted_at : undefined,
    });
    const { error } = await supabase
      .from("sale_reports")
      .upsert(payload, { onConflict: "user_id,report_date,slot_key" });
    setSaving(false);
    if (error) {
      toast.error(`Không thể lưu báo cáo Sale: ${error.message}`);
      return false;
    }
    await qc.invalidateQueries({ queryKey: ["sale-reports", profile.id] });
    await qc.invalidateQueries({ queryKey: ["sale-dashboard", profile.id] });
    if (submit) {
      toast.success("Đã gửi báo cáo Sale");
      return true;
    }
    toast.success("Đã lưu nháp báo cáo Sale");
    return true;
  };

  const capturePreview = async (mode: "capture" | "submit" = previewMode) => {
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    setPreviewMode(mode);
    setPreviewImageUrl(null);
    setPreviewBlob(null);
    setPreviewOpen(true);
    setCapturing(true);
    try {
      const captured = await captureElementAsPngUrl({
        target: previewRef.current,
        backgroundColor: "#ffffff",
        fullContent: true,
        pixelRatio: 2,
      });
      setPreviewBlob(captured.blob);
      setPreviewImageUrl(captured.url);
    } catch (error) {
      setPreviewOpen(false);
      toast.error(error instanceof Error ? error.message : "Không thể chụp hình báo cáo");
    } finally {
      setCapturing(false);
    }
  };

  const closePreview = () => {
    if (saving) return;
    setPreviewOpen(false);
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    setPreviewImageUrl(null);
    setPreviewBlob(null);
  };

  const confirmSubmitFromPreview = async () => {
    const saved = await handleSave(true);
    if (saved) closePreview();
  };

  return (
    <div className="space-y-2 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <WorkspacePageHeader
        icon={<FileSpreadsheet className="h-5 w-5" />}
        title="Nhập báo cáo"
        subtitle={`Hôm nay: ${formatSaleDate(today)} · Đang nhập: Hôm nay (${activeSlotConfig.time})`}
        badge={<Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Sale</Badge>}
        className="p-2.5 md:p-3"
        contentClassName="gap-2 lg:min-h-0"
      />

      <div className="grid shrink-0 gap-2 sm:grid-cols-3">
        {saleReportSlots.map((slot) => {
          const status = slotStatuses[slot.id];
          const visual = saleSlotVisual(status);
          const Icon = visual.icon;
          const isActive = activeSlot === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => setActiveSlot(slot.id)}
              className={cn(
                "rounded-xl border bg-card px-3 py-2 text-left transition",
                "hover:border-primary/40 hover:shadow-sm",
                isActive && "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/10",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">{slot.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{slot.time}</p>
                </div>
                <Icon className={cn("h-4 w-4", visual.iconClassName)} />
              </div>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  visual.badge,
                )}
              >
                {visual.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-base">Số liệu {activeSlotConfig.tableLabel}</CardTitle>
              <CardDescription>
                {activeSlotStatus === "available"
                  ? `Nhập dữ liệu Sale theo khung ${activeSlotConfig.time}`
                  : activeSlotStatus === "submitted"
                    ? activeSubmittedEditable
                      ? "Khung này đã gửi báo cáo. Bạn vẫn có thể sửa trong 2 tiếng sau khi gửi."
                      : "Khung này đã gửi báo cáo, chỉ xem dữ liệu đã lưu."
                    : "Chỉ khung đang mở theo thời gian hiện tại mới được nhập."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              {isLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 2xl:grid-cols-3">
                    <SaleNumberField
                      label={saleReportFieldLabels.newDataReceived}
                      value={activeValues.newDataReceived}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("newDataReceived", value)}
                    />
                    <SaleNumberField
                      label={saleReportFieldLabels.newDataClosed}
                      value={activeValues.newDataClosed}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("newDataClosed", value)}
                    />
                    <SaleNumberField
                      label={saleReportFieldLabels.floatingDataReceived}
                      value={activeValues.floatingDataReceived}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("floatingDataReceived", value)}
                    />
                    <SaleNumberField
                      label={saleReportFieldLabels.floatingDataClosed}
                      value={activeValues.floatingDataClosed}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("floatingDataClosed", value)}
                    />
                    <SaleMoneyField
                      label={saleReportFieldLabels.newCustomerRevenue}
                      value={activeValues.newCustomerRevenue}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("newCustomerRevenue", value)}
                    />
                    <SaleNumberField
                      label={saleReportFieldLabels.videoCallDataCount}
                      value={activeValues.videoCallDataCount}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("videoCallDataCount", value)}
                    />
                    <SaleMoneyField
                      label={saleReportFieldLabels.floatingRevenue}
                      value={activeValues.floatingRevenue}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("floatingRevenue", value)}
                    />
                    <SaleNumberField
                      label={saleReportFieldLabels.oldCustomerCallCount}
                      value={activeValues.oldCustomerCallCount}
                      disabled={!activeSlotEditable}
                      onChange={(value) => updateActiveField("oldCustomerCallCount", value)}
                    />
                    <div className="space-y-1 sm:col-span-2 2xl:col-span-3">
                      <Label>Ghi chú</Label>
                      <Textarea
                        value={activeValues.note}
                        onChange={(event) => updateActiveField("note", event.target.value)}
                        placeholder="Khách cần follow, vướng mắc, ghi chú ca làm..."
                        className="min-h-16 resize-none"
                        disabled={!activeSlotEditable}
                      />
                    </div>
                  </div>

                  <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background/95 pt-2 backdrop-blur">
                    <Button
                      variant="outline"
                      onClick={() => void handleSave(false)}
                      disabled={saving || !activeSlotEditable || activeSlotStatus === "submitted"}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Lưu nháp
                    </Button>
                    <Button
                      onClick={() => void capturePreview("submit")}
                      disabled={saving || !activeSlotEditable}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {activeSlotStatus === "submitted" ? "Cập nhật báo cáo" : "Gửi báo cáo"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void capturePreview("capture")}
                      disabled={capturing}
                    >
                      {capturing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="mr-2 h-4 w-4" />
                      )}
                      Chụp hình báo cáo
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <ComputedMetricsPanel metrics={activeMetrics} />
        </div>
        <SaleReportCaptureTarget
          ref={previewRef}
          forms={forms}
          dailyTotals={dailyTotals}
          employeeName={saleName}
          reportDate={today}
        />
      </div>
      <ReportPreviewModal
        open={previewOpen}
        imageUrl={previewImageUrl}
        blob={previewBlob}
        filename={reportFilename}
        isCapturing={capturing}
        isSubmitting={saving}
        showSubmitAction={previewMode === "submit"}
        onClose={closePreview}
        onRecapture={() => void capturePreview(previewMode)}
        onConfirmSubmit={() => void confirmSubmitFromPreview()}
      />
    </div>
  );
}

function SaleNumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      <Input
        className="h-9 text-sm"
        value={value}
        inputMode="numeric"
        placeholder="0"
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
      />
    </div>
  );
}

function SaleMoneyField(props: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-600">{props.label}</Label>
      <Input
        className="h-9 text-sm"
        value={props.value ? Number(props.value).toLocaleString("vi-VN") : ""}
        inputMode="numeric"
        placeholder="0"
        disabled={props.disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => props.onChange(event.target.value.replace(/[^\d]/g, ""))}
      />
    </div>
  );
}

function ComputedMetricsPanel({
  metrics,
}: {
  metrics: ReturnType<typeof calculateSaleComputedMetrics>;
}) {
  const rows = [
    ["Tổng data nhận", formatSaleInteger(metrics.totalDataReceived)],
    ["Tổng data chốt", formatSaleInteger(metrics.totalDataClosed)],
    ["Tổng doanh số", formatSaleVnd(metrics.totalRevenue)],
    ["Tỷ lệ chốt data mới", formatSalePercent(metrics.newCloseRate)],
    ["Tỷ lệ chốt thả nổi", formatSalePercent(metrics.floatingCloseRate)],
    ["Tỷ lệ chốt tổng", formatSalePercent(metrics.totalCloseRate)],
    ["TB đơn", formatSaleRatioCurrency(metrics.averageOrder)],
  ];
  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-base">Chỉ số tự tính</CardTitle>
        <CardDescription className="text-xs">Cập nhật real-time theo số đang nhập</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-1">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5"
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-bold text-slate-950">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const SaleReportCaptureTarget = forwardRef<
  HTMLDivElement,
  {
    forms: Record<SaleReportSlotId, SaleReportFormValues>;
    dailyTotals: SaleReportFormValues;
    employeeName: string;
    reportDate: Date;
  }
>(function SaleReportCaptureTarget({ forms, dailyTotals, employeeName, reportDate }, ref) {
  const previewRows = buildExportRows(forms, dailyTotals);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0 z-[-1]">
      <SaleReportExportTable
        ref={ref}
        rows={previewRows}
        employeeName={employeeName}
        reportDateLabel={formatSheetDate(reportDate)}
      />
    </div>
  );
});

type SaleExportRow = {
  stt: number;
  label: string;
  values: [string, string, string, string];
  tone: "data" | "calc";
};

const SaleReportExportTable = forwardRef<
  HTMLDivElement,
  {
    rows: SaleExportRow[];
    employeeName: string;
    reportDateLabel: string;
  }
>(function SaleReportExportTable({ rows, employeeName, reportDateLabel }, ref) {
  const cellStyle = {
    border: "1px solid #000",
    color: "#000",
    fontFamily: "Arial, sans-serif",
    fontSize: 16,
    lineHeight: "24px",
    padding: "0 8px",
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
  };
  const titleStyle = {
    ...cellStyle,
    borderLeft: "1px solid #000",
    borderRight: "1px solid #000",
    background: "#fff",
    fontSize: 19,
    fontWeight: 700,
    lineHeight: "22px",
    padding: 0,
  };
  const greenHeader = { ...cellStyle, background: "#00f315", fontWeight: 700 };
  const orangeHeader = { ...cellStyle, background: "#f28c13", fontWeight: 700 };
  const cyanHeader = { ...cellStyle, background: "#16f3f5", fontWeight: 700 };
  const dataBg = "#d9e8f6";
  const calcBg = "#fff3cf";

  return (
    <div ref={ref} style={{ display: "inline-block", background: "#fff", padding: 0 }}>
      <table
        style={{
          width: 800,
          tableLayout: "fixed",
          borderCollapse: "collapse",
          borderSpacing: 0,
          fontFamily: "Arial, sans-serif",
          color: "#000",
          background: "#fff",
        }}
      >
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 196 }} />
          <col style={{ width: 121 }} />
          <col style={{ width: 121 }} />
          <col style={{ width: 121 }} />
          <col style={{ width: 121 }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={6} style={titleStyle}>
              BÁO CÁO NGÀY NVKD
            </th>
          </tr>
          <tr>
            <th rowSpan={2} style={greenHeader}>
              STT
            </th>
            <th rowSpan={2} style={greenHeader}>
              {employeeName}
            </th>
            <th colSpan={4} style={orangeHeader}>
              {reportDateLabel}
            </th>
          </tr>
          <tr>
            <th style={cyanHeader}>Ca ngày</th>
            <th style={cyanHeader}>Ca chiều</th>
            <th style={cyanHeader}>Ca tối</th>
            <th style={cyanHeader}>Cả ngày</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const background = row.tone === "data" ? dataBg : calcBg;
            return (
              <tr key={row.label}>
                <td style={{ ...cellStyle, background }}>{row.stt}</td>
                <td style={{ ...cellStyle, background }}>{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${index}`} style={{ ...cellStyle, background }}>
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

function buildExportRows(
  forms: Record<SaleReportSlotId, SaleReportFormValues>,
  dailyTotals: SaleReportFormValues,
) {
  const slotValues = saleReportSlots.map((slot) => forms[slot.id]);
  const integer = (value: string) => formatSheetNumber(parseSaleNumber(value));
  const money = integer;
  const percent = (numerator: number, denominator: number) =>
    denominator ? `${Math.round((numerator / denominator) * 100)}%` : "0%";
  const average = (revenue: number, orders: number) =>
    orders ? formatSheetNumber(Math.round(revenue / orders)) : "0";
  const totalDataReceived = (value: SaleReportFormValues) =>
    parseSaleNumber(value.newDataReceived) + parseSaleNumber(value.floatingDataReceived);
  const totalCloseRate = (value: SaleReportFormValues) =>
    percent(
      parseSaleNumber(value.newDataClosed) + parseSaleNumber(value.floatingDataClosed),
      totalDataReceived(value),
    );

  const rows: Array<Omit<SaleExportRow, "values"> & { values: string[] }> = [
    {
      stt: 1,
      label: "Data mới nhận",
      values: slotValues.map((value) => integer(value.newDataReceived)),
      tone: "data",
    },
    {
      stt: 2,
      label: "Data mới chốt",
      values: slotValues.map((value) => integer(value.newDataClosed)),
      tone: "data",
    },
    {
      stt: 3,
      label: "Data thả nổi nhận",
      values: slotValues.map((value) => integer(value.floatingDataReceived)),
      tone: "data",
    },
    {
      stt: 4,
      label: "Data thả nổi chốt",
      values: slotValues.map((value) => integer(value.floatingDataClosed)),
      tone: "data",
    },
    {
      stt: 5,
      label: "Tổng Data nhận",
      values: slotValues.map((value) => formatSheetNumber(totalDataReceived(value))),
      tone: "data",
    },
    {
      stt: 6,
      label: "Doanh số khách mới",
      values: slotValues.map((value) => money(value.newCustomerRevenue)),
      tone: "calc",
    },
    {
      stt: 7,
      label: "Số DATA khách gọi video",
      values: slotValues.map((value) => integer(value.videoCallDataCount)),
      tone: "calc",
    },
    {
      stt: 8,
      label: "Tỷ lệ chốt mới",
      values: slotValues.map((value) =>
        percent(parseSaleNumber(value.newDataClosed), parseSaleNumber(value.newDataReceived)),
      ),
      tone: "calc",
    },
    {
      stt: 9,
      label: "TB đơn Data mới",
      values: slotValues.map((value) => {
        const revenue = parseSaleNumber(value.newCustomerRevenue);
        const closed = parseSaleNumber(value.newDataClosed);
        return average(revenue, closed);
      }),
      tone: "calc",
    },
    {
      stt: 10,
      label: "Doanh Số Thả Nổi",
      values: slotValues.map((value) => money(value.floatingRevenue)),
      tone: "calc",
    },
    {
      stt: 11,
      label: "Tổng tỷ lệ chốt",
      values: slotValues.map((value) => totalCloseRate(value)),
      tone: "calc",
    },
    {
      stt: 12,
      label: "Tổng doanh số",
      values: slotValues.map((value) =>
        formatSheetNumber(
          parseSaleNumber(value.newCustomerRevenue) + parseSaleNumber(value.floatingRevenue),
        ),
      ),
      tone: "calc",
    },
    {
      stt: 13,
      label: "Số DATA khách cũ gọi",
      values: slotValues.map((value) => integer(value.oldCustomerCallCount)),
      tone: "calc",
    },
  ];

  return rows.map(
    (row): SaleExportRow => ({
      ...row,
      values: [
        row.values[0],
        row.values[1],
        row.values[2],
        getDailyExportValue(row.stt, dailyTotals, percent, average),
      ] as [string, string, string, string],
    }),
  );
}

function getDailyExportValue(
  stt: number,
  dailyTotals: SaleReportFormValues,
  percent: (numerator: number, denominator: number) => string,
  average: (revenue: number, orders: number) => string,
) {
  const newDataReceived = parseSaleNumber(dailyTotals.newDataReceived);
  const newDataClosed = parseSaleNumber(dailyTotals.newDataClosed);
  const floatingDataClosed = parseSaleNumber(dailyTotals.floatingDataClosed);
  const floatingDataReceived = parseSaleNumber(dailyTotals.floatingDataReceived);
  const newCustomerRevenue = parseSaleNumber(dailyTotals.newCustomerRevenue);
  const videoCallDataCount = parseSaleNumber(dailyTotals.videoCallDataCount);
  const floatingRevenue = parseSaleNumber(dailyTotals.floatingRevenue);
  const oldCustomerCallCount = parseSaleNumber(dailyTotals.oldCustomerCallCount);

  switch (stt) {
    case 1:
      return formatSheetNumber(newDataReceived);
    case 2:
      return formatSheetNumber(newDataClosed);
    case 3:
      return formatSheetNumber(floatingDataClosed);
    case 4:
      return formatSheetNumber(floatingDataReceived);
    case 5:
      return formatSheetNumber(newDataReceived + floatingDataReceived);
    case 6:
      return formatSheetNumber(newCustomerRevenue);
    case 7:
      return formatSheetNumber(videoCallDataCount);
    case 8:
      return percent(newDataClosed, newDataReceived);
    case 9:
      return average(newCustomerRevenue, newDataClosed);
    case 10:
      return formatSheetNumber(floatingRevenue);
    case 11:
      return percent(newDataClosed + floatingDataClosed, newDataReceived + floatingDataReceived);
    case 12:
      return formatSheetNumber(newCustomerRevenue + floatingRevenue);
    case 13:
      return formatSheetNumber(oldCustomerCallCount);
    default:
      return "";
  }
}

function formatSheetNumber(value: number) {
  return Math.round(value).toLocaleString("vi-VN");
}

function formatSheetDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatSaleFileDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saleSlotVisual(status: SaleSlotStatus) {
  if (status === "submitted") {
    return {
      label: "Đã gửi",
      icon: CheckCircle2,
      iconClassName: "text-emerald-600",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }
  if (status === "not_open") {
    return {
      label: "Chưa mở",
      icon: Clock3,
      iconClassName: "text-slate-400",
      badge: "bg-slate-100 text-slate-600",
    };
  }
  if (status === "locked") {
    return {
      label: "Đã khóa",
      icon: Clock3,
      iconClassName: "text-slate-400",
      badge: "bg-slate-100 text-slate-600",
    };
  }
  return {
    label: "Đang mở",
    icon: Clock3,
    iconClassName: "text-primary",
    badge: "bg-primary/10 text-primary",
  };
}
