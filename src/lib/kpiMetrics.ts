import type { Tables } from "@/integrations/supabase/types";
import { deriveRates, type ReportMetricTotals } from "@/lib/analytics";
import type { SaleReportSummary } from "@/lib/saleReports";
import { fmtVndDong } from "@/lib/reports";

export type KpiValueKind = "money" | "number" | "percent" | "ratio";

export type MarketingMetricKey =
  | "ads_cost"
  | "revenue"
  | "mess"
  | "data"
  | "cost_per_data"
  | "cpl"
  | "cps"
  | "roi";

export type SaleMetricKey = "revenue" | "orders" | "close_rate" | "average_order";

export type MarketingKpiTarget = Tables<"kpi_targets">;
export type SaleKpiTarget = Tables<"sale_kpi_targets">;

export type MetricConfig<TActual, TTarget> = {
  key: string;
  label: string;
  kind: KpiValueKind;
  lowerIsBetter?: boolean;
  actual: (actual: TActual) => number | null;
  target: (target: TTarget | undefined) => number | null;
};

export const marketingMetrics: MetricConfig<ReportMetricTotals, MarketingKpiTarget>[] = [
  {
    key: "ads_cost",
    label: "Chi phí",
    kind: "money",
    lowerIsBetter: true,
    actual: (actual) => actual.ads_cost,
    target: (target) => Number(target?.ads_target ?? 0),
  },
  {
    key: "revenue",
    label: "Doanh thu",
    kind: "money",
    actual: (actual) => actual.total_revenue,
    target: (target) => Number(target?.revenue_target ?? 0),
  },
  {
    key: "mess",
    label: "MESS",
    kind: "number",
    actual: (actual) => actual.mess_count,
    target: (target) => Number(target?.mess_target ?? 0),
  },
  {
    key: "data",
    label: "DATA",
    kind: "number",
    actual: (actual) => actual.data_count,
    target: (target) => Number(target?.data_target ?? 0),
  },
  {
    key: "cost_per_data",
    label: "Giá số",
    kind: "money",
    lowerIsBetter: true,
    actual: (actual) => deriveRates(actual).cp_data ?? 0,
    target: (target) =>
      Number(target?.data_target ?? 0) > 0
        ? Number(target?.ads_target ?? 0) / Number(target?.data_target ?? 1)
        : null,
  },
  {
    key: "cpl",
    label: "CPL",
    kind: "money",
    lowerIsBetter: true,
    actual: (actual) => deriveRates(actual).cp_mess ?? 0,
    target: (target) =>
      Number(target?.mess_target ?? 0) > 0
        ? Number(target?.ads_target ?? 0) / Number(target?.mess_target ?? 1)
        : null,
  },
  {
    key: "cps",
    label: "CPS",
    kind: "money",
    lowerIsBetter: true,
    actual: (actual) => (actual.closed_orders > 0 ? actual.ads_cost / actual.closed_orders : 0),
    target: (target) =>
      Number(target?.orders_target ?? 0) > 0
        ? Number(target?.ads_target ?? 0) / Number(target?.orders_target ?? 1)
        : null,
  },
  {
    key: "roi",
    label: "ROI",
    kind: "ratio",
    actual: (actual) => deriveRates(actual).roas ?? 0,
    target: (target) => Number(target?.roas_target ?? 0),
  },
];

export const saleMetrics: MetricConfig<SaleReportSummary, SaleKpiTarget>[] = [
  {
    key: "revenue",
    label: "Doanh thu",
    kind: "money",
    actual: (actual) => actual.totalRevenue,
    target: (target) => Number(target?.revenue_target ?? 0),
  },
  {
    key: "orders",
    label: "Tổng đơn",
    kind: "number",
    actual: (actual) => actual.totalDataClosed,
    target: (target) => Number(target?.orders_target ?? 0),
  },
  {
    key: "close_rate",
    label: "Tỉ lệ chốt",
    kind: "percent",
    actual: (actual) => actual.closeRate,
    target: (target) => Number(target?.close_rate_target ?? 0),
  },
  {
    key: "average_order",
    label: "Trung bình đơn",
    kind: "money",
    actual: (actual) => actual.averageOrder,
    target: (target) => Number(target?.average_order_target ?? 0),
  },
];

export function formatKpiMetricValue(value: number | null | undefined, kind: KpiValueKind) {
  if (value == null || Number.isNaN(value)) return "—";
  if (kind === "money") return fmtVndDong(value);
  if (kind === "percent") return `${Math.round(value)}%`;
  if (kind === "ratio") return `${value.toFixed(2)}x`;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

export function metricProgress({
  actual,
  target,
  lowerIsBetter,
}: {
  actual: number | null | undefined;
  target: number | null | undefined;
  lowerIsBetter?: boolean;
}) {
  if (!target || target <= 0 || actual == null) return null;
  if (lowerIsBetter) {
    if (actual <= 0) return 100;
    return Math.round(Math.min(100, (target / actual) * 100));
  }
  return Math.round((actual / target) * 100);
}
