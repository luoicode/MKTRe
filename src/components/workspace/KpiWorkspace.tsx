import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert } from "@/integrations/supabase/types";
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
import { formatKpiMetricValue, marketingMetrics, metricProgress } from "@/lib/kpiMetrics";
import { filterVisibleProfiles } from "@/lib/profileVisibility";
import { fmtVndDong, formatDateVN } from "@/lib/reports";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type KpiFormState = {
  team_id: string;
  user_id: string;
  period_type: KpiPeriod;
  period_start: string;
  period_end: string;
  revenue_target: string;
  ads_target: string;
  mess_target: string;
  data_target: string;
  orders_target: string;
  roas_target: string;
  note: string;
};

type MemberKpiRow = {
  user: ProfileRow;
  team?: TeamRow;
  role?: OperationalRole;
  target: number;
  actual: number;
  dataCount: number;
  costPerData: number | null;
  percent: number | null;
  status: "none" | "done" | "near" | "low";
};

function isKpiPeriod(value: string): value is KpiPeriod {
  return value === "day" || value === "week" || value === "month";
}

function createDefaultForm(teamId = ""): KpiFormState {
  const range = monthRange();
  return {
    team_id: teamId,
    user_id: "team",
    period_type: "month",
    period_start: range.from,
    period_end: range.to,
    revenue_target: "",
    ads_target: "",
    mess_target: "",
    data_target: "",
    orders_target: "",
    roas_target: "",
    note: "",
  };
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
  const canEdit = role === "admin" || role === "manager" || role === "leader";
  const [createOpen, setCreateOpen] = useState(false);
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
      const visibleTeamIds =
        role === "admin" ? (teams ?? []).map((team) => team.id) : (teamIds ?? []);

      const memberships = teamIds?.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id, role_in_team")
            .in("team_id", teamIds)
            .eq("is_active", true)
        : await supabase
            .from("team_memberships")
            .select("user_id, team_id, role_in_team")
            .eq("is_active", true);
      if (memberships.error) throw memberships.error;

      const userIds = Array.from(
        new Set((memberships.data ?? []).map((m: { user_id: string }) => m.user_id)),
      );
      if (profile?.id && !userIds.includes(profile.id)) userIds.push(profile.id);

      const { data: operationalRoles, error: rolesError } = userIds.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [], error: null };
      if (rolesError) throw rolesError;

      const operationalRoleByUserId = new Map(
        (operationalRoles ?? [])
          .filter((row) => row.role === "employee" || row.role === "leader")
          .map((row) => [row.user_id, row.role as OperationalRole]),
      );
      for (const membership of memberships.data ?? []) {
        if (
          !operationalRoleByUserId.has(membership.user_id) &&
          (membership.role_in_team === "employee" || membership.role_in_team === "leader")
        ) {
          operationalRoleByUserId.set(membership.user_id, membership.role_in_team);
        }
      }
      const nonOperationalUserIds = new Set(
        (operationalRoles ?? [])
          .filter((row) => row.role === "admin" || row.role === "manager")
          .map((row) => row.user_id),
      );
      const operationalUserIds = userIds.filter(
        (userId) => operationalRoleByUserId.has(userId) && !nonOperationalUserIds.has(userId),
      );

      const { data: users, error: usersError } = operationalUserIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, status")
            .in("id", operationalUserIds)
            .order("full_name")
        : { data: [], error: null };
      if (usersError) throw usersError;
      const visibleUsers = filterVisibleProfiles(users ?? [], role);
      const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
      for (const userId of Array.from(operationalRoleByUserId.keys())) {
        if (!visibleUserIds.has(userId)) operationalRoleByUserId.delete(userId);
      }

      const { data: kpis, error: kpisError } = await supabase
        .from("kpi_targets")
        .select("*")
        .lte("period_start", currentPeriod.to)
        .gte("period_end", currentPeriod.from)
        .order("updated_at", { ascending: false });
      if (kpisError) throw kpisError;

      const personalReports =
        role === "employee" || role === "leader"
          ? await getVisibleReports({
              from: currentPeriod.from,
              to: currentPeriod.to,
              userId: profile!.id,
            })
          : [];

      const scopedTeamIds =
        teamIds?.length || role === "leader" || role === "manager" ? teamIds : undefined;
      const teamReports =
        role === "admin"
          ? await getVisibleReports({
              from: currentPeriod.from,
              to: currentPeriod.to,
            })
          : scopedTeamIds?.length
            ? await getVisibleReports({
                from: currentPeriod.from,
                to: currentPeriod.to,
                teamIds: scopedTeamIds,
              })
            : [];

      return {
        teams: teams ?? [],
        users: visibleUsers as ProfileRow[],
        operationalRoleByUserId,
        kpis: (kpis ?? []) as KpiTargetRow[],
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

  const teamKpis = useMemo(() => {
    if (!data?.teamIds.length) return [];
    return (data.kpis ?? []).filter(
      (kpi) =>
        !kpi.user_id &&
        kpi.team_id &&
        data.teamIds.includes(kpi.team_id) &&
        (teamFilter === "all" || kpi.team_id === teamFilter),
    );
  }, [data?.kpis, data?.teamIds, teamFilter]);

  const teamTarget = useMemo(
    () => teamKpis.reduce((sum, kpi) => sum + Number(kpi.revenue_target ?? 0), 0),
    [teamKpis],
  );
  const teamAdsTarget = useMemo(
    () => teamKpis.reduce((sum, kpi) => sum + Number(kpi.ads_target ?? 0), 0),
    [teamKpis],
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
        ? "Toàn hệ thống"
        : data?.teams.map((team) => team.name).join(", ") || "Team"
      : data?.teams.find((team) => team.id === teamFilter)?.name || "Team";

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
        const target = Number(kpi?.revenue_target ?? 0);
        const actualTotals = actualByUser.get(user.id) ?? emptyMetricTotals();
        const actual = actualTotals.total_revenue;
        const percent = kpiPercent(actual, target);
        return {
          user,
          team: teamByUserId.get(user.id),
          role: data?.operationalRoleByUserId.get(user.id),
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
    memberSearch,
    teamFilter,
    userFilter,
  ]);

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
    if (!form.team_id) return data?.users ?? [];
    const teamUserIds = new Set(
      (data?.memberships ?? [])
        .filter((membership) => membership.team_id === form.team_id)
        .map((membership) => membership.user_id),
    );
    return (data?.users ?? []).filter((user) => teamUserIds.has(user.id));
  }, [data?.memberships, data?.users, form.team_id]);

  const showScopeFilters = role === "admin" || role === "manager";

  const save = async () => {
    if (!form.team_id || !form.period_start || !form.period_end) {
      toast.error("Chọn team và kỳ KPI");
      return;
    }
    const payload: TablesInsert<"kpi_targets"> = {
      team_id: form.team_id,
      user_id: form.user_id === "team" ? null : form.user_id,
      period_type: form.period_type,
      period_start: form.period_start,
      period_end: form.period_end,
      revenue_target: Number(form.revenue_target || 0),
      ads_target: Number(form.ads_target || 0),
      mess_target: Number(form.mess_target || 0),
      data_target: Number(form.data_target || 0),
      orders_target: Number(form.orders_target || 0),
      roas_target: Number(form.roas_target || 0),
      created_by: profile?.id,
      note: form.note || null,
    };
    const { error } = await supabase.from("kpi_targets").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã tạo KPI");
    setCreateOpen(false);
    setForm(createDefaultForm(role === "leader" ? (data?.teams[0]?.id ?? "") : ""));
    qc.invalidateQueries({ queryKey: ["kpi-workspace"] });
  };

  const personalPercent = kpiPercent(
    data?.personalActual.total_revenue ?? 0,
    Number(personalKpi?.revenue_target ?? 0),
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
            <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
            {(role === "employee" || role === "leader") && (
              <Badge className={statusClass(personalStatus)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {statusLabel(personalStatus)}
              </Badge>
            )}
            {canEdit && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Tạo KPI
                  </Button>
                </DialogTrigger>
                <KpiCreateDialog
                  form={form}
                  setForm={setForm}
                  role={role}
                  teams={data?.teams ?? []}
                  users={usersForForm}
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
            {showScopeFilters && (
              <KpiScopeFilters
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
            {(role === "employee" || role === "leader") && (
              <>
                <PersonalKpiPanel
                  kpi={personalKpi}
                  actual={data?.personalActual}
                  percent={personalPercent}
                  status={personalStatus}
                  canEdit={canEdit}
                  onEdit={() => setCreateOpen(true)}
                  monthFrom={currentPeriod.from}
                  monthTo={currentPeriod.to}
                />
                <KpiHistory kpis={personalKpis} />
              </>
            )}

            {(role === "leader" || role === "admin" || role === "manager") && (
              <>
                <TeamKpiPanel
                  teamName={teamSummaryName}
                  target={teamTarget}
                  actual={role === "leader" ? data?.teamActual : filteredTeamActual}
                  adsTarget={teamAdsTarget}
                />
              </>
            )}

            {role !== "employee" && (
              <MemberKpiTable rows={memberRows} search={memberSearch} onSearch={setMemberSearch} />
            )}
          </div>
        )}
      </ScrollArea>
    </PageShell>
  );
}

function KpiScopeFilters({
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
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <Field label="Thời gian">
          <div className="grid gap-2">
            <Select
              value={periodRange.preset}
              onValueChange={(value) => setPreset(value as KpiRangePreset)}
            >
              <SelectTrigger>
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
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="date"
                  value={periodRange.from}
                  onChange={(event) =>
                    onPeriodRangeChange({ ...periodRange, from: event.target.value })
                  }
                />
                <Input
                  type="date"
                  value={periodRange.to}
                  onChange={(event) =>
                    onPeriodRangeChange({ ...periodRange, to: event.target.value })
                  }
                />
              </div>
            )}
          </div>
        </Field>
        <Field label="Team">
          <Select value={teamFilter} onValueChange={onTeamChange}>
            <SelectTrigger>
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
        </Field>
        <Field label="Nhân sự">
          <Select value={userFilter} onValueChange={onUserChange}>
            <SelectTrigger>
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
        </Field>
      </div>
    </section>
  );
}

