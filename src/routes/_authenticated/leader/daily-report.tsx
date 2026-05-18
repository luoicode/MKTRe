import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getLatestDailyReportPerEmployeeRange,
  getLeaderTeamIds,
  sumTotals,
  type EmployeeLatest,
} from "@/lib/dailyAggregates";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  calculateReportMetrics,
  fmtVndDong,
  fmtInt,
  fmtPctValue,
  formatDateVN,
} from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";

export const Route = createFileRoute("/_authenticated/leader/daily-report")({
  component: LeaderDailyReport,
});

function LeaderDailyReport() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const normalizedRange = normalizeDateRange(range);
  const dateLabel =
    normalizedRange.from === normalizedRange.to
      ? formatDateVN(normalizedRange.from)
      : `${formatDateVN(normalizedRange.from)} - ${formatDateVN(normalizedRange.to)}`;
  const isSingleDay = normalizedRange.from === normalizedRange.to;
  const reportTitle = isSingleDay
    ? "BÁO CÁO TỔNG TEAM TRONG NGÀY"
    : "BÁO CÁO TỔNG TEAM THEO KHOẢNG NGÀY";
  const [screenshot, setScreenshot] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date().toISOString());

  useEffect(() => {
    if (screenshot) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshot]);

  const { data, isLoading } = useQuery({
    queryKey: ["leader-daily", profile?.id, normalizedRange.from, normalizedRange.to],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getLeaderTeamIds(profile!.id);
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      const agg = await getLatestDailyReportPerEmployeeRange({
        teamIds,
        from: normalizedRange.from,
        to: normalizedRange.to,
      });
      setNow(new Date().toISOString());
      return { teamIds, teams: teams ?? [], rows: agg.rows };
    },
  });

  const totals = useMemo(() => (data ? sumTotals(data.rows) : null), [data]);
  const totalsMetrics = useMemo(() => (totals ? calculateReportMetrics(totals) : null), [totals]);
  const teamName = data?.teams.map((t) => t.name).join(", ") || "—";
  const missing = (data?.rows ?? []).filter((r) => !r.countedInTotal);

  return (
    <div className="w-full min-w-0 space-y-2 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <div className="screenshot-hide shrink-0 gap-2 md:flex md:flex-wrap md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <ReportActions
          targetRef={ref}
          filename={teamReportExportFilename(now, normalizedRange.to, teamName)}
          screenshotMode={screenshot}
          onToggleScreenshot={() => setScreenshot((v) => !v)}
        />
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
                <b>Team:</b> {teamName}
              </div>
              <div>
                <b>Leader:</b> {profile?.full_name}
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
                  {data.rows.map((r) => (
                    <EmpRow key={r.user_id} r={r} />
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border-t px-2 py-1.5">TỔNG</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totals.ads_cost)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(totals.mess_count)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.cp_mess)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(totals.data_count)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.cp_data)}</td>
                    <td className="border-t px-2 py-1.5">{fmtInt(totals.closed_orders)}</td>
                    <td className="border-t px-2 py-1.5">{fmtPctValue(totalsMetrics.conv_rate)}</td>
                    <td className="border-t px-2 py-1.5">
                      {fmtVndDong(totals.daily_data_revenue)}
                    </td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totalsMetrics.avg_order)}</td>
                    <td className="border-t px-2 py-1.5">
                      {fmtPctValue(totalsMetrics.cp_daily_pct)}
                    </td>
                    <td className="border-t px-2 py-1.5">{fmtInt(totals.total_orders)}</td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totals.total_revenue)}</td>
                    <td className="border-t px-2 py-1.5">
                      {fmtPctValue(totalsMetrics.cp_total_pct)}
                    </td>
                    <td className="border-t px-2 py-1.5">{fmtVndDong(totals.recovered_revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {isSingleDay && missing.length > 0 && (
            <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
              <b>Nhân viên chưa báo cáo / chưa gửi:</b> {missing.map((m) => m.full_name).join(", ")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
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

function EmpRow({ r }: { r: EmployeeLatest }) {
  const muted = !r.countedInTotal;
  return (
    <tr className={muted ? "bg-amber-50/50 text-slate-500" : ""}>
      <td className="border-b px-2 py-1 font-medium">{r.full_name}</td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtVndDong(r.ads_cost) : "—"}</td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtInt(r.mess_count) : "—"}</td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtVndDong(calculateReportMetrics(r).cp_mess) : "—"}
      </td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtInt(r.data_count) : "—"}</td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtVndDong(calculateReportMetrics(r).cp_data) : "—"}
      </td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtInt(r.closed_orders) : "—"}</td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtPctValue(calculateReportMetrics(r).conv_rate) : "—"}
      </td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtVndDong(r.daily_data_revenue) : "—"}</td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtVndDong(calculateReportMetrics(r).avg_order) : "—"}
      </td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtPctValue(calculateReportMetrics(r).cp_daily_pct) : "—"}
      </td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtInt(r.total_orders) : "—"}</td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtVndDong(r.total_revenue) : "—"}</td>
      <td className="border-b px-2 py-1">
        {r.hasReport ? fmtPctValue(calculateReportMetrics(r).cp_total_pct) : "—"}
      </td>
      <td className="border-b px-2 py-1">{r.hasReport ? fmtVndDong(r.recovered_revenue) : "—"}</td>
    </tr>
  );
}
