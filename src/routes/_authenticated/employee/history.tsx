import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatVnd, formatVndSigned, formatPercent, fmtInt, formatDateVN, calculateReportMetrics } from "@/lib/reports";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/employee/history")({ component: History });

const HEAD = [
  "Ngày", "Khung giờ", "Nhân viên",
  "Chi Phí Ads", "MESS", "Chi phí ADS/MESS",
  "Data", "Chi phí ADS/Data",
  "Đơn chốt DATA trong ngày", "Tỉ lệ chốt Data trong ngày",
  "DOANH SỐ DATA trong ngày", "TB Đơn", "Chi phí ADS/Doanh Số Trong Ngày",
  "Tổng Đơn Chốt", "Tổng Doanh Số", "Chi phí ADS/Tổng Doanh Số",
  "Doanh số chốt lại", "Status", "Ghi chú",
];

function statusLabel(s: string) {
  const map: Record<string, string> = { draft: "Nháp", submitted: "Đã gửi", approved: "Đã duyệt", rejected: "Từ chối", locked: "Khóa" };
  return map[s] ?? s;
}

function History() {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-reports", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_reports")
        .select("*, report_slots(slot_name, sort_order)")
        .eq("user_id", profile!.id)
        .order("report_date", { ascending: false })
        .order("slot_id");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Lịch sử báo cáo</h1>
      <Card>
        <CardHeader><CardTitle>30 báo cáo gần nhất</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {HEAD.map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).slice(0, 30).map((r) => {
                    const slot = (r.report_slots as { slot_name: string } | null)?.slot_name ?? "—";
                    const m = calculateReportMetrics({
                      ads_cost: Number(r.ads_cost) || 0,
                      mess_count: Number(r.mess_count) || 0,
                      data_count: Number(r.data_count) || 0,
                      closed_orders: Number(r.closed_orders) || 0,
                      daily_data_revenue: Number(r.daily_data_revenue) || 0,
                      total_orders: Number(r.total_orders) || 0,
                      total_revenue: Number(r.total_revenue) || 0,
                    });
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{formatDateVN(r.report_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{slot}</TableCell>
                        <TableCell className="whitespace-nowrap">{profile?.full_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(r.ads_cost)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.mess_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(m.cp_mess)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.data_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(m.cp_data)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.closed_orders)}</TableCell>
                        <TableCell className="text-right">{formatPercent(m.conv_rate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(r.daily_data_revenue)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(m.avg_order)}</TableCell>
                        <TableCell className="text-right">{formatPercent(m.cp_daily_pct)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.total_orders)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatVnd(r.total_revenue)}</TableCell>
                        <TableCell className="text-right">{formatPercent(m.cp_total_pct)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right ${m.recovered < 0 ? "text-red-600 font-semibold" : ""}`}>{formatVndSigned(m.recovered)}</TableCell>
                        <TableCell><Badge variant="outline">{statusLabel(r.status as string)}</Badge></TableCell>
                        <TableCell className="max-w-[240px] truncate" title={r.note ?? ""}>{r.note ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {data && data.length === 0 && (
                    <TableRow><TableCell colSpan={HEAD.length} className="text-center text-muted-foreground py-6">Chưa có báo cáo</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
