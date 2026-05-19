import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, TrendingUp, Target, MessageSquare, Database, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import {
  deriveRates,
  getVisibleReports,
  groupMetricsByDate,
  type ReportMetricTotals,
  sumReportMetrics,
} from "@/lib/analytics";
import { formatPercent, fmtInt, fmtVndDong } from "@/lib/reports";
import { kpiPercent, kpiStatus, kpiStatusLabel } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PageContent, PageHeader, PageShell, ScrollArea } from "@/components/layout/PageShell";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";
import {
  calculateSalaryEstimate,
  type SalaryAttendanceRecord,
  type SalaryEstimate,
  type SalaryRole,
  type SalaryRule,
} from "@/lib/salary";

export function AnalyticsDashboard({
  scope,
}: {
  scope: "admin" | "manager" | "leader" | "employee";
}) {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const { from, to } = normalizeDateRange(range);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["analytics-dashboard", scope, profile?.id, from, to],
    enabled: scope === "admin" || !!profile,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (scope === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (scope === "manager") teamIds = await getManagerTeamIds(profile!.id);
      const [reports, leaderPersonalReports] = await Promise.all([
        getVisibleReports({
          from,
          to,
          teamIds,
          userId: scope === "employee" ? profile!.id : undefined,
        }),
        scope === "leader"
          ? getVisibleReports({
              from,
              to,
              userId: profile!.id,
            })
          : Promise.resolve([]),
      ]);

      let kpiQuery = supabase
        .from("kpi_targets")
        .select("revenue_target, ads_target, data_target, orders_target, team_id, user_id")
        .lte("period_start", to)
        .gte("period_end", from);
      if (scope === "employee") kpiQuery = kpiQuery.eq("user_id", profile!.id);
      else if (teamIds?.length) kpiQuery = kpiQuery.in("team_id", teamIds);
      const { data: kpis } = await kpiQuery;

      let leaderPersonalKpis: Pick<Tables<"kpi_targets">, "revenue_target">[] = [];
      if (scope === "leader") {
        const { data: personalKpis, error: personalKpisError } = await supabase
          .from("kpi_targets")
          .select("revenue_target")
          .eq("user_id", profile!.id)
          .lte("period_start", to)
          .gte("period_end", from);
        if (personalKpisError) throw personalKpisError;
        leaderPersonalKpis = personalKpis ?? [];
      }

      let salaryRules: SalaryRule[] = [];
      let salaryAttendance: SalaryAttendanceRecord[] = [];
      const salaryUserId = scope === "employee" || scope === "leader" ? profile!.id : null;
      if (salaryUserId) {
        const [rulesResult, attendanceResult] = await Promise.all([
          supabase
            .from("salary_rules")
            .select("role, revenue_min, revenue_max, base_salary, milestone_bonus, over_kpi_bonus")
            .eq("is_active", true),
          supabase
            .from("attendance_records")
            .select("attendance_date, status")
            .eq("user_id", salaryUserId)
            .gte("attendance_date", from)
            .lte("attendance_date", to),
        ]);
        if (rulesResult.error) throw rulesResult.error;
        if (attendanceResult.error) throw attendanceResult.error;
        salaryRules = rulesResult.data ?? [];
        salaryAttendance = attendanceResult.data ?? [];
      }

      return {
        reports,
        leaderPersonalReports,
        kpis: kpis ?? [],
        leaderPersonalKpis,
        teamIds: teamIds ?? [],
        salaryRules,
        salaryAttendance,
      };
    },
  });

  const totals = useMemo(() => sumReportMetrics(data?.reports ?? []), [data]);
  const rates = useMemo(() => deriveRates(totals), [totals]);
  const leaderPersonalTotals = useMemo(
    () => sumReportMetrics(data?.leaderPersonalReports ?? []),
    [data],
  );
  const leaderPersonalRates = useMemo(
    () => deriveRates(leaderPersonalTotals),
    [leaderPersonalTotals],
  );
  const daily = useMemo(() => groupMetricsByDate(data?.reports ?? []), [data]);
  const kpiRevenueTarget = (data?.kpis ?? []).reduce(
    (sum: number, k: Pick<Tables<"kpi_targets">, "revenue_target">) =>
      sum + Number(k.revenue_target ?? 0),
    0,
  );
  const leaderPersonalKpiRevenueTarget = (data?.leaderPersonalKpis ?? []).reduce(
    (sum: number, k: Pick<Tables<"kpi_targets">, "revenue_target">) =>
      sum + Number(k.revenue_target ?? 0),
    0,
  );
  const kpiCompletion = kpiPercent(totals.total_revenue, kpiRevenueTarget);
  const status = kpiStatus(kpiCompletion);
  const salaryRole: SalaryRole | null =
    scope === "employee" ? "employee" : scope === "leader" ? "leader" : null;
  const salaryEstimate = salaryRole
    ? calculateSalaryEstimate({
        rules: data?.salaryRules ?? [],
        role: salaryRole,
        revenue: scope === "leader" ? leaderPersonalTotals.total_revenue : totals.total_revenue,
        kpiTarget: scope === "leader" ? leaderPersonalKpiRevenueTarget : kpiRevenueTarget,
        attendanceRecords: data?.salaryAttendance ?? [],
        from,
        to,
      })
    : null;
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <PageShell className="gap-3">
      <PageHeader className="space-y-3 md:flex md:items-center md:justify-between md:gap-4 md:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "admin"
              ? "Toàn hệ thống"
              : scope === "manager"
                ? "TP Marketing"
                : scope === "leader"
                  ? "Leader team"
                  : "Cá nhân"}{" "}
            · Doanh thu, ads, KPI và hiệu suất theo khoảng ngày.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
          <SalaryHeaderSummary estimate={salaryEstimate} />
          <DateRangeFilter
            value={range}
            onChange={setRange}
            trailingControl={<RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />}
          />
        </div>
      </PageHeader>

      {isLoading ? (
        <PageContent className="flex justify-center py-12 md:items-center">
          <Loader2 className="h-7 w-7 animate-spin" />
        </PageContent>
      ) : (
        <ScrollArea className="space-y-3 md:pr-2">
          {scope === "leader" ? (
            <OverviewSection
              title="Hiệu suất cá nhân"
              subtitle="Số liệu riêng của Leader"
              badge="Cá nhân"
            >
              <DashboardMetrics totals={leaderPersonalTotals} rates={leaderPersonalRates} />
              <SalaryEstimateCard estimate={salaryEstimate} />
            </OverviewSection>
          ) : null}

          <OverviewSection
            title={scope === "leader" ? "Tổng quan team" : "Tổng quan"}
            subtitle={
              scope === "leader"
                ? "Tổng hợp toàn team, bao gồm cả báo cáo của Leader"
                : "Tổng hợp theo phạm vi dữ liệu hiện tại"
            }
            badge={scope === "leader" ? "Team" : undefined}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat
                icon={TrendingUp}
                label="Tổng doanh thu"
                value={fmtVndDong(totals.total_revenue)}
              />
              <Stat icon={Target} label="Chi phí Ads" value={fmtVndDong(totals.ads_cost)} />
              <Stat icon={MessageSquare} label="Mess" value={fmtInt(totals.mess_count)} />
              <Stat icon={Database} label="Data" value={fmtInt(totals.data_count)} />
              <Stat icon={ShoppingCart} label="Đơn chốt" value={fmtInt(totals.total_orders)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Mini label="Chi Phí ADS/MESS" value={fmtVndDong(rates.cp_mess)} />
              <Mini
                label="Tỉ lệ chốt DATA trong ngày"
                value={formatPercent(rates.conversion_rate)}
              />
              <Mini label="Chi Phí/DATA trong ngày" value={fmtVndDong(rates.cp_data)} />
              <Mini
                label="Chi Phí ADS/Doanh số ngày"
                value={formatPercent(rates.cp_daily_revenue)}
              />
              <Mini label="Trung bình đơn" value={fmtVndDong(rates.avg_order)} />
              <Mini label="Chi Phí ADS/Tổng Doanh Số" value={formatPercent(rates.cp_revenue)} />
            </div>
          </OverviewSection>

          {scope === "employee" ? <SalaryEstimateCard estimate={salaryEstimate} /> : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">KPI doanh thu</CardTitle>
              <Badge
                variant={
                  status === "done" ? "default" : status === "near" ? "secondary" : "destructive"
                }
              >
                {kpiStatusLabel(status)}
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Mini
                  label="Mục tiêu"
                  value={kpiRevenueTarget ? fmtVndDong(kpiRevenueTarget) : "Chưa đặt KPI"}
                />
                <Mini label="Thực tế" value={fmtVndDong(totals.total_revenue)} />
                <Mini
                  label="% hoàn thành"
                  value={kpiCompletion == null ? "—" : `${kpiCompletion}%`}
                />
              </div>
            </CardContent>
          </Card>

          {daily.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <ChartCard title="Doanh thu theo ngày">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000000)}tr`} />
                  <Tooltip formatter={(v) => fmtVndDong(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="total_revenue"
                    stroke="var(--primary)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ChartCard>
              <ChartCard title="Chi phí Ads theo ngày">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000000)}tr`} />
                  <Tooltip formatter={(v) => fmtVndDong(Number(v))} />
                  <Bar dataKey="ads_cost" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu báo cáo trong khoảng ngày đã chọn.
              </CardContent>
            </Card>
          )}
        </ScrollArea>
      )}
    </PageShell>
  );
}

