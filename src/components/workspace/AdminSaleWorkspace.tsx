import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { FloatingLeadLifecycleDashboard } from "@/components/FloatingLeadLifecycleDashboard";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { formatKpiMetricValue, metricProgress, saleMetrics } from "@/lib/kpiMetrics";
import { MARKETING_ROLES, SALE_ROLES, type AppRole } from "@/lib/roles";
import {
  deriveFloatingLeadLifecycle,
  floatingLeadStatuses,
  getFloatingLeadDisplayStatus,
  todayYmd,
  type FloatingLeadDisplayStatus,
  type FloatingLeadRow,
  type FloatingLeadStatus,
} from "@/lib/floatingLeads";
import {
  saleReportSlots,
  formatSaleInteger,
  formatSalePercent,
  formatSaleVnd,
} from "@/lib/saleReportUtils";
import { summarizeSaleReports, type SaleReportRow } from "@/lib/saleReports";
import { cn } from "@/lib/utils";

type SaleProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
};

type SaleTeam = Pick<Tables<"teams">, "id" | "name">;
type SaleKpiTarget = Tables<"sale_kpi_targets">;
type SaleKpiPeriod = Enums<"kpi_period">;
type SaleTeamMembership = Pick<Tables<"team_memberships">, "team_id" | "user_id" | "role_in_team">;

type SaleKpiForm = {
  id?: string;
  scope: "team" | "user";
  teamId: string;
  userId: string;
  periodType: SaleKpiPeriod;
  periodStart: string;
  periodEnd: string;
  closeRateTarget: string;
  averageOrderTarget: string;
};

type AdminFloatingLeadStatus =
  | "all"
  | "unassigned"
  | "called_1"
  | "called_2"
  | "called_3"
  | "closed"
  | "not_closed";

type AdminLeadCreateForm = {
  phonesText: string;
  leadDate: string;
  marketingId: string;
  source: string;
};

type AdminLeadEditForm = {
  id: string;
  phone: string;
  leadDate: string;
  marketingId: string;
  source: string;
  assignedSaleId: string;
  call1: string;
  call2: string;
  call3: string;
  note: string;
  status: FloatingLeadStatus;
  isClosed: boolean;
  claimCount: number;
};

const COMPANY_SCOPE_VALUE = "__company__";

function createSaleKpiForm(target?: SaleKpiTarget): SaleKpiForm {
  const range = initialDateRange("month");
  return {
    id: target?.id,
    scope: target?.user_id ? "user" : "team",
    teamId: target?.team_id ?? "",
    userId: target?.user_id ?? "",
    periodType: target?.period_type ?? "month",
    periodStart: target?.period_start ?? range.from,
    periodEnd: target?.period_end ?? range.to,
    closeRateTarget: String(target?.close_rate_target ?? ""),
    averageOrderTarget: String(target?.average_order_target ?? ""),
  };
}

function isSaleKpiPeriod(value: string): value is SaleKpiPeriod {
  return value === "day" || value === "week" || value === "month";
}

export function AdminMarketingSaleTabs({
  marketing,
  sale,
}: {
  marketing: ReactNode;
  sale: ReactNode;
}) {
  return (
    <Tabs defaultValue="marketing" className="min-w-0 space-y-3">
      <TabsList className="h-10 rounded-xl bg-slate-100 p-1">
        <TabsTrigger value="marketing" className="px-4">
          Marketing
        </TabsTrigger>
        <TabsTrigger value="sale" className="px-4">
          Sale
        </TabsTrigger>
      </TabsList>
      <TabsContent value="marketing" className="mt-0">
        {marketing}
      </TabsContent>
      <TabsContent value="sale" className="mt-0">
        {sale}
      </TabsContent>
    </Tabs>
  );
}

export function AdminSaleOverview() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sale-overview", normalizedRange.from, normalizedRange.to],
    queryFn: async () => {
      const [reports, leads, sales] = await Promise.all([
        fetchAdminSaleReports(normalizedRange.from, normalizedRange.to),
        fetchAdminFloatingLeads(normalizedRange.from, normalizedRange.to),
        fetchSaleProfiles(),
      ]);
      return { reports, leads, sales };
    },
  });

  const submittedReports = useMemo(
    () => (data?.reports ?? []).filter((row) => row.status === "submitted"),
    [data?.reports],
  );
  const summary = useMemo(() => summarizeSaleReports(submittedReports), [submittedReports]);
  const performance = useMemo(
    () => buildSalePerformance(submittedReports, data?.sales ?? [], data?.leads ?? []),
    [data?.leads, data?.sales, submittedReports],
  );
  const activeLeads = (data?.leads ?? []).filter(
    (lead) => lead.assigned_sale_id && !lead.is_closed,
  );
  const closedLeads = (data?.leads ?? []).filter((lead) => lead.is_closed);

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title="Tổng quan Sale"
        subtitle="Dữ liệu Sale tách riêng từ báo cáo Sale và kho lead thả nổi"
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <AdminSaleMetric
              title="Tổng doanh số Sale"
              value={formatSaleVnd(summary.totalRevenue)}
              tone="green"
            />
            <AdminSaleMetric
              title="Tỷ lệ chốt"
              value={formatSalePercent(summary.closeRate)}
              tone="blue"
            />
            <AdminSaleMetric
              title="Tổng data nhận"
              value={formatSaleInteger(summary.totalDataReceived)}
            />
            <AdminSaleMetric
              title="Tổng data chốt"
              value={formatSaleInteger(summary.totalDataClosed)}
            />
            <AdminSaleMetric
              title="Lead đang xử lý"
              value={formatSaleInteger(activeLeads.length)}
              tone="amber"
            />
            <AdminSaleMetric
              title="Lead đã chốt"
              value={formatSaleInteger(closedLeads.length)}
              tone="green"
            />
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Hiệu suất theo nhân viên Sale</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto p-0">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Sale</th>
                    <th className="px-3 py-3">Doanh số</th>
                    <th className="px-3 py-3">Tỷ lệ chốt</th>
                    <th className="px-3 py-3">Data nhận</th>
                    <th className="px-3 py-3">Data chốt</th>
                    <th className="px-3 py-3">Lead đang xử lý</th>
                    <th className="px-3 py-3">Lead đã chốt</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((row) => (
                    <tr key={row.saleId} className="border-t">
                      <td className="px-4 py-3 font-semibold">{row.name}</td>
                      <td className="px-3 py-3">{formatSaleVnd(row.summary.totalRevenue)}</td>
                      <td className="px-3 py-3">{formatSalePercent(row.summary.closeRate)}</td>
                      <td className="px-3 py-3">
                        {formatSaleInteger(row.summary.totalDataReceived)}
                      </td>
                      <td className="px-3 py-3">
                        {formatSaleInteger(row.summary.totalDataClosed)}
                      </td>
                      <td className="px-3 py-3">{formatSaleInteger(row.activeLeads)}</td>
                      <td className="px-3 py-3">{formatSaleInteger(row.closedLeads)}</td>
                    </tr>
                  ))}
                  {!performance.length && <EmptyTableRow colSpan={7} />}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <FloatingLeadLifecycleDashboard
            leads={data?.leads ?? []}
            people={(data?.sales ?? []).map((sale) => ({
              id: sale.id,
              name: displayProfileName(sale),
            }))}
            personRole="sale"
            title="Analytics lifecycle lead Sale"
            subtitle="Funnel lead theo lifecycle, conversion và drop rate toàn hệ Sale trong khoảng lọc."
          />
        </>
      )}
    </div>
  );
}

