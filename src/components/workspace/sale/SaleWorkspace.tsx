import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Loader2,
  Lock,
  Pencil,
  PhoneCall,
  RefreshCw,
  Save,
  Target,
  Trophy,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { SaleReportForm } from "@/components/workspace/sale/SaleReportForm";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { todayStr } from "@/lib/reports";
import { formatKpiMetricValue, metricProgress, saleMetrics } from "@/lib/kpiMetrics";
import { APP_ROLES } from "@/lib/roles";
import {
  fetchSaleReportsInRange,
  groupSaleReportsByDate,
  latestSaleActivities,
  summarizeSaleReports,
  summarizeSaleReportsBySlot,
  type SaleReportRow,
} from "@/lib/saleReports";
import { saleReportSlots } from "@/lib/saleReportUtils";
import {
  claimFloatingLead,
  fetchSaleFloatingLeads,
  getFloatingLeadCallField,
  releaseExpiredFloatingLeadsForSale,
  updateFloatingLeadCare,
  type FloatingLeadCareDraft,
  type FloatingLeadCallField,
  type FloatingLeadRow,
} from "@/lib/floatingLeads";

export function SaleDashboardWorkspace() {
  const { role } = useAuth();
  return role === APP_ROLES.SALE_LEADER ? (
    <LeaderSaleDashboardWorkspace />
  ) : (
    <SalePersonalDashboardWorkspace />
  );
}

function SalePersonalDashboardWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const { data: reports = [], isLoading } = useSaleReportsRange(profile?.id, range);
  const summary = useMemo(() => summarizeSaleReports(reports), [reports]);
  const dailyTrend = useMemo(() => groupSaleReportsByDate(reports), [reports]);
  const slotSummaries = useMemo(() => summarizeSaleReportsBySlot(reports), [reports]);
  const activities = useMemo(() => latestSaleActivities(reports), [reports]);
  const isSingleDay = range.from === range.to;
  const rangeLabel = formatRangeLabel(range);

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Tổng quan Sale"
        subtitle={`${profile?.full_name ?? "Sale"} · ${rangeLabel}`}
        badge={<Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Sale</Badge>}
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <HeroKpiCard
              title={isSingleDay ? "Tỷ lệ chốt hôm nay" : "Tỷ lệ chốt"}
              value={formatNullablePercent(summary.closeRate)}
              subtitle={`${summary.totalDataClosed} data chốt / ${summary.totalDataReceived} data nhận`}
              meta={[
                ["Data nhận", formatInteger(summary.totalDataReceived)],
                ["Data chốt", formatInteger(summary.totalDataClosed)],
                ["Target", "Chưa đặt mục tiêu"],
              ]}
              tone={summary.closeRate && summary.closeRate >= 0.35 ? "green" : "amber"}
            />
            <HeroKpiCard
              title={isSingleDay ? "Doanh số hôm nay" : "Doanh số"}
              value={formatMoney(summary.totalRevenue)}
              subtitle="Target chưa đặt mục tiêu"
              meta={[
                ["Tổng doanh số", formatMoney(summary.totalRevenue)],
                ["TB đơn", summary.averageOrder ? formatMoney(summary.averageOrder) : "—"],
                ["Target", "Chưa đặt mục tiêu"],
              ]}
              tone="blue"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <KpiProgressCard summary={summary} />
            <RecentActivityCard activities={activities} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {isSingleDay ? (
              <ShiftPerformanceCard slotSummaries={slotSummaries} />
            ) : (
              <SaleTrendCard data={dailyTrend} />
            )}
            <DataOverviewCard summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}

function LeaderSaleDashboardWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: ["leader-sale-dashboard", profile?.id, normalizedRange.from, normalizedRange.to],
    enabled: !!profile?.id,
    queryFn: async () => {
      const teamData = await fetchLeaderSaleTeamData(
        profile!.id,
        normalizedRange.from,
        normalizedRange.to,
      );
      const memberIds = teamData.members.map((member) => member.id);
      const reports = await fetchSaleReportsForUsers(
        memberIds,
        normalizedRange.from,
        normalizedRange.to,
      );
      return { teamData, reports };
    },
  });

  const members = useMemo(() => data?.teamData.members ?? [], [data?.teamData.members]);
  const leads = useMemo(() => data?.teamData.leads ?? [], [data?.teamData.leads]);
  const reports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const summary = useMemo(() => summarizeSaleReports(reports), [reports]);
  const leadStats = useMemo(() => summarizeFloatingLeadTeam(leads), [leads]);
  const salesPerformance = useMemo(
    () => buildSaleMemberPerformance(members, leads, reports),
    [leads, members, reports],
  );
  const dailyTrend = useMemo(() => groupSaleReportsByDate(reports), [reports]);
  const warnings = useMemo(
    () => buildLeaderSaleWarnings(members, leads, reports, normalizedRange.to),
    [leads, members, normalizedRange.to, reports],
  );

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Tổng quan Leader Sale"
        subtitle={`Hiệu suất team Sale · ${formatRangeLabel(normalizedRange)}`}
        badge={<Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">Leader Sale</Badge>}
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <LeaderSaleMetricCard
              label="Tổng doanh thu team"
              value={formatMoney(summary.totalRevenue)}
            />
            <LeaderSaleMetricCard
              label="Tỉ lệ chốt team"
              value={formatNullablePercent(summary.closeRate)}
            />
            <LeaderSaleMetricCard
              label="Tổng data nhận"
              value={formatInteger(summary.totalDataReceived)}
            />
            <LeaderSaleMetricCard
              label="Tổng data chốt"
              value={formatInteger(summary.totalDataClosed)}
            />
            <LeaderSaleMetricCard label="Lead đang giữ" value={formatInteger(leadStats.claimed)} />
            <LeaderSaleMetricCard
              label="Lead quá 24h"
              value={formatInteger(leadStats.overdue)}
              tone="amber"
            />
            <LeaderSaleMetricCard
              label="Lead đã chốt"
              value={formatInteger(leadStats.closed)}
              tone="green"
            />
            <LeaderSaleMetricCard label="Sale active" value={formatInteger(members.length)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Doanh thu theo ngày</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {dailyTrend.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyTrend}>
                        <XAxis dataKey="date" tickFormatter={shortDate} />
                        <YAxis hide />
                        <Tooltip formatter={(value) => formatMoney(Number(value))} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#2563eb"
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptySaleState />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Cảnh báo team
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {warnings.map((warning) => (
                  <div
                    key={warning}
                    className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
                  >
                    {warning}
                  </div>
                ))}
                {!warnings.length && (
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    Chưa có cảnh báo nổi bật trong khoảng này.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <LeaderSaleTeamPerformanceCard stats={leadStats} rows={salesPerformance} />
        </>
      )}
    </div>
  );
}

export function SaleReportWorkspace() {
  const { role } = useAuth();
  if (role !== APP_ROLES.SALE_LEADER)
    return (
      <SaleReportAttendanceGate>
        <SaleReportForm />
      </SaleReportAttendanceGate>
    );
  return (
    <Tabs defaultValue="personal" className="space-y-4">
      <TabsList className="rounded-xl">
        <TabsTrigger value="personal">Báo cáo cá nhân</TabsTrigger>
        <TabsTrigger value="team">Báo cáo team</TabsTrigger>
      </TabsList>
      <TabsContent value="personal">
        <SaleReportAttendanceGate>
          <SaleReportForm />
        </SaleReportAttendanceGate>
      </TabsContent>
      <TabsContent value="team">
        <LeaderSaleTeamReportsWorkspace />
      </TabsContent>
    </Tabs>
  );
}

function SaleReportAttendanceGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);
  const today = todayStr();

  const {
    data: attendanceGate,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["sale-report-attendance-gate", profile?.id, today],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [attendanceResult, leaveResult] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("status")
          .eq("user_id", profile!.id)
          .eq("attendance_date", today)
          .maybeSingle(),
        supabase
          .from("leave_requests")
          .select("id")
          .eq("user_id", profile!.id)
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today)
          .limit(1),
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (leaveResult.error) throw leaveResult.error;

      const attendanceStatus = attendanceResult.data?.status;
      const hasApprovedLeave =
        attendanceStatus === "approved_leave" || (leaveResult.data ?? []).length > 0;

      return {
        unlocked: attendanceStatus === "present" || hasApprovedLeave,
      };
    },
  });

  const locked = attendanceGate?.unlocked !== true;

  const handleCheckInNow = async () => {
    if (!profile) return;
    setCheckingIn(true);
    const { error } = await supabase.from("attendance_records").upsert(
      {
        user_id: profile.id,
        attendance_date: today,
        status: "present",
        checked_in_at: new Date().toISOString(),
      },
      { onConflict: "user_id,attendance_date" },
    );
    setCheckingIn(false);

    if (error) {
      toast.error(`Không thể điểm danh: ${error.message}`);
      return;
    }

    toast.success("Đã điểm danh hôm nay");
    await refetch();
    qc.invalidateQueries({ queryKey: ["attendance"] });
    qc.invalidateQueries({ queryKey: ["attendance-workspace"] });
  };

  const openLeaveRequest = () => {
    void navigate({ to: "/sale/attendance" });
  };

  return (
    <div className="relative">
      <div
        className={cn("transition", locked ? "pointer-events-none select-none blur-sm" : "blur-0")}
        aria-hidden={locked}
      >
        {children}
      </div>

      {locked ? (
        <div className="absolute inset-0 z-30 flex min-h-[520px] items-center justify-center bg-background/50 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-md border-primary/20 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Clock3 className="h-5 w-5" />
                )}
              </div>
              <CardTitle>Bạn cần điểm danh trước khi nhập báo cáo.</CardTitle>
              <CardDescription>Vui lòng điểm danh hôm nay để mở khóa báo cáo Sale.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={handleCheckInNow} disabled={checkingIn}>
                {checkingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Điểm danh
              </Button>
              <Button variant="outline" className="flex-1" onClick={openLeaveRequest}>
                Xin nghỉ phép
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function LeaderSaleTeamReportsWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [saleFilter, setSaleFilter] = useState("all");
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["leader-sale-team-reports", profile?.id, normalizedRange.from, normalizedRange.to],
    enabled: !!profile?.id,
    queryFn: async () => {
      const teamData = await fetchLeaderSaleTeamData(profile!.id);
      const reports = await fetchSaleReportsForUsers(
        teamData.members.map((member) => member.id),
        normalizedRange.from,
        normalizedRange.to,
      );
      return { teamData, reports };
    },
  });
  const members = useMemo(() => data?.teamData.members ?? [], [data?.teamData.members]);
  const teamReports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const reportRows = useMemo(
    () => aggregateSaleReportsByUser(members, teamReports),
    [members, teamReports],
  );
  const visibleReportRows = useMemo(
    () =>
      reportRows.filter((row) => {
        if (saleFilter !== "all" && row.userId !== saleFilter) return false;
        return true;
      }),
    [reportRows, saleFilter],
  );
  const warningStats = useMemo(
    () => buildTeamReportWarningStats(members, teamReports, normalizedRange.to),
    [members, normalizedRange.to, teamReports],
  );

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Báo cáo team Sale"
        subtitle="Theo dõi hiệu suất Sale trong team bạn phụ trách"
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} hideLabel />
            <Select value={saleFilter} onValueChange={setSaleFilter}>
              <SelectTrigger className="h-10 w-44 rounded-xl bg-white">
                <SelectValue placeholder="Sale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Sale</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {getLeaderSaleMemberName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Tải lại
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <TeamReportInsightCard
          tone="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
          value={warningStats.missingReports}
          label="Sale chưa báo cáo hôm nay"
        />
        <TeamReportInsightCard
          tone="orange"
          icon={<ClipboardList className="h-4 w-4" />}
          value={warningStats.incompleteReports}
          label="Sale báo cáo thiếu dữ liệu"
        />
        <TeamReportInsightCard
          tone="red"
          icon={<AlertTriangle className="h-4 w-4" />}
          value={warningStats.zeroRevenueWithData}
          label="Sale có data nhưng doanh số bằng 0"
        />
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full min-w-[1220px] text-sm">
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 shadow-sm">
                  <tr>
                    {[
                      "Sale",
                      "Data mới nhận",
                      "Data mới chốt",
                      "Data thả nổi nhận",
                      "Data thả nổi chốt",
                      "DS khách mới",
                      "DS thả nổi",
                      "Khách cũ",
                      "Tổng DS",
                      "Tỉ lệ chốt",
                      "TB đơn",
                    ].map((header, index) => (
                      <th
                        key={header}
                        className={cn("px-3 py-3", index === 0 ? "text-left" : "text-right")}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleReportRows.map((row) => {
                    return (
                      <tr key={row.userId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar name={row.memberName} size={34} />
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">{row.memberName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.memberHandle}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportInteger(row, row.newDataReceived)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportInteger(row, row.newDataClosed)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportInteger(row, row.floatingDataReceived)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportInteger(row, row.floatingDataClosed)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportMoney(row, row.newCustomerRevenue)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportMoney(row, row.floatingRevenue)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatReportInteger(row, row.oldCustomers)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold">
                          {formatReportMoney(row, row.totalRevenue)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <CloseRateBadge value={row.closeRate} hasReports={row.hasReports} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          {row.hasReports && row.averageOrder ? formatMoney(row.averageOrder) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleReportRows.length && (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                        Chưa có báo cáo team phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function useSaleReportsRange(profileId: string | undefined, range: DateRangeValue) {
  return useQuery({
    queryKey: ["sale-dashboard", profileId, range.from, range.to],
    enabled: !!profileId,
    queryFn: () => fetchSaleReportsInRange(profileId!, range.from, range.to),
  });
}

type LeaderSaleTeam = {
  id: string;
  name: string;
  description: string | null;
};

type LeaderSaleTeamRole = "leader" | "employee" | "member";

type LeaderSaleTeamMember = {
  membership_id: string;
  id: string;
  auth_user_id: string | null;
  team_id: string;
  teamName: string;
  role_in_team: LeaderSaleTeamRole;
  full_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  role: string | null;
  profileMissing: boolean;
};

type LeaderSaleTeamData = {
  teams: LeaderSaleTeam[];
  members: LeaderSaleTeamMember[];
  leads: FloatingLeadRow[];
};

const LEADER_SALE_TEAM_ROLES = new Set<LeaderSaleTeamRole>(["leader", "employee", "member"]);

function normalizeLeaderSaleTeamRole(role: string | null | undefined): LeaderSaleTeamRole {
  if (role === "leader") return "leader";
  if (role === "member") return "member";
  return "employee";
}

function isLeaderSaleTeamRole(role: string | null | undefined): role is LeaderSaleTeamRole {
  return LEADER_SALE_TEAM_ROLES.has(role as LeaderSaleTeamRole);
}

export function SaleKpiWorkspace() {
  const { profile, role } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const [kpiMode, setKpiMode] = useState<"personal" | "team">("personal");
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: [
      "sale-kpi-workspace",
      profile?.id,
      role,
      kpiMode,
      normalizedRange.from,
      normalizedRange.to,
    ],
    enabled: !!profile?.id,
    queryFn: async () => {
      if (role === APP_ROLES.SALE_LEADER && kpiMode === "team") {
        const teamData = await fetchLeaderSaleTeamData(profile!.id);
        const memberIds = teamData.members.map((member) => member.id);
        const reports = await fetchSaleReportsForUsers(
          memberIds,
          normalizedRange.from,
          normalizedRange.to,
        );
        const targets = await fetchSaleKpiTargetsForScope({
          from: normalizedRange.from,
          to: normalizedRange.to,
          teamIds: teamData.teams.map((team) => team.id),
          userIds: memberIds,
        });
        return { reports, targets, teamData };
      }
      const reports = await fetchSaleReportsInRange(
        profile!.id,
        normalizedRange.from,
        normalizedRange.to,
      );
      const targets = await fetchSaleKpiTargetsForScope({
        from: normalizedRange.from,
        to: normalizedRange.to,
        userIds: [profile!.id],
      });
      return { reports, targets, teamData: null };
    },
  });
  const reports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const summary = useMemo(() => summarizeSaleReports(reports), [reports]);
  const trend = useMemo(() => groupSaleReportsByDate(reports), [reports]);
  const target = useMemo(() => pickLatestSaleKpiTarget(data?.targets ?? []), [data?.targets]);
  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Target className="h-5 w-5" />}
        title="KPI Sale"
        subtitle={
          role === APP_ROLES.SALE_LEADER && kpiMode === "team"
            ? "KPI team Sale và từng thành viên trong team"
            : "KPI cá nhân: tỷ lệ chốt, doanh số và trung bình đơn"
        }
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {role === APP_ROLES.SALE_LEADER ? (
        <Tabs value={kpiMode} onValueChange={(value) => setKpiMode(value as "personal" | "team")}>
          <TabsList className="rounded-xl">
            <TabsTrigger value="personal">KPI cá nhân</TabsTrigger>
            <TabsTrigger value="team">KPI team</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <KpiDetailCard
            title="Tỷ lệ chốt"
            value={formatNullablePercent(summary.closeRate)}
            description={`${formatInteger(summary.totalDataClosed)} / ${formatInteger(summary.totalDataReceived)} data · Target ${formatKpiMetricValue(target?.close_rate_target, "percent")}`}
            chartType="bar"
            chartData={trend.map((item) => ({
              label: shortDate(item.date),
              value: item.closeRate,
            }))}
          />
          <KpiDetailCard
            title="Doanh số"
            value={formatMoney(summary.totalRevenue)}
            description={`Target ${formatKpiMetricValue(target?.revenue_target, "money")}`}
            chartType="line"
            chartData={trend.map((item) => ({ label: shortDate(item.date), value: item.revenue }))}
          />
          <Card className="rounded-2xl xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Tiến độ KPI Sale</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              {saleMetrics.map((metric) => {
                const actual = metric.actual(summary);
                const targetValue = metric.target(target);
                const progress = metricProgress({ actual, target: targetValue });
                return (
                  <div key={metric.key} className="rounded-2xl border bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-xl font-black">
                      {formatKpiMetricValue(actual, metric.kind)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Target {formatKpiMetricValue(targetValue, metric.kind)}
                    </p>
                    <Progress value={progress ?? 0} className="mt-3 h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {role === APP_ROLES.SALE_LEADER && kpiMode === "team" ? (
            <LeaderSalePerformanceTable
              rows={buildSaleMemberPerformance(
                data?.teamData?.members ?? [],
                data?.teamData?.leads ?? [],
                reports,
              )}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SaleFloatingPoolWorkspace() {
  return <SaleFloatingPoolBoard />;
}

function SaleFloatingPoolBoard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [poolStatusFilter, setPoolStatusFilter] = useState("all");
  const [leadDrafts, setLeadDrafts] = useState<Record<string, FloatingLeadCareDraft>>({});
  const [recentlyUpdatedLeadIds, setRecentlyUpdatedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["sale-floating-leads", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      try {
        await releaseExpiredFloatingLeadsForSale(profile!.id);
      } catch (error) {
        console.warn("[sale-floating-pool] release expired leads failed", error);
      }
      return fetchSaleFloatingLeads();
    },
  });
  const allLeads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const visibleLeads = useMemo(
    () => allLeads.filter((lead) => matchesPoolStatusFilter(lead, poolStatusFilter)),
    [allLeads, poolStatusFilter],
  );
  const stats = useMemo(
    () => ({
      total: allLeads.length,
      unassigned: allLeads.filter((lead) => !lead.assigned_sale_id && !lead.is_closed).length,
      assigned: allLeads.filter((lead) => !!lead.assigned_sale_id && !lead.is_closed).length,
      closed: allLeads.filter((lead) => lead.is_closed).length,
    }),
    [allLeads],
  );

  const currentSaleName = profile?.full_name || profile?.username || "Sale";

  const isLeadOwnedByCurrentSale = (lead: FloatingLeadRow) =>
    !!profile && (lead.assigned_sale_id === profile.id || lead.closed_by === profile.id);

  const canEditLead = (lead: FloatingLeadRow) =>
    !!profile && lead.assigned_sale_id === profile.id && !lead.is_closed;

  const refreshLeads = () =>
    queryClient.invalidateQueries({
      queryKey: ["sale-floating-leads", profile?.id],
    });

  const handleRefreshLeads = async () => {
    await refreshLeads();
  };

  const getLeadDraft = (lead: FloatingLeadRow): FloatingLeadCareDraft =>
    leadDrafts[lead.id] ?? {
      call_1: lead.call_1 ?? "",
      call_2: lead.call_2 ?? "",
      call_3: lead.call_3 ?? "",
      note: lead.note ?? "",
      is_closed: lead.is_closed,
    };

  const startEditingLead = (lead: FloatingLeadRow) => {
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: {
        call_1: lead.call_1 ?? "",
        call_2: lead.call_2 ?? "",
        call_3: lead.call_3 ?? "",
        note: lead.note ?? "",
        is_closed: lead.is_closed,
      },
    }));
    setEditingLeadId(lead.id);
  };

  const handleClaimLead = async (lead: FloatingLeadRow) => {
    if (!profile || lead.assigned_sale_id || lead.is_closed) return;
    try {
      await claimFloatingLead({
        leadId: lead.id,
        profileId: profile.id,
        profileName: currentSaleName,
      });
      await refreshLeads();
      toast.success("Đã nhận data");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể nhận data");
    }
  };

  const updateLeadField = <
    K extends keyof Pick<FloatingLeadCareDraft, "call_1" | "call_2" | "call_3" | "note">,
  >(
    lead: FloatingLeadRow,
    field: K,
    value: FloatingLeadCareDraft[K],
  ) => {
    if (!canEditLead(lead)) return;
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: { ...getLeadDraft(lead), [field]: value },
    }));
  };

  const updateLeadClosed = (lead: FloatingLeadRow, checked: boolean) => {
    if (!canEditLead(lead)) return;
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: { ...getLeadDraft(lead), is_closed: checked },
    }));
  };

  const markLeadUpdated = (leadId: string) => {
    setRecentlyUpdatedLeadIds((current) => new Set(current).add(leadId));
    window.setTimeout(() => {
      setRecentlyUpdatedLeadIds((current) => {
        const next = new Set(current);
        next.delete(leadId);
        return next;
      });
    }, 2500);
  };

  const handleSaveLead = async (lead: FloatingLeadRow) => {
    if (!canEditLead(lead)) {
      toast.error("Không thể cập nhật lead");
      return;
    }

    try {
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng.");
      await updateFloatingLeadCare({
        lead,
        draft: getLeadDraft(lead),
        profileId: profile.id,
      });
      await refreshLeads();
      markLeadUpdated(lead.id);
      setEditingLeadId(null);
      toast.success("Đã cập nhật lead thành công");
    } catch {
      toast.error("Không thể cập nhật lead");
    }
  };

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Đã copy số điện thoại");
    } catch {
      toast.error("Không thể copy số điện thoại");
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<Database className="h-5 w-5" />}
        title="Kho Lead Thả Nổi"
        subtitle={
          <span className="space-y-1">
            <span className="block">Danh sách data được thả nổi cho đội Sale xử lý</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold italic text-red-600">
              <Lock className="h-3.5 w-3.5" />
              *Lưu ý: Vui lòng kiểm tra kĩ số trên Odoo xem đã chốt chưa trước khi gọi
            </span>
          </span>
        }
        rightContent={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-xl px-3"
              title="Tải lại danh sách"
              aria-label="Tải lại danh sách"
              disabled={leadsQuery.isFetching}
              onClick={handleRefreshLeads}
            >
              <RefreshCw className={cn("h-4 w-4", leadsQuery.isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Tải lại</span>
            </Button>
            <FloatingLeadStatCard
              label="Tổng lead"
              value={stats.total}
              className="from-slate-900 to-slate-700 text-white"
            />
            <FloatingLeadStatCard
              label="Chưa nhận"
              value={stats.unassigned}
              className="from-amber-50 to-orange-50 text-amber-800"
            />
            <FloatingLeadStatCard
              label="Đã nhận"
              value={stats.assigned}
              className="from-blue-50 to-cyan-50 text-blue-800"
            />
            <FloatingLeadStatCard
              label="Đã chốt"
              value={stats.closed}
              className="from-emerald-50 to-teal-50 text-emerald-800"
            />
          </div>
        }
        actions={
          <>
            <Select value={poolStatusFilter} onValueChange={setPoolStatusFilter}>
              <SelectTrigger
                aria-label="Tình trạng"
                className="h-10 w-44 rounded-xl border-slate-200 bg-white text-sm font-semibold shadow-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tình trạng</SelectItem>
                <SelectItem value="unclaimed">Chưa gọi</SelectItem>
                <SelectItem value="called_1">Đã gọi 1</SelectItem>
                <SelectItem value="called_2">Đã gọi 2</SelectItem>
                <SelectItem value="called_3">Đã gọi 3</SelectItem>
                <SelectItem value="released">Đã release</SelectItem>
                <SelectItem value="closed">Đã chốt</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {leadsQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="hidden max-h-[min(64vh,620px)] overflow-auto lg:block">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="sticky top-0 z-20 border-b bg-white shadow-sm">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-20 w-14 bg-white px-4 py-3 text-center">STT</th>
                      <th className="sticky top-0 z-20 w-28 bg-white px-3 py-3">Ngày</th>
                      <th className="sticky top-0 z-20 w-48 bg-white px-3 py-3">Số điện thoại</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 1</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 2</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 3</th>
                      <th className="sticky top-0 z-20 w-64 bg-white px-3 py-3">Tình trạng</th>
                      <th className="sticky top-0 z-20 w-20 bg-white px-4 py-3 text-right">
                        Hành động
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead, index) => {
                      const isUnassigned = !lead.assigned_sale_id;
                      const isMine = isLeadOwnedByCurrentSale(lead);
                      const isClosed = lead.is_closed;
                      const isMaxedOut = lead.claim_count >= 3;
                      const isEditing = canEditLead(lead) && editingLeadId === lead.id;
                      const isAssigned = !!lead.assigned_sale_id;
                      const isAssignedByOther = isAssigned && !isMine;
                      const isRecentlyUpdated = recentlyUpdatedLeadIds.has(lead.id);
                      const activeCallField = getFloatingLeadCallField(lead);
                      const draft = getLeadDraft(lead);
                      return (
                        <tr
                          key={lead.id}
                          className={cn(
                            "border-b transition-colors last:border-b-0 hover:bg-slate-50/80",
                            isAssigned && !isEditing && "bg-slate-50 text-slate-500",
                            isClosed && "bg-emerald-50/80 text-emerald-900",
                            isEditing && "bg-blue-50/40 ring-1 ring-inset ring-blue-100",
                            isRecentlyUpdated && "bg-emerald-50/70",
                            isAssignedByOther && "text-slate-400",
                          )}
                        >
                          <td className="px-4 py-2 text-center align-middle font-semibold text-slate-500">
                            {index + 1}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-slate-500">
                            {formatVietnameseDate(lead.lead_date)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                            <button
                              type="button"
                              className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-bold leading-none text-slate-900 transition hover:bg-slate-200"
                              onClick={() => copyPhone(lead.phone)}
                            >
                              <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="whitespace-nowrap">{lead.phone}</span>
                            </button>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <LeadInlineInput
                              value={draft.call_1 ?? ""}
                              disabled={
                                !canEditLeadCallField(isEditing, activeCallField, "call_1", lead)
                              }
                              placeholder={isEditing ? "Cập nhật lần 1" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_1", value)}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <LeadInlineInput
                              value={draft.call_2 ?? ""}
                              disabled={
                                !canEditLeadCallField(isEditing, activeCallField, "call_2", lead)
                              }
                              placeholder={isEditing ? "Cập nhật lần 2" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_2", value)}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <LeadInlineInput
                              value={draft.call_3 ?? ""}
                              disabled={
                                !canEditLeadCallField(isEditing, activeCallField, "call_3", lead)
                              }
                              placeholder={isEditing ? "Cập nhật lần 3" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_3", value)}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                              <LeadPoolStatusBadge lead={lead} currentSaleId={profile?.id} />
                              {isMine && !isClosed ? (
                                <LeadClosedCheckbox
                                  checked={draft.is_closed}
                                  disabled={!isEditing}
                                  onChange={(checked) => updateLeadClosed(lead, checked)}
                                />
                              ) : null}
                            </div>
                            {isEditing ? (
                              <textarea
                                value={draft.note ?? ""}
                                rows={2}
                                className="mt-2 w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
                                placeholder="Ghi chú nội bộ"
                                onChange={(event) =>
                                  updateLeadField(lead, "note", event.target.value)
                                }
                              />
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-right align-middle">
                            <LeadActionButton
                              isUnassigned={isUnassigned}
                              isMine={isMine}
                              isEditing={isEditing}
                              isMaxedOut={isMaxedOut}
                              isClosed={isClosed}
                              onClaim={() => handleClaimLead(lead)}
                              onEdit={() => startEditingLead(lead)}
                              onSave={() => handleSaveLead(lead)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 lg:hidden">
                {visibleLeads.map((lead, index) => {
                  const isUnassigned = !lead.assigned_sale_id;
                  const isMine = isLeadOwnedByCurrentSale(lead);
                  const isClosed = lead.is_closed;
                  const isMaxedOut = lead.claim_count >= 3;
                  const isEditing = canEditLead(lead) && editingLeadId === lead.id;
                  const isAssigned = !!lead.assigned_sale_id;
                  const isAssignedByOther = isAssigned && !isMine;
                  const isRecentlyUpdated = recentlyUpdatedLeadIds.has(lead.id);
                  const activeCallField = getFloatingLeadCallField(lead);
                  const draft = getLeadDraft(lead);
                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm",
                        isAssigned && !isEditing && "bg-slate-50 text-slate-500",
                        isClosed && "border-emerald-200 bg-emerald-50/80 text-emerald-900",
                        isEditing && "border-blue-200 bg-blue-50/30",
                        isRecentlyUpdated && "border-emerald-200 bg-emerald-50/70",
                        isAssignedByOther && "text-slate-400",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-muted-foreground">
                            #{index + 1} · {formatVietnameseDate(lead.lead_date)}
                          </p>
                          <button
                            type="button"
                            className="mt-1 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-black leading-none text-slate-950"
                            onClick={() => copyPhone(lead.phone)}
                          >
                            <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="whitespace-nowrap">{lead.phone}</span>
                          </button>
                        </div>
                        <LeadActionButton
                          isUnassigned={isUnassigned}
                          isMine={isMine}
                          isEditing={isEditing}
                          isMaxedOut={isMaxedOut}
                          isClosed={isClosed}
                          onClaim={() => handleClaimLead(lead)}
                          onEdit={() => startEditingLead(lead)}
                          onSave={() => handleSaveLead(lead)}
                        />
                      </div>
                      <div className="mt-3 grid gap-2">
                        <LeadInlineInput
                          value={draft.call_1 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, activeCallField, "call_1", lead)
                          }
                          placeholder="Cuộc gọi lần 1"
                          onChange={(value) => updateLeadField(lead, "call_1", value)}
                        />
                        <LeadInlineInput
                          value={draft.call_2 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, activeCallField, "call_2", lead)
                          }
                          placeholder="Cuộc gọi lần 2"
                          onChange={(value) => updateLeadField(lead, "call_2", value)}
                        />
                        <LeadInlineInput
                          value={draft.call_3 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, activeCallField, "call_3", lead)
                          }
                          placeholder="Cuộc gọi lần 3"
                          onChange={(value) => updateLeadField(lead, "call_3", value)}
                        />
                        <LeadPoolStatusBadge lead={lead} currentSaleId={profile?.id} />
                        {isMine && !isClosed ? (
                          <div className="grid gap-2">
                            <LeadClosedCheckbox
                              checked={draft.is_closed}
                              disabled={!isEditing}
                              onChange={(checked) => updateLeadClosed(lead, checked)}
                            />
                            <textarea
                              value={draft.note ?? ""}
                              rows={2}
                              className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary disabled:bg-slate-50 disabled:text-slate-500"
                              placeholder="Ghi chú nội bộ"
                              disabled={!isEditing}
                              onChange={(event) =>
                                updateLeadField(lead, "note", event.target.value)
                              }
                            />
                          </div>
                        ) : lead.note ? (
                          <p className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                            {lead.note}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!visibleLeads.length && (
                <div className="p-6">
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center">
                    <Database className="h-8 w-8 text-slate-400" />
                    <p className="mt-3 font-bold text-slate-900">Chưa có lead trong khoảng này</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Data sẽ xuất hiện tại đây khi Marketing hoặc hệ thống thả xuống.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function LeaderSaleTeamWorkspace() {
  const { profile } = useAuth();
  const monthRange = useMemo(() => normalizeDateRange(initialDateRange("month")), []);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["leader-sale-team", profile?.id, monthRange.from, monthRange.to],
    enabled: !!profile?.id,
    queryFn: async () => {
      const teamData = await fetchLeaderSaleTeamData(profile!.id, monthRange.from, monthRange.to);
      const reports = await fetchSaleReportsForUsers(
        teamData.members.map((member) => member.id),
        monthRange.from,
        monthRange.to,
      );
      return { teamData, reports };
    },
  });
  const members = useMemo(() => data?.teamData.members ?? [], [data?.teamData.members]);
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const leaderTeams = useMemo(() => data?.teamData.teams ?? [], [data?.teamData.teams]);
  const teamLeads = useMemo(() => data?.teamData.leads ?? [], [data?.teamData.leads]);
  const teamReports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const memberPerformance = useMemo(
    () => buildSaleMemberPerformance(activeMembers, teamLeads, teamReports),
    [activeMembers, teamLeads, teamReports],
  );
  const performanceById = useMemo(
    () => new Map(memberPerformance.map((item) => [item.id, item])),
    [memberPerformance],
  );

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<UsersRound className="h-5 w-5" />}
        title="Thành viên team"
        subtitle="Danh sách nhân viên Sale trong team bạn quản lý"
        actions={
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 rounded-xl"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Tải lại
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Team Sale đang lead
              </p>
              {leaderTeams.map((team) => (
                <div key={team.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-black text-slate-950">{team.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {team.description || "Team Sale"}
                  </p>
                </div>
              ))}
              {!leaderTeams.length && (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Bạn chưa được gán làm Leader Sale của team nào.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nhân viên Sale</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Vai trò</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Lead giữ</th>
                    <th className="px-4 py-3">Lead chốt</th>
                    <th className="px-4 py-3">Doanh thu tháng</th>
                    <th className="px-4 py-3">Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.map((member) => {
                    const performance = performanceById.get(member.id);
                    return (
                      <tr key={member.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">
                            {getLeaderSaleMemberName(member)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatLeaderSaleMemberHandle(member)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{member.teamName}</td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              isLeaderSaleLeader(member)
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-50"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-50",
                            )}
                          >
                            {formatLeaderSaleTeamRole(member)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              member.status === "active"
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-100",
                            )}
                          >
                            {member.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{formatInteger(performance?.heldLeads ?? 0)}</td>
                        <td className="px-4 py-3">
                          {formatInteger(performance?.closedLeads ?? 0)}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatMoney(performance?.revenue ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          {formatNullablePercent(performance?.closeRate ?? null)}
                        </td>
                      </tr>
                    );
                  })}
                  {!activeMembers.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        Chưa có thành viên team.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function LeaderSaleMetricCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "amber";
}) {
  const tones = {
    slate: "border-slate-200 bg-white",
    green: "border-emerald-100 bg-emerald-50",
    amber: "border-amber-100 bg-amber-50",
  };
  return (
    <Card className={cn("rounded-2xl shadow-sm", tones[tone])}>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

type SaleMemberPerformance = {
  id: string;
  name: string;
  teamName: string;
  revenue: number;
  closeRate: number | null;
  dataReceived: number;
  dataClosed: number;
  heldLeads: number;
  calledLeads: number;
  closedLeads: number;
  overdueLeads: number;
};

function LeaderSalePerformanceTable({ rows }: { rows: SaleMemberPerformance[] }) {
  const sortedRows = [...rows].sort((a, b) => b.revenue - a.revenue);
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hiệu suất từng Sale</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Sale</th>
                <th className="px-4 py-2.5">Team</th>
                <th className="px-4 py-2.5">Doanh thu</th>
                <th className="px-4 py-2.5">Tỉ lệ chốt</th>
                <th className="px-4 py-2.5">Data chốt</th>
                <th className="px-4 py-2.5">Lead giữ</th>
                <th className="px-4 py-2.5">Lead chốt</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.teamName}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(row.revenue)}</td>
                  <td className="px-4 py-3">{formatNullablePercent(row.closeRate)}</td>
                  <td className="px-4 py-3">
                    {formatInteger(row.dataClosed)} / {formatInteger(row.dataReceived)}
                  </td>
                  <td className="px-4 py-3">{formatInteger(row.heldLeads)}</td>
                  <td className="px-4 py-3">{formatInteger(row.closedLeads)}</td>
                </tr>
              ))}
              {!sortedRows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Chưa có thành viên hoặc dữ liệu hiệu suất.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderSaleTeamPerformanceCard({
  stats,
  rows,
}: {
  stats: ReturnType<typeof summarizeFloatingLeadTeam>;
  rows: SaleMemberPerformance[];
}) {
  const compactStats = [
    { label: "Tổng lead", value: stats.total, tone: "slate" },
    { label: "Chưa nhận", value: stats.unassigned, tone: "slate" },
    { label: "Đang giữ", value: stats.claimed, tone: "blue" },
    { label: "Đã gọi", value: stats.called, tone: "amber" },
    { label: "Đã chốt", value: stats.closed, tone: "green" },
    { label: "Quá hạn", value: stats.overdue, tone: "rose" },
  ] as const;
  const sortedRows = [...rows].sort((a, b) => b.revenue - a.revenue);

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hiệu suất & Lead team</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tổng hợp hiệu suất Sale và trạng thái lead team.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-2">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {compactStats.map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-xl px-3 py-2",
                item.tone === "blue" && "bg-blue-50 text-blue-700",
                item.tone === "amber" && "bg-amber-50 text-amber-700",
                item.tone === "green" && "bg-emerald-50 text-emerald-700",
                item.tone === "rose" && "bg-rose-50 text-rose-700",
                item.tone === "slate" && "bg-slate-100 text-slate-800",
              )}
            >
              <p className="text-[11px] font-bold uppercase opacity-75">{item.label}</p>
              <p className="text-xl font-black">{formatInteger(item.value)}</p>
            </div>
          ))}
        </div>

        <div className="max-h-[460px] overflow-auto rounded-xl border">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 shadow-sm">
              <tr>
                <th className="px-3 py-2.5 text-left">Sale</th>
                <th className="px-3 py-2.5 text-left">Team</th>
                <th className="px-3 py-2.5 text-right">Doanh thu</th>
                <th className="px-3 py-2.5 text-right">Tỉ lệ chốt</th>
                <th className="px-3 py-2.5 text-right">Data chốt</th>
                <th className="px-3 py-2.5 text-right">Lead giữ</th>
                <th className="px-3 py-2.5 text-right">Đã gọi</th>
                <th className="px-3 py-2.5 text-right">Lead chốt</th>
                <th className="px-3 py-2.5 text-right">Lead quá hạn</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3 font-bold text-slate-900">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.teamName}</td>
                  <td className="px-3 py-3 text-right font-semibold">{formatMoney(row.revenue)}</td>
                  <td className="px-3 py-3 text-right">{formatNullablePercent(row.closeRate)}</td>
                  <td className="px-3 py-3 text-right">
                    {formatInteger(row.dataClosed)} / {formatInteger(row.dataReceived)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatInteger(row.heldLeads)}</td>
                  <td className="px-3 py-3 text-right">{formatInteger(row.calledLeads)}</td>
                  <td className="px-3 py-3 text-right">{formatInteger(row.closedLeads)}</td>
                  <td className="px-3 py-3 text-right">{formatInteger(row.overdueLeads)}</td>
                </tr>
              ))}
              {!sortedRows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                    Chưa có thành viên hoặc dữ liệu hiệu suất.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function summarizeFloatingLeadTeam(leads: FloatingLeadRow[]) {
  const now = Date.now();
  const called = leads.filter((lead) => lead.call_1 || lead.call_2 || lead.call_3).length;
  const closed = leads.filter((lead) => lead.is_closed).length;
  const total = leads.length;
  return {
    total,
    unassigned: leads.filter((lead) => !lead.assigned_sale_id && !lead.is_closed).length,
    claimed: leads.filter((lead) => !!lead.assigned_sale_id && !lead.is_closed).length,
    called,
    overdue: leads.filter((lead) => {
      if (!lead.assigned_at || lead.is_closed) return false;
      const assignedAt = new Date(lead.assigned_at).getTime();
      return Number.isFinite(assignedAt) && now >= assignedAt + 24 * 60 * 60_000;
    }).length,
    closed,
    closeRate: total ? closed / total : null,
  };
}

function buildSaleMemberPerformance(
  members: LeaderSaleTeamMember[],
  leads: FloatingLeadRow[],
  reports: SaleReportRow[],
): SaleMemberPerformance[] {
  return members.map((member) => {
    const memberReports = reports.filter((report) => report.user_id === member.id);
    const summary = summarizeSaleReports(memberReports);
    return {
      id: member.id,
      name: getLeaderSaleMemberName(member),
      teamName: member.teamName,
      revenue: summary.totalRevenue,
      closeRate: summary.closeRate,
      dataReceived: summary.totalDataReceived,
      dataClosed: summary.totalDataClosed,
      heldLeads: leads.filter((lead) => lead.assigned_sale_id === member.id && !lead.is_closed)
        .length,
      calledLeads: leads.filter(
        (lead) =>
          (lead.assigned_sale_id === member.id ||
            lead.closed_by === member.id ||
            lead.blocked_sale_ids.includes(member.id)) &&
          (lead.call_1 || lead.call_2 || lead.call_3),
      ).length,
      closedLeads: leads.filter((lead) => lead.closed_by === member.id).length,
      overdueLeads: leads.filter((lead) => {
        if (lead.assigned_sale_id !== member.id || !lead.assigned_at || lead.is_closed)
          return false;
        const assignedAt = new Date(lead.assigned_at).getTime();
        return Number.isFinite(assignedAt) && Date.now() >= assignedAt + 24 * 60 * 60_000;
      }).length,
    };
  });
}

function buildLeaderSaleWarnings(
  members: LeaderSaleTeamMember[],
  leads: FloatingLeadRow[],
  reports: SaleReportRow[],
  date: string,
) {
  const warnings: string[] = [];
  const todayReports = reports.filter(
    (report) => report.report_date === date && report.status === "submitted",
  );
  const missingReportCount = members.filter(
    (member) => !todayReports.some((report) => report.user_id === member.id),
  ).length;
  const overdueLeadCount = summarizeFloatingLeadTeam(leads).overdue;
  const calledThreeNotClosed = leads.filter(
    (lead) => !lead.is_closed && lead.call_3?.trim(),
  ).length;
  if (missingReportCount)
    warnings.push(`${missingReportCount} Sale chưa báo cáo ngày ${formatVietnameseDate(date)}.`);
  if (overdueLeadCount) warnings.push(`${overdueLeadCount} lead đang giữ quá 24h.`);
  if (calledThreeNotClosed)
    warnings.push(`${calledThreeNotClosed} lead đã gọi 3 lần nhưng chưa chốt.`);
  const performance = buildSaleMemberPerformance(members, leads, reports);
  const lowCloseRate = performance.filter(
    (item) => item.dataReceived > 0 && (item.closeRate ?? 0) < 0.2,
  ).length;
  if (lowCloseRate) warnings.push(`${lowCloseRate} Sale có tỉ lệ chốt dưới 20%.`);
  return warnings;
}

function buildTeamReportWarningStats(
  members: LeaderSaleTeamMember[],
  reports: SaleReportRow[],
  date: string,
) {
  const todaySubmitted = reports.filter(
    (report) => report.report_date === date && report.status === "submitted",
  );
  const missing = members.filter(
    (member) => !todaySubmitted.some((report) => report.user_id === member.id),
  );
  const incomplete = members.filter((member) => {
    const count = todaySubmitted.filter((report) => report.user_id === member.id).length;
    return count > 0 && count < saleReportSlots.length;
  });
  const zeroRevenueWithData = members.filter((member) => {
    const summary = summarizeSaleReports(
      todaySubmitted.filter((report) => report.user_id === member.id),
    );
    return summary.totalDataReceived > 0 && summary.totalRevenue === 0;
  }).length;
  return {
    missingReports: missing.length,
    incompleteReports: incomplete.length,
    zeroRevenueWithData,
  };
}

type AggregatedSaleTeamReportRow = {
  userId: string;
  memberName: string;
  memberHandle: string;
  hasReports: boolean;
  newDataReceived: number;
  newDataClosed: number;
  floatingDataReceived: number;
  floatingDataClosed: number;
  newCustomerRevenue: number;
  floatingRevenue: number;
  oldCustomers: number;
  totalRevenue: number;
  closeRate: number | null;
  averageOrder: number | null;
};

function aggregateSaleReportsByUser(
  members: LeaderSaleTeamMember[],
  reports: SaleReportRow[],
): AggregatedSaleTeamReportRow[] {
  return members.map((member) => {
    const memberReports = reports.filter((report) => report.user_id === member.id);
    const summary = summarizeSaleReports(memberReports);
    return {
      userId: member.id,
      memberName: getLeaderSaleMemberName(member),
      memberHandle: formatLeaderSaleMemberHandle(member),
      hasReports: memberReports.length > 0,
      newDataReceived: memberReports.reduce(
        (sum, report) => sum + Number(report.new_data_received ?? 0),
        0,
      ),
      newDataClosed: memberReports.reduce(
        (sum, report) => sum + Number(report.new_data_closed ?? 0),
        0,
      ),
      floatingDataReceived: memberReports.reduce(
        (sum, report) => sum + Number(report.floating_data_received ?? 0),
        0,
      ),
      floatingDataClosed: memberReports.reduce(
        (sum, report) => sum + Number(report.floating_data_closed ?? 0),
        0,
      ),
      newCustomerRevenue: memberReports.reduce(
        (sum, report) => sum + Number(report.new_customer_revenue ?? 0),
        0,
      ),
      floatingRevenue: memberReports.reduce(
        (sum, report) => sum + Number(report.floating_revenue ?? 0),
        0,
      ),
      oldCustomers: memberReports.reduce(
        (sum, report) => sum + Number(report.old_customers ?? 0),
        0,
      ),
      totalRevenue: summary.totalRevenue,
      closeRate: summary.closeRate,
      averageOrder: summary.averageOrder,
    };
  });
}

function TeamReportInsightCard({
  tone,
  icon,
  value,
  label,
}: {
  tone: "amber" | "orange" | "red";
  icon: ReactNode;
  value: number;
  label: string;
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 shadow-sm",
        styles[tone],
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </span>
      <p className="text-sm font-semibold leading-tight">
        <span className="font-black">{formatInteger(value)}</span> {label}
      </p>
    </div>
  );
}

function formatReportInteger(row: AggregatedSaleTeamReportRow, value: number) {
  return row.hasReports ? formatInteger(value) : "—";
}

function formatReportMoney(row: AggregatedSaleTeamReportRow, value: number) {
  return row.hasReports ? formatMoney(value) : "—";
}

function CloseRateBadge({ value, hasReports }: { value: number | null; hasReports: boolean }) {
  if (!hasReports || value === null) return <span className="text-muted-foreground">—</span>;
  const percent = value * 100;
  const tone =
    percent > 20
      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
      : percent >= 10
        ? "bg-amber-50 text-amber-700 hover:bg-amber-50"
        : "bg-red-50 text-red-700 hover:bg-red-50";
  return (
    <Badge className={cn("min-w-14 justify-center", tone)}>{formatNullablePercent(value)}</Badge>
  );
}

function getLeaderSaleMemberName(member: LeaderSaleTeamMember) {
  return member.full_name || member.username || member.email || "User chưa có profile";
}

function formatLeaderSaleMemberHandle(member: LeaderSaleTeamMember) {
  if (member.username) return `@${member.username}`;
  if (member.email) return member.email;
  return "User chưa có profile";
}

function isLeaderSaleLeader(member: LeaderSaleTeamMember) {
  return member.role_in_team === "leader";
}

function formatLeaderSaleTeamRole(member: LeaderSaleTeamMember) {
  return isLeaderSaleLeader(member) ? "Leader Sale" : "Nhân viên Sale";
}

function FloatingLeadStatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <Card
      className={cn(
        "min-w-[96px] overflow-hidden rounded-xl border-0 bg-gradient-to-br shadow-sm",
        className,
      )}
    >
      <CardContent className="flex items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold leading-tight opacity-75">{label}</p>
          <p className="text-lg font-black leading-tight">{formatInteger(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeadInlineInput({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      className="h-9 w-full min-w-40 rounded-xl border bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary disabled:bg-slate-50 disabled:text-slate-500"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function canEditLeadCallField(
  isEditing: boolean,
  activeCallField: FloatingLeadCallField,
  field: FloatingLeadCallField,
  lead: Pick<FloatingLeadRow, "call_1" | "call_2" | "call_3">,
) {
  return isEditing && activeCallField === field && !lead[field]?.trim();
}

function LeadActionButton({
  isUnassigned,
  isMine,
  isEditing,
  isMaxedOut,
  isClosed,
  onClaim,
  onEdit,
  onSave,
}: {
  isUnassigned: boolean;
  isMine: boolean;
  isEditing: boolean;
  isMaxedOut: boolean;
  isClosed: boolean;
  onClaim: () => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  if (isClosed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        className="h-9 w-9 rounded-xl p-0"
        title={isMine ? "Lead đã chốt" : "Lead đã chốt"}
        aria-label={isMine ? "Lead đã chốt" : "Lead đã chốt"}
      >
        {isMine ? <Pencil className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </Button>
    );
  }

  if (isUnassigned) {
    if (isMaxedOut) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          className="h-9 w-9 rounded-xl p-0"
          title="Lead đã được xử lý đủ 3 lượt"
          aria-label="Lead đã được xử lý đủ 3 lượt"
        >
          <Lock className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 w-9 rounded-xl p-0 text-emerald-700 hover:bg-emerald-50"
        title="Nhận số"
        aria-label="Nhận số"
        onClick={onClaim}
      >
        <UserPlus className="h-4 w-4" />
      </Button>
    );
  }

  if (!isMine) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        className="h-9 w-9 rounded-xl p-0"
        title={isClosed ? "Lead đã chốt" : "Lead đã có người nhận"}
        aria-label={isClosed ? "Lead đã chốt" : "Lead đã có người nhận"}
      >
        <Lock className="h-4 w-4" />
      </Button>
    );
  }

  if (isEditing) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-9 w-9 rounded-xl bg-emerald-600 p-0 text-white hover:bg-emerald-700"
        title="Cập nhật"
        aria-label="Cập nhật"
        onClick={onSave}
      >
        <Save className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 w-9 rounded-xl p-0"
      title="Sửa"
      aria-label="Sửa"
      onClick={onEdit}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}

function LeadPoolStatusBadge({
  lead,
  currentSaleId,
}: {
  lead: FloatingLeadRow;
  currentSaleId?: string;
}) {
  const normalizedCount = getLeadCallStatusCount(lead);
  const state = getSaleLeadRowState(lead, currentSaleId);
  const label =
    state === "closed"
      ? "Đã chốt"
      : state === "claimed_by_me"
        ? "Đang xử lý"
        : state === "claimed_by_other"
          ? "Đã có sale nhận"
          : state === "released" && normalizedCount === 0
            ? "Đã release"
            : normalizedCount === 0
              ? "Chưa ai nhận"
              : `Đã gọi ${normalizedCount}`;
  const styles = {
    unclaimed: "border-slate-200 bg-slate-50 text-slate-700",
    claimed_by_me: "border-blue-100 bg-blue-50 text-blue-700",
    claimed_by_other: "border-amber-100 bg-amber-50 text-amber-700",
    released: "border-violet-100 bg-violet-50 text-violet-700",
    closed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center rounded-full border px-2.5 text-xs font-bold",
        styles[state],
      )}
    >
      {label}
    </span>
  );
}

function LeadClosedCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-bold",
        checked
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700",
        disabled && "opacity-80",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="h-3.5 w-3.5 accent-emerald-600"
        onChange={(event) => onChange(event.target.checked)}
      />
      Đã chốt
    </label>
  );
}

function getSaleLeadRowState(lead: FloatingLeadRow, currentSaleId?: string) {
  if (lead.is_closed) return "closed";
  if (lead.assigned_sale_id === currentSaleId) return "claimed_by_me";
  if (lead.assigned_sale_id) return "claimed_by_other";
  if (lead.lifecycle_status === "released") return "released";
  return "unclaimed";
}

function getLeadCallStatusCount(lead: Pick<FloatingLeadRow, "call_1" | "call_2" | "call_3">) {
  if (lead.call_3?.trim()) return 3;
  if (lead.call_2?.trim()) return 2;
  if (lead.call_1?.trim()) return 1;
  return 0;
}

function matchesPoolStatusFilter(lead: FloatingLeadRow, filter: string) {
  if (filter === "all") return true;
  if (filter === "closed") return lead.is_closed;
  if (filter === "released") return lead.lifecycle_status === "released";
  if (lead.is_closed) return false;
  const count = getLeadCallStatusCount(lead);
  if (filter === "unclaimed") return count === 0;
  if (filter === "called_1") return count === 1;
  if (filter === "called_2") return count === 2;
  if (filter === "called_3") return count === 3;
  return true;
}

function formatVietnameseDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

async function fetchSaleReportsForUsers(userIds: string[], from: string, to: string) {
  if (!userIds.length) return [] as SaleReportRow[];
  const { data, error } = await supabase
    .from("sale_reports")
    .select("*")
    .in("user_id", userIds)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: true })
    .order("slot_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SaleReportRow[];
}

async function fetchSaleKpiTargetsForScope({
  from,
  to,
  teamIds = [],
  userIds = [],
}: {
  from: string;
  to: string;
  teamIds?: string[];
  userIds?: string[];
}) {
  let query = supabase
    .from("sale_kpi_targets")
    .select("*")
    .lte("period_start", to)
    .gte("period_end", from)
    .order("updated_at", { ascending: false });

  const filters = [
    ...teamIds.map((id) => `team_id.eq.${id}`),
    ...userIds.map((id) => `user_id.eq.${id}`),
  ];
  if (filters.length) query = query.or(filters.join(","));

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Tables<"sale_kpi_targets">[];
}

function pickLatestSaleKpiTarget(targets: Tables<"sale_kpi_targets">[]) {
  return [...targets].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  })[0];
}

async function fetchLeaderSaleTeamData(
  profileId: string,
  from?: string,
  to?: string,
): Promise<LeaderSaleTeamData> {
  const { data: memberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", profileId)
    .eq("role_in_team", "leader")
    .eq("is_active", true);
  if (membershipError) throw membershipError;

  const leaderTeamIds = (memberships ?? []).map((membership) => membership.team_id);
  if (!leaderTeamIds.length) {
    return { teams: [], members: [], leads: [] };
  }

  const [{ data: teams, error: teamsError }, { data: teamMembers, error: teamMembersError }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, description")
        .in("id", leaderTeamIds)
        .eq("department", "sale"),
      supabase
        .from("team_memberships")
        .select("id, team_id, user_id, role_in_team")
        .in("team_id", leaderTeamIds)
        .eq("is_active", true),
    ]);
  if (teamsError) throw teamsError;
  if (teamMembersError) throw teamMembersError;

  const typedTeams = (teams ?? []) as LeaderSaleTeam[];
  const saleTeamIds = new Set(typedTeams.map((team: LeaderSaleTeam) => team.id));
  const teamNameById = new Map(typedTeams.map((team: LeaderSaleTeam) => [team.id, team.name]));
  const rawMembers = (teamMembers ?? []).filter(
    (member) => saleTeamIds.has(member.team_id) && isLeaderSaleTeamRole(member.role_in_team),
  );
  const rawMemberIds = Array.from(new Set(rawMembers.map((member) => member.user_id)));
  const { data: profilesById, error: profilesByIdError } = rawMemberIds.length
    ? await supabase
        .from("profiles")
        .select("id, auth_user_id, full_name, username, email, phone, status")
        .in("id", rawMemberIds)
    : { data: [], error: null };
  if (profilesByIdError) throw profilesByIdError;

  const profileByMembershipUserId = new Map<string, NonNullable<typeof profilesById>[number]>();
  for (const profile of profilesById ?? []) {
    profileByMembershipUserId.set(profile.id, profile);
  }
  const roleLookupIds = Array.from(
    new Set([
      ...rawMemberIds,
      ...rawMembers
        .map((member) => profileByMembershipUserId.get(member.user_id)?.id)
        .filter(Boolean),
    ]),
  ) as string[];
  const { data: userRoles, error: rolesError } = roleLookupIds.length
    ? await supabase.from("user_roles").select("user_id, role").in("user_id", roleLookupIds)
    : { data: [], error: null };
  if (rolesError) throw rolesError;
  const roleByUserId = new Map((userRoles ?? []).map((row) => [row.user_id, row.role]));
  const members: LeaderSaleTeamMember[] = rawMembers
    .filter((member) => saleTeamIds.has(member.team_id))
    .map((member) => {
      const profile = profileByMembershipUserId.get(member.user_id);
      const canonicalUserId = profile?.id ?? member.user_id;
      const normalizedRoleInTeam = normalizeLeaderSaleTeamRole(member.role_in_team);
      return {
        membership_id: member.id,
        id: canonicalUserId,
        auth_user_id: profile?.auth_user_id ?? null,
        team_id: member.team_id,
        teamName: teamNameById.get(member.team_id) ?? "Team Sale",
        role_in_team: normalizedRoleInTeam,
        full_name: profile?.full_name ?? "User chưa có profile",
        username: profile?.username ?? "missing-profile",
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        status: profile?.status ?? "inactive",
        role:
          roleByUserId.get(canonicalUserId) ??
          roleByUserId.get(member.user_id) ??
          normalizedRoleInTeam,
        profileMissing: !profile,
      };
    });
  const memberIds = Array.from(new Set(members.map((member) => member.id)));
  if (!memberIds.length) return { teams: typedTeams, members, leads: [] };

  let leadsQuery = supabase
    .from("floating_leads")
    .select("*")
    .order("lead_date", { ascending: false })
    .order("updated_at", { ascending: false });
  if (from) leadsQuery = leadsQuery.gte("lead_date", from);
  if (to) leadsQuery = leadsQuery.lte("lead_date", to);
  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) throw leadsError;
  const memberIdSet = new Set(memberIds);
  const teamLeads = ((leads ?? []) as FloatingLeadRow[]).filter(
    (lead) =>
      (lead.assigned_sale_id && memberIdSet.has(lead.assigned_sale_id)) ||
      (lead.closed_by && memberIdSet.has(lead.closed_by)) ||
      lead.blocked_sale_ids.some((saleId) => memberIdSet.has(saleId)),
  );

  return {
    teams: typedTeams,
    members,
    leads: teamLeads,
  };
}

function HeroKpiCard({
  title,
  value,
  subtitle,
  meta,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  meta: Array<[string, string]>;
  tone: "green" | "blue" | "amber";
}) {
  const styles = {
    green: "from-emerald-500 to-teal-500 shadow-emerald-500/20",
    blue: "from-blue-600 to-cyan-500 shadow-blue-500/20",
    amber: "from-amber-500 to-orange-500 shadow-amber-500/20",
  };
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border-0 bg-gradient-to-br text-white shadow-xl",
        styles[tone],
      )}
    >
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/80">{title}</p>
            <p className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{value}</p>
            <p className="mt-2 text-sm text-white/80">{subtitle}</p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
            <Target className="h-6 w-6" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-1/3 rounded-full bg-white/70" />
          </div>
          <div className="flex justify-between text-xs font-semibold text-white/85">
            <span>Tiến độ KPI</span>
            <span>Chưa đặt mục tiêu</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {meta.map(([label, itemValue]) => (
            <div key={label} className="rounded-2xl bg-white/12 px-3 py-2">
              <p className="text-xs text-white/70">{label}</p>
              <p className="mt-1 text-sm font-bold">{itemValue}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiProgressCard({ summary }: { summary: ReturnType<typeof summarizeSaleReports> }) {
  const rows = [
    {
      label: "Tỷ lệ chốt",
      value: formatNullablePercent(summary.closeRate),
      detail: `${formatInteger(summary.totalDataClosed)} data chốt`,
    },
    {
      label: "Doanh số",
      value: formatMoney(summary.totalRevenue),
      detail: "Target chưa đặt mục tiêu",
    },
    {
      label: "TB đơn",
      value: summary.averageOrder ? formatMoney(summary.averageOrder) : "—",
      detail: "Tính theo data đã chốt",
    },
  ];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-primary" />
          Tiến độ KPI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-black text-slate-950">{row.value}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
            <KpiMiniProgress label="Tiến độ" className="mt-3" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function KpiMiniProgress({ label, className }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">Chưa đặt mục tiêu</span>
      </div>
      <Progress value={0} className="h-1.5" />
    </div>
  );
}

function ShiftPerformanceCard({
  slotSummaries,
}: {
  slotSummaries: ReturnType<typeof summarizeSaleReportsBySlot>;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-emerald-600" />
          Hiệu suất theo ca
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {slotSummaries.map(({ slot, summary }) => {
          const closeRate = summary.closeRate ?? 0;
          return (
            <div key={slot.id} className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-950">{slot.tableLabel}</p>
                <ShiftBadge closeRate={closeRate} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <ShiftMetric label="Data nhận" value={formatInteger(summary.totalDataReceived)} />
                <ShiftMetric label="Data chốt" value={formatInteger(summary.totalDataClosed)} />
                <ShiftMetric label="Tỷ lệ" value={formatPercent(closeRate)} />
                <ShiftMetric label="Doanh số" value={formatMoneyCompact(summary.totalRevenue)} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SaleTrendCard({
  data,
}: {
  data: Array<{ date: string; closeRate: number; revenue: number }>;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-blue-600" />
          Xu hướng doanh số
        </CardTitle>
      </CardHeader>
      <CardContent className="h-60">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.map((item) => ({ ...item, label: shortDate(item.date) }))}>
              <XAxis dataKey="label" />
              <YAxis hide />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptySaleState />
        )}
      </CardContent>
    </Card>
  );
}

function DataOverviewCard({ summary }: { summary: ReturnType<typeof summarizeSaleReports> }) {
  const rows = [
    ["Data mới nhận", summary.newDataReceived],
    ["Data thả nổi nhận", summary.floatingDataReceived],
    ["Data mới chốt", summary.newDataClosed],
    ["Data thả nổi chốt", summary.floatingDataClosed],
    ["Khách cũ", summary.oldCustomers],
  ];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tổng quan dữ liệu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="font-black text-slate-950">{formatInteger(Number(value))}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({ activities }: { activities: SaleReportRow[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-amber-500" />
          Hoạt động gần đây
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length ? (
          activities.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="flex w-12 shrink-0 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                {item.slot_time}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">
                  {item.status === "submitted" ? "Đã gửi báo cáo" : "Đã lưu nháp"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(item.report_date)} · Doanh số{" "}
                  {formatMoney(Number(item.new_customer_revenue) + Number(item.floating_revenue))}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptySaleState />
        )}
      </CardContent>
    </Card>
  );
}

function KpiDetailCard({
  title,
  value,
  description,
  chartType,
  chartData,
}: {
  title: string;
  value: string;
  description: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{title}</p>
            <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline">Chưa đặt mục tiêu</Badge>
        </div>
        <Progress value={0} className="h-2" />
        <div className="h-32">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={chartData}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip formatter={(itemValue) => `${itemValue}%`} />
                  <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip formatter={(itemValue) => formatMoney(Number(itemValue))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <EmptySaleState />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ShiftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ShiftBadge({ closeRate }: { closeRate: number }) {
  const label = closeRate >= 0.35 ? "Tốt" : closeRate >= 0.25 ? "Ổn" : "Cần cải thiện";
  const styles = {
    Tốt: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Ổn: "bg-blue-50 text-blue-700 border-blue-100",
    "Cần cải thiện": "bg-amber-50 text-amber-700 border-amber-100",
  };
  return <Badge className={cn("border", styles[label])}>{label}</Badge>;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

function formatMoneyCompact(value: number) {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  return formatMoney(value);
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("vi-VN");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100).toLocaleString("vi-VN")}%`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "—" : formatPercent(value);
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function shortDate(value: string) {
  return formatShortDate(value);
}

function formatRangeLabel(range: DateRangeValue) {
  if (range.from === range.to) return formatShortDate(range.from);
  return `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`;
}

function EmptySaleState() {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-xl bg-slate-50 text-sm text-muted-foreground">
      Chưa có dữ liệu báo cáo Sale trong khoảng này.
    </div>
  );
}
