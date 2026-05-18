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
type MetricKey =
  | "ads_cost"
  | "mess"
  | "cp_mess"
  | "data"
  | "cp_data"
  | "closed_orders"
  | "close_rate"
  | "daily_revenue"
  | "avg_order"
  | "cost_per_revenue_day"
  | "total_orders"
  | "total_revenue"
  | "cost_per_total_revenue"
  | "recovered_revenue";

const staticMetricTone: Partial<Record<MetricKey, "green" | "red">> = {
  cp_mess: "green",
  cp_data: "green",
  avg_order: "green",
  recovered_revenue: "green",
};

export const ReportSheetImageTemplate = forwardRef<HTMLDivElement, { data: ReportSheetImageData }>(
  function ReportSheetImageTemplate({ data }, ref) {
    const c = calculateReportMetrics(data);
    const recovered = data.recovered_revenue ?? c.recovered;
    const rows: Array<{ key: MetricKey; label: SheetRowLabel; value: string }> = [
      { key: "ads_cost", label: "Chi Phí Ads", value: fmtVnd(data.ads_cost) },
      { key: "mess", label: "MESS", value: fmtInt(data.mess_count) },
      { key: "cp_mess", label: "CP/MESS", value: fmtVnd(c.cp_mess) },
      { key: "data", label: "Data", value: fmtInt(data.data_count) },
      { key: "cp_data", label: "CP/Data", value: fmtVnd(c.cp_data) },
      {
        key: "closed_orders",
        label: "Đơn chốt DATA trong ngày",
        value: fmtInt(data.closed_orders),
      },
      { key: "close_rate", label: "Tỉ lệ chốt", value: sheetPercent(c.conv_rate, 0) },
      {
        key: "daily_revenue",
        label: "DOANH SỐ DATA trong ngày",
        value: fmtVnd(data.daily_data_revenue),
      },
      { key: "avg_order", label: "TB Đơn", value: fmtVnd(c.avg_order) },
      { key: "cost_per_revenue_day", label: "CP/DS", value: sheetPercent(c.cp_daily_pct, 2) },
      { key: "total_orders", label: "Tổng Đơn Chốt", value: fmtInt(data.total_orders) },
      { key: "total_revenue", label: "Tổng Doanh Số", value: fmtVnd(data.total_revenue) },
      {
        key: "cost_per_total_revenue",
        label: "CP / Tổng DS",
        value: sheetPercent(c.cp_total_pct, 2),
      },
      { key: "recovered_revenue", label: "Doanh số chốt lại", value: fmtVnd(recovered) },
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
                  getMetricTone(row.key, row.value),
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

function sheetCellToneClass(tone: "green" | "red" | undefined) {
  if (tone === "green") return "bg-[#63F13A]";
  if (tone === "red") return "bg-[#FF2A23] text-[#6b1110]";
  return "bg-[#fff4cf]";
}

function getMetricTone(metricKey: MetricKey, value: string): "green" | "red" | undefined {
  const percent = getPercentValue(value);
  if (metricKey === "close_rate") {
    if (percent == null) return undefined;
    return percent <= 40 ? "red" : "green";
  }
  if (metricKey === "cost_per_revenue_day" || metricKey === "cost_per_total_revenue") {
    if (percent == null) return undefined;
    return percent <= 55 ? "green" : "red";
  }
  return staticMetricTone[metricKey];
}

function getPercentValue(value: string) {
  const normalized = value.replace("%", "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetPercent(v: number | null | undefined, digits: number) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}%`;
}

function normalizeSheetHeaderLine(value: string | null | undefined, fallback = "FACEBOOK") {
  return value?.trim().toUpperCase() || fallback;
}
