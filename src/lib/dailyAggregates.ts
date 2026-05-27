import { supabase } from "@/integrations/supabase/client";
import { getReconciledReportIds } from "@/lib/reportAudit";
import { MARKETING_ROLES } from "@/lib/roles";

export interface SlotMeta {
  id: string;
  slot_name: string;
  sort_order: number;
}

export interface EmployeeLatest {
  user_id: string;
  full_name: string;
  username: string;
  team_id: string;
  // latest report (only counted if status submitted/approved). may be null when no report
  report_id: string | null;
  slot_id: string | null;
  slot_name: string | null;
  status: string | null; // 'submitted' | 'approved' | 'draft' | 'rejected' | null
  submitted_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  ads_cost: number;
  mess_count: number;
  data_count: number;
  closed_orders: number;
  daily_data_revenue: number;
  total_orders: number;
  total_revenue: number;
  recovered_revenue: number;
  roas: number | null;
  conversion_rate: number | null;
  note: string | null;
  hasReport: boolean;
  countedInTotal: boolean; // submitted or approved
  has_21h: boolean;
  was_reconciled: boolean;
}

export interface TeamTotals {
  ads_cost: number;
  mess_count: number;
  data_count: number;
  closed_orders: number;
  daily_data_revenue: number;
  total_orders: number;
  total_revenue: number;
  recovered_revenue: number;
  roas: number | null;
  conversion_rate: number | null; // percentage value
  reportedCount: number;
  missingCount: number;
  totalEmployees: number;
}

const COUNT_STATUSES = new Set(["submitted", "approved"]);

export function emptyTotals(totalEmployees = 0): TeamTotals {
  return {
    ads_cost: 0,
    mess_count: 0,
    data_count: 0,
    closed_orders: 0,
    daily_data_revenue: 0,
    total_orders: 0,
    total_revenue: 0,
    recovered_revenue: 0,
    roas: null,
    conversion_rate: null,
    reportedCount: 0,
    missingCount: totalEmployees,
    totalEmployees,
  };
}

export function sumTotals(rows: EmployeeLatest[]): TeamTotals {
  const t = emptyTotals(rows.length);
  for (const r of rows) {
    if (r.countedInTotal) {
      t.ads_cost += Number(r.ads_cost) || 0;
      t.mess_count += Number(r.mess_count) || 0;
      t.data_count += Number(r.data_count) || 0;
      t.closed_orders += Number(r.closed_orders) || 0;
      t.daily_data_revenue += Number(r.daily_data_revenue) || 0;
      t.total_orders += Number(r.total_orders) || 0;
      t.total_revenue += Number(r.total_revenue) || 0;
      t.recovered_revenue += Number(r.recovered_revenue) || 0;
      t.reportedCount += 1;
    }
  }
  t.missingCount = t.totalEmployees - t.reportedCount;
  t.roas = t.ads_cost > 0 ? t.total_revenue / t.ads_cost : null;
  t.conversion_rate = t.data_count > 0 ? (t.closed_orders / t.data_count) * 100 : null;
  return t;
}

/**
 * For each active employee in the given teams, returns their LATEST report on that date.
 * "Latest" = newest real submission/update time; tiebreak by slot order.
 * This lets the 13h55 reconciliation submitted today win over yesterday's 21h00
 * row while still keeping report_date as yesterday.
 * Reports with status draft/rejected are returned but NOT counted in totals.
 */
