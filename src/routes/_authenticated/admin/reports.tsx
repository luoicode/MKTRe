import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getLatestDailyReportPerEmployeeRange,
  sumTotals,
  type EmployeeLatest,
} from "@/lib/dailyAggregates";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  calculateReportMetrics,
  fmtInt,
  fmtPctValue,
  fmtVndDong,
  formatDateVN,
} from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({ component: AdminReports });

type TeamRow = {
  id: string;
  name: string;
};

function AdminReports() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [teamId, setTeamId] = useState("all");
  const [screenshot, setScreenshot] = useState(false);
  const [now, setNow] = useState(new Date().toISOString());
  const ref = useRef<HTMLDivElement>(null);
  const normalizedRange = normalizeDateRange(range);
  const dateLabel =
    normalizedRange.from === normalizedRange.to
      ? formatDateVN(normalizedRange.from)
      : `${formatDateVN(normalizedRange.from)} - ${formatDateVN(normalizedRange.to)}`;
  const isSingleDay = normalizedRange.from === normalizedRange.to;

  useEffect(() => {
    if (screenshot) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshot]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-team-summary-report", normalizedRange.from, normalizedRange.to, teamId],
    queryFn: async () => {
      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .order("name");
      if (teamsError) throw teamsError;

      const allTeams = (teams ?? []) as TeamRow[];
      const selectedTeamIds = teamId === "all" ? allTeams.map((team) => team.id) : [teamId];
      const selectedTeams = allTeams.filter((team) => selectedTeamIds.includes(team.id));
      const agg = await getLatestDailyReportPerEmployeeRange({
        teamIds: selectedTeamIds,
        from: normalizedRange.from,
        to: normalizedRange.to,
      });

      const leaderNames = await getLeaderNamesByTeam(selectedTeamIds);
      setNow(new Date().toISOString());
      return {
        teams: allTeams,
        selectedTeams,
        rows: agg.rows,
        leaderNames,
      };
    },
  });

  const totals = useMemo(() => (data ? sumTotals(data.rows) : null), [data]);
  const totalsMetrics = useMemo(() => (totals ? calculateReportMetrics(totals) : null), [totals]);
  const selectedTeamName =
    teamId === "all"
      ? "Tất cả team"
      : (data?.selectedTeams.map((team) => team.name).join(", ") ?? "—");
  const leaderName =
    teamId === "all"
      ? "Toàn hệ thống"
      : data?.selectedTeams
          .flatMap((team) => data.leaderNames.get(team.id) ?? [])
          .filter(Boolean)
          .join(", ") || "—";
  const missing = (data?.rows ?? []).filter((row) => !row.countedInTotal);
  const reportTitle =
    teamId === "all"
      ? isSingleDay
        ? "BÁO CÁO TỔNG TOÀN HỆ THỐNG TRONG NGÀY"
        : "BÁO CÁO TỔNG TOÀN HỆ THỐNG THEO KHOẢNG NGÀY"
      : isSingleDay
        ? "BÁO CÁO TỔNG TEAM TRONG NGÀY"
        : "BÁO CÁO TỔNG TEAM THEO KHOẢNG NGÀY";
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <div className="w-full min-w-0 space-y-2 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <div className="screenshot-hide shrink-0 gap-2 md:flex md:flex-wrap md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="min-w-56">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả team</SelectItem>
                {(data?.teams ?? []).map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
          <ReportActions
            targetRef={ref}
            filename={teamReportExportFilename(now, normalizedRange.to, selectedTeamName)}
            screenshotMode={screenshot}
            onToggleScreenshot={() => setScreenshot((value) => !value)}
            sheetData={
              totals
                ? {
                    reportType: "team",
                    reportDate: normalizedRange.to,
                    dateLabel,
                    title: selectedTeamName,
                    channel: "FACEBOOK",
                    ads_cost: totals.ads_cost,
                    mess_count: totals.mess_count,
                    data_count: totals.data_count,
                    closed_orders: totals.closed_orders,
                    daily_data_revenue: totals.daily_data_revenue,
                    total_orders: totals.total_orders,
                    total_revenue: totals.total_revenue,
                    recovered_revenue: totals.recovered_revenue,
                  }
                : undefined
            }
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 md:min-h-0 md:flex-1 md:items-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data && totals && totalsMetrics ? (
        <div
          ref={ref}
          className="space-y-2 bg-white p-2 text-slate-900 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden"
        >
          <header className="shrink-0 border-b-2 border-slate-900 pb-2">
            <h1 className="text-center text-lg font-extrabold tracking-wide">{reportTitle}</h1>
            <div className="mt-1 grid gap-1 text-xs md:grid-cols-2">
              <div>
                <b>Team:</b> {selectedTeamName}
              </div>
              <div>
                <b>Leader:</b> {leaderName}
              </div>
              <div>
                <b>Ngày báo cáo:</b> {dateLabel}
              </div>
            </div>
            <p className="mt-1 text-[11px] italic text-slate-600">
              Dữ liệu tổng team được tính bằng báo cáo mới nhất trong ngày của từng nhân viên (lũy
              kế), không cộng dồn các khung giờ.
            </p>
          </header>

          <div className="grid shrink-0 grid-cols-3 gap-1.5 md:grid-cols-6">
            <Stat label="Tổng Chi Phí Ads" value={fmtVndDong(totals.ads_cost)} />
            <Stat label="Tổng MESS" value={fmtInt(totals.mess_count)} />
            <Stat label="Chi Phí ADS/MESS" value={fmtVndDong(totalsMetrics.cp_mess)} />
            <Stat label="Tổng Data" value={fmtInt(totals.data_count)} />
            <Stat label="Chi Phí/DATA trong ngày" value={fmtVndDong(totalsMetrics.cp_data)} />
            <Stat label="Đơn chốt DATA trong ngày" value={fmtInt(totals.closed_orders)} />
            <Stat label="Tỉ lệ chốt DATA trong ngày" value={fmtPctValue(totalsMetrics.conv_rate)} />
            <Stat label="Doanh số DATA trong ngày" value={fmtVndDong(totals.daily_data_revenue)} />
            <Stat label="Trung bình đơn" value={fmtVndDong(totalsMetrics.avg_order)} />
            <Stat
              label="Chi Phí ADS/Doanh số ngày"
              value={fmtPctValue(totalsMetrics.cp_daily_pct)}
            />
            <Stat label="Tổng Đơn Chốt" value={fmtInt(totals.total_orders)} />
            <Stat label="Tổng Doanh Số" value={fmtVndDong(totals.total_revenue)} />
            <Stat
              label="Chi Phí ADS/Tổng Doanh Số"
              value={fmtPctValue(totalsMetrics.cp_total_pct)}
            />
            <Stat label="Tổng DS chốt lại" value={fmtVndDong(totals.recovered_revenue)} />
            {isSingleDay && (
              <>
                <Stat
                  label="Đã báo cáo"
                  value={`${totals.reportedCount}/${totals.totalEmployees}`}
                />
                <Stat
                  label="Chưa báo cáo"
                  value={String(totals.missingCount)}
                  danger={totals.missingCount > 0}
                />
              </>
            )}
          </div>

          <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
            <CardHeader className="shrink-0 py-2">
              <CardTitle className="text-base">Chi tiết theo nhân viên</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto p-0">
              <table className="w-full table-fixed text-xs">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    {[
                      "Marketing",
                      ...(teamId === "all" ? ["Team"] : []),
                      "CP ADS",
                      "MESS",
                      "CP ADS/MESS",
                      "Data",
                      "CP/DATA ngày",
                      "Đơn DATA ngày",
                      "TLC DATA ngày",
                      "DS DATA ngày",
                      "TB đơn",
                      "CP ADS/DS ngày",
                      "Tổng Đơn",
                      "Tổng DS",
                      "CP ADS/Tổng DS",
                      "DS chốt lại",
                    ].map((header) => (
                      <th key={header} className="border-b px-2 py-1.5 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <EmpRow
                      key={`${row.team_id}:${row.user_id}`}
                      row={row}
                      showTeam={teamId === "all"}
                      teamName={data.teams.find((team) => team.id === row.team_id)?.name ?? "—"}
                    />
                  ))}
                  <TotalsRow
                    totals={totals}
                    totalsMetrics={totalsMetrics}
                    showTeam={teamId === "all"}
                  />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {isSingleDay && missing.length > 0 && (
            <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
              <b>Nhân viên chưa báo cáo / chưa gửi:</b>{" "}
              {missing.map((employee) => employee.full_name).join(", ")}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu báo cáo.
        </div>
      )}
    </div>
  );
}

