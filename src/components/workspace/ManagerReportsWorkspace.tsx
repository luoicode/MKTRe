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
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import {
  fetchFacebookManagerSpend,
  formatFacebookManagerSpend,
  syncFacebookManagerSpend,
} from "@/lib/facebookAdSpend";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";

export function ManagerReportsWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [isSyncingFacebookSpend, setIsSyncingFacebookSpend] = useState(false);
  const { from, to } = normalizeDateRange(range);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["manager-reports-range", profile?.id, from, to],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getManagerTeamIds(profile!.id);
      if (!teamIds.length) return [];
      const { data, error } = await supabase
        .from("slot_reports")
        .select(
          "*, profiles!slot_reports_user_id_fkey(full_name, username, status), teams(name), report_slots(slot_name)",
        )
        .in("team_id", teamIds)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: false });
      if (error) throw error;
      const reconciledReportIds = await getReconciledReportIds((data ?? []).map((row) => row.id));
      return (data ?? [])
        .filter((row) => row.profiles?.status === "active")
        .map((row) => ({
          ...row,
          was_reconciled: reconciledReportIds.has(row.id),
        }));
    },
  });
  const {
    data: facebookSpend,
    isFetching: isFacebookSpendFetching,
    refetch: refetchFacebookSpend,
  } = useQuery({
    queryKey: ["facebook-manager-spend", from, to],
    queryFn: () => fetchFacebookManagerSpend(from, to),
  });
  const refreshData = async () => {
    setIsSyncingFacebookSpend(true);
    try {
      await syncFacebookManagerSpend(from, to);
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
    <div className="space-y-5 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <WorkspacePageHeader
        title="Báo cáo Marketing"
        subtitle="Xem báo cáo Marketing trong phạm vi team được phân công."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <RefreshButton
              isRefreshing={isFetching || isFacebookSpendFetching || isSyncingFacebookSpend}
              onRefresh={refreshData}
            />
          </div>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Chi phí trên trình quản lí</p>
            <p className="mt-1 text-lg font-bold text-amber-900">
              {isSyncingFacebookSpend
                ? "Đang đồng bộ..."
                : formatFacebookManagerSpend(facebookSpend, fmtVndDong)}
            </p>
          </CardContent>
        </Card>
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
                    <TableHead>Nhân viên Marketing</TableHead>
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
