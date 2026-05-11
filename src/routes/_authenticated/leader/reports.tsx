import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSlots, todayStr, fmtVnd, fmtPct, fmtNum } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leader/reports")({ component: LeaderReports });

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

  const totals = (rows ?? []).reduce((a, r) => ({
    ads: a.ads + Number(r.ads_cost || 0),
    mess: a.mess + Number(r.mess_count || 0),
    data: a.data + Number(r.data_count || 0),
    closed: a.closed + Number(r.closed_orders || 0),
    rev: a.rev + Number(r.total_revenue || 0),
  }), { ads: 0, mess: 0, data: 0, closed: 0, rev: 0 });

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
        <CardHeader><CardTitle>Báo cáo {date}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Khung</TableHead>
                    <TableHead className="text-right">Ads</TableHead>
                    <TableHead className="text-right">Mess</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                    <TableHead className="text-right">Đơn</TableHead>
                    <TableHead className="text-right">Tỉ lệ</TableHead>
                    <TableHead className="text-right">Tổng DS</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => {
                    const p = r.profiles as { full_name: string } | null;
                    const s = r.report_slots as { slot_name: string } | null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{p?.full_name}</TableCell>
                        <TableCell>{s?.slot_name}</TableCell>
                        <TableCell className="text-right">{fmtVnd(r.ads_cost)}</TableCell>
                        <TableCell className="text-right">{r.mess_count}</TableCell>
                        <TableCell className="text-right">{r.data_count}</TableCell>
                        <TableCell className="text-right">{r.closed_orders}</TableCell>
                        <TableCell className="text-right">{fmtPct(r.conversion_rate)}</TableCell>
                        <TableCell className="text-right">{fmtVnd(r.total_revenue)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.roas, 2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {rows && rows.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={2}>Tổng</TableCell>
                      <TableCell className="text-right">{fmtVnd(totals.ads)}</TableCell>
                      <TableCell className="text-right">{totals.mess}</TableCell>
                      <TableCell className="text-right">{totals.data}</TableCell>
                      <TableCell className="text-right">{totals.closed}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{fmtVnd(totals.rev)}</TableCell>
                      <TableCell className="text-right">{totals.ads > 0 ? fmtNum(totals.rev / totals.ads, 2) : "—"}</TableCell>
                    </TableRow>
                  )}
                  {rows && rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Chưa có báo cáo</TableCell></TableRow>
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
