import type { ReportMetricTotals } from "@/lib/analytics";

export type KpiStatus = "none" | "done" | "near" | "low";

export function kpiPercent(actual: number, target: number) {
  if (!target || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

export function kpiStatus(percent: number | null): KpiStatus {
  if (percent == null) return "none";
  if (percent >= 100) return "done";
  if (percent >= 80) return "near";
  return "low";
}

export function kpiStatusLabel(status: KpiStatus) {
  const map: Record<KpiStatus, string> = {
    none: "Chưa đặt KPI",
    done: "Đạt",
    near: "Gần đạt",
    low: "Chưa đạt",
  };
  return map[status];
}

export function actualForMetric(metric: string, totals: ReportMetricTotals) {
  const map: Record<string, number> = {
    revenue_target: totals.total_revenue,
    ads_target: totals.ads_cost,
    data_target: totals.data_count,
    orders_target: totals.total_orders,
    mess_target: totals.mess_count,
  };
  return map[metric] ?? 0;
}
