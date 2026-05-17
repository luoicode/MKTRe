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
import { getVisibleReports, monthRange, sumReportMetrics } from "@/lib/analytics";
import { kpiPercent, kpiStatus } from "@/lib/kpi";
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
import { toast } from "sonner";

type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "username">;
type KpiPeriod = Enums<"kpi_period">;
type KpiTargetRow = Tables<"kpi_targets">;

type KpiFormState = {
  team_id: string;
  user_id: string;
  period_type: KpiPeriod;
  period_start: string;
  period_end: string;
  revenue_target: string;
  ads_target: string;
  note: string;
};

type MemberKpiRow = {
  user: ProfileRow;
  target: number;
  actual: number;
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
    note: "",
  };
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
  const canEdit = role === "manager" || role === "leader";
  const [createOpen, setCreateOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [form, setForm] = useState<KpiFormState>(() => createDefaultForm());
  const currentMonth = useMemo(() => monthRange(), []);

  const { data, isLoading } = useQuery({
    queryKey: ["kpi-workspace", role, profile?.id, currentMonth.from, currentMonth.to],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") teamIds = await getManagerTeamIds(profile!.id);

      let teamsQuery = supabase.from("teams").select("id, name").order("name");
      if (teamIds?.length) teamsQuery = teamsQuery.in("id", teamIds);
      const { data: teams, error: teamsError } = await teamsQuery;
      if (teamsError) throw teamsError;

      const memberships = teamIds?.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id")
            .in("team_id", teamIds)
            .eq("is_active", true)
        : await supabase.from("team_memberships").select("user_id, team_id").eq("is_active", true);
      if (memberships.error) throw memberships.error;

      const userIds = Array.from(
        new Set((memberships.data ?? []).map((m: { user_id: string }) => m.user_id)),
      );
      if (profile?.id && !userIds.includes(profile.id)) userIds.push(profile.id);

      const { data: users, error: usersError } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username")
            .in("id", userIds)
            .order("full_name")
        : { data: [], error: null };
      if (usersError) throw usersError;

      const { data: kpis, error: kpisError } = await supabase
        .from("kpi_targets")
        .select("*")
        .eq("period_type", "month")
        .lte("period_start", currentMonth.to)
        .gte("period_end", currentMonth.from)
        .order("updated_at", { ascending: false });
      if (kpisError) throw kpisError;

      const personalReports = await getVisibleReports({
        from: currentMonth.from,
        to: currentMonth.to,
        userId: profile!.id,
      });

      const scopedTeamIds =
        teamIds?.length || role === "leader" || role === "manager" ? teamIds : undefined;
      const teamReports = scopedTeamIds?.length
        ? await getVisibleReports({
            from: currentMonth.from,
            to: currentMonth.to,
            teamIds: scopedTeamIds,
          })
        : [];

      return {
        teams: teams ?? [],
        users: (users ?? []) as ProfileRow[],
        kpis: (kpis ?? []) as KpiTargetRow[],
        teamIds: teamIds ?? [],
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
      (kpi) => !kpi.user_id && kpi.team_id && data.teamIds.includes(kpi.team_id),
    );
  }, [data?.kpis, data?.teamIds]);

  const teamTarget = useMemo(
    () => teamKpis.reduce((sum, kpi) => sum + Number(kpi.revenue_target ?? 0), 0),
    [teamKpis],
  );
  const teamAdsTarget = useMemo(
    () => teamKpis.reduce((sum, kpi) => sum + Number(kpi.ads_target ?? 0), 0),
    [teamKpis],
  );

  const memberRows = useMemo<MemberKpiRow[]>(() => {
    const actualByUser = new Map<string, number>();
    for (const report of data?.teamReports ?? []) {
      actualByUser.set(
        report.user_id,
        (actualByUser.get(report.user_id) ?? 0) + report.total_revenue,
      );
    }
    return (data?.users ?? [])
      .filter(
        (user) =>
          !memberSearch || user.full_name.toLowerCase().includes(memberSearch.toLowerCase()),
      )
      .map((user) => {
        const kpi = pickLatestKpi((data?.kpis ?? []).filter((row) => row.user_id === user.id));
        const target = Number(kpi?.revenue_target ?? 0);
        const actual = actualByUser.get(user.id) ?? 0;
        const percent = kpiPercent(actual, target);
        return { user, target, actual, percent, status: kpiStatus(percent) };
      });
  }, [data?.kpis, data?.teamReports, data?.users, memberSearch]);

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border bg-background/95 p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {role === "employee" || role === "leader" ? "KPI Cá Nhân" : "KPI"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name ?? "Nhân sự"} · Tháng {new Date().getMonth() + 1}/
            {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusClass(personalStatus)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            {statusLabel(personalStatus)}
          </Badge>
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
                users={data?.users ?? []}
                onSave={save}
              />
            </Dialog>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <PersonalKpiPanel
              kpi={personalKpi}
              actualRevenue={data?.personalActual.total_revenue ?? 0}
              percent={personalPercent}
              status={personalStatus}
              canEdit={canEdit}
              onEdit={() => setCreateOpen(true)}
              monthFrom={currentMonth.from}
              monthTo={currentMonth.to}
            />
            <KpiHistory kpis={personalKpis} />

            {role === "leader" && (
              <>
                <TeamKpiPanel
                  teamName={data?.teams.map((team) => team.name).join(", ") || "Team"}
                  target={teamTarget}
                  actual={data?.teamActual.total_revenue ?? 0}
                  adsTarget={teamAdsTarget}
                />
                <MemberKpiTable
                  rows={memberRows}
                  search={memberSearch}
                  onSearch={setMemberSearch}
                />
              </>
            )}

            {role !== "employee" && role !== "leader" && (
              <MemberKpiTable rows={memberRows} search={memberSearch} onSearch={setMemberSearch} />
            )}
          </div>
        )}
      </div>
    </div>
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
            <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v })}>
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
  actualRevenue,
  percent,
  status,
  canEdit,
  onEdit,
  monthFrom,
  monthTo,
}: {
  kpi?: KpiTargetRow;
  actualRevenue: number;
  percent: number | null;
  status: ReturnType<typeof kpiStatus>;
  canEdit: boolean;
  onEdit: () => void;
  monthFrom: string;
  monthTo: string;
}) {
  if (!kpi) {
    return (
      <div className="rounded-[28px] border border-dashed bg-card p-8 text-center shadow-sm">
        <Target className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Chưa có KPI tháng này</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          KPI tháng hiện tại sẽ hiển thị tại đây khi Leader/Manager tạo mục tiêu.
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
          <div className="grid gap-5 sm:grid-cols-2">
            <DarkMetric label="Doanh thu mục tiêu" value={fmtVndDong(kpi.revenue_target)} />
            <DarkMetric label="Doanh thu thực tế" value={fmtVndDong(actualRevenue)} highlight />
            <DarkMetric label="% hoàn thành" value={percent == null ? "0%" : `${percent}%`} />
            <DarkMetric label="Chi phí mục tiêu" value={fmtVndDong(kpi.ads_target)} />
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
  actual: number;
  adsTarget: number;
}) {
  const percent = kpiPercent(actual, target);
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
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <LightMetric label="Tổng KPI doanh thu team" value={fmtVndDong(target)} />
        <LightMetric label="Tổng doanh thu thực tế team" value={fmtVndDong(actual)} />
        <LightMetric label="% hoàn thành team" value={percent == null ? "0%" : `${percent}%`} />
        <LightMetric label="Tổng chi phí mục tiêu" value={fmtVndDong(adsTarget)} />
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
          Chưa có KPI tháng này
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
          <p className="text-sm text-muted-foreground">Chỉ hiển thị KPI tháng hiện tại.</p>
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
              <th className="px-4 py-3 text-right">Mục tiêu</th>
              <th className="px-4 py-3 text-right">Thực tế</th>
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
                  <td className="px-4 py-3 text-right font-medium">{fmtVndDong(row.target)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtVndDong(row.actual)}</td>
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
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Chưa có KPI tháng này
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
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-black ${highlight ? "text-emerald-600" : "text-foreground"}`}
      >
        {value}
      </p>
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
