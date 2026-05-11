import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getLatestDailyReportPerEmployee,
  getManagerTeamIds,
  sumTotals,
  type TeamTotals,
} from "@/lib/dailyAggregates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { todayStr, fmtVndDong, fmtInt, fmtPctValue, formatDateVN, formatDateTimeVN } from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";

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
  const [date, setDate] = useState(todayStr());
  const [screenshot, setScreenshot] = useState(false);
  const [now, setNow] = useState(new Date().toISOString());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (screenshot) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshot]);

  const { data, isLoading } = useQuery({
    queryKey: ["manager-today", profile?.id, date],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getManagerTeamIds(profile!.id);
      if (!teamIds.length) return { teams: [] as TeamRow[] };
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, leader_id")
        .in("id", teamIds);
      const leaderIds = Array.from(new Set((teams ?? []).map((t) => t.leader_id).filter(Boolean) as string[]));
      const { data: leaders } = leaderIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", leaderIds)
        : { data: [] as { id: string; full_name: string }[] };
      const leaderMap = new Map((leaders ?? []).map((l) => [l.id, l.full_name]));

      const rows: TeamRow[] = [];
      for (const t of teams ?? []) {
        const agg = await getLatestDailyReportPerEmployee({ teamIds: [t.id], date });
        rows.push({
          team_id: t.id,
          team_name: t.name,
          leader_name: t.leader_id ? leaderMap.get(t.leader_id) ?? "—" : "—",
          totals: sumTotals(agg.rows),
        });
      }
      setNow(new Date().toISOString());
      return { teams: rows };
    },
  });

  const grand = useMemo(() => {
    const t = { ads:0, mess:0, data:0, closed:0, dailyRev:0, orders:0, rev:0, recovered:0, emp:0, reported:0, missing:0 };
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
    const roas = t.ads > 0 ? t.rev / t.ads : null;
    const conv = t.data > 0 ? (t.closed / t.data) * 100 : null;
    return { ...t, roas, conv };
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const headers = ["Team","Leader","Số NV","Đã báo cáo","Chưa báo cáo","Chi Phí Ads","MESS","Data","Đơn DATA/ngày","DS DATA/ngày","Tổng Đơn","Tổng DS","DS chốt lại","ROAS","Tỉ lệ chốt %"];
    const lines = [headers.join(",")];
    for (const r of data.teams) {
      const t = r.totals;
      lines.push([
        `"${r.team_name}"`, `"${r.leader_name}"`, t.totalEmployees, t.reportedCount, t.missingCount,
        t.ads_cost, t.mess_count, t.data_count, t.closed_orders, t.daily_data_revenue, t.total_orders,
        t.total_revenue, t.recovered_revenue, t.roas ?? "", t.conversion_rate?.toFixed(2) ?? "",
      ].join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `today-teams-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const buildText = () => {
    if (!data) return "";
    const L = [
      "BÁO CÁO DOANH SỐ CÁC TEAM TRONG NGÀY",
      `Ngày báo cáo: ${formatDateVN(date)}`,
      `Thời gian cập nhật: ${formatDateTimeVN(now)}`,
      `Trưởng Phòng Marketing: ${profile?.full_name ?? ""}`,
      "",
      `Tổng team: ${data.teams.length} | Tổng NV: ${grand.emp} | Đã báo cáo: ${grand.reported}/${grand.emp}`,
      `Tổng Chi Phí Ads: ${fmtVndDong(grand.ads)}`,
      `Tổng Data: ${fmtInt(grand.data)}`,
      `Tổng Đơn: ${fmtInt(grand.orders)}`,
      `Tổng Doanh Số: ${fmtVndDong(grand.rev)}`,
      `Tổng DS chốt lại: ${fmtVndDong(grand.recovered)}`,
      `ROAS tổng: ${grand.roas == null ? "—" : grand.roas.toFixed(2)}`,
      `Tỉ lệ chốt tổng: ${fmtPctValue(grand.conv)}`,
      "",
      ...data.teams.map((r) =>
        `- ${r.team_name} (Leader: ${r.leader_name}) | Ads ${fmtVndDong(r.totals.ads_cost)} | DS ${fmtVndDong(r.totals.total_revenue)} | Đơn ${fmtInt(r.totals.total_orders)} | ROAS ${r.totals.roas?.toFixed(2) ?? "—"} | ${r.totals.reportedCount}/${r.totals.totalEmployees}`
      ),
    ];
    return L.join("\n");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="screenshot-hide flex flex-wrap items-end gap-3">
        <div>
          <Label>Ngày</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
      </div>

      <ReportActions
        targetRef={ref}
        filename={`today-teams-${date}.png`}
        buildText={buildText}
        screenshotMode={screenshot}
        onToggleScreenshot={() => setScreenshot((v) => !v)}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div ref={ref} className="space-y-4 bg-white p-4 text-slate-900">
          <header className="border-b-2 border-slate-900 pb-3">
            <h1 className="text-center text-xl font-extrabold">BÁO CÁO DOANH SỐ CÁC TEAM TRONG NGÀY</h1>
            <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
              <div><b>Ngày báo cáo:</b> {formatDateVN(date)}</div>
              <div><b>Cập nhật:</b> {formatDateTimeVN(now)}</div>
              <div><b>TP Marketing:</b> {profile?.full_name}</div>
            </div>
            <p className="mt-2 text-xs italic text-slate-600">
              Tổng team được tính bằng báo cáo mới nhất trong ngày của từng nhân viên (lũy kế).
            </p>
          </header>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <S label="Tổng team" value={String(data?.teams.length ?? 0)} />
            <S label="Tổng nhân viên" value={fmtInt(grand.emp)} />
            <S label="Đã báo cáo" value={`${grand.reported}/${grand.emp}`} />
            <S label="Chưa báo cáo" value={String(grand.missing)} danger={grand.missing > 0} />
            <S label="Tổng Chi Phí Ads" value={fmtVndDong(grand.ads)} />
            <S label="Tổng Data" value={fmtInt(grand.data)} />
            <S label="Tổng Đơn" value={fmtInt(grand.orders)} />
            <S label="Tổng Doanh Số" value={fmtVndDong(grand.rev)} />
            <S label="Tổng DS chốt lại" value={fmtVndDong(grand.recovered)} />
            <S label="ROAS tổng" value={grand.roas == null ? "—" : grand.roas.toFixed(2)} />
            <S label="Tỉ lệ chốt tổng" value={fmtPctValue(grand.conv)} />
          </div>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Chi tiết theo team</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1200px] text-xs">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    {["Team","Leader","Số NV","Đã BC","Chưa BC","Chi Phí Ads","MESS","Data","Đơn DATA/ngày","DS DATA/ngày","Tổng Đơn","Tổng DS","DS chốt lại","ROAS","Tỉ lệ chốt"]
                      .map((h) => <th key={h} className="border-b px-2 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data?.teams.map((r) => (
                    <tr key={r.team_id}>
                      <td className="border-b px-2 py-1.5 font-medium">{r.team_name}</td>
                      <td className="border-b px-2 py-1.5">{r.leader_name}</td>
                      <td className="border-b px-2 py-1.5">{r.totals.totalEmployees}</td>
                      <td className="border-b px-2 py-1.5 text-green-700">{r.totals.reportedCount}</td>
                      <td className={`border-b px-2 py-1.5 ${r.totals.missingCount > 0 ? "text-red-600 font-semibold" : ""}`}>{r.totals.missingCount}</td>
                      <td className="border-b px-2 py-1.5">{fmtVndDong(r.totals.ads_cost)}</td>
                      <td className="border-b px-2 py-1.5">{fmtInt(r.totals.mess_count)}</td>
                      <td className="border-b px-2 py-1.5">{fmtInt(r.totals.data_count)}</td>
                      <td className="border-b px-2 py-1.5">{fmtInt(r.totals.closed_orders)}</td>
                      <td className="border-b px-2 py-1.5">{fmtVndDong(r.totals.daily_data_revenue)}</td>
                      <td className="border-b px-2 py-1.5">{fmtInt(r.totals.total_orders)}</td>
                      <td className="border-b px-2 py-1.5">{fmtVndDong(r.totals.total_revenue)}</td>
                      <td className="border-b px-2 py-1.5">{fmtVndDong(r.totals.recovered_revenue)}</td>
                      <td className="border-b px-2 py-1.5">{r.totals.roas == null ? "—" : r.totals.roas.toFixed(2)}</td>
                      <td className="border-b px-2 py-1.5">{fmtPctValue(r.totals.conversion_rate)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border-t px-2 py-2" colSpan={2}>TỔNG</td>
                    <td className="border-t px-2 py-2">{grand.emp}</td>
                    <td className="border-t px-2 py-2">{grand.reported}</td>
                    <td className="border-t px-2 py-2">{grand.missing}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(grand.ads)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(grand.mess)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(grand.data)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(grand.closed)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(grand.dailyRev)}</td>
                    <td className="border-t px-2 py-2">{fmtInt(grand.orders)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(grand.rev)}</td>
                    <td className="border-t px-2 py-2">{fmtVndDong(grand.recovered)}</td>
                    <td className="border-t px-2 py-2">{grand.roas == null ? "—" : grand.roas.toFixed(2)}</td>
                    <td className="border-t px-2 py-2">{fmtPctValue(grand.conv)}</td>
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

function S({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-red-300 bg-red-50" : "bg-white"}`}>
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className={`mt-1 text-base font-bold ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
