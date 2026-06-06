import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import {
  emptyMetricTotals,
  getVisibleReports,
  monthRange,
  sumReportMetrics,
  type ReportMetricTotals,
} from "@/lib/analytics";
import { kpiPercent, kpiStatus } from "@/lib/kpi";
import {
  distributeKpiTarget,
  getCurrentKpiPeriodSelection,
  getDbPeriodTypeFromMode,
  getKpiMonthRange,
  getKpiPeriodRange,
  getKpiWeekSegments,
  getKpiYearOptions,
  inferKpiPeriodSelection,
  type KpiPeriodMode,
} from "@/lib/kpiPeriod";
import { formatKpiMetricValue, marketingMetrics, metricProgress } from "@/lib/kpiMetrics";
import { fmtVndDong, formatDateVN } from "@/lib/reports";
import { APP_ROLES, MARKETING_ROLES } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageShell, ScrollArea } from "@/components/layout/PageShell";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";

type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "username" | "status">;
type KpiPeriod = Enums<"kpi_period">;
type KpiTargetRow = Tables<"kpi_targets">;
type MembershipRow = { user_id: string; team_id: string; role_in_team: OperationalRole | null };
type OperationalRole = "employee" | "leader";
type KpiRangePreset = "today" | "week" | "month" | "quarter" | "year" | "custom";

type KpiRangeState = {
  preset: KpiRangePreset;
  from: string;
  to: string;
};

type KpiTargetScope = "personal" | "team" | "system";

type KpiFormState = {
  target_scope: KpiTargetScope;
  team_id: string;
  user_id: string;
  period_type: KpiPeriod;
  period_start: string;
  period_end: string;
  period_mode: KpiPeriodMode;
  period_year: string;
  period_quarter: string;
  period_month: string;
  weekly_revenue_targets: Record<number, string>;
  revenue_target: string;
  cost_percent: string;
  data_target: string;
};

type MemberKpiRow = {
  user: ProfileRow;
  team?: TeamRow;
  role?: OperationalRole;
  kpi?: KpiTargetRow;
  target: number;
  actual: number;
  dataCount: number;
  costPerData: number | null;
  percent: number | null;
  status: "none" | "done" | "near" | "low";
};

function createDefaultForm(teamId = ""): KpiFormState {
  const selection = getCurrentKpiPeriodSelection();
  const range = getKpiPeriodRange(selection);
  return {
    target_scope: "personal",
    team_id: teamId,
    user_id: "",
    period_type: "month",
    period_start: range.from,
    period_end: range.to,
    period_mode: selection.mode,
    period_year: String(selection.year),
    period_quarter: String(selection.quarter),
    period_month: String(selection.month),
    weekly_revenue_targets: {},
    revenue_target: "",
    cost_percent: "",
    data_target: "",
  };
}

function kpiScopeMatches(a: KpiTargetRow, b: KpiTargetRow) {
  return (a.user_id ?? "") === (b.user_id ?? "") && (a.team_id ?? "") === (b.team_id ?? "");
}

function getKpiWeekIndex(kpi: KpiTargetRow) {
  const selection = inferKpiPeriodSelection(kpi.period_start, kpi.period_end, kpi.period_type);
  if (selection.mode !== "week") return null;
  const week = getKpiWeekSegments(selection.year, selection.month).find(
    (segment) => segment.from === kpi.period_start && segment.to === kpi.period_end,
  );
  return week?.index ?? null;
}

function getRelatedWeeklyKpis(kpi: KpiTargetRow, allKpis: KpiTargetRow[]) {
  const selection = inferKpiPeriodSelection(kpi.period_start, kpi.period_end, kpi.period_type);
  if (selection.mode !== "week") return [kpi];
  const monthRange = getKpiMonthRange(selection.year, selection.month);
  return allKpis.filter(
    (row) =>
      row.period_type === "week" &&
      kpiScopeMatches(row, kpi) &&
      row.period_start >= monthRange.from &&
      row.period_end <= monthRange.to,
  );
}

function createFormFromKpi(kpi: KpiTargetRow, relatedKpis: KpiTargetRow[] = [kpi]): KpiFormState {
  const revenueTarget = Number(kpi.revenue_target ?? 0);
  const adsTarget = Number(kpi.ads_target ?? 0);
  const costPercent =
    revenueTarget > 0 ? String(Math.round((adsTarget / revenueTarget) * 100)) : "";
  const selection = inferKpiPeriodSelection(kpi.period_start, kpi.period_end, kpi.period_type);
  const weeklyTargets =
    selection.mode === "week"
      ? Object.fromEntries(
          relatedKpis
            .map((row) => {
              const weekIndex = getKpiWeekIndex(row);
              return weekIndex
                ? ([weekIndex, formatVndInput(String(Number(row.revenue_target ?? 0)))] as const)
                : null;
            })
            .filter((row): row is readonly [number, string] => !!row),
        )
      : {};
  return {
    target_scope: isSystemStrategicKpi(kpi) ? "system" : kpi.user_id ? "personal" : "team",
    team_id: kpi.team_id ?? "",
    user_id: kpi.user_id ?? "",
    period_type: kpi.period_type,
    period_start: kpi.period_start,
    period_end: kpi.period_end,
    period_mode: selection.mode,
    period_year: String(selection.year),
    period_quarter: String(selection.quarter),
    period_month: String(selection.month),
    weekly_revenue_targets: weeklyTargets,
    revenue_target: revenueTarget ? formatVndInput(String(revenueTarget)) : "",
    cost_percent: costPercent,
    data_target: kpi.data_target ? formatVndInput(String(kpi.data_target)) : "",
  };
}

function parseNumberInput(value: string) {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

function withKpiPeriodRange(form: KpiFormState, patch: Partial<KpiFormState>): KpiFormState {
  const next = { ...form, ...patch };
  const selection = {
    mode: next.period_mode,
    year: Number(next.period_year) || new Date().getFullYear(),
    quarter: Number(next.period_quarter) || 1,
    month: Number(next.period_month) || 1,
  };
  const range = getKpiPeriodRange(selection);
  return {
    ...next,
    period_type: getDbPeriodTypeFromMode(selection.mode),
    period_start: range.from,
    period_end: range.to,
  };
}

function formatVndInput(value: string) {
  const numeric = value.replace(/[^\d]/g, "");
  if (!numeric) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(numeric));
}

function sanitizePercentInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [integer = "", ...decimalParts] = normalized.split(".");
  const decimal = decimalParts.join("");
  return decimalParts.length ? `${integer}.${decimal.slice(0, 2)}` : integer;
}

function createKpiRange(preset: KpiRangePreset = "month"): KpiRangeState {
  const today = new Date();
  if (preset === "custom") return { preset, ...monthRange(today) };
  return { preset, ...getKpiPresetRange(preset, today) };
}

function getKpiPresetRange(preset: Exclude<KpiRangePreset, "custom">, base = new Date()) {
  const year = base.getFullYear();
  const month = base.getMonth();
  if (preset === "today") {
    const today = formatLocalYmd(base);
    return { from: today, to: today };
  }
  if (preset === "week") {
    const day = base.getDay() || 7;
    return { from: formatLocalYmd(addDays(base, 1 - day)), to: formatLocalYmd(base) };
  }
  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return {
      from: formatLocalYmd(new Date(year, quarterStartMonth, 1)),
      to: formatLocalYmd(new Date(year, quarterStartMonth + 3, 0)),
    };
  }
  if (preset === "year") {
    return {
      from: formatLocalYmd(new Date(year, 0, 1)),
      to: formatLocalYmd(new Date(year, 11, 31)),
    };
  }
  return monthRange(base);
}

function formatLocalYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

type WeekSegment = {
  label: string;
  from: string;
  to: string;
};

function getWeekSegments(from: string, to: string): WeekSegment[] {
  const segments: WeekSegment[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  let index = 1;
  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    segments.push({
      label: `Tuần ${index}`,
      from: formatLocalYmd(weekStart),
      to: formatLocalYmd(weekEnd),
    });
    cursor.setTime(addDays(weekEnd, 1).getTime());
    index += 1;
  }
  return segments;
}

function findCurrentWeekSegment(from: string, to: string, base = new Date()) {
  const today = formatLocalYmd(base);
  return getWeekSegments(from, to).find((segment) => segment.from <= today && today <= segment.to);
}

function kpiOverlapsRange(kpi: KpiTargetRow, from: string, to: string) {
  return kpi.period_start <= to && kpi.period_end >= from;
}

function normalizeKpiRange(range: KpiRangeState) {
  if (range.from <= range.to) return range;
  return { ...range, from: range.to, to: range.from };
}

function exactMonthLabel(from: string, to: string) {
  const [year, month] = from.split("-").map(Number);
  if (!year || !month) return null;
  const expected = monthRange(new Date(year, month - 1, 1));
  return expected.from === from && expected.to === to ? `Tháng ${month}/${year}` : null;
}

function kpiRangeLabel(range: KpiRangeState) {
  const normalized = normalizeKpiRange(range);
  const exactMonth = exactMonthLabel(normalized.from, normalized.to);
  if (exactMonth) return exactMonth;
  const start = new Date(`${normalized.from}T00:00:00`);
  if (normalized.preset === "today") return `Ngày ${formatDateVN(normalized.from)}`;
  if (normalized.preset === "week") {
    return `Tuần ${formatDateVN(normalized.from)} - ${formatDateVN(normalized.to)}`;
  }
  if (normalized.preset === "quarter") {
    return `Quý ${Math.floor(start.getMonth() / 3) + 1}/${start.getFullYear()}`;
  }
  if (normalized.preset === "year") return `Năm ${start.getFullYear()}`;
  return `${formatDateVN(normalized.from)} - ${formatDateVN(normalized.to)}`;
}

function pickLatestKpi(rows: KpiTargetRow[]) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  })[0];
}

function getResolvedKpiRevenueTarget(kpi: KpiTargetRow | undefined, range: KpiRangeState) {
  if (!kpi) return 0;
  if (range.preset !== "week" || kpi.period_type === "week") return Number(kpi.revenue_target ?? 0);
  const selection = inferKpiPeriodSelection(kpi.period_start, kpi.period_end, kpi.period_type);
  if (selection.mode !== "month") return Number(kpi.revenue_target ?? 0);
  const weeks = getKpiWeekSegments(selection.year, selection.month);
  const weekIndex = weeks.findIndex((week) => range.from >= week.from && range.from <= week.to);
  const distributed = distributeKpiTarget(Number(kpi.revenue_target ?? 0), weeks.length);
  return weekIndex >= 0 ? (distributed[weekIndex] ?? 0) : Number(kpi.revenue_target ?? 0);
}

function isSystemStrategicKpi(kpi: KpiTargetRow) {
  return !kpi.user_id && !kpi.team_id;
}

function isPersonalKpi(kpi: KpiTargetRow) {
  return !!kpi.user_id;
}

function statusLabel(status: ReturnType<typeof kpiStatus>) {
  if (status === "done") return "Đã đạt KPI";
  if (status === "near") return "Gần đạt KPI";
  if (status === "none") return "Chưa có mục tiêu";
  return "Chưa đạt KPI";
}

