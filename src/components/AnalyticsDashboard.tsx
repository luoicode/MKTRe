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
  sumReportMetrics,
} from "@/lib/analytics";
import { formatPercent, fmtInt, fmtVndDong } from "@/lib/reports";
import { kpiPercent, kpiStatus, kpiStatusLabel } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PageContent, PageHeader, PageShell, ScrollArea } from "@/components/layout/PageShell";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";

export function AnalyticsDashboard({
  scope,
}: {
  scope: "admin" | "manager" | "leader" | "employee";
}) {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const { from, to } = normalizeDateRange(range);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-dashboard", scope, profile?.id, from, to],
    enabled: scope === "admin" || !!profile,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (scope === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (scope === "manager") teamIds = await getManagerTeamIds(profile!.id);
      const reports = await getVisibleReports({
        from,
        to,
        teamIds,
        userId: scope === "employee" ? profile!.id : undefined,
      });

      let kpiQuery = supabase
        .from("kpi_targets")
        .select("revenue_target, ads_target, data_target, orders_target, team_id, user_id")
        .lte("period_start", to)
        .gte("period_end", from);
      if (scope === "employee") kpiQuery = kpiQuery.eq("user_id", profile!.id);
      else if (teamIds?.length) kpiQuery = kpiQuery.in("team_id", teamIds);
      const { data: kpis } = await kpiQuery;

      return { reports, kpis: kpis ?? [], teamIds: teamIds ?? [] };
    },
  });

  const totals = useMemo(() => sumReportMetrics(data?.reports ?? []), [data]);
  const rates = useMemo(() => deriveRates(totals), [totals]);
  const daily = useMemo(() => groupMetricsByDate(data?.reports ?? []), [data]);
  const kpiRevenueTarget = (data?.kpis ?? []).reduce(
    (sum: number, k: Pick<Tables<"kpi_targets">, "revenue_target">) =>
      sum + Number(k.revenue_target ?? 0),
    0,
  );
  const kpiCompletion = kpiPercent(totals.total_revenue, kpiRevenueTarget);
  const status = kpiStatus(kpiCompletion);

  return (
    <PageShell className="gap-3">
      <PageHeader className="flex-wrap items-end justify-between gap-3 md:flex">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Dashboard</h1>
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
        <div className="mt-3 md:mt-0">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </PageHeader>

      {isLoading ? (
        <PageContent className="flex justify-center py-12 md:items-center">
          <Loader2 className="h-7 w-7 animate-spin" />
        </PageContent>
      ) : (
        <ScrollArea className="space-y-3 md:pr-2">
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
            <Mini label="Tỉ lệ chốt DATA trong ngày" value={formatPercent(rates.conversion_rate)} />
            <Mini label="Chi Phí/DATA trong ngày" value={fmtVndDong(rates.cp_data)} />
            <Mini label="Chi Phí ADS/Doanh số ngày" value={formatPercent(rates.cp_daily_revenue)} />
            <Mini label="Trung bình đơn" value={fmtVndDong(rates.avg_order)} />
            <Mini label="Chi Phí ADS/Tổng Doanh Số" value={formatPercent(rates.cp_revenue)} />
          </div>

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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold leading-tight">{value}</p>
    </div>
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
