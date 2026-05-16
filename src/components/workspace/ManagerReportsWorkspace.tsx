import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getManagerTeamIds } from "@/lib/dailyAggregates";
import { formatDateVN, formatDateTimeVN, fmtInt, fmtVndDong } from "@/lib/reports";
import { getReconciledReportIds, isReconciliationSlot } from "@/lib/reportAudit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ManagerReportsWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const { from, to } = range;

  const { data, isLoading } = useQuery({
    queryKey: ["manager-reports-range", profile?.id, from, to],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getManagerTeamIds(profile!.id);
      if (!teamIds.length) return [];
      const { data, error } = await supabase
        .from("slot_reports")
        .select(
          "*, profiles!slot_reports_user_id_fkey(full_name, username), teams(name), report_slots(slot_name)",
        )
        .in("team_id", teamIds)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: false });
      if (error) throw error;
      const reconciledReportIds = await getReconciledReportIds((data ?? []).map((row) => row.id));
      return (data ?? []).map((row) => ({
        ...row,
        was_reconciled: reconciledReportIds.has(row.id),
      }));
    },
  });

  return (
    <div className="space-y-5 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <div className="shrink-0 flex-wrap items-end justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo theo team</h1>
          <p className="text-sm text-muted-foreground">
            Xem báo cáo trong phạm vi team được phân công.
          </p>
        </div>
        <div className="mt-3 md:mt-0">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>
            Báo cáo {formatDateVN(from)} → {formatDateVN(to)}
          </CardTitle>
        </CardHeader>
        <CardContent className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : data?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Khung</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Cập nhật cuối</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Ads</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Đơn</TableHead>
                    <TableHead>Doanh số</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => {
                    const slotName = r.report_slots?.slot_name ?? "—";
                    const isReconciliation = isReconciliationSlot(slotName) || r.was_reconciled;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{formatDateVN(r.report_date)}</TableCell>
                        <TableCell>{slotName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={isReconciliation ? "secondary" : "outline"}>
                              {isReconciliation ? "Chỉnh hôm trước" : "Hôm nay"}
                            </Badge>
                            {r.was_reconciled && (
                              <Badge variant="outline">Đã chỉnh sau reconciliation</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTimeVN(r.updated_at)}
                        </TableCell>
                        <TableCell>{r.teams?.name ?? "—"}</TableCell>
                        <TableCell>{r.profiles?.full_name ?? "—"}</TableCell>
                        <TableCell>{fmtVndDong(r.ads_cost)}</TableCell>
                        <TableCell>{fmtInt(r.data_count)}</TableCell>
                        <TableCell>{fmtInt(r.total_orders)}</TableCell>
                        <TableCell>{fmtVndDong(r.total_revenue)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có báo cáo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