function KpiCreateDialog({
  form,
  setForm,
  role,
  teams,
  users,
  onSave,
}: {
  form: KpiFormState;
  setForm: (form: KpiFormState) => void;
  role: string | null;
  teams: TeamRow[];
  users: ProfileRow[];
  onSave: () => void;
}) {
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Tạo KPI</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        {role === "leader" ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Team</p>
            <p className="font-medium">
              {teams.find((team) => team.id === form.team_id)?.name ?? "Chưa có team"}
            </p>
          </div>
        ) : (
          <Field label="Team">
            <Select
              value={form.team_id}
              onValueChange={(v) => setForm({ ...form, team_id: v, user_id: "team" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn team" />
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
        )}
        <Field label="Đối tượng">
          <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team">KPI Team</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kỳ">
          <Select
            value={form.period_type}
            onValueChange={(value) => {
              if (isKpiPeriod(value)) setForm({ ...form, period_type: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Ngày</SelectItem>
              <SelectItem value="week">Tuần</SelectItem>
              <SelectItem value="month">Tháng</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Doanh thu target">
          <Input
            value={form.revenue_target}
            onChange={(event) =>
              setForm({ ...form, revenue_target: event.target.value.replace(/[^\d]/g, "") })
            }
          />
        </Field>
        <Field label="Từ ngày">
          <Input
            type="date"
            value={form.period_start}
            onChange={(event) => setForm({ ...form, period_start: event.target.value })}
          />
        </Field>
        <Field label="Đến ngày">
          <Input
            type="date"
            value={form.period_end}
            onChange={(event) => setForm({ ...form, period_end: event.target.value })}
          />
        </Field>
        <Field label="Chi phí target">
          <Input
            value={form.ads_target}
            onChange={(event) =>
              setForm({ ...form, ads_target: event.target.value.replace(/[^\d]/g, "") })
            }
          />
        </Field>
        <Field label="MESS target">
          <Input
            value={form.mess_target}
            onChange={(event) =>
              setForm({ ...form, mess_target: event.target.value.replace(/[^\d]/g, "") })
            }
          />
        </Field>
        <Field label="DATA target">
          <Input
            value={form.data_target}
            onChange={(event) =>
              setForm({ ...form, data_target: event.target.value.replace(/[^\d]/g, "") })
            }
          />
        </Field>
        <Field label="Đơn target">
          <Input
            value={form.orders_target}
            onChange={(event) =>
              setForm({ ...form, orders_target: event.target.value.replace(/[^\d]/g, "") })
            }
          />
        </Field>
        <Field label="ROI target">
          <Input
            value={form.roas_target}
            onChange={(event) =>
              setForm({ ...form, roas_target: event.target.value.replace(/[^\d.]/g, "") })
            }
          />
        </Field>
        <Field label="Ghi chú">
          <Input
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </Field>
        <div className="flex justify-end md:col-span-2">
          <Button onClick={onSave}>
            <Plus className="mr-2 h-4 w-4" /> Tạo KPI
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function PersonalKpiPanel({
  kpi,
  actual,
  percent,
  status,
  canEdit,
  onEdit,
  monthFrom,
  monthTo,
}: {
  kpi?: KpiTargetRow;
  actual?: ReportMetricTotals;
  percent: number | null;
  status: ReturnType<typeof kpiStatus>;
  canEdit: boolean;
  onEdit: () => void;
  monthFrom: string;
  monthTo: string;
}) {
  const actualTotals = actual ?? emptyMetricTotals();
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
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Kỳ đánh giá</p>
              <p className="mt-1 font-semibold">
                {formatDateVN(monthFrom)} – {formatDateVN(monthTo)}
              </p>
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

function TeamKpiPanel({
  teamName,
  target,
  actual,
  adsTarget,
}: {
  teamName: string;
  target: number;
  actual?: ReportMetricTotals;
  adsTarget: number;
}) {
  const actualTotals = actual ?? emptyMetricTotals();
  const percent = kpiPercent(actualTotals.total_revenue, target);
  const status = kpiStatus(percent);
  return (
    <section className="rounded-[24px] border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> KPI Team
          </p>
          <h2 className="mt-1 text-xl font-bold">{teamName}</h2>
        </div>
        <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <LightMetric label="Tổng KPI doanh thu team" value={fmtVndDong(target)} />
        <LightMetric
          label="Tổng doanh thu thực tế team"
          value={fmtVndDong(actualTotals.total_revenue)}
        />
        <LightMetric label="% hoàn thành team" value={percent == null ? "0%" : `${percent}%`} />
        <LightMetric label="Tổng chi phí mục tiêu" value={fmtVndDong(adsTarget)} />
        {marketingMetrics
          .filter((metric) =>
            ["mess", "data", "cost_per_data", "cpl", "cps", "roi"].includes(metric.key),
          )
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

function KpiHistory({ kpis }: { kpis: KpiTargetRow[] }) {
  const history = [...kpis].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

  return (
    <section className="rounded-[24px] border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-emerald-600" />
        <h2 className="font-semibold">Lịch sử cập nhật KPI</h2>
      </div>
      {history.length ? (
        <div className="mt-4 space-y-3">
          {history.map((kpi) => (
            <div
              key={kpi.id}
              className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-emerald-50 p-2 text-emerald-700">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {formatDateVN(kpi.updated_at ?? kpi.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kỳ {formatDateVN(kpi.period_start)} – {formatDateVN(kpi.period_end)}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-semibold text-emerald-700">
                  Doanh thu mục tiêu: {fmtVndDong(kpi.revenue_target)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Chi phí mục tiêu: {fmtVndDong(kpi.ads_target)}
                </p>
              </div>
            </div>
          ))}
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
  rows,
  search,
  onSearch,
}: {
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Chưa có KPI trong kỳ này
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
    <div className="rounded-2xl border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
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
