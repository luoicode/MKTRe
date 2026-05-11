import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getLatestDailyReportPerEmployee,
  getLeaderTeamIds,
  sumTotals,
  type EmployeeLatest,
} from "@/lib/dailyAggregates";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { todayStr, fmtVndDong, fmtInt, fmtPctValue, formatDateVN, formatDateTimeVN } from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";

export const Route = createFileRoute("/_authenticated/leader/daily-report")({
  component: LeaderDailyReport,
});

function LeaderDailyReport() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [screenshot, setScreenshot] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date().toISOString());

  useEffect(() => {
    if (screenshot) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshot]);

  const { data, isLoading } = useQuery({
    queryKey: ["leader-daily", profile?.id, date],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getLeaderTeamIds(profile!.id);
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      const agg = await getLatestDailyReportPerEmployee({ teamIds, date });
      setNow(new Date().toISOString());
      return { teamIds, teams: teams ?? [], rows: agg.rows };
    },
  });

  const totals = useMemo(() => (data ? sumTotals(data.rows) : null), [data]);
  const teamName = data?.teams.map((t) => t.name).join(", ") || "—";
  const missing = (data?.rows ?? []).filter((r) => !r.countedInTotal);

  const buildText = () => {
    if (!data || !totals) return "";
    const L: string[] = [
      "BÁO CÁO TỔNG TEAM TRONG NGÀY",
      `Team: ${teamName}`,
      `Leader: ${profile?.full_name ?? ""}`,
      `Ngày báo cáo: ${formatDateVN(date)}`,
      `Thời gian cập nhật: ${formatDateTimeVN(now)}`,
      "",
      `Tổng Chi Phí Ads: ${fmtVndDong(totals.ads_cost)}`,
      `Tổng MESS: ${fmtInt(totals.mess_count)}`,
      `Tổng Data: ${fmtInt(totals.data_count)}`,
      `Tổng Đơn chốt DATA trong ngày: ${fmtInt(totals.closed_orders)}`,
      `Tổng DOANH SỐ DATA trong ngày: ${fmtVndDong(totals.daily_data_revenue)}`,
      `Tổng Đơn Chốt: ${fmtInt(totals.total_orders)}`,
      `Tổng Doanh Số: ${fmtVndDong(totals.total_revenue)}`,
      `Tổng Doanh số chốt lại: ${fmtVndDong(totals.recovered_revenue)}`,
      `ROAS team: ${totals.roas == null ? "—" : totals.roas.toFixed(2)}`,
      `Tỉ lệ chốt team: ${fmtPctValue(totals.conversion_rate)}`,
      `Đã báo cáo: ${totals.reportedCount}/${totals.totalEmployees}`,
      "",
      "CHI TIẾT NHÂN VIÊN:",
      ...data.rows.map((r) =>
        r.countedInTotal
          ? `- ${r.full_name} (${r.slot_name}): Ads ${fmtVndDong(r.ads_cost)} | DS ${fmtVndDong(r.total_revenue)} | Đơn ${fmtInt(r.total_orders)}`
          : `- ${r.full_name}: ${r.hasReport ? "Báo cáo " + r.status : "Chưa báo cáo"}`
      ),
    ];
    if (missing.length) {
      L.push("", "NHÂN VIÊN CHƯA BÁO CÁO:");
      missing.forEach((m) => L.push(`- ${m.full_name}`));
    }
    return L.join("\n");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="screenshot-hide flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="d">Ngày</Label>
          <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>

      <ReportActions
        targetRef={ref}
        filename={`daily-report-${date}.png`}
        buildText={buildText}
        screenshotMode={screenshot}
        onToggleScreenshot={() => setScreenshot((v) => !v)}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : data && totals ? (
        <div ref={ref} className="space-y-4 bg-white p-4 text-slate-900">
          <header className="border-b-2 border-slate-900 pb-3">
            <h1 className="text-center text-xl font-extrabold tracking-wide">BÁO CÁO TỔNG TEAM TRONG NGÀY</h1>
            <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
              <div><b>Team:</b> {teamName}</div>
              <div><b>Leader:</b> {profile?.full_name}</div>
              <div><b>Ngày báo cáo:</b> {formatDateVN(date)}</div>
              <div><b>Thời gian cập nhật:</b> {formatDateTimeVN(now)}</div>
            </div>
            <p className="mt-2 text-xs italic text-slate-600">
              Dữ liệu tổng team được tính bằng báo cáo mới nhất trong ngày của từng nhân viên (lũy kế), không cộng dồn các khung giờ.
            </p>
          </header>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Tổng Chi Phí Ads" value={fmtVndDong(totals.ads_cost)} />
            <Stat label="Tổng MESS" value={fmtInt(totals.mess_count)} />
            <Stat label="Tổng Data" value={fmtInt(totals.data_count)} />
            <Stat label="Tổng Đơn chốt DATA/ngày" value={fmtInt(totals.closed_orders)} />
            <Stat label="Tổng DS DATA/ngày" value={fmtVndDong(totals.daily_data_revenue)} />
            <Stat label="Tổng Đơn Chốt" value={fmtInt(totals.total_orders)} />
            <Stat label="Tổng Doanh Số" value={fmtVndDong(totals.total_revenue)} />
            <Stat label="Tổng DS chốt lại" value={fmtVndDong(totals.recovered_revenue)} />
            <Stat label="ROAS team" value={totals.roas == null ? "—" : totals.roas.toFixed(2)} />
            <Stat label="Tỉ lệ chốt team" value={fmtPctValue(totals.conversion_rate)} />
            <Stat label="Đã báo cáo" value={`${totals.reportedCount}/${totals.totalEmployees}`} />
            <Stat label="Chưa báo cáo" value={String(totals.missingCount)} danger={totals.missingCount > 0} />
          </div>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Chi tiết theo nhân viên</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1100px] text-xs">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    {["Nhân viên","Khung mới nhất","Trạng thái","Chi Phí Ads","MESS","Data","Đơn DATA/ngày","DS DATA/ngày","Tổng Đơn","Tổng DS","DS chốt lại","ROAS","Ghi chú"]
                      .map((h) => <th key={h} className="border-b px-2 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => <EmpRow key={r.user_id} r={r} />)}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border-t px-2 py-2" colSpan={3}>TỔNG</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(totals.ads_cost)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(totals.mess_count)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(totals.data_count)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(totals.closed_orders)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(totals.daily_data_revenue)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(totals.total_orders)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(totals.total_revenue)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(totals.recovered_revenue)}</td>
                    <td className="border-t px-2 py-2">{totals.roas == null ? "—" : totals.roas.toFixed(2)}</td>
                    <td className="border-t px-2 py-2"></td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {missing.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <b>Nhân viên chưa báo cáo / chưa gửi:</b>{" "}
              {missing.map((m) => m.full_name).join(", ")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-red-300 bg-red-50" : "bg-white"}`}>
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className={`mt-1 text-base font-bold ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function EmpRow({ r }: { r: EmployeeLatest }) {
  const status = !r.hasReport
    ? <Badge variant="destructive">Chưa báo cáo</Badge>
    : !r.countedInTotal
      ? <Badge variant="secondary">{r.status}</Badge>
      : !r.has_21h
        ? <Badge variant="outline">Chưa có 21h00</Badge>
        : <Badge>Đã gửi</Badge>;
  const muted = !r.countedInTotal;
  return (
    <tr className={muted ? "bg-amber-50/50 text-slate-500" : ""}>
      <td className="border-b px-2 py-1.5 font-medium">{r.full_name}</td>
      <td className="border-b px-2 py-1.5">{r.slot_name ?? "—"}</td>
      <td className="border-b px-2 py-1.5">{status}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtVndDong(r.ads_cost) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtInt(r.mess_count) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtInt(r.data_count) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtInt(r.closed_orders) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtVndDong(r.daily_data_revenue) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtInt(r.total_orders) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtVndDong(r.total_revenue) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.hasReport ? fmtVndDong(r.recovered_revenue) : "—"}</td>
      <td className="border-b px-2 py-1.5">{r.roas == null ? "—" : r.roas.toFixed(2)}</td>
      <td className="border-b px-2 py-1.5 max-w-[200px] truncate">{r.note ?? ""}</td>
    </tr>
  );
}
