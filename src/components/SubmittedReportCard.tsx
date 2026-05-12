import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatVnd, formatVndSigned, formatPercent, fmtInt, formatDateVN, formatDateTimeVN, slugify, calculateReportMetrics } from "@/lib/reports";

export interface SubmittedReportData {
  fullName: string;
  reportDate: string; // YYYY-MM-DD
  slotName: string;
  submittedAt: string; // ISO
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

export function SubmittedReportCard({ data }: { data: SubmittedReportData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const c = calc(data);
  const recoveredNeg = c.recovered < 0;

  const handleCapture = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `report-${slugify(data.fullName)}-${data.reportDate}-${slugify(data.slotName)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Đã tải ảnh báo cáo");
    } catch {
      toast.error("Chụp màn hình thất bại");
    } finally {
      setBusy(false);
    }
  };

  const buildText = () => {
    const lines = [
      "BÁO CÁO ĐÃ GỬI",
      `Nhân viên: ${data.fullName}`,
      `Ngày báo cáo: ${formatDateVN(data.reportDate)}`,
      `Khung giờ báo cáo: ${data.slotName}`,
      `Thời gian gửi: ${formatDateTimeVN(data.submittedAt)}`,
      "",
      `Chi Phí Ads: ${formatVnd(data.ads_cost)}`,
      `MESS: ${fmtInt(data.mess_count)}`,
      `Chi phí ADS/MESS: ${formatVnd(c.cp_mess)}`,
      `Data: ${fmtInt(data.data_count)}`,
      `Chi phí ADS/Data: ${formatVnd(c.cp_data)}`,
      `Đơn chốt DATA trong ngày: ${fmtInt(data.closed_orders)}`,
      `Tỉ lệ chốt Data trong ngày: ${formatPercent(c.conv_rate)}`,
      `DOANH SỐ DATA trong ngày: ${formatVnd(data.daily_data_revenue)}`,
      `TB Đơn: ${formatVnd(c.avg_order)}`,
      `Chi phí ADS/Doanh Số Trong Ngày: ${formatPercent(c.cp_daily_pct)}`,
      `Tổng Đơn Chốt: ${fmtInt(data.total_orders)}`,
      `Tổng Doanh Số: ${formatVnd(data.total_revenue)}`,
      `Chi phí ADS/Tổng Doanh Số: ${formatPercent(c.cp_total_pct)}`,
      `Doanh số chốt lại: ${formatVndSigned(c.recovered)}`,
      `Ghi chú: ${data.note?.trim() || "—"}`,
    ];
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      toast.success("Đã copy nội dung báo cáo");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy thất bại");
    }
  };

  const Row = ({ label, value, danger }: { label: string; value: string; danger?: boolean }) => (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 py-1.5 text-[13px] last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={`text-right font-semibold ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCapture} disabled={busy} size="sm">
          <Camera className="mr-2 h-4 w-4" />
          {busy ? "Đang chụp..." : "Chụp màn hình báo cáo"}
        </Button>
        <Button onClick={handleCopy} variant="secondary" size="sm">
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          Copy nội dung báo cáo
        </Button>
      </div>

      <Card className="overflow-hidden border-2 border-slate-200">
        <div ref={ref} className="bg-white p-5 text-slate-900">
          <div className="border-b-2 border-slate-900 pb-3">
            <h2 className="text-center text-lg font-extrabold tracking-wide text-slate-900">BÁO CÁO ĐÃ GỬI</h2>
            <div className="mt-2 grid gap-1 text-[13px] text-slate-700">
              <div><span className="font-semibold">Nhân viên:</span> {data.fullName}</div>
              <div><span className="font-semibold">Ngày báo cáo:</span> {formatDateVN(data.reportDate)}</div>
              <div><span className="font-semibold">Khung giờ báo cáo:</span> {data.slotName}</div>
              <div><span className="font-semibold">Thời gian gửi:</span> {formatDateTimeVN(data.submittedAt)}</div>
            </div>
          </div>
          <CardContent className="p-0 pt-3">
            <Row label="Chi Phí Ads" value={formatVnd(data.ads_cost)} />
            <Row label="MESS" value={fmtInt(data.mess_count)} />
            <Row label="Chi phí ADS/MESS" value={formatVnd(c.cp_mess)} />
            <Row label="Data" value={fmtInt(data.data_count)} />
            <Row label="Chi phí ADS/Data" value={formatVnd(c.cp_data)} />
            <Row label="Đơn chốt DATA trong ngày" value={fmtInt(data.closed_orders)} />
            <Row label="Tỉ lệ chốt Data trong ngày" value={formatPercent(c.conv_rate)} />
            <Row label="DOANH SỐ DATA trong ngày" value={formatVnd(data.daily_data_revenue)} />
            <Row label="TB Đơn" value={formatVnd(c.avg_order)} />
            <Row label="Chi phí ADS/Doanh Số Trong Ngày" value={formatPercent(c.cp_daily_pct)} />
            <Row label="Tổng Đơn Chốt" value={fmtInt(data.total_orders)} />
            <Row label="Tổng Doanh Số" value={formatVnd(data.total_revenue)} />
            <Row label="Chi phí ADS/Tổng Doanh Số" value={formatPercent(c.cp_total_pct)} />
            <Row label="Doanh số chốt lại" value={formatVndSigned(c.recovered)} danger={recoveredNeg} />
            <div className="mt-2 text-[13px]">
              <div className="text-slate-600">Ghi chú:</div>
              <div className="mt-1 whitespace-pre-wrap font-medium text-slate-900">{data.note?.trim() || "—"}</div>
            </div>
            {recoveredNeg && (
              <div className="mt-3 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
                Tổng Doanh Số đang nhỏ hơn Doanh Số DATA trong ngày. Vui lòng kiểm tra lại số liệu.
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
