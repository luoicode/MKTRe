import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  formatVnd,
  formatVndSigned,
  formatPercent,
  fmtInt,
  formatDateVN,
  formatDateTimeVN,
  calculateReportMetrics,
} from "@/lib/reports";
import { saveReportDataUrlToPreferredFolder } from "@/lib/reportScreenshotStorage";

export interface SubmittedReportData {
  fullName: string;
  reportDate: string; // YYYY-MM-DD
  slotName: string;
  scopeLabel: string;
  submittedAt: string; // ISO
  lastUpdatedAt: string; // ISO
  wasReconciled?: boolean;
  ads_cost: number;
  mess_count: number;
  data_count: number;
  closed_orders: number;
  daily_data_revenue: number;
  total_orders: number;
  total_revenue: number;
  note?: string | null;
}

function calc(d: SubmittedReportData) {
  const m = calculateReportMetrics({
    ads_cost: d.ads_cost,
    mess_count: d.mess_count,
    data_count: d.data_count,
    closed_orders: d.closed_orders,
    daily_data_revenue: d.daily_data_revenue,
    total_orders: d.total_orders,
    total_revenue: d.total_revenue,
  });
  return m;
}

export function SubmittedReportCard({
  data,
  onClose,
}: {
  data: SubmittedReportData;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const c = calc(data);
  const recoveredNeg = c.recovered < 0;
  const exportFilename = reportExportFilename(data.slotName, data.reportDate);

  const handleCapture = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      if (await saveReportDataUrlToPreferredFolder(exportFilename, dataUrl)) {
        return;
      }
      setPreview(dataUrl);
    } catch {
      toast.error("Chụp màn hình thất bại");
    } finally {
      setBusy(false);
    }
  };

  const downloadPreview = () => {
    if (!preview) return;
    const link = document.createElement("a");
    link.download = exportFilename;
    link.href = preview;
    link.click();
    toast.success("Đã tải ảnh báo cáo");
  };

  const Row = ({ label, value, danger }: { label: string; value: string; danger?: boolean }) => (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 text-[13px] last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={`text-right font-semibold ${danger ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
  const Group = ({
    title,
    children,
    tone = "slate",
  }: {
    title: string;
    children: React.ReactNode;
    tone?: "slate" | "rose";
  }) => (
    <section
      className={`rounded-lg border p-3 ${
        tone === "rose" ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50/40"
      }`}
    >
      <h3
        className={`mb-2 text-xs font-bold ${tone === "rose" ? "text-rose-700" : "text-slate-700"}`}
      >
        {title}
      </h3>
      <div className="grid gap-x-4 sm:grid-cols-2">{children}</div>
    </section>
  );

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-base">Báo cáo đã gửi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <div ref={ref} className="rounded-lg bg-white p-4 text-slate-900">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-center text-base font-extrabold tracking-wide text-slate-900">
                  BÁO CÁO ĐÃ GỬI
                </h2>
                <div className="mt-2 grid gap-1 text-[12px] text-slate-700">
                  <div>
                    <span className="font-semibold">Marketing:</span> {data.fullName}
                  </div>
                  <div>
                    <span className="font-semibold">Ngày báo cáo:</span>{" "}
                    {formatDateVN(data.reportDate)}
                  </div>
                  <div>
                    <span className="font-semibold">Khung giờ:</span> {data.slotName}
                  </div>
                  <div>
                    <span className="font-semibold">Thời gian gửi:</span>{" "}
                    {formatDateTimeVN(data.submittedAt)}
                  </div>
                  {data.wasReconciled && (
                    <div className="inline-flex w-fit rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                      Đã chỉnh sau reconciliation
                    </div>
                  )}
                </div>
              </div>
              <CardContent className="p-0 pt-3">
                <div className="space-y-3">
                  <Group title="Chỉ số vận hành">
                    <Row label="CP ADS" value={formatVnd(data.ads_cost)} />
                    <Row label="Đơn chốt DATA ngày" value={fmtInt(data.closed_orders)} />
                    <Row label="MESS" value={fmtInt(data.mess_count)} />
                    <Row label="CP/MESS" value={formatVnd(c.cp_mess)} />
                    <Row label="DATA" value={fmtInt(data.data_count)} />
                    <Row label="CP/DATA" value={formatVnd(c.cp_data)} />
                    <Row label="TLC chốt" value={formatPercent(c.conv_rate)} />
                    <Row label="TB đơn" value={formatVnd(c.avg_order)} />
                    <Row label="CP ADS/DS ngày" value={formatPercent(c.cp_daily_pct)} />
                    <Row label="DS DATA ngày" value={formatVnd(data.daily_data_revenue)} />
                  </Group>

                  <Group title="Tổng kết" tone="rose">
                    <Row label="Tổng Đơn Chốt" value={fmtInt(data.total_orders)} />
                    <Row label="Tổng DS" value={formatVnd(data.total_revenue)} />
                    <Row label="CP ADS/Tổng DS" value={formatPercent(c.cp_total_pct)} />
                    <Row
                      label="DS chốt lại"
                      value={formatVndSigned(c.recovered)}
                      danger={recoveredNeg}
                    />
                  </Group>
                </div>
                {data.note?.trim() && (
                  <div className="mt-2 text-[13px]">
                    <div className="text-slate-600">Ghi chú:</div>
                    <div className="mt-1 whitespace-pre-wrap font-medium text-slate-900">
                      {data.note.trim()}
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={handleCapture} disabled={busy} size="sm">
                <Camera className="mr-2 h-4 w-4" />
                {busy ? "Đang chụp..." : "Tải ảnh"}
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Đóng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl border-0 bg-slate-950 p-0 text-white shadow-2xl">
          <DialogHeader className="border-b border-white/10 px-4 py-3">
            <DialogTitle className="text-sm">Preview ảnh báo cáo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            {preview && (
              <div className="max-h-[70vh] overflow-auto rounded-lg bg-white p-2">
                <img src={preview} alt="Report preview" className="mx-auto max-w-full rounded" />
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={downloadPreview}>
                <Download className="mr-2 h-4 w-4" />
                Tải ảnh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                <X className="mr-2 h-4 w-4" />
                Đóng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function reportExportFilename(slotName: string, reportDate: string) {
  const hhmm = slotName.replace(/\D/g, "").padEnd(4, "0").slice(0, 4) || "0000";
  const [year, month, day] = reportDate.split("-");
  return `${hhmm}_${day}${month}${year}.png`;
}