export function AdminSaleReports() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [saleId, setSaleId] = useState("all");
  const [status, setStatus] = useState("all");
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sale-reports", normalizedRange.from, normalizedRange.to, saleId, status],
    queryFn: async () => {
      const [reports, sales] = await Promise.all([
        fetchAdminSaleReports(normalizedRange.from, normalizedRange.to),
        fetchSaleProfiles(),
      ]);
      return { reports, sales };
    },
  });

  const visibleReports = useMemo(
    () =>
      (data?.reports ?? []).filter((row) => {
        if (saleId !== "all" && row.user_id !== saleId) return false;
        if (status !== "all" && row.status !== status) return false;
        return true;
      }),
    [data?.reports, saleId, status],
  );
  const profileMap = useMemo(
    () => new Map((data?.sales ?? []).map((sale) => [sale.id, sale])),
    [data?.sales],
  );
  const summary = useMemo(() => summarizeSaleReports(visibleReports), [visibleReports]);

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Báo cáo Sale"
        subtitle="Báo cáo Sale theo nhân viên, ngày và khung giờ"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter value={range} onChange={setRange} hideLabel />
            <CompactSelect value={saleId} onValueChange={setSaleId} label="Sale">
              <SelectItem value="all">Tất cả Sale</SelectItem>
              {(data?.sales ?? []).map((sale) => (
                <SelectItem key={sale.id} value={sale.id}>
                  {displayProfileName(sale)}
                </SelectItem>
              ))}
            </CompactSelect>
            <CompactSelect value={status} onValueChange={setStatus} label="Trạng thái">
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="submitted">Đã gửi</SelectItem>
              <SelectItem value="draft">Nháp</SelectItem>
            </CompactSelect>
          </div>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <AdminSaleMetric
              title="Tổng doanh số"
              value={formatSaleVnd(summary.totalRevenue)}
              tone="green"
            />
            <AdminSaleMetric
              title="Tỷ lệ chốt"
              value={formatSalePercent(summary.closeRate)}
              tone="blue"
            />
            <AdminSaleMetric
              title="Data nhận"
              value={formatSaleInteger(summary.totalDataReceived)}
            />
            <AdminSaleMetric
              title="TB đơn"
              value={summary.averageOrder === null ? "—" : formatSaleVnd(summary.averageOrder)}
            />
          </div>

          <Card className="rounded-2xl">
            <CardContent className="overflow-auto p-0">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    {[
                      "Ngày",
                      "Khung",
                      "Sale",
                      "Trạng thái",
                      "Data mới nhận",
                      "Data mới chốt",
                      "Data nổi nhận",
                      "Data nổi chốt",
                      "DS khách mới",
                      "DS thả nổi",
                      "Khách cũ",
                      "Tổng DS",
                      "Tỷ lệ chốt",
                      "TB đơn",
                    ].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleReports.map((row) => {
                    const rowSummary = summarizeSaleReports([row]);
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatDate(row.report_date)}
                        </td>
                        <td className="px-3 py-3">
                          {saleReportSlots.find((slot) => slot.id === row.slot_key)?.tableLabel ??
                            row.slot_time}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {displayProfileName(profileMap.get(row.user_id))}
                        </td>
                        <td className="px-3 py-3">
                          {row.status === "submitted" ? "Đã gửi" : "Nháp"}
                        </td>
                        <td className="px-3 py-3">{formatSaleInteger(row.new_data_received)}</td>
                        <td className="px-3 py-3">{formatSaleInteger(row.new_data_closed)}</td>
                        <td className="px-3 py-3">
                          {formatSaleInteger(row.floating_data_received)}
                        </td>
                        <td className="px-3 py-3">{formatSaleInteger(row.floating_data_closed)}</td>
                        <td className="px-3 py-3">
                          {formatSaleVnd(Number(row.new_customer_revenue ?? 0))}
                        </td>
                        <td className="px-3 py-3">
                          {formatSaleVnd(Number(row.floating_revenue ?? 0))}
                        </td>
                        <td className="px-3 py-3">{formatSaleInteger(row.old_customers)}</td>
                        <td className="px-3 py-3 font-semibold">
                          {formatSaleVnd(rowSummary.totalRevenue)}
                        </td>
                        <td className="px-3 py-3">{formatSalePercent(rowSummary.closeRate)}</td>
                        <td className="px-3 py-3">
                          {rowSummary.averageOrder === null
                            ? "—"
                            : formatSaleVnd(rowSummary.averageOrder)}
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleReports.length && <EmptyTableRow colSpan={14} />}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function AdminSaleKpi() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SaleKpiForm>(() => createSaleKpiForm());
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sale-kpi", normalizedRange.from, normalizedRange.to],
    queryFn: async () => {
      const [reports, sales, teams, targets] = await Promise.all([
        fetchAdminSaleReports(normalizedRange.from, normalizedRange.to),
        fetchSaleProfiles(),
        fetchSaleTeams(),
        fetchSaleKpiTargets(normalizedRange.from, normalizedRange.to),
      ]);
      const memberships = await fetchSaleTeamMemberships(teams.map((team) => team.id));
      return { reports, sales, teams, targets, memberships };
    },
  });
  const saveTarget = useMutation({
    mutationFn: async () => upsertSaleKpiTarget(form),
    onSuccess: () => {
      toast.success(form.id ? "Đã cập nhật KPI Sale" : "Đã tạo KPI Sale");
      setFormOpen(false);
      setForm(createSaleKpiForm());
      queryClient.invalidateQueries({ queryKey: ["admin-sale-kpi"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteTarget = useMutation({
    mutationFn: deleteSaleKpiTarget,
    onSuccess: () => {
      toast.success("Đã xóa KPI Sale");
      queryClient.invalidateQueries({ queryKey: ["admin-sale-kpi"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = useMemo(
    () =>
      buildSalePerformance(
        (data?.reports ?? []).filter((row) => row.status === "submitted"),
        data?.sales ?? [],
        [],
      ),
    [data?.reports, data?.sales],
  ).sort((a, b) => b.summary.totalRevenue - a.summary.totalRevenue);
  const targetBySaleId = useMemo(() => {
    const map = new Map<string, SaleKpiTarget>();
    for (const target of data?.targets ?? []) {
      if (!target.user_id) continue;
      const current = map.get(target.user_id);
      if (!current || target.updated_at > current.updated_at) map.set(target.user_id, target);
    }
    return map;
  }, [data?.targets]);
  const teamTargets = useMemo(
    () => (data?.targets ?? []).filter((target) => !target.user_id),
    [data?.targets],
  );
  const teamBySaleId = useMemo(() => {
    const map = new Map<string, string>();
    for (const membership of data?.memberships ?? []) {
      if (!map.has(membership.user_id)) map.set(membership.user_id, membership.team_id);
    }
    return map;
  }, [data?.memberships]);

  const openCreate = () => {
    setForm(createSaleKpiForm());
    setFormOpen(true);
  };

  const openEdit = (target: SaleKpiTarget) => {
    setForm(createSaleKpiForm(target));
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Target className="h-5 w-5" />}
        title="KPI Sale"
        subtitle="Doanh thu, tổng đơn, tỉ lệ chốt và trung bình đơn"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} hideLabel />
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Tạo KPI Sale
            </Button>
          </div>
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">KPI Team Sale</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mục tiêu theo team, kỳ ngày/tuần/tháng.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {teamTargets.map((target) => (
                <div key={target.id} className="rounded-2xl border bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black">
                        {data?.teams.find((team) => team.id === target.team_id)?.name ??
                          "Tổng công ty"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(target.period_start)} -{" "}
                        {formatDateShort(target.period_end)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(target)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTarget.mutate(target.id)}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {saleMetrics.map((metric) => (
                      <KpiMiniStat key={metric.key} metric={metric} target={target} />
                    ))}
                  </div>
                </div>
              ))}
              {!teamTargets.length && (
                <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                  Chưa có KPI team Sale trong kỳ này.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">KPI cá nhân Sale</CardTitle>
              <p className="text-sm text-muted-foreground">
                Xếp hạng theo doanh số, tỉ lệ chốt và số data chốt.
              </p>
            </CardHeader>
            <CardContent className="overflow-auto p-0">
              <table className="w-full min-w-[1020px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-3 py-3">Sale</th>
                    <th className="px-3 py-3">Doanh số</th>
                    <th className="px-3 py-3">Tổng đơn</th>
                    <th className="px-3 py-3">Tỷ lệ chốt</th>
                    <th className="px-3 py-3">TB đơn</th>
                    <th className="px-3 py-3">Progress</th>
                    <th className="px-3 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const target = targetBySaleId.get(row.saleId);
                    const revenueProgress = metricProgress({
                      actual: row.summary.totalRevenue,
                      target: target?.revenue_target,
                    });
                    return (
                      <tr key={row.saleId} className="border-t">
                        <td className="px-4 py-3 font-black">{index + 1}</td>
                        <td className="px-3 py-3 font-semibold">{row.name}</td>
                        <td className="px-3 py-3">{formatSaleVnd(row.summary.totalRevenue)}</td>
                        <td className="px-3 py-3">
                          {formatSaleInteger(row.summary.totalDataClosed)}
                        </td>
                        <td className="px-3 py-3">{formatSalePercent(row.summary.closeRate)}</td>
                        <td className="px-3 py-3">
                          {row.summary.averageOrder === null
                            ? "—"
                            : formatSaleVnd(row.summary.averageOrder)}
                        </td>
                        <td className="px-3 py-3">
                          {revenueProgress == null ? "Chưa đặt mục tiêu" : `${revenueProgress}%`}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            {target ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEdit(target)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteTarget.mutate(target.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-rose-500" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setForm({
                                    ...createSaleKpiForm(),
                                    scope: "user",
                                    userId: row.saleId,
                                    teamId: teamBySaleId.get(row.saleId) ?? "",
                                  });
                                  setFormOpen(true);
                                }}
                              >
                                Tạo target
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && <EmptyTableRow colSpan={8} />}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
      <SaleKpiTargetDialog
        open={formOpen}
        form={form}
        teams={data?.teams ?? []}
        sales={data?.sales ?? []}
        memberships={data?.memberships ?? []}
        isSaving={saveTarget.isPending}
        onOpenChange={setFormOpen}
        onChange={setForm}
        onSave={() => saveTarget.mutate()}
      />
    </div>
  );
}

function KpiMiniStat({
  metric,
  target,
}: {
  metric: (typeof saleMetrics)[number];
  target: SaleKpiTarget;
}) {
  const targetValue = metric.target(target);
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{metric.label}</p>
      <p className="mt-1 text-base font-black">{formatKpiMetricValue(targetValue, metric.kind)}</p>
    </div>
  );
}

function SaleKpiTargetDialog({
  open,
  form,
  teams,
  sales,
  memberships,
  isSaving,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  form: SaleKpiForm;
  teams: SaleTeam[];
  sales: SaleProfile[];
  memberships: SaleTeamMembership[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: SaleKpiForm) => void;
  onSave: () => void;
}) {
  const setNumber = (field: keyof SaleKpiForm, value: string, allowDecimal = false) => {
    onChange({ ...form, [field]: value.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, "") });
  };
  const teamBySaleId = useMemo(() => {
    const map = new Map<string, string>();
    for (const membership of memberships) {
      if (!map.has(membership.user_id)) map.set(membership.user_id, membership.team_id);
    }
    return map;
  }, [memberships]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Sửa KPI Sale" : "Tạo KPI Sale"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Phạm vi">
            <Select
              value={form.scope}
              onValueChange={(value) =>
                onChange({
                  ...form,
                  scope: value as "team" | "user",
                  userId: "",
                  teamId: value === "team" ? form.teamId : "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">KPI Team Sale</SelectItem>
                <SelectItem value="user">KPI Cá nhân Sale</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Team Sale">
            <Select value={form.teamId} onValueChange={(teamId) => onChange({ ...form, teamId })}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn tổng công ty hoặc team Sale" />
              </SelectTrigger>
              <SelectContent>
                {form.scope === "team" && (
                  <SelectItem value={COMPANY_SCOPE_VALUE}>Tổng công ty</SelectItem>
                )}
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.scope === "user" && (
            <Field label="Nhân viên Sale">
              <Select
                value={form.userId}
                onValueChange={(userId) =>
                  onChange({
                    ...form,
                    userId,
                    teamId: teamBySaleId.get(userId) ?? form.teamId,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhân viên Sale" />
                </SelectTrigger>
                <SelectContent>
                  {sales.map((sale) => (
                    <SelectItem key={sale.id} value={sale.id}>
                      {displayProfileName(sale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Kỳ">
            <Select
              value={form.periodType}
              onValueChange={(value) => {
                if (isSaleKpiPeriod(value)) onChange({ ...form, periodType: value });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Ngày</SelectItem>
                <SelectItem value="week">Tuần</SelectItem>
                <SelectItem value="month">Tháng</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Từ ngày">
            <Input
              type="date"
              value={form.periodStart}
              onChange={(event) => onChange({ ...form, periodStart: event.target.value })}
            />
          </Field>
          <Field label="Đến ngày">
            <Input
              type="date"
              value={form.periodEnd}
              onChange={(event) => onChange({ ...form, periodEnd: event.target.value })}
            />
          </Field>
          <Field label="Target tỉ lệ chốt (%)">
            <Input
              value={form.closeRateTarget}
              onChange={(event) => setNumber("closeRateTarget", event.target.value, true)}
            />
          </Field>
          <Field label="Target trung bình đơn">
            <Input
              value={form.averageOrderTarget}
              onChange={(event) => setNumber("averageOrderTarget", event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.id ? "Lưu KPI" : "Tạo KPI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminFloatingLeadsWorkspace() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [status, setStatus] = useState<AdminFloatingLeadStatus>("all");
  const [marketingId, setMarketingId] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<FloatingLeadRow | null>(null);
  const [deleteLead, setDeleteLead] = useState<FloatingLeadRow | null>(null);
  const [createForm, setCreateForm] = useState<AdminLeadCreateForm>({
    phonesText: "",
    leadDate: todayYmd(),
    marketingId: "",
    source: "",
  });
  const [editForm, setEditForm] = useState<AdminLeadEditForm | null>(null);
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-floating-leads", normalizedRange.from, normalizedRange.to],
    queryFn: async () => {
      const [leads, sales, marketers] = await Promise.all([
        fetchAdminFloatingLeads(normalizedRange.from, normalizedRange.to),
        fetchSaleProfiles(),
        fetchMarketingProfiles(),
      ]);
      return { leads, sales, marketers };
    },
  });
  const invalidateAdminLeads = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-floating-leads"] });

  const createMutation = useMutation({
    mutationFn: () => createAdminFloatingLeads(createForm, data?.marketers ?? []),
    onSuccess: async (rows) => {
      await invalidateAdminLeads();
      setCreateOpen(false);
      setCreateForm({
        phonesText: "",
        leadDate: todayYmd(),
        marketingId: createForm.marketingId,
        source: "",
      });
      toast.success(`Đã thêm ${rows.length} số vào kho thả nổi`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể thêm số");
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => updateAdminFloatingLead(editForm, data?.marketers ?? [], data?.sales ?? []),
    onSuccess: async () => {
      await invalidateAdminLeads();
      setEditLead(null);
      setEditForm(null);
      toast.success("Đã cập nhật lead");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật lead");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (leadId: string) => deleteAdminFloatingLead(leadId),
    onSuccess: async () => {
      await invalidateAdminLeads();
      setDeleteLead(null);
      toast.success("Đã xóa lead");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể xóa lead");
    },
  });
  const visibleLeads = useMemo(
    () =>
      (data?.leads ?? []).filter((lead) => {
        if (marketingId !== "all" && lead.created_by !== marketingId) return false;
        if (saleId !== "all" && lead.assigned_sale_id !== saleId && lead.closed_by !== saleId)
          return false;
        if (!matchesLeadStatusFilter(lead, status)) return false;
        if (search.trim() && !lead.phone.includes(search.trim())) return false;
        return true;
      }),
    [data?.leads, marketingId, saleId, search, status],
  );
  const adminLeadStats = useMemo(
    () => ({
      total: visibleLeads.length,
      unassigned: visibleLeads.filter((lead) => !lead.assigned_sale_id && !lead.is_closed).length,
      assigned: visibleLeads.filter((lead) => !!lead.assigned_sale_id && !lead.is_closed).length,
      closed: visibleLeads.filter((lead) => lead.is_closed).length,
    }),
    [visibleLeads],
  );
  const openCreateDialog = () => {
    setCreateForm((current) => ({
      ...current,
      leadDate: todayYmd(),
      marketingId: current.marketingId || data?.marketers[0]?.id || "",
    }));
    setCreateOpen(true);
  };
  const openEditDialog = (lead: FloatingLeadRow) => {
    setEditLead(lead);
    setEditForm({
      id: lead.id,
      phone: lead.phone,
      leadDate: lead.lead_date,
      marketingId: lead.created_by,
      source: lead.source ?? "",
      assignedSaleId: lead.assigned_sale_id ?? "none",
      call1: lead.call_1 ?? "",
      call2: lead.call_2 ?? "",
      call3: lead.call_3 ?? "",
      note: lead.note ?? "",
      status: isFloatingLeadStatusValue(lead.status) ? lead.status : "Chưa gọi",
      isClosed: lead.is_closed,
      claimCount: lead.claim_count,
    });
  };
  const saveEdit = () => {
    if (
      editLead &&
      hasLeadHistory(editLead) &&
      !window.confirm("Lead này đã có lịch sử xử lý. Bạn chắc chắn muốn sửa?")
    ) {
      return;
    }
    updateMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-3.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-slate-950">Kho thả nổi</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Admin theo dõi toàn bộ vòng đời lead Marketing → Sale
                </p>
              </div>
            </div>

            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:w-auto xl:grid-cols-4 xl:justify-end">
              <AdminLeadStatCard
                label="Tổng lead"
                value={adminLeadStats.total}
                className="from-slate-900 to-slate-700 text-white"
              />
              <AdminLeadStatCard
                label="Chưa nhận"
                value={adminLeadStats.unassigned}
                className="from-amber-50 to-orange-50 text-amber-800"
              />
              <AdminLeadStatCard
                label="Đã nhận"
                value={adminLeadStats.assigned}
                className="from-blue-50 to-cyan-50 text-blue-800"
              />
              <AdminLeadStatCard
                label="Đã chốt"
                value={adminLeadStats.closed}
                className="from-emerald-50 to-teal-50 text-emerald-800"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:w-[300px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="h-9 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm font-medium shadow-none transition-colors focus-visible:border-blue-300 focus-visible:ring-blue-100"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm số điện thoại"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button className="h-9 rounded-xl gap-2" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Thêm số
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl gap-2"
                disabled={isFetching}
                onClick={async () => {
                  await refetch();
                }}
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                Tải lại
              </Button>
              <DateRangeFilter
                value={range}
                onChange={setRange}
                hideLabel
                className="flex flex-wrap items-end gap-2"
              />
              <CompactSelect
                value={status}
                onValueChange={(value) => setStatus(value as AdminFloatingLeadStatus)}
                label="Trạng thái"
                hideLabel
              >
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="unassigned">Chưa nhận</SelectItem>
                <SelectItem value="called_1">Đã gọi 1</SelectItem>
                <SelectItem value="called_2">Đã gọi 2</SelectItem>
                <SelectItem value="called_3">Đã gọi 3</SelectItem>
                <SelectItem value="closed">Đã chốt</SelectItem>
                <SelectItem value="not_closed">Chưa chốt</SelectItem>
              </CompactSelect>
              <CompactSelect
                value={marketingId}
                onValueChange={setMarketingId}
                label="Marketing"
                hideLabel
              >
                <SelectItem value="all">Tất cả Marketing</SelectItem>
                {(data?.marketers ?? []).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {displayProfileName(profile)}
                  </SelectItem>
                ))}
              </CompactSelect>
              <CompactSelect value={saleId} onValueChange={setSaleId} label="Sale" hideLabel>
                <SelectItem value="all">Tất cả Sale</SelectItem>
                {(data?.sales ?? []).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {displayProfileName(profile)}
                  </SelectItem>
                ))}
              </CompactSelect>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : (
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="max-h-[68vh] overflow-auto p-0">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-sm">
                <tr>
                  {[
                    "STT",
                    "Ngày",
                    "Số điện thoại",
                    "Marketing",
                    "Sale nhận hiện tại",
                    "Cuộc gọi lần 1",
                    "Cuộc gọi lần 2",
                    "Cuộc gọi lần 3",
                    "Tình trạng",
                    "",
                  ].map((header) => (
                    <th key={header} className="px-3 py-2.5">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead, index) => {
                  const statusLabel = getFloatingLeadDisplayStatus(lead);
                  return (
                    <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {formatDate(lead.lead_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-black text-slate-900">
                          {lead.phone}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">
                        {lead.created_by_name ||
                          displayProfileName(
                            data?.marketers.find((item) => item.id === lead.created_by),
                          )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {lead.assigned_sale_name ||
                          displayProfileName(
                            data?.sales.find((item) => item.id === lead.closed_by),
                          ) ||
                          "Chưa có"}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">
                        {lead.call_1 || "—"}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">
                        {lead.call_2 || "—"}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">
                        {lead.call_3 || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <FloatingLeadStatusBadge status={statusLabel} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-lg p-0"
                            title="Sửa lead"
                            aria-label="Sửa lead"
                            onClick={() => openEditDialog(lead)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-lg p-0 text-destructive hover:bg-red-50 hover:text-destructive"
                            title="Xóa lead"
                            aria-label="Xóa lead"
                            onClick={() => setDeleteLead(lead)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!visibleLeads.length && <EmptyTableRow colSpan={10} />}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <AdminLeadCreateDialog
        open={createOpen}
        form={createForm}
        marketers={data?.marketers ?? []}
        isSaving={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onFormChange={setCreateForm}
        onSave={() => createMutation.mutate()}
      />
      <AdminLeadEditDialog
        open={!!editLead && !!editForm}
        form={editForm}
        marketers={data?.marketers ?? []}
        sales={data?.sales ?? []}
        isSaving={updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setEditLead(null);
            setEditForm(null);
          }
        }}
        onFormChange={setEditForm}
        onSave={saveEdit}
      />
      <AdminLeadDeleteDialog
        lead={deleteLead}
        isDeleting={deleteMutation.isPending}
        onOpenChange={(open) => !open && setDeleteLead(null)}
        onConfirm={() => deleteLead && deleteMutation.mutate(deleteLead.id)}
      />
    </div>
  );
}

function AdminLeadCreateDialog({
  open,
  form,
  marketers,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  form: AdminLeadCreateForm;
  marketers: SaleProfile[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: AdminLeadCreateForm) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm số vào kho thả nổi</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Ngày">
              <Input
                type="date"
                value={form.leadDate}
                onChange={(event) => onFormChange({ ...form, leadDate: event.target.value })}
              />
            </Field>
            <Field label="Marketing tạo / phụ trách">
              <Select
                value={form.marketingId}
                onValueChange={(value) => onFormChange({ ...form, marketingId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn Marketing" />
                </SelectTrigger>
                <SelectContent>
                  {marketers.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {displayProfileName(profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Nguồn">
            <Input
              value={form.source}
              onChange={(event) => onFormChange({ ...form, source: event.target.value })}
              placeholder="Facebook, Odoo, Ads..."
            />
          </Field>
          <Field label="Số điện thoại">
            <Textarea
              className="min-h-32"
              value={form.phonesText}
              onChange={(event) => onFormChange({ ...form, phonesText: event.target.value })}
              placeholder="Nhập tối đa 5 số điện thoại, mỗi dòng 1 số"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Admin có thể thêm tối đa 5 số/lần. Số sẽ thuộc về Marketing được chọn.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Lưu số
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminLeadEditDialog({
  open,
  form,
  marketers,
  sales,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  form: AdminLeadEditForm | null;
  marketers: SaleProfile[];
  sales: SaleProfile[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: AdminLeadEditForm | null) => void;
  onSave: () => void;
}) {
  if (!form) return null;

  const setForm = (next: Partial<AdminLeadEditForm>) => onFormChange({ ...form, ...next });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sửa lead thả nổi</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Số điện thoại">
              <Input
                value={form.phone}
                onChange={(event) => setForm({ phone: event.target.value })}
              />
            </Field>
            <Field label="Ngày">
              <Input
                type="date"
                value={form.leadDate}
                onChange={(event) => setForm({ leadDate: event.target.value })}
              />
            </Field>
            <Field label="Nguồn">
              <Input
                value={form.source}
                onChange={(event) => setForm({ source: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Marketing owner">
              <Select
                value={form.marketingId}
                onValueChange={(value) => setForm({ marketingId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketers.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {displayProfileName(profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sale nhận">
              <Select
                value={form.assignedSaleId}
                onValueChange={(value) => setForm({ assignedSaleId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Chưa có</SelectItem>
                  {sales.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {displayProfileName(profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Trạng thái">
              <Select
                value={form.status}
                onValueChange={(value) => {
                  const nextStatus = value as FloatingLeadStatus;
                  setForm({ status: nextStatus, isClosed: nextStatus === "Đã bị chốt" });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {floatingLeadStatuses.map((statusItem) => (
                    <SelectItem key={statusItem} value={statusItem}>
                      {statusItem}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Cuộc gọi lần 1">
              <Textarea
                className="min-h-24"
                value={form.call1}
                onChange={(event) => setForm({ call1: event.target.value })}
              />
            </Field>
            <Field label="Cuộc gọi lần 2">
              <Textarea
                className="min-h-24"
                value={form.call2}
                onChange={(event) => setForm({ call2: event.target.value })}
              />
            </Field>
            <Field label="Cuộc gọi lần 3">
              <Textarea
                className="min-h-24"
                value={form.call3}
                onChange={(event) => setForm({ call3: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Ghi chú Sale">
            <Textarea
              className="min-h-24"
              value={form.note}
              onChange={(event) => setForm({ note: event.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold">
            <Checkbox
              checked={form.isClosed}
              onCheckedChange={(value) => {
                const checked = value === true;
                setForm({
                  isClosed: checked,
                  status: checked
                    ? "Đã bị chốt"
                    : form.status === "Đã bị chốt"
                      ? "Chưa gọi"
                      : form.status,
                });
              }}
            />
            Đánh dấu đã chốt
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminLeadDeleteDialog({
  lead,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  lead: FloatingLeadRow | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const hasHistory = !!lead && hasLeadHistory(lead);

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xóa lead thả nổi?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Bạn có chắc muốn xóa lead này? Hành động này không thể hoàn tác.</p>
          {hasHistory ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-700">
              Lead này đã có lịch sử xử lý Sale. Xóa sẽ mất toàn bộ lịch sử.
            </p>
          ) : null}
          {lead ? <p className="font-bold text-foreground">{lead.phone}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Xóa lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function createAdminFloatingLeads(form: AdminLeadCreateForm, marketers: SaleProfile[]) {
  const phones = parseAdminLeadPhones(form.phonesText);
  if (!phones.length) throw new Error("Nhập ít nhất 1 số điện thoại.");
  if (!form.marketingId) throw new Error("Chọn Marketing phụ trách.");
  if (!form.leadDate) throw new Error("Chọn ngày.");

  const marketer = marketers.find((profile) => profile.id === form.marketingId);
  const rows: TablesInsert<"floating_leads">[] = phones.map((phone) => ({
    phone,
    source: form.source.trim() || null,
    lead_date: form.leadDate,
    created_by: form.marketingId,
    created_by_name: displayProfileName(marketer),
    status: "Chưa gọi",
    lifecycle_status: "new",
  }));

  const { data, error } = await supabase.from("floating_leads").insert(rows).select("*");
  if (error) throw error;
  return (data ?? []) as FloatingLeadRow[];
}

async function updateAdminFloatingLead(
  form: AdminLeadEditForm | null,
  marketers: SaleProfile[],
  sales: SaleProfile[],
) {
  if (!form) throw new Error("Không có dữ liệu lead để cập nhật.");
  const phone = normalizeAdminLeadPhone(form.phone);
  validateSingleAdminLeadPhone(phone);
  if (!form.marketingId) throw new Error("Chọn Marketing owner.");
  if (!form.leadDate) throw new Error("Chọn ngày.");

  const marketer = marketers.find((profile) => profile.id === form.marketingId);
  const sale = sales.find((profile) => profile.id === form.assignedSaleId);
  const assignedSaleId = form.assignedSaleId === "none" ? null : form.assignedSaleId;
  const assignedAt = assignedSaleId ? new Date().toISOString() : null;
  const status = form.isClosed ? "Đã bị chốt" : form.status;
  const lifecycleStatus = deriveFloatingLeadLifecycle({
    assigned_sale_id: assignedSaleId,
    assigned_at: assignedAt,
    is_closed: form.isClosed,
    call_1: form.call1.trim() || null,
    call_2: form.call2.trim() || null,
    call_3: form.call3.trim() || null,
    claim_count: form.claimCount,
  });
  const payload: TablesUpdate<"floating_leads"> = {
    phone,
    lead_date: form.leadDate,
    source: form.source.trim() || null,
    created_by: form.marketingId,
    created_by_name: displayProfileName(marketer),
    assigned_sale_id: assignedSaleId,
    assigned_sale_name: assignedSaleId ? displayProfileName(sale) : null,
    assigned_at: assignedAt,
    call_1: form.call1.trim() || null,
    call_2: form.call2.trim() || null,
    call_3: form.call3.trim() || null,
    note: form.note.trim() || null,
    status,
    lifecycle_status: lifecycleStatus,
    is_closed: form.isClosed,
    closed_by: form.isClosed ? assignedSaleId : null,
    closed_at: form.isClosed ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("floating_leads")
    .update(payload)
    .eq("id", form.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as FloatingLeadRow;
}

async function deleteAdminFloatingLead(leadId: string) {
  const { error } = await supabase.from("floating_leads").delete().eq("id", leadId);
  if (error) throw error;
}

async function fetchAdminSaleReports(from: string, to: string) {
  const { data, error } = await supabase
    .from("sale_reports")
    .select("*")
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false })
    .order("slot_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SaleReportRow[];
}

async function fetchSaleTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name")
    .eq("department", "sale")
    .order("name");
  if (error) throw error;
  return (data ?? []) as SaleTeam[];
}

async function fetchSaleTeamMemberships(teamIds: string[]) {
  if (!teamIds.length) return [] as SaleTeamMembership[];
  const { data, error } = await supabase
    .from("team_memberships")
    .select("team_id, user_id, role_in_team")
    .in("team_id", teamIds)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as SaleTeamMembership[];
}

async function fetchSaleKpiTargets(from: string, to: string) {
  const { data, error } = await supabase
    .from("sale_kpi_targets")
    .select("*")
    .lte("period_start", to)
    .gte("period_end", from)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SaleKpiTarget[];
}

async function upsertSaleKpiTarget(form: SaleKpiForm) {
  if (form.scope === "team" && !form.teamId) throw new Error("Chọn phạm vi KPI Sale");
  if (form.scope === "user" && !form.userId) throw new Error("Chọn nhân viên Sale");
  if (!form.periodStart || !form.periodEnd) throw new Error("Chọn kỳ KPI");

  const payload: TablesInsert<"sale_kpi_targets"> = {
    team_id: form.teamId === COMPANY_SCOPE_VALUE ? null : form.teamId || null,
    user_id: form.scope === "user" ? form.userId : null,
    period_type: form.periodType,
    period_start: form.periodStart,
    period_end: form.periodEnd,
    revenue_target: 0,
    orders_target: 0,
    close_rate_target: Number(form.closeRateTarget || 0),
    average_order_target: Number(form.averageOrderTarget || 0),
    note: null,
  };

  if (form.id) {
    const { error } = await supabase.from("sale_kpi_targets").update(payload).eq("id", form.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("sale_kpi_targets").insert(payload);
  if (error) throw error;
}

async function deleteSaleKpiTarget(targetId: string) {
  const { error } = await supabase.from("sale_kpi_targets").delete().eq("id", targetId);
  if (error) throw error;
}

async function fetchAdminFloatingLeads(from: string, to: string) {
  const { data, error } = await supabase
    .from("floating_leads")
    .select("*")
    .gte("lead_date", from)
    .lte("lead_date", to)
    .order("lead_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FloatingLeadRow[];
}

async function fetchSaleProfiles() {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", [...SALE_ROLES]);
  if (rolesError) throw rolesError;
  return fetchProfilesByIds((roles ?? []).map((item) => item.user_id));
}

async function fetchMarketingProfiles() {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", [...MARKETING_ROLES]);
  if (rolesError) throw rolesError;
  const ids = Array.from(new Set((roles ?? []).map((role) => role.user_id)));
  return fetchProfilesByIds(ids);
}

async function fetchProfilesByRole(role: AppRole) {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", role);
  if (rolesError) throw rolesError;
  return fetchProfilesByIds((roles ?? []).map((item) => item.user_id));
}

async function fetchProfilesByIds(ids: string[]) {
  if (!ids.length) return [] as SaleProfile[];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", ids)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as SaleProfile[];
}

function buildSalePerformance(
  reports: SaleReportRow[],
  sales: SaleProfile[],
  leads: FloatingLeadRow[],
) {
  return sales.map((sale) => {
    const saleReports = reports.filter((row) => row.user_id === sale.id);
    return {
      saleId: sale.id,
      name: displayProfileName(sale),
      summary: summarizeSaleReports(saleReports),
      activeLeads: leads.filter((lead) => lead.assigned_sale_id === sale.id && !lead.is_closed)
        .length,
      closedLeads: leads.filter((lead) => lead.closed_by === sale.id).length,
    };
  });
}

function matchesLeadStatusFilter(lead: FloatingLeadRow, status: AdminFloatingLeadStatus) {
  const displayStatus = getFloatingLeadDisplayStatus(lead);
  if (status === "all") return true;
  if (status === "not_closed") return !lead.is_closed;
  if (status === "unassigned")
    return !lead.is_closed && !lead.assigned_sale_id && displayStatus === "Chưa gọi";
  if (status === "closed") return lead.is_closed;
  if (status === "called_1") return displayStatus === "Đã gọi 1";
  if (status === "called_2") return displayStatus === "Đã gọi 2";
  if (status === "called_3") return displayStatus === "Đã gọi 3";
  return true;
}

function AdminSaleMetric({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string;
  tone?: "slate" | "green" | "blue" | "amber";
}) {
  const tones = {
    slate: "bg-white",
    green: "bg-emerald-50 text-emerald-900",
    blue: "bg-blue-50 text-blue-900",
    amber: "bg-amber-50 text-amber-900",
  };
  return (
    <Card className={cn("rounded-2xl", tones[tone])}>
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}

function AdminLeadStatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <Card
      className={cn(
        "h-12 min-w-[88px] overflow-hidden rounded-xl border-0 bg-gradient-to-br shadow-sm",
        className,
      )}
    >
      <CardContent className="flex h-full items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold leading-tight opacity-75">{label}</p>
          <p className="text-lg font-black leading-tight">{formatSaleInteger(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CompactSelect({
  value,
  onValueChange,
  label,
  hideLabel = false,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-36 space-y-1">
      <Label className={cn("text-xs", hideLabel && "sr-only")}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          aria-label={label}
          className="h-9 rounded-xl border-slate-200 bg-white text-sm font-semibold shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function FloatingLeadStatusBadge({ status }: { status: FloatingLeadDisplayStatus }) {
  const styles: Record<FloatingLeadDisplayStatus, string> = {
    "Đã bị chốt": "border-emerald-100 bg-emerald-50 text-emerald-700",
    "Đã gọi 1": "border-blue-100 bg-blue-50 text-blue-700",
    "Đã gọi 2": "border-amber-100 bg-amber-50 text-amber-700",
    "Đã gọi 3": "border-rose-100 bg-rose-50 text-rose-700",
    "Chưa gọi": "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
        Chưa có dữ liệu.
      </td>
    </tr>
  );
}

function displayProfileName(profile?: SaleProfile | null) {
  return profile?.full_name || profile?.username || "Không rõ";
}

function formatDateShort(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function parseAdminLeadPhones(value: string) {
  const lines = value.split(/\r?\n/).map(normalizeAdminLeadPhone).filter(Boolean);
  if (lines.length > 5) throw new Error("Chỉ được nhập tối đa 5 số/lần.");

  const seen = new Set<string>();
  const phones: string[] = [];
  lines.forEach((phone) => {
    validateSingleAdminLeadPhone(phone);
    const digits = phone.replace(/\D/g, "");
    if (seen.has(digits)) return;
    seen.add(digits);
    phones.push(phone);
  });
  return phones;
}

function normalizeAdminLeadPhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function validateSingleAdminLeadPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(`Số điện thoại không hợp lệ: ${phone || "(trống)"}`);
  }
}

function hasLeadHistory(lead: FloatingLeadRow) {
  return Boolean(
    lead.assigned_sale_id ||
    lead.closed_by ||
    lead.is_closed ||
    lead.call_1 ||
    lead.call_2 ||
    lead.call_3 ||
    lead.claim_count > 0,
  );
}

function isFloatingLeadStatusValue(value: string): value is FloatingLeadStatus {
  return floatingLeadStatuses.includes(value as FloatingLeadStatus);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
