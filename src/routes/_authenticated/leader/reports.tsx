import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSlots, todayStr, formatVnd, formatVndSigned, formatPercent, fmtInt, formatDateVN, calculateReportMetrics } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leader/reports")({ component: LeaderReports });

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

function LeaderReports() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayStr());
  const { data: slots } = useSlots();
  const [slotId, setSlotId] = useState<string>("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["leader-reports", profile?.id, date, slotId],
    enabled: !!profile,
    queryFn: async () => {
      let q = supabase
        .from("slot_reports")
        .select("*, profiles!slot_reports_user_id_fkey(full_name, username), report_slots(slot_name, sort_order)")
        .eq("report_date", date);
      if (slotId) q = q.eq("slot_id", slotId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo team</h1>
        <p className="text-sm text-muted-foreground">Tối ưu cho cap màn hình gửi Zalo</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <div><Label>Ngày</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Khung giờ</Label>
            <Select value={slotId || "all"} onValueChange={(v) => setSlotId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(slots ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.slot_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Báo cáo {formatDateVN(date)}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>{HEAD.map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => {
                    const p = r.profiles as { full_name: string } | null;
                    const slot = (r.report_slots as { slot_name: string } | null)?.slot_name ?? "—";
                    const recovered = Number(r.total_revenue || 0) - Number(r.daily_data_revenue || 0);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{formatDateVN(r.report_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{slot}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{p?.full_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.ads_cost)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.mess_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.cp_mess)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.data_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.cp_data)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.closed_orders)}</TableCell>
                        <TableCell className="text-right">{fmtPctValue(r.conversion_rate == null ? null : Number(r.conversion_rate) * 100)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.daily_data_revenue)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.average_order_value)}</TableCell>
                        <TableCell className="text-right">{r.cp_daily_revenue == null ? "—" : Number(r.cp_daily_revenue).toFixed(3)}</TableCell>
                        <TableCell className="text-right">{fmtInt(r.total_orders)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{fmtVndDong(r.total_revenue)}</TableCell>
                        <TableCell className="text-right">{r.cp_total_revenue == null ? "—" : Number(r.cp_total_revenue).toFixed(3)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right ${recovered < 0 ? "text-red-600 font-semibold" : ""}`}>{fmtVndDong(recovered)}</TableCell>
                        <TableCell><Badge variant="outline">{statusLabel(r.status as string)}</Badge></TableCell>
                        <TableCell className="max-w-[240px] truncate" title={r.note ?? ""}>{r.note ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {rows && rows.length === 0 && (
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
