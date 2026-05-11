import { supabase } from "@/integrations/supabase/client";

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
    ads_cost: 0, mess_count: 0, data_count: 0, closed_orders: 0,
    daily_data_revenue: 0, total_orders: 0, total_revenue: 0, recovered_revenue: 0,
    roas: null, conversion_rate: null,
    reportedCount: 0, missingCount: totalEmployees, totalEmployees,
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
 * "Latest" = highest report_slots.sort_order; tiebreak by submitted_at then updated_at.
 * Reports with status draft/rejected are returned but NOT counted in totals.
 */
export async function getLatestDailyReportPerEmployee(params: {
  teamIds: string[];
  date: string; // YYYY-MM-DD
}): Promise<{ rows: EmployeeLatest[]; slots: SlotMeta[] }> {
  const { teamIds, date } = params;
  if (!teamIds.length) return { rows: [], slots: [] };

  const [{ data: slots }, { data: memberships }, { data: reports }] = await Promise.all([
    supabase.from("report_slots").select("id, slot_name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("team_memberships").select("user_id, team_id").in("team_id", teamIds).eq("is_active", true),
    supabase.from("slot_reports").select("*").in("team_id", teamIds).eq("report_date", date),
  ]);

  const slotMeta = (slots ?? []) as SlotMeta[];
  const slotById = new Map(slotMeta.map((s) => [s.id, s]));
  const slot21 = slotMeta.find((s) => /21/.test(s.slot_name)) ?? slotMeta[slotMeta.length - 1];

  const userIds = Array.from(new Set((memberships ?? []).map((m) => m.user_id)));
  const teamByUser = new Map((memberships ?? []).map((m) => [m.user_id, m.team_id]));

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, username").in("id", userIds)
    : { data: [] as { id: string; full_name: string; username: string }[] };

  // Group reports by user, pick the "latest"
  const reportsByUser = new Map<string, typeof reports>();
  for (const r of reports ?? []) {
    const arr = reportsByUser.get(r.user_id) ?? [];
    arr.push(r);
    reportsByUser.set(r.user_id, arr);
  }
  const pickLatest = (arr: NonNullable<typeof reports>) => {
    return [...arr].sort((a, b) => {
      const sa = slotById.get(a.slot_id)?.sort_order ?? 0;
      const sb = slotById.get(b.slot_id)?.sort_order ?? 0;
      if (sb !== sa) return sb - sa;
      const ta = new Date(a.submitted_at ?? a.updated_at).getTime();
      const tb = new Date(b.submitted_at ?? b.updated_at).getTime();
      return tb - ta;
    })[0];
  };

  const rows: EmployeeLatest[] = (profiles ?? []).map((p) => {
    const arr = reportsByUser.get(p.id) ?? [];
    const r = arr.length ? pickLatest(arr as NonNullable<typeof reports>) : null;
    const counted = !!r && COUNT_STATUSES.has(String(r.status));
    const has21 = arr.some(
      (x) => x.slot_id === slot21?.id && COUNT_STATUSES.has(String(x.status))
    );
    return {
      user_id: p.id,
      full_name: p.full_name,
      username: p.username,
      team_id: teamByUser.get(p.id) ?? "",
      report_id: r?.id ?? null,
      slot_id: r?.slot_id ?? null,
      slot_name: r ? slotById.get(r.slot_id)?.slot_name ?? null : null,
      status: r?.status ?? null,
      submitted_at: r?.submitted_at ?? null,
      updated_at: r?.updated_at ?? null,
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
    };
  });

  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
  return { rows, slots: slotMeta };
}

/** Returns team ids led by the given leader profile id */
export async function getLeaderTeamIds(leaderProfileId: string): Promise<string[]> {
  const { data } = await supabase.from("teams").select("id").eq("leader_id", leaderProfileId);
  return (data ?? []).map((t) => t.id);
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