async function getLeaderNamesByTeam(teamIds: string[]) {
  if (!teamIds.length) return new Map<string, string[]>();
  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("team_id, user_id")
    .in("team_id", teamIds)
    .eq("is_active", true);
  const userIds = Array.from(new Set((memberships ?? []).map((membership) => membership.user_id)));
  if (!userIds.length) return new Map<string, string[]>();

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", userIds)
    .eq("role", "leader");
  const leaderIds = new Set((roles ?? []).map((role) => role.user_id));
  if (!leaderIds.size) return new Map<string, string[]>();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", Array.from(leaderIds));
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const leaderNamesByTeam = new Map<string, string[]>();
  for (const membership of memberships ?? []) {
    if (!leaderIds.has(membership.user_id)) continue;
    const name = nameById.get(membership.user_id);
    if (!name) continue;
    const names = leaderNamesByTeam.get(membership.team_id) ?? [];
    names.push(name);
    leaderNamesByTeam.set(membership.team_id, names);
  }
  return leaderNamesByTeam;
}

function teamReportExportFilename(iso: string, reportDate: string, teamName: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const [year, month, day] = reportDate.split("-");
  const cleanTeam =
    teamName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "") || "Team";
  return `${hh}${mm}_${day}${month}${year}_${cleanTeam}.png`;
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${danger ? "border-red-300 bg-red-50" : "bg-white"}`}>
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${danger ? "text-red-700" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function EmpRow({
  row,
  showTeam,
  teamName,
}: {
  row: EmployeeLatest;
  showTeam: boolean;
  teamName: string;
}) {
  const muted = !row.countedInTotal;
  const metrics = calculateReportMetrics(row);
  return (
    <tr className={muted ? "bg-amber-50/50 text-slate-500" : ""}>
      <td className="border-b px-2 py-1 font-medium">{row.full_name}</td>
      {showTeam && <td className="border-b px-2 py-1">{teamName}</td>}
      <td className="border-b px-2 py-1">{row.hasReport ? fmtVndDong(row.ads_cost) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtInt(row.mess_count) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtVndDong(metrics.cp_mess) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtInt(row.data_count) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtVndDong(metrics.cp_data) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtInt(row.closed_orders) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtPctValue(metrics.conv_rate) : "—"}</td>
      <td className="border-b px-2 py-1">
        {row.hasReport ? fmtVndDong(row.daily_data_revenue) : "—"}
      </td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtVndDong(metrics.avg_order) : "—"}</td>
      <td className="border-b px-2 py-1">
        {row.hasReport ? fmtPctValue(metrics.cp_daily_pct) : "—"}
      </td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtInt(row.total_orders) : "—"}</td>
      <td className="border-b px-2 py-1">{row.hasReport ? fmtVndDong(row.total_revenue) : "—"}</td>
      <td className="border-b px-2 py-1">
        {row.hasReport ? fmtPctValue(metrics.cp_total_pct) : "—"}
      </td>
      <td className="border-b px-2 py-1">
        {row.hasReport ? fmtVndDong(row.recovered_revenue) : "—"}
      </td>
    </tr>
  );
}

function TotalsRow({
  totals,
  totalsMetrics,
  showTeam,
}: {
  totals: NonNullable<ReturnType<typeof sumTotals>>;
  totalsMetrics: ReturnType<typeof calculateReportMetrics>;
  showTeam: boolean;
}) {
  return (
    <tr className="bg-slate-50 font-semibold">
      <td className="border-t px-2 py-1.5">TỔNG</td>
      {showTeam && <td className="border-t px-2 py-1.5">—</td>}
      <td className="border-t px-2 py-1.5">{fmtVndDong(totals.ads_cost)}</td>
      <td className="border-t px-2 py-1.5">{fmtInt(totals.mess_count)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.cp_mess)}</td>
      <td className="border-t px-2 py-1.5">{fmtInt(totals.data_count)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.cp_data)}</td>
      <td className="border-t px-2 py-1.5">{fmtInt(totals.closed_orders)}</td>
      <td className="border-t px-2 py-1.5">{fmtPctValue(totalsMetrics.conv_rate)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totals.daily_data_revenue)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.avg_order)}</td>
      <td className="border-t px-2 py-1.5">{fmtPctValue(totalsMetrics.cp_daily_pct)}</td>
      <td className="border-t px-2 py-1.5">{fmtInt(totals.total_orders)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totals.total_revenue)}</td>
      <td className="border-t px-2 py-1.5">{fmtPctValue(totalsMetrics.cp_total_pct)}</td>
      <td className="border-t px-2 py-1.5">{fmtVndDong(totals.recovered_revenue)}</td>
    </tr>
  );
}
