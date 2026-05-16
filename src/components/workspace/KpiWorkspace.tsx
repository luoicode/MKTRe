import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import { getVisibleReports, sumReportMetrics } from "@/lib/analytics";
import { kpiPercent, kpiStatus, kpiStatusLabel } from "@/lib/kpi";
import { fmtVndDong, todayStr } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function isKpiPeriod(value: string): value is KpiPeriod {
  return value === "day" || value === "week" || value === "month";
}

function createDefaultForm(teamId = ""): KpiFormState {
  return {
    team_id: teamId,
    user_id: "team",
    period_type: "month",
    period_start: todayStr().slice(0, 8) + "01",
    period_end: todayStr(),
    revenue_target: "",
    ads_target: "",
    note: "",
  };
}

export function KpiWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "manager" || role === "leader";
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<KpiFormState>(() => createDefaultForm());

  const { data, isLoading } = useQuery({
    queryKey: ["kpi-workspace", role, profile?.id],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") teamIds = await getManagerTeamIds(profile!.id);

      let teamsQuery = supabase.from("teams").select("id, name").order("name");
      if (teamIds?.length) teamsQuery = teamsQuery.in("id", teamIds);
      const { data: teams } = await teamsQuery;

      const memberships = teamIds?.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id")
            .in("team_id", teamIds)
            .eq("is_active", true)
        : await supabase.from("team_memberships").select("user_id, team_id").eq("is_active", true);
      const userIds = Array.from(
        new Set((memberships.data ?? []).map((m: { user_id: string }) => m.user_id)),
      );
      const { data: users } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username")
            .in("id", userIds)
            .order("full_name")
        : { data: [] };

      const { data: kpis } = await supabase
        .from("kpi_targets")
        .select("*")
        .order("period_start", { ascending: false });

      return {
        teams: teams ?? [],
        users: users ?? [],
        kpis: kpis ?? [],
      };
    },
  });

  const visibleKpis = data?.kpis ?? [];

  useEffect(() => {
    if (role !== "leader" || form.team_id || !data?.teams.length) return;
    setForm((current) => ({ ...current, team_id: data.teams[0].id }));
  }, [data?.teams, form.team_id, role]);

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

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border bg-background/95 p-4 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">KPI</h1>
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

      <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <CardHeader className="shrink-0 border-b py-4">
          <CardTitle>Danh sách KPI</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : visibleKpis.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleKpis.map((k) => (
                <KpiCard key={k.id} kpi={k} users={data?.users ?? []} teams={data?.teams ?? []} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có KPI.
            </div>
          )}
        </CardContent>
      </Card>
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

function KpiCard({
  kpi,
  users,
  teams,
}: {
  kpi: KpiTargetRow;
  users: ProfileRow[];
  teams: TeamRow[];
}) {
  const { data } = useQuery({
    queryKey: ["kpi-actual", kpi.id],
    queryFn: async () => {
      const reports = await getVisibleReports({
        from: kpi.period_start,
        to: kpi.period_end,
        teamIds: kpi.team_id ? [kpi.team_id] : undefined,
        userId: kpi.user_id ?? undefined,
      });
      return sumReportMetrics(reports);
    },
  });
  const percent = kpiPercent(data?.total_revenue ?? 0, Number(kpi.revenue_target ?? 0));
  const status = kpiStatus(percent);
  const targetName = kpi.user_id
    ? (users.find((u) => u.id === kpi.user_id)?.full_name ?? "Nhân viên")
    : (teams.find((t) => t.id === kpi.team_id)?.name ?? "Team");
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{targetName}</p>
          <p className="text-sm text-muted-foreground">
            {kpi.period_start} → {kpi.period_end}
          </p>
        </div>
        <Badge
          variant={status === "done" ? "default" : status === "near" ? "secondary" : "destructive"}
        >
          {kpiStatusLabel(status)}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Doanh thu mục tiêu" value={fmtVndDong(kpi.revenue_target)} />
        <Metric label="Doanh thu thực tế" value={fmtVndDong(data?.total_revenue ?? 0)} />
        <Metric label="% hoàn thành" value={percent == null ? "—" : `${percent}%`} />
        <Metric label="Chi phí mục tiêu" value={fmtVndDong(kpi.ads_target)} />
      </div>
      {kpi.note && <p className="mt-3 text-sm text-muted-foreground">Ghi chú: {kpi.note}</p>}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
