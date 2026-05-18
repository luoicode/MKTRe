import { forwardRef } from "react";
import {
  calculateReportMetrics,
  formatDateVN,
  fmtInt,
  fmtVnd,
  type RawReportNumbers,
} from "@/lib/reports";

export interface ReportSheetImageData extends RawReportNumbers {
  reportType: "personal" | "team";
  reportDate?: string;
  dateLabel?: string;
  title?: string | null;
  channel?: string | null;
  recovered_revenue?: number | null;
}

const sheetRows = [
  "Chi Phí Ads",
  "MESS",
  "CP/MESS",
  "Data",
  "CP/Data",
  "Đơn chốt DATA trong ngày",
  "Tỉ lệ chốt",
  "DOANH SỐ DATA trong ngày",
  "TB Đơn",
  "CP/DS",
  "Tổng Đơn Chốt",
  "Tổng Doanh Số",
  "CP / Tổng DS",
  "Doanh số chốt lại",
] as const;

type SheetRowLabel = (typeof sheetRows)[number];

const sheetValueTone: Partial<Record<SheetRowLabel, "green" | "bright" | "red">> = {
  "CP/MESS": "green",
  "CP/Data": "green",
  "Tỉ lệ chốt": "bright",
  "TB Đơn": "green",
  "CP/DS": "red",
  "CP / Tổng DS": "red",
  "Doanh số chốt lại": "green",
};

export const ReportSheetImageTemplate = forwardRef<HTMLDivElement, { data: ReportSheetImageData }>(
  function ReportSheetImageTemplate({ data }, ref) {
    const c = calculateReportMetrics(data);
    const recovered = data.recovered_revenue ?? c.recovered;
    const rows: Array<{ label: SheetRowLabel; value: string }> = [
      { label: "Chi Phí Ads", value: fmtVnd(data.ads_cost) },
      { label: "MESS", value: fmtInt(data.mess_count) },
      { label: "CP/MESS", value: fmtVnd(c.cp_mess) },
      { label: "Data", value: fmtInt(data.data_count) },
      { label: "CP/Data", value: fmtVnd(c.cp_data) },
      { label: "Đơn chốt DATA trong ngày", value: fmtInt(data.closed_orders) },
      { label: "Tỉ lệ chốt", value: sheetPercent(c.conv_rate, 0) },
      { label: "DOANH SỐ DATA trong ngày", value: fmtVnd(data.daily_data_revenue) },
      { label: "TB Đơn", value: fmtVnd(c.avg_order) },
      { label: "CP/DS", value: sheetPercent(c.cp_daily_pct, 2) },
      { label: "Tổng Đơn Chốt", value: fmtInt(data.total_orders) },
      { label: "Tổng Doanh Số", value: fmtVnd(data.total_revenue) },
      { label: "CP / Tổng DS", value: sheetPercent(c.cp_total_pct, 2) },
      { label: "Doanh số chốt lại", value: fmtVnd(recovered) },
    ];
    const dateLabel = data.dateLabel ?? (data.reportDate ? formatDateVN(data.reportDate) : "—");
    const titleLine = normalizeSheetHeaderLine(
      data.title,
      data.reportType === "personal" ? "NHÂN VIÊN" : "TEAM",
    );
    const channelLine = normalizeSheetHeaderLine(data.channel || "FACEBOOK");

    return (
      <div ref={ref} className="bg-white p-2" style={{ width: 720 }}>
        <div
          className="grid text-[25px] font-extrabold leading-none text-black"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <div className="flex h-[82px] items-center justify-center border-2 border-black bg-[#b5651d] text-white">
            {dateLabel}
          </div>
          <div className="grid h-[82px] grid-rows-2 border-y-2 border-r-2 border-black bg-[#ffff35] text-center">
            <div className="flex items-center justify-center border-b-2 border-black px-2">
              {titleLine}
            </div>
            <div className="flex items-center justify-center px-2">{channelLine}</div>
          </div>
        </div>
        <div className="text-[21px] font-extrabold leading-tight text-black">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid"
              style={{ gridTemplateColumns: "1fr 1fr", minHeight: 39 }}
            >
              <div className="flex items-center border-x-2 border-b-2 border-black bg-white px-2">
                {row.label}
              </div>
              <div
                className={`flex items-center justify-end border-b-2 border-r-2 border-black px-2 text-right ${sheetCellToneClass(
                  sheetValueTone[row.label],
                )}`}
              >
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

function sheetCellToneClass(tone: "green" | "bright" | "red" | undefined) {
  if (tone === "green") return "bg-[#b7d7a8]";
  if (tone === "bright") return "bg-[#62ef45]";
  if (tone === "red") return "bg-[#ef2f25] text-[#6b1110]";
  return "bg-[#fff4cf]";
}

function sheetPercent(v: number | null | undefined, digits: number) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}%`;
}

function normalizeSheetHeaderLine(value: string | null | undefined, fallback = "FACEBOOK") {
  return value?.trim().toUpperCase() || fallback;
}