function statusClass(status: ReturnType<typeof kpiStatus>) {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "near") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "none") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function KpiWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "admin" || role === "leader";
  const [createOpen, setCreateOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiTargetRow | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [periodRange, setPeriodRange] = useState<KpiRangeState>(() => createKpiRange("month"));
  const [teamFilter, setTeamFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [form, setForm] = useState<KpiFormState>(() => createDefaultForm());
  const currentPeriod = useMemo(() => normalizeKpiRange(periodRange), [periodRange]);
  const periodLabel = useMemo(() => kpiRangeLabel(currentPeriod), [currentPeriod]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["kpi-workspace", role, profile?.id, currentPeriod.from, currentPeriod.to],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") teamIds = await getManagerTeamIds(profile!.id);

      let teamsQuery = supabase
        .from("teams")
        .select("id, name")
        .or("department.is.null,department.eq.marketing")
        .order("name");
      if (teamIds?.length) teamsQuery = teamsQuery.in("id", teamIds);
      const { data: teams, error: teamsError } = await teamsQuery;
      if (teamsError) throw teamsError;
      const visibleTeamIds = (teams ?? []).map((team) => team.id);

      const memberships = visibleTeamIds.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id, role_in_team")
            .in("team_id", visibleTeamIds)
            .eq("is_active", true)
        : { data: [], error: null };
      if (memberships.error) throw memberships.error;

      const userIds = Array.from(
        new Set((memberships.data ?? []).map((m: { user_id: string }) => m.user_id)),
      );
      if (
        profile?.id &&
        (role === APP_ROLES.MARKETING_EMPLOYEE || role === APP_ROLES.MARKETING_LEADER) &&
        !userIds.includes(profile.id)
      ) {
        userIds.push(profile.id);
      }

      const { data: operationalRoles, error: rolesError } = userIds.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [], error: null };
      if (rolesError) throw rolesError;

      const explicitRoleByUserId = new Map(
        (operationalRoles ?? []).map((row) => [row.user_id, row.role as string]),
      );
      const marketingRoleSet = new Set<string>(MARKETING_ROLES);
      const operationalRoleByUserId = new Map<string, OperationalRole>();
      for (const row of operationalRoles ?? []) {
        if (marketingRoleSet.has(row.role)) {
          operationalRoleByUserId.set(row.user_id, row.role as OperationalRole);
        }
      }
      for (const membership of memberships.data ?? []) {
        if (
          !explicitRoleByUserId.has(membership.user_id) &&
          !operationalRoleByUserId.has(membership.user_id) &&
          (membership.role_in_team === "employee" || membership.role_in_team === "leader")
        ) {
          operationalRoleByUserId.set(membership.user_id, membership.role_in_team);
        }
      }
      const operationalUserIds = userIds.filter((userId) => operationalRoleByUserId.has(userId));

      const { data: users, error: usersError } = operationalUserIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, status")
            .in("id", operationalUserIds)
            .eq("status", "active")
            .order("full_name")
        : { data: [], error: null };
      if (usersError) throw usersError;
      const visibleUsers = users ?? [];
      const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
      for (const userId of Array.from(operationalRoleByUserId.keys())) {
        if (!visibleUserIds.has(userId)) operationalRoleByUserId.delete(userId);
      }
      const activeMarketingUserIds = new Set(Array.from(operationalRoleByUserId.keys()));

      const { data: kpis, error: kpisError } = await supabase
        .from("kpi_targets")
        .select("*")
        .lte("period_start", currentPeriod.to)
        .gte("period_end", currentPeriod.from)
        .order("updated_at", { ascending: false });
      if (kpisError) throw kpisError;
      const scopedKpis = ((kpis ?? []) as KpiTargetRow[]).filter((kpi) => {
        if (kpi.user_id) return activeMarketingUserIds.has(kpi.user_id);
        if (kpi.team_id) return visibleTeamIds.includes(kpi.team_id);
        return role === "admin";
      });

      const personalReports =
        (role === "employee" || role === "leader") && activeMarketingUserIds.has(profile!.id)
          ? await getVisibleReports({
              from: currentPeriod.from,
              to: currentPeriod.to,
              userId: profile!.id,
            })
          : [];

      const scopedTeamIds =
        role === "admin" || visibleTeamIds.length || role === "leader" || role === "manager"
          ? visibleTeamIds
          : undefined;
      const rawTeamReports =
        role === "admin"
          ? scopedTeamIds?.length
            ? await getVisibleReports({
                from: currentPeriod.from,
                to: currentPeriod.to,
                teamIds: scopedTeamIds,
              })
            : []
          : scopedTeamIds?.length
            ? await getVisibleReports({
                from: currentPeriod.from,
                to: currentPeriod.to,
                teamIds: scopedTeamIds,
              })
            : [];
      const teamReports = rawTeamReports.filter(
        (report) =>
          activeMarketingUserIds.has(report.user_id) &&
          (!report.team_id || visibleTeamIds.includes(report.team_id)),
      );

      return {
        teams: teams ?? [],
        users: visibleUsers as ProfileRow[],
        operationalRoleByUserId,
        kpis: scopedKpis,
        memberships: (memberships.data ?? []) as MembershipRow[],
        teamIds: visibleTeamIds,
        personalActual: sumReportMetrics(personalReports),
        teamReports,
        teamActual: sumReportMetrics(teamReports),
      };
    },
  });

  useEffect(() => {
    if (role !== "leader" || form.team_id || !data?.teams.length) return;
    setForm((current) => ({ ...current, team_id: data.teams[0].id }));
  }, [data?.teams, form.team_id, role]);

  const personalKpis = useMemo(
    () => (data?.kpis ?? []).filter((kpi) => kpi.user_id === profile?.id),
    [data?.kpis, profile?.id],
  );
  const personalKpi = useMemo(() => pickLatestKpi(personalKpis), [personalKpis]);
  const systemStrategicKpis = useMemo(
    () => (data?.kpis ?? []).filter(isSystemStrategicKpi),
    [data?.kpis],
  );
  const systemStrategicKpi = useMemo(
    () => pickLatestKpi(systemStrategicKpis),
    [systemStrategicKpis],
  );

  const filteredTeamReports = useMemo(() => {
    if (teamFilter === "all") return data?.teamReports ?? [];
    return (data?.teamReports ?? []).filter((report) => report.team_id === teamFilter);
  }, [data?.teamReports, teamFilter]);
  const filteredTeamActual = useMemo(
    () => sumReportMetrics(filteredTeamReports),
    [filteredTeamReports],
  );
  const teamSummaryName =
    teamFilter === "all"
      ? role === "admin"
        ? "Toàn hệ thống từ KPI cá nhân"
        : data?.teams.map((team) => team.name).join(", ") || "Team"
      : data?.teams.find((team) => team.id === teamFilter)?.name || "Team";

  const autoTeamTarget = useMemo(() => {
    if (!data) return 0;
    const teamById = new Map((data.teams ?? []).map((team) => [team.id, team]));
    const teamByUserId = new Map(
      (data.memberships ?? []).map((membership) => [
        membership.user_id,
        teamById.get(membership.team_id),
      ]),
    );
    const targetUsers = data.users.filter(
      (user) => teamFilter === "all" || teamByUserId.get(user.id)?.id === teamFilter,
    );
    return targetUsers.reduce((sum, user) => {
      const personalKpi = pickLatestKpi(
        (data.kpis ?? []).filter((row) => row.user_id === user.id && isPersonalKpi(row)),
      );
      return sum + getResolvedKpiRevenueTarget(personalKpi, currentPeriod);
    }, 0);
  }, [currentPeriod, data, teamFilter]);
  const manualTeamTarget = useMemo(() => {
    if (!data) return undefined;
    const targetTeamIds =
      teamFilter === "all" ? new Set(data.teamIds) : new Set<string>([teamFilter]);
    return pickLatestKpi(
      data.kpis.filter((row) => !row.user_id && row.team_id && targetTeamIds.has(row.team_id)),
    );
  }, [data, teamFilter]);
  const displayedTeamTarget = Number(manualTeamTarget?.revenue_target ?? 0) || autoTeamTarget;

  const memberRows = useMemo<MemberKpiRow[]>(() => {
    const actualByUser = new Map<string, ReportMetricTotals>();
    for (const report of data?.teamReports ?? []) {
      const current = actualByUser.get(report.user_id) ?? emptyMetricTotals();
      actualByUser.set(report.user_id, sumReportMetrics([current, report]));
    }
    const teamById = new Map((data?.teams ?? []).map((team) => [team.id, team]));
    const teamByUserId = new Map(
      (data?.memberships ?? []).map((membership) => [
        membership.user_id,
        teamById.get(membership.team_id),
      ]),
    );
    return (data?.users ?? [])
      .filter(
        (user) =>
          (teamFilter === "all" || teamByUserId.get(user.id)?.id === teamFilter) &&
          (userFilter === "all" || user.id === userFilter) &&
          (!memberSearch || user.full_name.toLowerCase().includes(memberSearch.toLowerCase())),
      )
      .map((user) => {
        const kpi = pickLatestKpi((data?.kpis ?? []).filter((row) => row.user_id === user.id));
        const target = getResolvedKpiRevenueTarget(kpi, currentPeriod);
        const actualTotals = actualByUser.get(user.id) ?? emptyMetricTotals();
        const actual = actualTotals.total_revenue;
        const percent = kpiPercent(actual, target);
        return {
          user,
          team: teamByUserId.get(user.id),
          role: data?.operationalRoleByUserId.get(user.id),
          kpi,
          target,
          actual,
          dataCount: actualTotals.data_count,
          costPerData:
            actualTotals.data_count > 0 ? actualTotals.ads_cost / actualTotals.data_count : null,
          percent,
          status: kpiStatus(percent),
        };
      });
  }, [
    data?.kpis,
    data?.memberships,
    data?.operationalRoleByUserId,
    data?.teamReports,
    data?.teams,
    data?.users,
    currentPeriod,
    memberSearch,
    teamFilter,
    userFilter,
  ]);

  const totalPersonalTarget = useMemo(() => {
    if (!data) return 0;
    const teamById = new Map((data.teams ?? []).map((team) => [team.id, team]));
    const teamByUserId = new Map(
      (data.memberships ?? []).map((membership) => [
        membership.user_id,
        teamById.get(membership.team_id),
      ]),
    );
    return data.users
      .filter(
        (user) =>
          (teamFilter === "all" || teamByUserId.get(user.id)?.id === teamFilter) &&
          (userFilter === "all" || user.id === userFilter),
      )
      .reduce((sum, user) => {
        const kpi = pickLatestKpi(data.kpis.filter((row) => row.user_id === user.id));
        return sum + getResolvedKpiRevenueTarget(kpi, currentPeriod);
      }, 0);
  }, [currentPeriod, data, teamFilter, userFilter]);

  const usersForFilter = useMemo(() => {
    if (teamFilter === "all") return data?.users ?? [];
    const teamUserIds = new Set(
      (data?.memberships ?? [])
        .filter((membership) => membership.team_id === teamFilter)
        .map((membership) => membership.user_id),
    );
    return (data?.users ?? []).filter((user) => teamUserIds.has(user.id));
  }, [data?.memberships, data?.users, teamFilter]);

  const usersForForm = useMemo(() => {
    if (form.target_scope === "system") return [];
    if (!form.team_id) return data?.users ?? [];
    const teamUserIds = new Set(
      (data?.memberships ?? [])
        .filter((membership) => membership.team_id === form.team_id)
        .map((membership) => membership.user_id),
    );
    return (data?.users ?? []).filter((user) => teamUserIds.has(user.id));
  }, [data?.memberships, data?.users, form.target_scope, form.team_id]);

  const showScopeFilters = role === "admin" || role === "manager";

  const openCreateDialog = (targetScope: KpiTargetScope = "personal") => {
    setEditingKpi(null);
    const defaultForm = createDefaultForm(role === "leader" ? (data?.teams[0]?.id ?? "") : "");
    setForm(
      targetScope === "system"
        ? { ...defaultForm, target_scope: "system", team_id: "", user_id: "" }
        : targetScope === "team"
          ? { ...defaultForm, target_scope: "team", user_id: "" }
          : defaultForm,
    );
    setCreateOpen(true);
  };

  const openCreateForUser = (userId: string) => {
    const teamId =
      data?.memberships.find((membership) => membership.user_id === userId)?.team_id ??
      data?.teams[0]?.id ??
      "";
    setEditingKpi(null);
    setForm({ ...createDefaultForm(teamId), target_scope: "personal", user_id: userId });
    setCreateOpen(true);
  };

  const openEditDialog = (kpi: KpiTargetRow) => {
    const relatedWeeklyKpis = getRelatedWeeklyKpis(kpi, data?.kpis ?? []);
    setEditingKpi(kpi);
    setForm(createFormFromKpi(kpi, relatedWeeklyKpis));
    setCreateOpen(true);
  };

  const closeKpiDialog = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setEditingKpi(null);
      setForm(createDefaultForm(role === "leader" ? (data?.teams[0]?.id ?? "") : ""));
    }
  };

  const save = async () => {
    const periodForm = withKpiPeriodRange(form, {});
    if (form.target_scope === "system" && role !== "admin") {
      toast.error("Chỉ Admin được tạo KPI toàn hệ thống");
      return;
    }
    if (form.target_scope === "team" && !form.team_id) {
      toast.error("Chọn team cần tạo KPI");
      return;
    }
    if (form.target_scope === "personal" && !form.user_id) {
      toast.error("Chọn nhân sự cần tạo KPI");
      return;
    }
    if (role === "leader" && form.team_id && !data?.teamIds.includes(form.team_id)) {
      toast.error("Leader chỉ được tạo KPI trong team mình phụ trách");
      return;
    }
    const revenueTarget = parseNumberInput(form.revenue_target);
    const costPercent = Number(form.cost_percent || 0);
    const adsTarget = Math.round((revenueTarget * costPercent) / 100);
    const buildPayload = (
      periodStart = periodForm.period_start,
      periodEnd = periodForm.period_end,
      periodType = periodForm.period_type,
      target = revenueTarget,
    ): TablesInsert<"kpi_targets"> => ({
      team_id: periodForm.target_scope === "system" ? null : periodForm.team_id || null,
      user_id: periodForm.target_scope === "personal" ? periodForm.user_id : null,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
      revenue_target: target,
      ads_target: Math.round((target * costPercent) / 100),
      mess_target: 0,
      data_target: parseNumberInput(periodForm.data_target),
      orders_target: 0,
      roas_target: 0,
      note: null,
    });
    let error: Error | null = null;
    if (editingKpi && periodForm.period_mode === "week") {
      const weeks = getKpiWeekSegments(
        Number(periodForm.period_year),
        Number(periodForm.period_month),
      );
      const relatedWeeklyKpis = getRelatedWeeklyKpis(editingKpi, data?.kpis ?? []);
      const existingByWeek = new Map(
        relatedWeeklyKpis
          .map((row) => {
            const weekIndex = getKpiWeekIndex(row);
            return weekIndex ? ([weekIndex, row] as const) : null;
          })
          .filter((row): row is readonly [number, KpiTargetRow] => !!row),
      );
      for (const week of weeks) {
        const target = parseNumberInput(periodForm.weekly_revenue_targets[week.index] ?? "");
        const existing = existingByWeek.get(week.index);
        if (existing) {
          const updatePayload: TablesUpdate<"kpi_targets"> = {
            ...buildPayload(week.from, week.to, "week", target),
            revenue_target: target,
            updated_at: new Date().toISOString(),
          };
          const result = await supabase
            .from("kpi_targets")
            .update(updatePayload)
            .eq("id", existing.id);
          if (result.error) {
            error = result.error;
            break;
          }
        } else if (target > 0) {
          const result = await supabase.from("kpi_targets").insert({
            ...buildPayload(week.from, week.to, "week", target),
            revenue_target: target,
            created_by: profile?.id ?? null,
          });
          if (result.error) {
            error = result.error;
            break;
          }
        }
      }
    } else if (editingKpi) {
      const updatePayload: TablesUpdate<"kpi_targets"> = {
        ...buildPayload(),
        updated_at: new Date().toISOString(),
      };
      const result = await supabase
        .from("kpi_targets")
        .update(updatePayload)
        .eq("id", editingKpi.id);
      error = result.error;
    } else if (periodForm.period_mode === "week") {
      const weeks = getKpiWeekSegments(
        Number(periodForm.period_year),
        Number(periodForm.period_month),
      );
      const rows = weeks
        .map((week) => ({
          week,
          target: parseNumberInput(periodForm.weekly_revenue_targets[week.index] ?? ""),
        }))
        .filter((row) => row.target > 0)
        .map(({ week, target }) => ({
          ...buildPayload(week.from, week.to, "week", target),
          revenue_target: target,
          created_by: profile?.id ?? null,
        }));
      if (!rows.length) {
        toast.error("Nhập KPI cho ít nhất một tuần");
        return;
      }
      const result = await supabase.from("kpi_targets").insert(rows);
      error = result.error;
    } else {
      const result = await supabase
        .from("kpi_targets")
        .insert({ ...buildPayload(), created_by: profile?.id ?? null });
      error = result.error;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingKpi ? "Đã cập nhật KPI" : "Đã tạo KPI");
    closeKpiDialog(false);
    qc.invalidateQueries({ queryKey: ["kpi-workspace"] });
  };

  const personalPercent = kpiPercent(
    data?.personalActual.total_revenue ?? 0,
    getResolvedKpiRevenueTarget(personalKpi, currentPeriod),
  );
  const personalStatus = kpiStatus(personalPercent);
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <PageShell>
      <WorkspacePageHeader
        title={role === "employee" || role === "leader" ? "KPI Marketing cá nhân" : "KPI Marketing"}
        subtitle={`${profile?.full_name ?? "Nhân sự"} · ${periodLabel}`}
        actions={
          <>
            {showScopeFilters && (
              <KpiHeaderFilters
                periodRange={periodRange}
                onPeriodRangeChange={setPeriodRange}
                teamFilter={teamFilter}
                onTeamChange={(value) => {
                  setTeamFilter(value);
                  setUserFilter("all");
                }}
                userFilter={userFilter}
                onUserChange={setUserFilter}
                teams={data?.teams ?? []}
                users={usersForFilter}
              />
            )}
            <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
            {(role === "employee" || role === "leader") && (
              <Badge className={statusClass(personalStatus)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {statusLabel(personalStatus)}
              </Badge>
            )}
            {canEdit && (
              <Button onClick={() => openCreateDialog()}>
                <Plus className="mr-2 h-4 w-4" /> Tạo KPI
              </Button>
            )}
            {canEdit && (
              <Dialog open={createOpen} onOpenChange={closeKpiDialog}>
                <KpiCreateDialog
                  form={form}
                  setForm={setForm}
                  role={role}
                  isEditing={!!editingKpi}
                  teams={data?.teams ?? []}
                  users={usersForForm}
                  memberships={data?.memberships ?? []}
                  onSave={save}
                />
              </Dialog>
            )}
          </>
        }
      />

      <ScrollArea className="py-1 md:pr-2">
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {role === "admin" && (
              <SystemStrategicKpiCard
                kpi={systemStrategicKpi}
                actual={data?.teamActual}
                periodLabel={periodLabel}
                canEdit={canEdit}
                onEdit={
                  systemStrategicKpi
                    ? () => openEditDialog(systemStrategicKpi)
                    : () => openCreateDialog("system")
                }
              />
            )}
            {(role === "employee" || role === "leader") && (
              <>
                <PersonalKpiPanel
                  kpi={personalKpi}
                  actual={data?.personalActual}
                  revenueTarget={getResolvedKpiRevenueTarget(personalKpi, currentPeriod)}
                  percent={personalPercent}
                  status={personalStatus}
                  canEdit={canEdit}
                  onEdit={personalKpi ? () => openEditDialog(personalKpi) : openCreateDialog}
                  monthFrom={currentPeriod.from}
                  monthTo={currentPeriod.to}
                />
                <KpiHistory
                  kpis={personalKpis}
                  monthFrom={currentPeriod.from}
                  monthTo={currentPeriod.to}
                />
              </>
            )}

            {(role === "leader" || role === "admin" || role === "manager") && (
              <>
                <TeamKpiPanel
                  teamName={teamSummaryName}
                  target={displayedTeamTarget}
                  personalTargetTotal={totalPersonalTarget}
                  actual={role === "leader" ? data?.teamActual : filteredTeamActual}
                  isCompanyScope={role === "admin" && teamFilter === "all"}
                  manualTarget={manualTeamTarget}
                  canEdit={canEdit}
                  onEdit={
                    manualTeamTarget
                      ? () => openEditDialog(manualTeamTarget)
                      : () => openCreateDialog("team")
                  }
                />
              </>
            )}

            {role !== "employee" && (
              <MemberKpiTable
                emptyMessage={
                  data?.users.length
                    ? "Chưa có KPI trong kỳ này"
                    : "Chưa có nhân sự Marketing đang hoạt động"
                }
                rows={memberRows}
                search={memberSearch}
                onSearch={setMemberSearch}
                canEdit={canEdit}
                onEdit={(kpi) => openEditDialog(kpi)}
                onCreateForUser={openCreateForUser}
              />
            )}
          </div>
        )}
      </ScrollArea>
    </PageShell>
  );
}

