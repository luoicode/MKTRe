import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateVN, formatDateTimeVN, fmtInt, fmtVndDong } from "@/lib/reports";
import { getReconciledReportIds, isReconciliationSlot } from "@/lib/reportAudit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PersonalReportsWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const { from, to } = normalizeDateRange(range);

  const { data, isLoading } = useQuery({
    queryKey: ["personal-reports-range", profile?.id, from, to],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_reports")
        .select("*, teams(name), report_slots(slot_name)")
        .eq("user_id", profile!.id)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: false })
        .order("updated_at", { ascending: false });
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
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo của tôi</h1>
          <p className="text-sm text-muted-foreground">
            Xem lịch sử báo cáo theo khung giờ của chính bạn.
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
                    <TableHead className="text-right">CP Ads</TableHead>
                    <TableHead className="text-right">Mess</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                    <TableHead className="text-right">Đơn</TableHead>
                    <TableHead className="text-right">DS</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((report) => {
                    const slotName = report.report_slots?.slot_name ?? "—";
                    const isReconciliation =
                      isReconciliationSlot(slotName) || report.was_reconciled;
                    return (
                      <TableRow key={report.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateVN(report.report_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{slotName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={isReconciliation ? "secondary" : "outline"}>
                              {isReconciliation ? "Chỉnh hôm trước" : "Hôm nay"}
                            </Badge>
                            {report.was_reconciled && (
                              <Badge variant="outline">Đã chỉnh sau reconciliation</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTimeVN(report.updated_at)}
                        </TableCell>
                        <TableCell>{report.teams?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {fmtVndDong(report.ads_cost)}
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(report.mess_count)}</TableCell>
                        <TableCell className="text-right">{fmtInt(report.data_count)}</TableCell>
                        <TableCell className="text-right">{fmtInt(report.total_orders)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold">
                          {fmtVndDong(report.total_revenue)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{report.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có báo cáo trong khoảng thời gian này.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