export async function getLatestDailyReportPerEmployee(params: {
  teamIds: string[];
  date: string; // YYYY-MM-DD
  includeInactive?: boolean;
}): Promise<{ rows: EmployeeLatest[]; slots: SlotMeta[] }> {
  const { teamIds, date, includeInactive = false } = params;
  if (!teamIds.length) return { rows: [], slots: [] };

  const [{ data: slots }, { data: memberships }] = await Promise.all([
    supabase
      .from("report_slots")
      .select("id, slot_name, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("team_memberships")
      .select("user_id, team_id")
      .in("team_id", teamIds)
      .eq("is_active", true),
  ]);

  const slotMeta = (slots ?? []) as SlotMeta[];
  const slotById = new Map(slotMeta.map((s) => [s.id, s]));
  const slot21 = slotMeta.find((s) => /21/.test(s.slot_name)) ?? slotMeta[slotMeta.length - 1];
  const membershipRows = memberships ?? [];
  const rawUserIds = Array.from(new Set(membershipRows.map((m) => m.user_id)));
  const { data: marketingRoles } = rawUserIds.length
    ? await supabase
        .from("user_roles")
        .select("user_id")
        .in("user_id", rawUserIds)
        .in("role", [...MARKETING_ROLES])
    : { data: [] as { user_id: string }[] };
  const marketingUserIdSet = new Set((marketingRoles ?? []).map((role) => role.user_id));
  const userIds = rawUserIds.filter((userId) => marketingUserIdSet.has(userId));
  const teamByUser = new Map(
    membershipRows
      .filter((membership) => marketingUserIdSet.has(membership.user_id))
      .map((m) => [m.user_id, m.team_id]),
  );

  const reportFilters = [`team_id.in.(${teamIds.join(",")})`];
  if (userIds.length) reportFilters.push(`user_id.in.(${userIds.join(",")})`);
  const { data: reports, error: reportsError } = await supabase
    .from("slot_reports")
    .select("*")
    .eq("report_date", date)
    .or(reportFilters.join(","));
  if (reportsError) throw reportsError;

  const reconciledReportIds = await getReconciledReportIds((reports ?? []).map((r) => r.id));

  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, username, status")
        .in("id", userIds)
        .in("status", includeInactive ? ["active", "inactive"] : ["active"])
    : { data: [] as { id: string; full_name: string; username: string; status: string }[] };

  // Group reports by user, pick the "latest"
  const reportsByUser = new Map<string, typeof reports>();
  for (const r of reports ?? []) {
    const arr = reportsByUser.get(r.user_id) ?? [];
    arr.push(r);
    reportsByUser.set(r.user_id, arr);
  }
  const pickLatest = (arr: NonNullable<typeof reports>) => {
    return [...arr].sort((a, b) => {
      const ta = reportRowTime(a);
      const tb = reportRowTime(b);
      if (tb !== ta) return tb - ta;
      const sa = slotById.get(a.slot_id)?.sort_order ?? 0;
      const sb = slotById.get(b.slot_id)?.sort_order ?? 0;
      return sb - sa;
    })[0];
  };

  const rows: EmployeeLatest[] = (profiles ?? []).map((p) => {
    const arr = reportsByUser.get(p.id) ?? [];
    const r = arr.length ? pickLatest(arr as NonNullable<typeof reports>) : null;
    const counted = !!r && COUNT_STATUSES.has(String(r.status));
    const has21 = arr.some((x) => x.slot_id === slot21?.id && COUNT_STATUSES.has(String(x.status)));
    return {
      user_id: p.id,
      full_name: p.full_name,
      username: p.username,
      team_id: teamByUser.get(p.id) ?? "",
      report_id: r?.id ?? null,
      slot_id: r?.slot_id ?? null,
      slot_name: r ? (slotById.get(r.slot_id)?.slot_name ?? null) : null,
      status: r?.status ?? null,
      submitted_at: r?.submitted_at ?? null,
      updated_at: r?.updated_at ?? null,
      created_at: r?.created_at ?? null,
      ads_cost: Number(r?.ads_cost ?? 0),
      mess_count: Number(r?.mess_count ?? 0),
      data_count: Number(r?.data_count ?? 0),
      closed_orders: Number(r?.closed_orders ?? 0),
      daily_data_revenue: Number(r?.daily_data_revenue ?? 0),
      total_orders: Number(r?.total_orders ?? 0),
      total_revenue: Number(r?.total_revenue ?? 0),
      recovered_revenue: Number(r?.recovered_revenue ?? 0),
      roas: r?.roas != null ? Number(r.roas) : null,
      conversion_rate: r?.conversion_rate != null ? Number(r.conversion_rate) : null,
      note: r?.note ?? null,
      hasReport: !!r,
      countedInTotal: counted,
      has_21h: has21,
      was_reconciled: !!r && reconciledReportIds.has(r.id),
    };
  });

  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
  return { rows, slots: slotMeta };
}

export async function getLatestDailyReportPerEmployeeRange(params: {
  teamIds: string[];
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  includeInactive?: boolean;
}): Promise<{ rows: EmployeeLatest[]; slots: SlotMeta[] }> {
  const from = params.from <= params.to ? params.from : params.to;
  const to = params.from <= params.to ? params.to : params.from;
  if (from === to)
    return getLatestDailyReportPerEmployee({
      teamIds: params.teamIds,
      date: from,
      includeInactive: params.includeInactive,
    });

  const rowsByUser = new Map<string, EmployeeLatest>();
  let slots: SlotMeta[] = [];

  for (const date of enumerateDates(from, to)) {
    const daily = await getLatestDailyReportPerEmployee({
      teamIds: params.teamIds,
      date,
      includeInactive: params.includeInactive,
    });
    if (!slots.length) slots = daily.slots;

    for (const row of daily.rows) {
      const current = rowsByUser.get(row.user_id) ?? emptyEmployeeRangeRow(row);
      current.hasReport = current.hasReport || row.hasReport;
      current.countedInTotal = current.countedInTotal || row.countedInTotal;
      current.has_21h = current.has_21h || row.has_21h;
      current.was_reconciled = current.was_reconciled || row.was_reconciled;

      if (row.countedInTotal) {
        current.ads_cost += Number(row.ads_cost) || 0;
        current.mess_count += Number(row.mess_count) || 0;
        current.data_count += Number(row.data_count) || 0;
        current.closed_orders += Number(row.closed_orders) || 0;
        current.daily_data_revenue += Number(row.daily_data_revenue) || 0;
        current.total_orders += Number(row.total_orders) || 0;
        current.total_revenue += Number(row.total_revenue) || 0;
        current.recovered_revenue += Number(row.recovered_revenue) || 0;
      }

      if (row.hasReport && reportTime(row) >= reportTime(current)) {
        current.report_id = row.report_id;
        current.slot_id = row.slot_id;
        current.slot_name = row.slot_name;
        current.status = row.status;
        current.submitted_at = row.submitted_at;
        current.updated_at = row.updated_at;
        current.created_at = row.created_at;
        current.note = row.note;
      }

      current.roas = current.ads_cost > 0 ? current.total_revenue / current.ads_cost : null;
      current.conversion_rate =
        current.data_count > 0 ? (current.closed_orders / current.data_count) * 100 : null;
      rowsByUser.set(row.user_id, current);
    }
  }

  const rows = Array.from(rowsByUser.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "vi"),
  );
  return { rows, slots };
}

