import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, FileText, Loader2, Search, Target, TrendingUp } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  getFloatingLeadDisplayStatus,
  type FloatingLeadDisplayStatus,
  type FloatingLeadRow,
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

type AdminFloatingLeadStatus =
  | "all"
  | "unassigned"
  | "called_1"
  | "called_2"
  | "called_3"
  | "closed"
  | "not_closed";

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
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sale-kpi", normalizedRange.from, normalizedRange.to],
    queryFn: async () => {
      const [reports, sales] = await Promise.all([
        fetchAdminSaleReports(normalizedRange.from, normalizedRange.to),
        fetchSaleProfiles(),
      ]);
      return { reports, sales };
    },
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

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Target className="h-5 w-5" />}
        title="KPI Sale"
        subtitle="2 KPI chính: Tỷ lệ chốt và Doanh số"
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />
      {isLoading ? (
        <LoadingState />
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Xếp hạng KPI Sale</CardTitle>
            <p className="text-sm text-muted-foreground">Target: Chưa đặt mục tiêu</p>
          </CardHeader>
          <CardContent className="overflow-auto p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-3 py-3">Sale</th>
                  <th className="px-3 py-3">Doanh số</th>
                  <th className="px-3 py-3">Tỷ lệ chốt</th>
                  <th className="px-3 py-3">Data chốt</th>
                  <th className="px-3 py-3">Data nhận</th>
                  <th className="px-3 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.saleId} className="border-t">
                    <td className="px-4 py-3 font-black">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold">{row.name}</td>
                    <td className="px-3 py-3">{formatSaleVnd(row.summary.totalRevenue)}</td>
                    <td className="px-3 py-3">{formatSalePercent(row.summary.closeRate)}</td>
                    <td className="px-3 py-3">{formatSaleInteger(row.summary.totalDataClosed)}</td>
                    <td className="px-3 py-3">
                      {formatSaleInteger(row.summary.totalDataReceived)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">Chưa đặt mục tiêu</td>
                  </tr>
                ))}
                {!rows.length && <EmptyTableRow colSpan={7} />}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AdminFloatingLeadsWorkspace() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [status, setStatus] = useState<AdminFloatingLeadStatus>("all");
  const [marketingId, setMarketingId] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [search, setSearch] = useState("");
  const normalizedRange = normalizeDateRange(range);
  const { data, isLoading } = useQuery({
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

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Database className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-slate-950">Kho thả nổi</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Admin theo dõi toàn bộ vòng đời lead Marketing → Sale
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
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

          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="h-9 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm font-medium shadow-none transition-colors focus-visible:border-blue-300 focus-visible:ring-blue-100"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm số điện thoại"
            />
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
                    </tr>
                  );
                })}
                {!visibleLeads.length && <EmptyTableRow colSpan={9} />}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
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
  return fetchProfilesByRole("sale");
}

async function fetchMarketingProfiles() {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["employee", "leader"]);
  if (rolesError) throw rolesError;
  const ids = Array.from(new Set((roles ?? []).map((role) => role.user_id)));
  return fetchProfilesByIds(ids);
}

async function fetchProfilesByRole(role: "admin" | "manager" | "leader" | "employee" | "sale") {
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
