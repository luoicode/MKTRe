import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { calculateReportMetrics } from "@/lib/reports";
import {
  ReportSheetImageTemplate,
  type ReportSheetImageData,
} from "@/components/ReportSheetImageTemplate";
import { ReportImagePreviewDialog } from "@/components/ReportImagePreviewDialog";

export interface SubmittedReportData {
  fullName: string;
  teamName?: string | null;
  channelName?: string | null;
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
  const exportRef = useRef<HTMLDivElement>(null);
  const autoExportedRef = useRef(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(true);
  const exportFilename = reportExportFilename(data.fullName, data.slotName, data.reportDate);
  const sheetData = toSheetData(data);

  const generatePreview = useCallback(async () => {
    if (!exportRef.current) return;
    setGenerating(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await (await fetch(dataUrl)).blob();
      setImageBlob(blob);
      setImageUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return URL.createObjectURL(blob);
      });
      toast.success("Đã gửi báo cáo thành công");
    } catch {
      toast.error("Không tạo được ảnh báo cáo");
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (autoExportedRef.current) return;
    autoExportedRef.current = true;
    window.setTimeout(() => {
      void generatePreview();
    }, 100);
  }, [generatePreview]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <>
      <ReportImagePreviewDialog
        open
        imageUrl={imageUrl}
        blob={imageBlob}
        filename={exportFilename}
        isGenerating={generating}
        onClose={onClose}
      />
      <div className="pointer-events-none fixed -left-[10000px] top-0 opacity-100">
        <ReportSheetImageTemplate ref={exportRef} data={sheetData} />
      </div>
    </>
  );
}

function toSheetData(data: SubmittedReportData): ReportSheetImageData {
  const metrics = calc(data);
  return {
    reportType: "personal",
    reportDate: data.reportDate,
    title: data.fullName,
    channel: data.channelName || "FACEBOOK",
    ads_cost: data.ads_cost,
    mess_count: data.mess_count,
    data_count: data.data_count,
    closed_orders: data.closed_orders,
    daily_data_revenue: data.daily_data_revenue,
    total_orders: data.total_orders,
    total_revenue: data.total_revenue,
    recovered_revenue: metrics.recovered,
  };
}

function reportExportFilename(employeeName: string, slotName: string, reportDate: string) {
  return `report-${slugify(employeeName)}-${reportDate}-${slugifySlot(slotName)}.png`;
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "marketing"
  );
}

function slugifySlot(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(":", "h");
}