function emptyEmployeeRangeRow(row: EmployeeLatest): EmployeeLatest {
  return {
    ...row,
    report_id: null,
    slot_id: null,
    slot_name: null,
    status: null,
    submitted_at: null,
    updated_at: null,
    created_at: null,
    ads_cost: 0,
    mess_count: 0,
    data_count: 0,
    closed_orders: 0,
    daily_data_revenue: 0,
    total_orders: 0,
    total_revenue: 0,
    recovered_revenue: 0,
    roas: null,
    conversion_rate: null,
    note: null,
    hasReport: false,
    countedInTotal: false,
    has_21h: false,
    was_reconciled: false,
  };
}

function reportTime(row: Pick<EmployeeLatest, "submitted_at" | "updated_at" | "created_at">) {
  return new Date(row.submitted_at ?? row.updated_at ?? row.created_at ?? 0).getTime();
}

function reportRowTime(row: {
  submitted_at: string | null;
  updated_at: string;
  created_at: string;
}) {
  return new Date(row.submitted_at ?? row.updated_at ?? row.created_at ?? 0).getTime();
}

function enumerateDates(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns team ids led by the given leader profile id */
export async function getLeaderTeamIds(leaderProfileId: string): Promise<string[]> {
  const [{ data: membershipTeams }, { data: legacyTeams }] = await Promise.all([
    supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", leaderProfileId)
      .eq("is_active", true)
      .eq("role_in_team", "leader"),
    supabase.from("teams").select("id").eq("leader_id", leaderProfileId),
  ]);
  return Array.from(
    new Set([
      ...(membershipTeams ?? []).map((t) => t.team_id),
      ...(legacyTeams ?? []).map((t) => t.id),
    ]),
  );
}

/** Returns team ids assigned to a manager profile */
export async function getManagerTeamIds(managerProfileId: string): Promise<string[]> {
  const { data } = await supabase
    .from("manager_team_assignments")
    .select("team_id")
    .eq("manager_id", managerProfileId)
    .eq("is_active", true);
  return (data ?? []).map((t) => t.team_id);
}
