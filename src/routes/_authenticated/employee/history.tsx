import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtVnd, fmtPct, fmtNum } from "@/lib/reports";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/employee/history")({ component: History });

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
                    <TableHead>Ngày</TableHead>
                    <TableHead>Khung</TableHead>
                    <TableHead className="text-right">Ads</TableHead>
                    <TableHead className="text-right">Mess</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                    <TableHead className="text-right">Đơn chốt</TableHead>
                    <TableHead className="text-right">Tỉ lệ</TableHead>
                    <TableHead className="text-right">Tổng DS</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).slice(0, 30).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.report_date}</TableCell>
                      <TableCell>{(r.report_slots as { slot_name: string } | null)?.slot_name}</TableCell>
                      <TableCell className="text-right">{fmtVnd(r.ads_cost)}</TableCell>
                      <TableCell className="text-right">{r.mess_count}</TableCell>
                      <TableCell className="text-right">{r.data_count}</TableCell>
                      <TableCell className="text-right">{r.closed_orders}</TableCell>
                      <TableCell className="text-right">{fmtPct(r.conversion_rate)}</TableCell>
                      <TableCell className="text-right">{fmtVnd(r.total_revenue)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.roas, 2)}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {data && data.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Chưa có báo cáo</TableCell></TableRow>
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