function KpiHeaderFilters({
  periodRange,
  onPeriodRangeChange,
  teamFilter,
  onTeamChange,
  userFilter,
  onUserChange,
  teams,
  users,
}: {
  periodRange: KpiRangeState;
  onPeriodRangeChange: (value: KpiRangeState) => void;
  teamFilter: string;
  onTeamChange: (value: string) => void;
  userFilter: string;
  onUserChange: (value: string) => void;
  teams: TeamRow[];
  users: ProfileRow[];
}) {
  const setPreset = (preset: KpiRangePreset) => {
    onPeriodRangeChange(createKpiRange(preset));
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <Select
        value={periodRange.preset}
        onValueChange={(value) => setPreset(value as KpiRangePreset)}
      >
        <SelectTrigger
          aria-label="Thời gian"
          className="h-9 w-[136px] rounded-xl bg-white/90 text-sm shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hôm nay</SelectItem>
          <SelectItem value="week">Tuần này</SelectItem>
          <SelectItem value="month">Tháng này</SelectItem>
          <SelectItem value="quarter">Quý này</SelectItem>
          <SelectItem value="year">Năm nay</SelectItem>
          <SelectItem value="custom">Tuỳ chỉnh</SelectItem>
        </SelectContent>
      </Select>
      {periodRange.preset === "custom" && (
        <>
          <Input
            aria-label="Từ ngày"
            className="h-9 w-[135px] rounded-xl bg-white/90 text-sm shadow-sm"
            type="date"
            value={periodRange.from}
            onChange={(event) => onPeriodRangeChange({ ...periodRange, from: event.target.value })}
          />
          <Input
            aria-label="Đến ngày"
            className="h-9 w-[135px] rounded-xl bg-white/90 text-sm shadow-sm"
            type="date"
            value={periodRange.to}
            onChange={(event) => onPeriodRangeChange({ ...periodRange, to: event.target.value })}
          />
        </>
      )}
      <Select value={teamFilter} onValueChange={onTeamChange}>
        <SelectTrigger
          aria-label="Team"
          className="h-9 w-[170px] rounded-xl bg-white/90 text-sm shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả team</SelectItem>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={userFilter} onValueChange={onUserChange}>
        <SelectTrigger
          aria-label="Nhân sự"
          className="h-9 w-[180px] rounded-xl bg-white/90 text-sm shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả nhân sự</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function KpiCreateDialog({
  form,
  setForm,
  role,
  isEditing,
  teams,
  users,
  memberships,
  onSave,
}: {
  form: KpiFormState;
  setForm: (form: KpiFormState) => void;
  role: string | null;
  isEditing: boolean;
  teams: TeamRow[];
  users: ProfileRow[];
  memberships: MembershipRow[];
  onSave: () => void;
}) {
  const teamByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const membership of memberships) {
      if (!map.has(membership.user_id)) map.set(membership.user_id, membership.team_id);
    }
    return map;
  }, [memberships]);
  const selectedUserTeam = form.user_id
    ? teams.find((team) => team.id === teamByUserId.get(form.user_id))
    : null;
  const yearOptions = getKpiYearOptions();
  const weeklySegments = getKpiWeekSegments(Number(form.period_year), Number(form.period_month));
  const updatePeriod = (patch: Partial<KpiFormState>) => setForm(withKpiPeriodRange(form, patch));

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Sửa KPI" : "Tạo KPI"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loại KPI / Đối tượng
          </p>
        </div>
        {(role === "admin" || role === "leader") && (
          <Field label="Loại KPI">
            <Select
              value={form.target_scope}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  target_scope: value as KpiTargetScope,
                  team_id: value === "system" ? "" : form.team_id || teams[0]?.id || "",
                  user_id: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">KPI cá nhân</SelectItem>
                <SelectItem value="team">KPI Team</SelectItem>
                {role === "admin" ? (
                  <SelectItem value="system">KPI Toàn Hệ Thống</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Field>
        )}
        {form.target_scope === "personal" ? (
          <>
            <Field label="Đối tượng">
              <Select
                value={form.user_id}
                onValueChange={(value) => {
                  const userTeamId = teamByUserId.get(value);
                  setForm({
                    ...form,
                    user_id: value,
                    team_id: userTeamId ?? "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhân sự Marketing" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Team tự nhận diện</p>
              <p className="font-medium">{selectedUserTeam?.name ?? "Chọn nhân sự để lấy team"}</p>
            </div>
          </>
        ) : form.target_scope === "team" ? (
          <Field label="Team">
            <Select
              value={form.team_id}
              onValueChange={(teamId) => setForm({ ...form, team_id: teamId, user_id: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn team Marketing" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              KPI Toàn Hệ Thống
            </p>
            <p className="mt-1 text-violet-950">
              Đây là mục tiêu chiến lược công ty, không cộng vào KPI team hoặc KPI cá nhân.
            </p>
          </div>
        )}
        <div className="border-t pt-4 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kỳ KPI
          </p>
        </div>
        <Field label="Kỳ">
          <Select
            value={form.period_mode}
            onValueChange={(value) => updatePeriod({ period_mode: value as KpiPeriodMode })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="year">Năm</SelectItem>
              <SelectItem value="quarter">Quý</SelectItem>
              <SelectItem value="month">Tháng</SelectItem>
              <SelectItem value="week">Tuần</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Năm">
          <Select
            value={form.period_year}
            onValueChange={(value) => updatePeriod({ period_year: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {form.period_mode === "quarter" && (
          <Field label="Quý">
            <Select
              value={form.period_quarter}
              onValueChange={(value) => updatePeriod({ period_quarter: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((quarter) => (
                  <SelectItem key={quarter} value={String(quarter)}>
                    Quý {quarter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {(form.period_mode === "month" || form.period_mode === "week") && (
          <Field label="Tháng">
            <Select
              value={form.period_month}
              onValueChange={(value) => updatePeriod({ period_month: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <SelectItem key={month} value={String(month)}>
                    Tháng {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
          Kỳ áp dụng: {formatDateVN(form.period_start)} → {formatDateVN(form.period_end)}
        </div>
        <div className="border-t pt-4 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chỉ số KPI
          </p>
        </div>
        {form.period_mode === "week" ? (
          <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            {weeklySegments.map((week) => (
              <Field
                key={week.index}
                label={`${week.label} (${formatDateVN(week.from)} - ${formatDateVN(week.to)})`}
              >
                <Input
                  value={form.weekly_revenue_targets[week.index] ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      weekly_revenue_targets: {
                        ...form.weekly_revenue_targets,
                        [week.index]: formatVndInput(event.target.value),
                      },
                    })
                  }
                  inputMode="numeric"
                  placeholder="100.000.000"
                />
              </Field>
            ))}
          </div>
        ) : (
          <Field label="Doanh thu">
            <Input
              value={form.revenue_target}
              onChange={(event) =>
                setForm({ ...form, revenue_target: formatVndInput(event.target.value) })
              }
              inputMode="numeric"
              placeholder="1.200.000.000"
            />
          </Field>
        )}
        {form.target_scope !== "system" && (
          <>
            <Field label="% chi phí">
              <div className="relative">
                <Input
                  className="pr-10"
                  value={form.cost_percent}
                  onChange={(event) =>
                    setForm({ ...form, cost_percent: sanitizePercentInput(event.target.value) })
                  }
                  inputMode="decimal"
                  placeholder="30"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  %
                </span>
              </div>
            </Field>
            <Field label="DATA">
              <Input
                value={form.data_target}
                onChange={(event) =>
                  setForm({ ...form, data_target: formatVndInput(event.target.value) })
                }
                inputMode="numeric"
              />
            </Field>
          </>
        )}
        <div className="flex justify-end md:col-span-2">
          <Button onClick={onSave}>
            {isEditing ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {isEditing ? "Lưu thay đổi" : "Tạo KPI"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function PersonalKpiPanel({
  kpi,
  actual,
  revenueTarget,
  percent,
  status,
  canEdit,
  onEdit,
  monthFrom,
  monthTo,
}: {
  kpi?: KpiTargetRow;
  actual?: ReportMetricTotals;
  revenueTarget: number;
  percent: number | null;
  status: ReturnType<typeof kpiStatus>;
  canEdit: boolean;
  onEdit: () => void;
  monthFrom: string;
  monthTo: string;
}) {
  const actualTotals = actual ?? emptyMetricTotals();
  const currentWeek = findCurrentWeekSegment(monthFrom, monthTo);
  if (!kpi) {
    return (
      <div className="rounded-[28px] border border-dashed bg-card p-8 text-center shadow-sm">
        <Target className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Chưa có KPI tháng này</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          KPI trong kỳ đang chọn sẽ hiển thị tại đây khi người quản lý tạo mục tiêu.
        </p>
        {canEdit && (
          <Button className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onEdit}>
            <Plus className="mr-2 h-4 w-4" /> Cập nhật KPI
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border bg-card p-5 shadow-sm md:p-6">
      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        <div className="flex items-center justify-center">
          <ProgressRing percent={percent} />
        </div>
        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {marketingMetrics.map((metric) => {
              const actualValue = metric.actual(actualTotals);
              const targetValue = metric.target(kpi);
              const progress = metricProgress({
                actual: actualValue,
                target: targetValue,
                lowerIsBetter: metric.lowerIsBetter,
              });
              return (
                <DarkMetric
                  key={metric.key}
                  label={`${metric.label}${targetValue ? ` / ${formatKpiMetricValue(targetValue, metric.kind)}` : ""}`}
                  value={formatKpiMetricValue(actualValue, metric.kind)}
                  helper={progress == null ? "Chưa có target" : `${progress}% KPI`}
                  highlight={metric.key === "revenue" || metric.key === "data"}
                />
              );
            })}
          </div>
          <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tuần hiện tại
                </p>
                <p className="mt-1 font-semibold">{currentWeek?.label ?? "Ngoài kỳ"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kỳ đánh giá</p>
                <p className="mt-1 font-semibold">
                  {currentWeek
                    ? `${formatDateVN(currentWeek.from)} → ${formatDateVN(currentWeek.to)}`
                    : `${formatDateVN(monthFrom)} → ${formatDateVN(monthTo)}`}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Mục tiêu</p>
                <p className="mt-1 font-semibold">{fmtVndDong(revenueTarget)}</p>
              </div>
            </div>
            <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
            {canEdit && (
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onEdit}>
                Cập nhật KPI
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SystemStrategicKpiCard({
  actual,
  canEdit,
  kpi,
  onEdit,
  periodLabel,
}: {
  actual?: ReportMetricTotals;
  canEdit?: boolean;
  kpi?: KpiTargetRow;
  onEdit?: () => void;
  periodLabel: string;
}) {
  const target = Number(kpi?.revenue_target ?? 0);
  const actualRevenue = actual?.total_revenue ?? 0;
  const percent = kpiPercent(actualRevenue, target);
  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500 p-5 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">
            KPI Toàn Hệ Thống
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">
            {target ? fmtVndDong(target) : "Chưa đặt mục tiêu"}
          </h2>
          <p className="mt-1 text-sm font-medium text-white/80">{periodLabel}</p>
        </div>
        <div className="rounded-2xl bg-white/15 px-4 py-3 text-right backdrop-blur">
          <p className="text-xs font-medium text-white/75">Đã đạt</p>
          <p className="text-2xl font-black">{percent == null ? "0%" : `${percent}%`}</p>
          {canEdit && onEdit ? (
            <Button
              className="mt-3 border-white/40 bg-white/15 text-white hover:bg-white/25"
              size="sm"
              variant="outline"
              onClick={onEdit}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {kpi ? "Sửa KPI" : "Tạo KPI"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="text-xs text-white/70">Doanh thu thực tế</p>
          <p className="mt-1 text-lg font-bold">{fmtVndDong(actualRevenue)}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="text-xs text-white/70">Nguồn mục tiêu</p>
          <p className="mt-1 text-sm font-semibold">
            Mục tiêu chiến lược công ty, không cộng vào KPI team/cá nhân
          </p>
        </div>
      </div>
    </section>
  );
}

function TeamKpiPanel({
  canEdit,
  teamName,
  target,
  personalTargetTotal,
  actual,
  isCompanyScope,
  manualTarget,
  onEdit,
}: {
  canEdit?: boolean;
  teamName: string;
  target: number;
  personalTargetTotal: number;
  actual?: ReportMetricTotals;
  isCompanyScope?: boolean;
  manualTarget?: KpiTargetRow;
  onEdit?: () => void;
}) {
  const actualTotals = actual ?? emptyMetricTotals();
  const percent = kpiPercent(actualTotals.total_revenue, target);
  const status = kpiStatus(percent);
  return (
    <section className="rounded-[24px] border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {isCompanyScope ? "KPI Toàn hệ thống tự động" : "KPI Team (tự động)"}
          </p>
          <h2 className="mt-1 text-xl font-bold">{teamName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
          {canEdit && onEdit ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {manualTarget ? "Sửa KPI team" : "Tạo KPI team"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <LightMetric
          label={
            manualTarget
              ? "KPI team"
              : isCompanyScope
                ? "SUM KPI cá nhân active"
                : "SUM KPI cá nhân trong team"
          }
          value={fmtVndDong(target)}
        />
        <LightMetric label="Tổng KPI mục tiêu cá nhân" value={fmtVndDong(personalTargetTotal)} />
        <LightMetric
          label="Tổng doanh thu thực tế team"
          value={fmtVndDong(actualTotals.total_revenue)}
        />
        <LightMetric label="% hoàn thành team" value={percent == null ? "0%" : `${percent}%`} />
        {marketingMetrics
          .filter((metric) => ["data", "cost_per_data"].includes(metric.key))
          .map((metric) => (
            <LightMetric
              key={metric.key}
              label={metric.label}
              value={formatKpiMetricValue(metric.actual(actualTotals), metric.kind)}
            />
          ))}
      </div>
    </section>
  );
}

function KpiHistory({
  kpis,
  monthFrom,
  monthTo,
}: {
  kpis: KpiTargetRow[];
  monthFrom: string;
  monthTo: string;
}) {
  const history = [...kpis].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  });
  const weekSegments = getWeekSegments(monthFrom, monthTo);

  return (
    <section className="rounded-[24px] border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-emerald-600" />
        <h2 className="font-semibold">Timeline KPI theo tuần</h2>
      </div>
      {weekSegments.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {weekSegments.map((week) => {
            const weekKpi = pickLatestKpi(
              history.filter((kpi) => kpiOverlapsRange(kpi, week.from, week.to)),
            );
            return (
              <div key={`${week.from}-${week.to}`} className="rounded-2xl border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-50 p-2 text-emerald-700">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{week.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateVN(week.from)} - {formatDateVN(week.to)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-emerald-700">
                    KPI: {weekKpi ? fmtVndDong(weekKpi.revenue_target) : "Chưa có KPI"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          Chưa có KPI trong kỳ này
        </div>
      )}
    </section>
  );
}

function MemberKpiTable({
  canEdit,
  emptyMessage,
  onCreateForUser,
  onEdit,
  rows,
  search,
  onSearch,
}: {
  canEdit: boolean;
  emptyMessage: string;
  onCreateForUser: (userId: string) => void;
  onEdit: (kpi: KpiTargetRow) => void;
  rows: MemberKpiRow[];
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <section className="rounded-[24px] border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Theo dõi KPI từng người
          </h2>
          <p className="text-sm text-muted-foreground">Hiển thị KPI theo bộ lọc thời gian.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm nhân viên..."
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Tên</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-right">Mục tiêu</th>
              <th className="px-4 py-3 text-right">Thực tế</th>
              <th className="px-4 py-3 text-right">DATA</th>
              <th className="px-4 py-3 text-right">Giá số</th>
              <th className="px-4 py-3 text-right">% hoàn thành</th>
              <th className="px-4 py-3 text-right">Trạng thái</th>
              {canEdit ? <th className="px-4 py-3 text-right">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.user.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{row.user.full_name}</p>
                    <p className="text-xs text-muted-foreground">@{row.user.username}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.team?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtVndDong(row.target)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtVndDong(row.actual)}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatKpiMetricValue(row.dataCount, "number")}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatKpiMetricValue(row.costPerData, "money")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.percent == null ? "0%" : `${row.percent}%`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge className={statusClass(row.status)}>{statusLabel(row.status)}</Badge>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      {row.kpi ? (
                        <Button size="sm" variant="outline" onClick={() => onEdit(row.kpi!)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Sửa
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onCreateForUser(row.user.id)}
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Tạo KPI
                        </Button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={canEdit ? 9 : 8}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProgressRing({ percent }: { percent: number | null }) {
  const display = percent == null ? 0 : percent;
  const ringPercent = Math.min(100, Math.max(0, display));
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (ringPercent / 100) * circumference;
  return (
    <div className="relative grid h-44 w-44 place-items-center">
      <svg className="h-44 w-44 -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgb(226 232 240)" strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#21d36b"
          strokeLinecap="round"
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-black text-emerald-600">{display}%</p>
        <p className="mt-1 text-xs text-muted-foreground">Hoàn thành</p>
      </div>
    </div>
  );
}

function DarkMetric({
  label,
  value,
  highlight,
  helper,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  helper?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-black ${highlight ? "text-emerald-600" : "text-foreground"}`}
      >
        {value}
      </p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function LightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-3">
      <p className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </p>
      <p className="mt-1 truncate text-base font-bold" title={value}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
