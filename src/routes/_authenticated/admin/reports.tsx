import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useSlots,
  formatVnd,
  formatVndSigned,
  formatPercent,
  fmtInt,
  formatDateVN,
  formatDateTimeVN,
  calculateReportMetrics,
} from "@/lib/reports";
import { getReconciledReportIds, isReconciliationSlot } from "@/lib/reportAudit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";

export const Route = createFileRoute("/_authenticated/admin/reports")({ component: AdminReports });

const HEAD = [
  "Ngày",
  "Khung giờ",
  "Loại",
  "Cập nhật cuối",
  "Nhân viên",
  "Chi Phí Ads",
  "MESS",
  "Chi Phí ADS/MESS",
  "Data",
  "Chi Phí/DATA trong ngày",
  "Đơn chốt DATA trong ngày",
  "Tỉ lệ chốt DATA trong ngày",
  "Doanh số DATA trong ngày",
  "Trung bình đơn",
  "Chi Phí ADS/Doanh số ngày",
  "Tổng Đơn Chốt",
  "Tổng Doanh Số",
  "Chi Phí ADS/Tổng Doanh Số",
  "Doanh số chốt lại",
  "Status",
  "Ghi chú",
];

function statusLabel(s: string) {
  const map: Record<string, string> = {
    draft: "Nháp",
    submitted: "Đã gửi",
    approved: "Đã duyệt",
    rejected: "Từ chối",
    locked: "Khóa",
  };
  return map[s] ?? s;
}

function AdminReports() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const { from, to } = normalizeDateRange(range);
  const { data: slots } = useSlots();
  const [slotId, setSlotId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("all");

  const { data: teams } = useQuery({
    queryKey: ["teams-list"],
    queryFn: async () => (await supabase.from("teams").select("id, name").order("name")).data ?? [],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-reports", from, to, slotId, teamId],
    queryFn: async () => {
      let q = supabase
        .from("slot_reports")
        .select(
          "*, profiles!slot_reports_user_id_fkey(full_name, username), teams(name), report_slots(slot_name, sort_order)",
        )
        .gte("report_date", from)
        .lte("report_date", to);
      if (slotId) q = q.eq("slot_id", slotId);
      if (teamId !== "all") q = q.eq("team_id", teamId);
      const { data, error } = await q;
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
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo tổng hợp</h1>
        <p className="text-sm text-muted-foreground">Lọc theo ngày, khung giờ, team</p>
      </div>

      <Card className="shrink-0">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <DateRangeFilter value={range} onChange={setRange} />
          <div>
            <Label>Khung giờ</Label>
            <Select value={slotId || "all"} onValueChange={(v) => setSlotId(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(slots ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.slot_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>
            Báo cáo {formatDateVN(from)} - {formatDateVN(to)}
          </CardTitle>
        </CardHeader>
        <CardContent className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {HEAD.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => {
                    const p = r.profiles as { full_name: string } | null;
                    const slot = (r.report_slots as { slot_name: string } | null)?.slot_name ?? "—";
                    const isReconciliation = isReconciliationSlot(slot) || r.was_reconciled;
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
                        <TableCell className="whitespace-nowrap">
                          {formatDateVN(r.report_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{slot}</TableCell>
                        <TableCell className="whitespace-nowrap">
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
                        <TableCell className="whitespace-nowrap font-medium">
                          {p?.full_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(r.ads_cost)}
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(r.mess_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(m.cp_mess)}
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(r.data_count)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(m.cp_data)}
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(r.closed_orders)}</TableCell>
                        <TableCell className="text-right">{formatPercent(m.conv_rate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(r.daily_data_revenue)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(m.avg_order)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercent(m.cp_daily_pct)}
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(r.total_orders)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatVnd(r.total_revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercent(m.cp_total_pct)}
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-right ${m.recovered < 0 ? "text-red-600 font-semibold" : ""}`}
                        >
                          {formatVndSigned(m.recovered)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{statusLabel(r.status as string)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate" title={r.note ?? ""}>
                          {r.note ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows && rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={HEAD.length}
                        className="text-center text-muted-foreground py-6"
                      >
                        Chưa có báo cáo
                      </TableCell>
                    </TableRow>
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