function SalaryHeaderSummary({ estimate }: { estimate: SalaryEstimate | null }) {
  if (!estimate?.rule) return null;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/40 bg-[linear-gradient(135deg,#0f766e,#2563eb_52%,#7c3aed)] px-4 py-3 text-white shadow-[0_0_28px_rgba(45,212,191,0.45)] transition duration-200 hover:scale-[1.02] hover:shadow-[0_0_36px_rgba(45,212,191,0.62)] md:min-w-[260px]">
      <div className="animate-pulse">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100/90">
          Lương tạm tính
        </p>
        <p className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
          {fmtVndDong(Math.round(estimate.totalEstimatedSalary))}
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewSection({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card/80 p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function DashboardMetrics({
  totals,
  rates,
}: {
  totals: ReportMetricTotals;
  rates: ReturnType<typeof deriveRates>;
}) {
  const recoveredRevenue = totals.total_revenue - totals.daily_data_revenue;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={Target} label="Chi Phí Ads" value={fmtVndDong(totals.ads_cost)} />
        <Stat icon={MessageSquare} label="MESS" value={fmtInt(totals.mess_count)} />
        <Stat icon={Database} label="Data" value={fmtInt(totals.data_count)} />
        <Stat
          icon={ShoppingCart}
          label="Đơn chốt DATA trong ngày"
          value={fmtInt(totals.closed_orders)}
        />
        <Stat
          icon={TrendingUp}
          label="DS DATA ngày"
          value={fmtVndDong(totals.daily_data_revenue)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Tổng Đơn Chốt" value={fmtInt(totals.total_orders)} />
        <Mini label="Tổng Doanh Số" value={fmtVndDong(totals.total_revenue)} />
        <Mini label="DS chốt lại" value={fmtVndDong(recoveredRevenue)} />
        <Mini label="CP/MESS" value={fmtVndDong(rates.cp_mess)} />
        <Mini label="CP/Data" value={fmtVndDong(rates.cp_data)} />
        <Mini label="Tỉ lệ chốt" value={formatPercent(rates.conversion_rate)} />
        <Mini label="CP/DS ngày" value={formatPercent(rates.cp_daily_revenue)} />
        <Mini label="CP/Tổng DS" value={formatPercent(rates.cp_revenue)} />
        <Mini label="TB Đơn" value={fmtVndDong(rates.avg_order)} />
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold leading-tight">{value}</p>
    </div>
  );
}

function SalaryEstimateCard({ estimate }: { estimate: SalaryEstimate | null }) {
  if (!estimate) return null;

  if (!estimate.rule) {
    return (
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Lương ước tính</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm text-muted-foreground">
          Chưa cấu hình lương
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 py-3">
        <div>
          <CardTitle className="text-base">Lương ước tính</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tạm tính theo ngày công và doanh thu trong bộ lọc hiện tại.
          </p>
        </div>
        <Badge variant={estimate.kpiAchieved ? "default" : "secondary"}>
          {estimate.kpiAchieved ? "Đạt KPI" : "Tạm tính"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {!estimate.hasCheckedInToday ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Bạn chưa điểm danh hôm nay
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Mini
            label="Ngày công"
            value={`${estimate.attendedDays}/${estimate.expectedWorkdays} ngày`}
          />
          <Mini label="Lương cứng" value={fmtVndDong(Math.round(estimate.baseSalaryProrated))} />
          <Mini label="Thưởng mốc" value={fmtVndDong(estimate.milestoneBonus)} />
          <Mini label="Thưởng KPI" value={fmtVndDong(estimate.overKpiBonus)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-48 px-4 pb-4 pt-0 2xl:h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
