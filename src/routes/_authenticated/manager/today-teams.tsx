import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getLatestDailyReportPerEmployeeRange,
  getManagerTeamIds,
  sumTotals,
  type TeamTotals,
} from "@/lib/dailyAggregates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import {
  calculateReportMetrics,
  fmtVndDong,
  fmtInt,
  fmtPctValue,
  formatDateVN,
  formatDateTimeVN,
} from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { RefreshButton } from "@/components/RefreshButton";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { toast } from "sonner";
import {
  fetchFacebookManagerSpend,
  formatFacebookManagerSpend,
  syncFacebookManagerSpend,
} from "@/lib/facebookAdSpend";

export const Route = createFileRoute("/_authenticated/manager/today-teams")({
  component: ManagerTodayTeams,
});

interface TeamRow {
  team_id: string;
  team_name: string;
  leader_name: string;
  totals: TeamTotals;
}

function ManagerTodayTeams() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const normalizedRange = normalizeDateRange(range);
  const dateLabel =
    normalizedRange.from === normalizedRange.to
      ? formatDateVN(normalizedRange.from)
      : `${formatDateVN(normalizedRange.from)} - ${formatDateVN(normalizedRange.to)}`;
  const isSingleDay = normalizedRange.from === normalizedRange.to;
  const reportTitle =
    normalizedRange.from === normalizedRange.to
      ? "BÁO CÁO DOANH SỐ CÁC TEAM TRONG NGÀY"
      : "BÁO CÁO DOANH SỐ CÁC TEAM THEO KHOẢNG NGÀY";
  const [screenshot, setScreenshot] = useState(false);
  const [now, setNow] = useState(new Date().toISOString());
  const [isSyncingFacebookSpend, setIsSyncingFacebookSpend] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (screenshot) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshot]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["manager-today", profile?.id, normalizedRange.from, normalizedRange.to],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getManagerTeamIds(profile!.id);
      if (!teamIds.length) return { teams: [] as TeamRow[] };
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, leader_id")
        .in("id", teamIds);
      const leaderIds = Array.from(
        new Set((teams ?? []).map((t) => t.leader_id).filter(Boolean) as string[]),
      );
      const { data: leaders } = leaderIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", leaderIds)
            .eq("status", "active")
        : { data: [] as { id: string; full_name: string }[] };
      const leaderMap = new Map((leaders ?? []).map((l) => [l.id, l.full_name]));

      const rows: TeamRow[] = [];
      for (const t of teams ?? []) {
        const agg = await getLatestDailyReportPerEmployeeRange({
          teamIds: [t.id],
          from: normalizedRange.from,
          to: normalizedRange.to,
        });
        rows.push({
          team_id: t.id,
          team_name: t.name,
          leader_name: t.leader_id ? (leaderMap.get(t.leader_id) ?? "—") : "—",
          totals: sumTotals(agg.rows),
        });
      }
      setNow(new Date().toISOString());
      return { teams: rows };
    },
  });
  const {
    data: facebookSpend,
    isFetching: isFacebookSpendFetching,
    refetch: refetchFacebookSpend,
  } = useQuery({
    queryKey: ["facebook-manager-spend", normalizedRange.from, normalizedRange.to],
    queryFn: () => fetchFacebookManagerSpend(normalizedRange.from, normalizedRange.to),
  });

  const grand = useMemo(() => {
    const t = {
      ads: 0,
      mess: 0,
      data: 0,
      closed: 0,
      dailyRev: 0,
      orders: 0,
      rev: 0,
      recovered: 0,
      emp: 0,
      reported: 0,
      missing: 0,
    };
    for (const r of data?.teams ?? []) {
      t.ads += r.totals.ads_cost;
      t.mess += r.totals.mess_count;
      t.data += r.totals.data_count;
      t.closed += r.totals.closed_orders;
      t.dailyRev += r.totals.daily_data_revenue;
      t.orders += r.totals.total_orders;
      t.rev += r.totals.total_revenue;
      t.recovered += r.totals.recovered_revenue;
      t.emp += r.totals.totalEmployees;
      t.reported += r.totals.reportedCount;
      t.missing += r.totals.missingCount;
    }
    return t;
  }, [data]);
  const grandMetrics = calculateReportMetrics({
    ads_cost: grand.ads,
    mess_count: grand.mess,
    data_count: grand.data,
    closed_orders: grand.closed,
    daily_data_revenue: grand.dailyRev,
    total_orders: grand.orders,
    total_revenue: grand.rev,
  });

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "Team",
      "Leader",
      "Số NV",
      "Đã báo cáo",
      "Chưa báo cáo",
      "Chi Phí Ads",
      "MESS",
      "Chi Phí ADS/MESS",
      "Data",
      "Chi Phí/DATA trong ngày",
      "Đơn chốt DATA trong ngày",
      "Tỉ lệ chốt DATA trong ngày",
      "Doanh số DATA trong ngày",
      "Trung bình đơn",
      "Chi Phí ADS/Doanh số ngày",
      "Tổng Đơn",
      "Tổng DS",
      "Chi Phí ADS/Tổng Doanh Số",
      "DS chốt lại",
    ];
    const lines = [headers.join(",")];
    for (const r of data.teams) {
      const t = r.totals;
      const m = calculateReportMetrics(t);
      lines.push(
        [
          `"${r.team_name}"`,
          `"${r.leader_name}"`,
          t.totalEmployees,
          t.reportedCount,
          t.missingCount,
          t.ads_cost,
          t.mess_count,
          m.cp_mess ?? "",
          t.data_count,
          m.cp_data ?? "",
          t.closed_orders,
          m.conv_rate?.toFixed(2) ?? "",
          t.daily_data_revenue,
          m.avg_order ?? "",
          m.cp_daily_pct?.toFixed(2) ?? "",
          t.total_orders,
          t.total_revenue,
          m.cp_total_pct?.toFixed(2) ?? "",
          t.recovered_revenue,
        ].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `today-teams-${normalizedRange.from}-${normalizedRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const refreshData = async () => {
    setIsSyncingFacebookSpend(true);
    try {
      await syncFacebookManagerSpend(normalizedRange.from, normalizedRange.to);
      await Promise.all([refetch(), refetchFacebookSpend()]);
      toast.success("Đã làm mới dữ liệu");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đồng bộ Facebook Ads";
      toast.error(message);
      await Promise.allSettled([refetch(), refetchFacebookSpend()]);
    } finally {
      setIsSyncingFacebookSpend(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-2 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <WorkspacePageHeader
        className="screenshot-hide"
        title="Báo cáo Marketing"
        subtitle={`${formatDateVN(normalizedRange.from)} - ${formatDateVN(normalizedRange.to)}`}
        actions={
          <>
            <div className="flex flex-wrap items-end gap-2">
              <DateRangeFilter value={range} onChange={setRange} />
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RefreshButton
                isRefreshing={isFetching || isFacebookSpendFetching || isSyncingFacebookSpend}
                onRefresh={refreshData}
              />
              <ReportActions
                targetRef={ref}
                filename={`today-teams-${normalizedRange.from}-${normalizedRange.to}.png`}
                screenshotMode={screenshot}
                onToggleScreenshot={() => setScreenshot((v) => !v)}
                sheetData={{
                  reportType: "team",
                  reportDate: normalizedRange.to,
                  dateLabel,
                  title: "Tất cả team",
                  channel: "FACEBOOK",
                  ads_cost: grand.ads,
                  mess_count: grand.mess,
                  data_count: grand.data,
                  closed_orders: grand.closed,
                  daily_data_revenue: grand.dailyRev,
                  total_orders: grand.orders,
                  total_revenue: grand.rev,
                  recovered_revenue: grand.recovered,
                }}
              />
            </div>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10 md:min-h-0 md:flex-1 md:items-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div
          ref={ref}
          className="space-y-2 bg-white p-2 text-slate-900 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden"
        >
          <header className="shrink-0 border-b-2 border-slate-900 pb-2">
            <h1 className="text-center text-lg font-extrabold">{reportTitle}</h1>
            <div className="mt-1 grid gap-1 text-xs md:grid-cols-2">
              <div>
                <b>Ngày báo cáo:</b> {dateLabel}
              </div>
              <div>
                <b>Cập nhật:</b> {formatDateTimeVN(now)}
              </div>
              <div>
                <b>TP Marketing:</b> {profile?.full_name}
              </div>
            </div>
            <p className="mt-1 text-[11px] italic text-slate-600">
              Tổng team được tính bằng báo cáo mới nhất trong ngày của từng nhân viên (lũy kế).
            </p>
          </header>

          <div className="grid shrink-0 grid-cols-3 gap-1.5 md:grid-cols-6">
            <S label="Tổng team" value={String(data?.teams.length ?? 0)} />
            <S label="Tổng nhân viên" value={fmtInt(grand.emp)} />
            {isSingleDay && (
              <>
                <S label="Đã báo cáo" value={`${grand.reported}/${grand.emp}`} />
                <S label="Chưa báo cáo" value={String(grand.missing)} danger={grand.missing > 0} />
              </>
            )}
            <S label="Tổng Chi Phí Ads" value={fmtVndDong(grand.ads)} />
            <S
              label="Chi phí trên trình quản lí"
              value={
                isSyncingFacebookSpend
                  ? "Đang đồng bộ..."
                  : formatFacebookManagerSpend(facebookSpend, fmtVndDong)
              }
              variant="managerSpend"
            />
            <S label="Chi Phí ADS/MESS" value={fmtVndDong(grandMetrics.cp_mess)} />
            <S label="Tổng Data" value={fmtInt(grand.data)} />
            <S label="Chi Phí/DATA trong ngày" value={fmtVndDong(grandMetrics.cp_data)} />
            <S label="Đơn chốt DATA trong ngày" value={fmtInt(grand.closed)} />
            <S label="Tỉ lệ chốt DATA trong ngày" value={fmtPctValue(grandMetrics.conv_rate)} />
            <S label="Doanh số DATA trong ngày" value={fmtVndDong(grand.dailyRev)} />
            <S label="Trung bình đơn" value={fmtVndDong(grandMetrics.avg_order)} />
            <S label="Chi Phí ADS/Doanh số ngày" value={fmtPctValue(grandMetrics.cp_daily_pct)} />
            <S label="Tổng Đơn Chốt" value={fmtInt(grand.orders)} />
            <S label="Tổng Doanh Số" value={fmtVndDong(grand.rev)} />
            <S label="Chi Phí ADS/Tổng Doanh Số" value={fmtPctValue(grandMetrics.cp_total_pct)} />
            <S label="Doanh số chốt lại" value={fmtVndDong(grand.recovered)} />
          </div>

          <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
            <CardHeader className="shrink-0 py-2">
              <CardTitle className="text-base">Chi tiết theo team</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto p-0">
              <table className="w-full min-w-[1200px] text-xs">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    {[
                      "Team",
                      "Leader",
                      "Số NV",
                      ...(isSingleDay ? ["Đã BC", "Chưa BC"] : []),
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
                    ].map((h) => (
                      <th key={h} className="border-b px-2 py-1.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.teams.map((r) => {
                    const m = calculateReportMetrics(r.totals);
                    return (
                      <tr key={r.team_id}>
                        <td className="border-b px-2 py-1 font-medium">{r.team_name}</td>
                        <td className="border-b px-2 py-1">{r.leader_name}</td>
                        <td className="border-b px-2 py-1">{r.totals.totalEmployees}</td>
                        {isSingleDay && (
                          <>
                            <td className="border-b px-2 py-1 text-green-700">
                              {r.totals.reportedCount}
                            </td>
                            <td
                              className={`border-b px-2 py-1 ${r.totals.missingCount > 0 ? "text-red-600 font-semibold" : ""}`}
                            >
                              {r.totals.missingCount}
                            </td>
                          </>
                        )}
                        <td className="border-b px-2 py-1">{fmtVndDong(r.totals.ads_cost)}</td>
                        <td className="border-b px-2 py-1">{fmtInt(r.totals.mess_count)}</td>
                        <td className="border-b px-2 py-1">{fmtVndDong(m.cp_mess)}</td>
                        <td className="border-b px-2 py-1">{fmtInt(r.totals.data_count)}</td>
                        <td className="border-b px-2 py-1">{fmtVndDong(m.cp_data)}</td>
                        <td className="border-b px-2 py-1">{fmtInt(r.totals.closed_orders)}</td>
                        <td className="border-b px-2 py-1">{fmtPctValue(m.conv_rate)}</td>
                        <td className="border-b px-2 py-1">
                          {fmtVndDong(r.totals.daily_data_revenue)}
                        </td>
                        <td className="border-b px-2 py-1">{fmtVndDong(m.avg_order)}</td>
                        <td className="border-b px-2 py-1">{fmtPctValue(m.cp_daily_pct)}</td>
                        <td className="border-b px-2 py-1">{fmtInt(r.totals.total_orders)}</td>
                        <td className="border-b px-2 py-1">{fmtVndDong(r.totals.total_revenue)}</td>
                        <td className="border-b px-2 py-1">{fmtPctValue(m.cp_total_pct)}</td>
                        <td className="border-b px-2 py-1">
                          {fmtVndDong(r.totals.recovered_revenue)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border-t px-2 py-1.5" colSpan={2}>
                      TỔNG
                    </td>
                    <td className="border-t px-2 py-1.5">{grand.emp}</td>
                    {isSingleDay && (
                      <>
                        <td className="border-t px-2 py-1.5">{grand.reported}</td>
                        <td className="border-t px-2 py-1.5">{grand.missing}</td>
                      </>
                    )}
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grand.ads)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(grand.mess)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grandMetrics.cp_mess)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(grand.data)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grandMetrics.cp_data)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(grand.closed)}</td>
                    <td className="border-t px-2 py-1.5">{fmtPctValue(grandMetrics.conv_rate)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grand.dailyRev)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grandMetrics.avg_order)}</td>
                    <td className="border-t px-2 py-1.5">
                      {fmtPctValue(grandMetrics.cp_daily_pct)}
                    </td>
                    <td className="border-t px-2 py-1.5">{fmtInt(grand.orders)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grand.rev)}</td>
                    <td className="border-t px-2 py-1.5">
                      {fmtPctValue(grandMetrics.cp_total_pct)}
                    </td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(grand.recovered)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function S({
  label,
  value,
  danger,
  variant,
}: {
  label: string;
  value: string;
  danger?: boolean;
  variant?: "managerSpend";
}) {
  const className =
    variant === "managerSpend"
      ? "border-amber-200 bg-amber-50"
      : danger
        ? "border-red-300 bg-red-50"
        : "bg-white";
  return (
    <div className={`rounded-lg border p-2 ${className}`}>
      <p className="text-[11px] text-slate-600">{label}</p>
      <p
        className={`mt-0.5 text-sm font-bold ${
          danger ? "text-red-700" : variant === "managerSpend" ? "text-amber-900" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
