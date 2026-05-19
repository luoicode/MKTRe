import { supabase } from "@/integrations/supabase/client";
import { normalizeDateRange } from "@/lib/dateRange";

export interface ReportMetricTotals {
  ads_cost: number;
  mess_count: number;
  data_count: number;
  closed_orders: number;
  daily_data_revenue: number;
  total_orders: number;
  total_revenue: number;
}

export interface DailyMetric extends ReportMetricTotals {
  date: string;
}

type RawVisibleReportRow = {
  report_date: string;
  team_id: string | null;
  user_id: string;
  slot_id: string | null;
  ads_cost: number | string | null;
  mess_count: number | string | null;
  data_count: number | string | null;
  closed_orders: number | string | null;
  daily_data_revenue: number | string | null;
  total_orders: number | string | null;
  total_revenue: number | string | null;
  status: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type VisibleReportRow = {
  report_date: string;
  team_id: string | null;
  user_id: string;
  slot_id: string | null;
  status: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  created_at: string | null;
} & ReportMetricTotals;

type SlotOrderRow = {
  id: string;
  sort_order: number | null;
};

export const emptyMetricTotals = (): ReportMetricTotals => ({
  ads_cost: 0,
  mess_count: 0,
  data_count: 0,
  closed_orders: 0,
  daily_data_revenue: 0,
  total_orders: 0,
  total_revenue: 0,
});

export function sumReportMetrics(rows: Partial<ReportMetricTotals>[]): ReportMetricTotals {
  return rows.reduce<ReportMetricTotals>((acc, row) => {
    acc.ads_cost += Number(row.ads_cost ?? 0);
    acc.mess_count += Number(row.mess_count ?? 0);
    acc.data_count += Number(row.data_count ?? 0);
    acc.closed_orders += Number(row.closed_orders ?? 0);
    acc.daily_data_revenue += Number(row.daily_data_revenue ?? 0);
    acc.total_orders += Number(row.total_orders ?? 0);
    acc.total_revenue += Number(row.total_revenue ?? 0);
    return acc;
  }, emptyMetricTotals());
}

export function deriveRates(totals: ReportMetricTotals) {
  return {
    conversion_rate:
      totals.data_count > 0 ? (totals.closed_orders / totals.data_count) * 100 : null,
    cp_mess: totals.mess_count > 0 ? totals.ads_cost / totals.mess_count : null,
    cp_data: totals.data_count > 0 ? totals.ads_cost / totals.data_count : null,
    avg_order: totals.closed_orders > 0 ? totals.daily_data_revenue / totals.closed_orders : null,
    cp_daily_revenue:
      totals.daily_data_revenue > 0 ? (totals.ads_cost / totals.daily_data_revenue) * 100 : null,
    cp_revenue: totals.total_revenue > 0 ? (totals.ads_cost / totals.total_revenue) * 100 : null,
    roas: totals.ads_cost > 0 ? totals.total_revenue / totals.ads_cost : null,
  };
}

export function groupMetricsByDate(
  rows: ({ report_date: string } & Partial<ReportMetricTotals>)[],
) {
  const map = new Map<string, DailyMetric>();
  for (const row of rows) {
    const current = map.get(row.report_date) ?? { date: row.report_date, ...emptyMetricTotals() };
    current.ads_cost += Number(row.ads_cost ?? 0);
    current.mess_count += Number(row.mess_count ?? 0);
    current.data_count += Number(row.data_count ?? 0);
    current.closed_orders += Number(row.closed_orders ?? 0);
    current.daily_data_revenue += Number(row.daily_data_revenue ?? 0);
    current.total_orders += Number(row.total_orders ?? 0);
    current.total_revenue += Number(row.total_revenue ?? 0);
    map.set(row.report_date, current);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getVisibleReports(params: {
  from: string;
  to: string;
  teamIds?: string[];
  userId?: string;
}) {
  const range = normalizeDateRange({ preset: "custom", from: params.from, to: params.to });
  const [{ data: slots, error: slotsError }, reportsResult] = await Promise.all([
    supabase.from("report_slots").select("id, sort_order"),
    buildVisibleReportsQuery({
      from: range.from,
      to: range.to,
      teamIds: params.teamIds,
      userId: params.userId,
    }),
  ]);

  if (slotsError) throw slotsError;
  if (reportsResult.error) throw reportsResult.error;

  const slotOrder = new Map(
    ((slots ?? []) as SlotOrderRow[]).map((slot) => [slot.id, Number(slot.sort_order ?? 0)]),
  );
  const latestByUserDate = new Map<string, RawVisibleReportRow>();

  for (const report of (reportsResult.data ?? []) as RawVisibleReportRow[]) {
    const key = `${report.user_id}:${report.report_date}`;
    const current = latestByUserDate.get(key);
    if (!current || compareReportRecency(report, current, slotOrder) > 0) {
      latestByUserDate.set(key, report);
    }
  }

  return Array.from(latestByUserDate.values()).map(normalizeVisibleReportRow);
}

function buildVisibleReportsQuery(params: {
  from: string;
  to: string;
  teamIds?: string[];
  userId?: string;
}) {
  let q = supabase
    .from("slot_reports")
    .select(
      "report_date, team_id, user_id, slot_id, ads_cost, mess_count, data_count, closed_orders, daily_data_revenue, total_orders, total_revenue, status, submitted_at, updated_at, created_at",
    )
    .gte("report_date", params.from)
    .lte("report_date", params.to)
    .in("status", ["submitted", "approved"]);

  if (params.teamIds?.length) q = q.in("team_id", params.teamIds);
  if (params.userId) q = q.eq("user_id", params.userId);
  return q;
}

function compareReportRecency(
  a: RawVisibleReportRow,
  b: RawVisibleReportRow,
  slotOrder: Map<string, number>,
) {
  const aTime = reportRecencyTime(a);
  const bTime = reportRecencyTime(b);
  if (aTime !== bTime) return aTime - bTime;

  const aSlot = a.slot_id ? (slotOrder.get(a.slot_id) ?? 0) : 0;
  const bSlot = b.slot_id ? (slotOrder.get(b.slot_id) ?? 0) : 0;
  return aSlot - bSlot;
}

function normalizeVisibleReportRow(row: RawVisibleReportRow): VisibleReportRow {
  return {
    report_date: row.report_date,
    team_id: row.team_id,
    user_id: row.user_id,
    slot_id: row.slot_id,
    status: row.status,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    created_at: row.created_at,
    ads_cost: Number(row.ads_cost ?? 0),
    mess_count: Number(row.mess_count ?? 0),
    data_count: Number(row.data_count ?? 0),
    closed_orders: Number(row.closed_orders ?? 0),
    daily_data_revenue: Number(row.daily_data_revenue ?? 0),
    total_orders: Number(row.total_orders ?? 0),
    total_revenue: Number(row.total_revenue ?? 0),
  };
}

function reportRecencyTime(
  row: Pick<RawVisibleReportRow, "submitted_at" | "updated_at" | "created_at">,
) {
  return new Date(row.submitted_at ?? row.updated_at ?? row.created_at ?? 0).getTime();
}

export function monthRange(date = new Date()) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}
