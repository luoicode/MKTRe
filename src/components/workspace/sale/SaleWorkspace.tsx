import {
  Activity,
  BarChart3,
  CheckCircle2,
  Database,
  Loader2,
  Lock,
  Pencil,
  PhoneCall,
  RefreshCw,
  Save,
  Target,
  Trophy,
  UserPlus,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SaleReportForm } from "@/components/workspace/sale/SaleReportForm";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { initialDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  fetchSaleReportsInRange,
  groupSaleReportsByDate,
  latestSaleActivities,
  summarizeSaleReports,
  summarizeSaleReportsBySlot,
  type SaleReportRow,
} from "@/lib/saleReports";
import {
  claimFloatingLead,
  fetchSaleFloatingLeads,
  getFloatingLeadCallField,
  releaseExpiredFloatingLeadsForSale,
  updateFloatingLeadCare,
  type FloatingLeadCareDraft,
  type FloatingLeadCallField,
  type FloatingLeadRow,
} from "@/lib/floatingLeads";

export function SaleDashboardWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const { data: reports = [], isLoading } = useSaleReportsRange(profile?.id, range);
  const summary = useMemo(() => summarizeSaleReports(reports), [reports]);
  const dailyTrend = useMemo(() => groupSaleReportsByDate(reports), [reports]);
  const slotSummaries = useMemo(() => summarizeSaleReportsBySlot(reports), [reports]);
  const activities = useMemo(() => latestSaleActivities(reports), [reports]);
  const isSingleDay = range.from === range.to;
  const rangeLabel = formatRangeLabel(range);

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Tổng quan Sale"
        subtitle={`${profile?.full_name ?? "Sale"} · ${rangeLabel}`}
        badge={<Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Sale</Badge>}
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <HeroKpiCard
              title={isSingleDay ? "Tỷ lệ chốt hôm nay" : "Tỷ lệ chốt"}
              value={formatNullablePercent(summary.closeRate)}
              subtitle={`${summary.totalDataClosed} data chốt / ${summary.totalDataReceived} data nhận`}
              meta={[
                ["Data nhận", formatInteger(summary.totalDataReceived)],
                ["Data chốt", formatInteger(summary.totalDataClosed)],
                ["Target", "Chưa đặt mục tiêu"],
              ]}
              tone={summary.closeRate && summary.closeRate >= 0.35 ? "green" : "amber"}
            />
            <HeroKpiCard
              title={isSingleDay ? "Doanh số hôm nay" : "Doanh số"}
              value={formatMoney(summary.totalRevenue)}
              subtitle="Target chưa đặt mục tiêu"
              meta={[
                ["Tổng doanh số", formatMoney(summary.totalRevenue)],
                ["TB đơn", summary.averageOrder ? formatMoney(summary.averageOrder) : "—"],
                ["Target", "Chưa đặt mục tiêu"],
              ]}
              tone="blue"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <KpiProgressCard summary={summary} />
            <RecentActivityCard activities={activities} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {isSingleDay ? (
              <ShiftPerformanceCard slotSummaries={slotSummaries} />
            ) : (
              <SaleTrendCard data={dailyTrend} />
            )}
            <DataOverviewCard summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}

export function SaleReportWorkspace() {
  return <SaleReportForm />;
}

function useSaleReportsRange(profileId: string | undefined, range: DateRangeValue) {
  return useQuery({
    queryKey: ["sale-dashboard", profileId, range.from, range.to],
    enabled: !!profileId,
    queryFn: () => fetchSaleReportsInRange(profileId!, range.from, range.to),
  });
}

export function SaleKpiWorkspace() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("month"));
  const { data: reports = [], isLoading } = useSaleReportsRange(profile?.id, range);
  const summary = useMemo(() => summarizeSaleReports(reports), [reports]);
  const trend = useMemo(() => groupSaleReportsByDate(reports), [reports]);
  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Target className="h-5 w-5" />}
        title="KPI Sale"
        subtitle="2 KPI cốt lõi: tỷ lệ chốt và doanh số"
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <KpiDetailCard
            title="Tỷ lệ chốt"
            value={formatNullablePercent(summary.closeRate)}
            description={`${formatInteger(summary.totalDataClosed)} / ${formatInteger(summary.totalDataReceived)} data`}
            chartType="bar"
            chartData={trend.map((item) => ({
              label: shortDate(item.date),
              value: item.closeRate,
            }))}
          />
          <KpiDetailCard
            title="Doanh số"
            value={formatMoney(summary.totalRevenue)}
            description="Target chưa đặt mục tiêu"
            chartType="line"
            chartData={trend.map((item) => ({ label: shortDate(item.date), value: item.revenue }))}
          />
        </div>
      )}
    </div>
  );
}

export function SaleFloatingPoolWorkspace() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [activeLeadTab, setActiveLeadTab] = useState<"pool" | "mine">("pool");
  const [leadDrafts, setLeadDrafts] = useState<Record<string, FloatingLeadCareDraft>>({});
  const [recentlyUpdatedLeadIds, setRecentlyUpdatedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["sale-floating-leads", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      try {
        await releaseExpiredFloatingLeadsForSale(profile!.id);
      } catch (error) {
        console.warn("[sale-floating-pool] release expired leads failed", error);
      }
      return fetchSaleFloatingLeads();
    },
  });
  const allLeads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const poolLeads = useMemo(() => {
    const currentSaleId = profile?.id;
    return allLeads.filter((lead) => {
      const hiddenReason = getSalePoolHiddenReason(lead, currentSaleId);
      if (hiddenReason) {
        console.debug("[sale-floating-pool][filter-out]", {
          currentSaleId,
          leadId: lead.id,
          assignedSaleId: lead.assigned_sale_id,
          claimCount: lead.claim_count,
          blockedSaleIds: lead.blocked_sale_ids,
          isClosed: lead.is_closed,
          reason: hiddenReason,
        });
        return false;
      }
      return true;
    });
  }, [allLeads, profile?.id]);
  const myLeads = useMemo(
    () =>
      allLeads.filter(
        (lead) =>
          (lead.assigned_sale_id === profile?.id || lead.closed_by === profile?.id) &&
          isLeadInDateRange(lead, range),
      ),
    [allLeads, profile?.id, range],
  );
  const visibleLeads = activeLeadTab === "mine" ? myLeads : poolLeads;
  const statLeads = useMemo(() => uniqueLeads([...poolLeads, ...myLeads]), [myLeads, poolLeads]);
  const stats = useMemo(
    () => ({
      total: statLeads.length,
      unassigned: poolLeads.length,
      assigned: statLeads.filter((lead) => !!lead.assigned_sale_id && !lead.is_closed).length,
      closed: statLeads.filter((lead) => lead.is_closed).length,
    }),
    [poolLeads.length, statLeads],
  );

  const currentSaleName = profile?.full_name || profile?.username || "Sale";

  const isLeadOwnedByCurrentSale = (lead: FloatingLeadRow) =>
    !!profile && (lead.assigned_sale_id === profile.id || lead.closed_by === profile.id);

  const refreshLeads = () =>
    queryClient.invalidateQueries({
      queryKey: ["sale-floating-leads", profile?.id],
    });

  const handleRefreshLeads = async () => {
    await refreshLeads();
  };

  const getLeadDraft = (lead: FloatingLeadRow): FloatingLeadCareDraft =>
    leadDrafts[lead.id] ?? {
      call_1: lead.call_1 ?? "",
      call_2: lead.call_2 ?? "",
      call_3: lead.call_3 ?? "",
      note: lead.note ?? "",
      is_closed: lead.is_closed,
    };

  const startEditingLead = (lead: FloatingLeadRow) => {
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: {
        call_1: lead.call_1 ?? "",
        call_2: lead.call_2 ?? "",
        call_3: lead.call_3 ?? "",
        note: lead.note ?? "",
        is_closed: lead.is_closed,
      },
    }));
    setEditingLeadId(lead.id);
  };

  const handleClaimLead = async (lead: FloatingLeadRow) => {
    if (!profile || lead.assigned_sale_id) return;
    try {
      await claimFloatingLead({
        leadId: lead.id,
        profileId: profile.id,
        profileName: currentSaleName,
      });
      await refreshLeads();
      toast.success("Đã nhận data");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể nhận data");
    }
  };

  const updateLeadField = <
    K extends keyof Pick<FloatingLeadCareDraft, "call_1" | "call_2" | "call_3" | "note">,
  >(
    lead: FloatingLeadRow,
    field: K,
    value: FloatingLeadCareDraft[K],
  ) => {
    if (!isLeadOwnedByCurrentSale(lead)) return;
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: { ...getLeadDraft(lead), [field]: value },
    }));
  };

  const updateLeadClosed = (lead: FloatingLeadRow, checked: boolean) => {
    if (!isLeadOwnedByCurrentSale(lead)) return;
    setLeadDrafts((current) => ({
      ...current,
      [lead.id]: { ...getLeadDraft(lead), is_closed: checked },
    }));
  };

  const markLeadUpdated = (leadId: string) => {
    setRecentlyUpdatedLeadIds((current) => new Set(current).add(leadId));
    window.setTimeout(() => {
      setRecentlyUpdatedLeadIds((current) => {
        const next = new Set(current);
        next.delete(leadId);
        return next;
      });
    }, 2500);
  };

  const handleSaveLead = async (lead: FloatingLeadRow) => {
    if (!isLeadOwnedByCurrentSale(lead)) {
      toast.error("Không thể cập nhật lead");
      return;
    }

    try {
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng.");
      await updateFloatingLeadCare({
        lead,
        draft: getLeadDraft(lead),
        profileId: profile.id,
      });
      await refreshLeads();
      markLeadUpdated(lead.id);
      setEditingLeadId(null);
      toast.success("Đã cập nhật lead thành công");
    } catch {
      toast.error("Không thể cập nhật lead");
    }
  };

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Đã copy số điện thoại");
    } catch {
      toast.error("Không thể copy số điện thoại");
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<Database className="h-5 w-5" />}
        title="Kho Lead Thả Nổi"
        subtitle={
          <span className="space-y-1">
            <span className="block">Danh sách data được thả nổi cho đội Sale xử lý</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold italic text-red-600">
              <Lock className="h-3.5 w-3.5" />
              *Lưu ý: Vui lòng kiểm tra kĩ số trên Odoo xem đã chốt chưa trước khi gọi
            </span>
          </span>
        }
        rightContent={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <FloatingLeadStatCard
              label="Tổng lead"
              value={stats.total}
              className="from-slate-900 to-slate-700 text-white"
            />
            <FloatingLeadStatCard
              label="Chưa nhận"
              value={stats.unassigned}
              className="from-amber-50 to-orange-50 text-amber-800"
            />
            <FloatingLeadStatCard
              label="Đã nhận"
              value={stats.assigned}
              className="from-blue-50 to-cyan-50 text-blue-800"
            />
            <FloatingLeadStatCard
              label="Đã chốt"
              value={stats.closed}
              className="from-emerald-50 to-teal-50 text-emerald-800"
            />
          </div>
        }
        actions={<DateRangeFilter value={range} onChange={setRange} hideLabel />}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <LeadTabButton
            active={activeLeadTab === "pool"}
            label="Kho thả nổi"
            count={poolLeads.length}
            onClick={() => setActiveLeadTab("pool")}
          />
          <LeadTabButton
            active={activeLeadTab === "mine"}
            label="Số đã nhận"
            count={myLeads.length}
            onClick={() => setActiveLeadTab("mine")}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-2 rounded-xl px-3"
          title="Tải lại danh sách"
          aria-label="Tải lại danh sách"
          disabled={leadsQuery.isFetching}
          onClick={handleRefreshLeads}
        >
          <RefreshCw className={cn("h-4 w-4", leadsQuery.isFetching && "animate-spin")} />
          <span className="hidden sm:inline">Tải lại</span>
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {leadsQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="hidden max-h-[min(64vh,620px)] overflow-auto lg:block">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="sticky top-0 z-20 border-b bg-white shadow-sm">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-20 w-14 bg-white px-4 py-3 text-center">STT</th>
                      <th className="sticky top-0 z-20 w-28 bg-white px-3 py-3">Ngày</th>
                      <th className="sticky top-0 z-20 w-48 bg-white px-3 py-3">Số điện thoại</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 1</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 2</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Cuộc gọi lần 3</th>
                      <th className="sticky top-0 z-20 w-44 bg-white px-3 py-3">Tình trạng</th>
                      <th className="sticky top-0 z-20 w-20 bg-white px-4 py-3 text-right">
                        Hành động
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead, index) => {
                      const isUnassigned = !lead.assigned_sale_id;
                      const isMine = isLeadOwnedByCurrentSale(lead);
                      const isClosed = lead.is_closed;
                      const isBlocked = !!profile?.id && lead.blocked_sale_ids.includes(profile.id);
                      const isMaxedOut = lead.claim_count >= 3;
                      const isEditing = isMine && !isClosed && editingLeadId === lead.id;
                      const isAssigned = !!lead.assigned_sale_id;
                      const isAssignedByOther = isAssigned && !isMine;
                      const isRecentlyUpdated = recentlyUpdatedLeadIds.has(lead.id);
                      const isPoolTab = activeLeadTab === "pool";
                      const activeCallField = getFloatingLeadCallField(lead);
                      const draft = getLeadDraft(lead);
                      return (
                        <tr
                          key={lead.id}
                          className={cn(
                            "border-b transition-colors last:border-b-0 hover:bg-slate-50/80",
                            isAssigned && !isEditing && "bg-slate-50 text-slate-500",
                            isClosed && "bg-emerald-50/80 text-emerald-900",
                            isEditing && "bg-blue-50/40 ring-1 ring-inset ring-blue-100",
                            isRecentlyUpdated && "bg-emerald-50/70",
                            isAssignedByOther && "text-slate-400",
                          )}
                        >
                          <td className="px-4 py-3 text-center font-semibold text-slate-500">
                            {index + 1}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                            {formatVietnameseDate(lead.lead_date)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {isPoolTab ? (
                              <span className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-bold leading-none text-slate-700">
                                <PhoneCall className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="whitespace-nowrap">{maskPhone(lead.phone)}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-bold leading-none text-slate-900 transition hover:bg-slate-200"
                                onClick={() => copyPhone(lead.phone)}
                              >
                                <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="whitespace-nowrap">{lead.phone}</span>
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <LeadInlineInput
                              value={draft.call_1 ?? ""}
                              disabled={
                                !canEditLeadCallField(
                                  isEditing,
                                  isPoolTab,
                                  activeCallField,
                                  "call_1",
                                )
                              }
                              placeholder={isEditing ? "Cập nhật lần 1" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_1", value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <LeadInlineInput
                              value={draft.call_2 ?? ""}
                              disabled={
                                !canEditLeadCallField(
                                  isEditing,
                                  isPoolTab,
                                  activeCallField,
                                  "call_2",
                                )
                              }
                              placeholder={isEditing ? "Cập nhật lần 2" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_2", value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <LeadInlineInput
                              value={draft.call_3 ?? ""}
                              disabled={
                                !canEditLeadCallField(
                                  isEditing,
                                  isPoolTab,
                                  activeCallField,
                                  "call_3",
                                )
                              }
                              placeholder={isEditing ? "Cập nhật lần 3" : "—"}
                              onChange={(value) => updateLeadField(lead, "call_3", value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            {isPoolTab ? (
                              <LeadPoolStatusBadge lead={lead} />
                            ) : (
                              <LeadClosedCheckbox
                                checked={draft.is_closed}
                                disabled={!isEditing || isClosed}
                                onChange={(checked) => updateLeadClosed(lead, checked)}
                              />
                            )}
                            {isMine && !isPoolTab ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {isRecentlyUpdated
                                  ? "Cập nhật vài giây trước"
                                  : formatLeadUpdatedAt(lead.updated_at)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <LeadActionButton
                              isUnassigned={isUnassigned}
                              isMine={isMine}
                              isEditing={isEditing}
                              isBlocked={isBlocked}
                              isMaxedOut={isMaxedOut}
                              isClosed={isClosed}
                              onClaim={() => handleClaimLead(lead)}
                              onEdit={() => startEditingLead(lead)}
                              onSave={() => handleSaveLead(lead)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 lg:hidden">
                {visibleLeads.map((lead, index) => {
                  const isUnassigned = !lead.assigned_sale_id;
                  const isMine = isLeadOwnedByCurrentSale(lead);
                  const isClosed = lead.is_closed;
                  const isBlocked = !!profile?.id && lead.blocked_sale_ids.includes(profile.id);
                  const isMaxedOut = lead.claim_count >= 3;
                  const isEditing = isMine && !isClosed && editingLeadId === lead.id;
                  const isAssigned = !!lead.assigned_sale_id;
                  const isAssignedByOther = isAssigned && !isMine;
                  const isRecentlyUpdated = recentlyUpdatedLeadIds.has(lead.id);
                  const isPoolTab = activeLeadTab === "pool";
                  const activeCallField = getFloatingLeadCallField(lead);
                  const draft = getLeadDraft(lead);
                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm",
                        isAssigned && !isEditing && "bg-slate-50 text-slate-500",
                        isClosed && "border-emerald-200 bg-emerald-50/80 text-emerald-900",
                        isEditing && "border-blue-200 bg-blue-50/30",
                        isRecentlyUpdated && "border-emerald-200 bg-emerald-50/70",
                        isAssignedByOther && "text-slate-400",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-muted-foreground">
                            #{index + 1} · {formatVietnameseDate(lead.lead_date)}
                          </p>
                          {isPoolTab ? (
                            <p className="mt-1 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-black leading-none text-slate-700">
                              <PhoneCall className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="whitespace-nowrap">{maskPhone(lead.phone)}</span>
                            </p>
                          ) : (
                            <button
                              type="button"
                              className="mt-1 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 text-sm font-black leading-none text-slate-950"
                              onClick={() => copyPhone(lead.phone)}
                            >
                              <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="whitespace-nowrap">{lead.phone}</span>
                            </button>
                          )}
                        </div>
                        <LeadActionButton
                          isUnassigned={isUnassigned}
                          isMine={isMine}
                          isEditing={isEditing}
                          isBlocked={isBlocked}
                          isMaxedOut={isMaxedOut}
                          isClosed={isClosed}
                          onClaim={() => handleClaimLead(lead)}
                          onEdit={() => startEditingLead(lead)}
                          onSave={() => handleSaveLead(lead)}
                        />
                      </div>
                      {isMine && !isPoolTab ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {isRecentlyUpdated
                            ? "Cập nhật vài giây trước"
                            : formatLeadUpdatedAt(lead.updated_at)}
                        </p>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        <LeadInlineInput
                          value={draft.call_1 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, isPoolTab, activeCallField, "call_1")
                          }
                          placeholder="Cuộc gọi lần 1"
                          onChange={(value) => updateLeadField(lead, "call_1", value)}
                        />
                        <LeadInlineInput
                          value={draft.call_2 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, isPoolTab, activeCallField, "call_2")
                          }
                          placeholder="Cuộc gọi lần 2"
                          onChange={(value) => updateLeadField(lead, "call_2", value)}
                        />
                        <LeadInlineInput
                          value={draft.call_3 ?? ""}
                          disabled={
                            !canEditLeadCallField(isEditing, isPoolTab, activeCallField, "call_3")
                          }
                          placeholder="Cuộc gọi lần 3"
                          onChange={(value) => updateLeadField(lead, "call_3", value)}
                        />
                        {isPoolTab ? (
                          <LeadPoolStatusBadge lead={lead} />
                        ) : (
                          <>
                            <LeadClosedCheckbox
                              checked={draft.is_closed}
                              disabled={!isEditing || isClosed}
                              onChange={(checked) => updateLeadClosed(lead, checked)}
                            />
                            <textarea
                              value={draft.note ?? ""}
                              disabled
                              rows={2}
                              className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary disabled:bg-slate-50 disabled:text-slate-500"
                              placeholder="Ghi chú nội bộ"
                              readOnly
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!visibleLeads.length && (
                <div className="p-6">
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center">
                    <Database className="h-8 w-8 text-slate-400" />
                    <p className="mt-3 font-bold text-slate-900">Chưa có lead trong khoảng này</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Data sẽ xuất hiện tại đây khi Marketing hoặc hệ thống thả xuống.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FloatingLeadStatCard({
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
        "min-w-[96px] overflow-hidden rounded-xl border-0 bg-gradient-to-br shadow-sm",
        className,
      )}
    >
      <CardContent className="flex items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold leading-tight opacity-75">{label}</p>
          <p className="text-lg font-black leading-tight">{formatInteger(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeadTabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
      onClick={onClick}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs",
          active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700",
        )}
      >
        {formatInteger(count)}
      </span>
    </button>
  );
}

function LeadInlineInput({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      className="h-9 w-full min-w-40 rounded-xl border bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary disabled:bg-slate-50 disabled:text-slate-500"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function canEditLeadCallField(
  isEditing: boolean,
  isPoolTab: boolean,
  activeCallField: FloatingLeadCallField,
  field: FloatingLeadCallField,
) {
  return isEditing && !isPoolTab && activeCallField === field;
}

function LeadActionButton({
  isUnassigned,
  isMine,
  isEditing,
  isBlocked,
  isMaxedOut,
  isClosed,
  onClaim,
  onEdit,
  onSave,
}: {
  isUnassigned: boolean;
  isMine: boolean;
  isEditing: boolean;
  isBlocked: boolean;
  isMaxedOut: boolean;
  isClosed: boolean;
  onClaim: () => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  if (isUnassigned) {
    if (isMaxedOut) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          className="h-9 w-9 rounded-xl p-0"
          title="Lead đã được xử lý đủ 3 lượt"
          aria-label="Lead đã được xử lý đủ 3 lượt"
        >
          <Lock className="h-4 w-4" />
        </Button>
      );
    }

    if (isBlocked) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          className="h-9 w-9 rounded-xl p-0"
          title="Bạn đã xử lý số này trước đó"
          aria-label="Bạn đã xử lý số này trước đó"
        >
          <Lock className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 w-9 rounded-xl p-0 text-emerald-700 hover:bg-emerald-50"
        title="Nhận data"
        aria-label="Nhận data"
        onClick={onClaim}
      >
        <UserPlus className="h-4 w-4" />
      </Button>
    );
  }

  if (!isMine || isClosed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        className="h-9 w-9 rounded-xl p-0"
        title={isClosed ? "Lead đã chốt" : "Lead đã có người nhận"}
        aria-label={isClosed ? "Lead đã chốt" : "Lead đã có người nhận"}
      >
        <Lock className="h-4 w-4" />
      </Button>
    );
  }

  if (isEditing) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-9 w-9 rounded-xl bg-emerald-600 p-0 text-white hover:bg-emerald-700"
        title="Cập nhật"
        aria-label="Cập nhật"
        onClick={onSave}
      >
        <Save className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 w-9 rounded-xl p-0"
      title="Sửa"
      aria-label="Sửa"
      onClick={onEdit}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}

function LeadPoolStatusBadge({ lead }: { lead: FloatingLeadRow }) {
  const normalizedCount = getLeadCallStatusCount(lead);
  const label = normalizedCount === 0 ? "Chưa ai nhận" : `Đã gọi ${normalizedCount}`;
  const styles = [
    "border-slate-200 bg-slate-50 text-slate-700",
    "border-blue-100 bg-blue-50 text-blue-700",
    "border-amber-100 bg-amber-50 text-amber-700",
    "border-rose-100 bg-rose-50 text-rose-700",
  ];

  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-32 items-center justify-center rounded-xl border px-3 text-sm font-bold",
        styles[normalizedCount],
      )}
    >
      {label}
    </span>
  );
}

function LeadClosedCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 min-w-32 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold",
        checked
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700",
        disabled && "opacity-80",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="h-4 w-4 accent-emerald-600"
        onChange={(event) => onChange(event.target.checked)}
      />
      Đã chốt
    </label>
  );
}

function maskPhone(phone: string) {
  const visible = phone.replace(/\D/g, "").slice(-4) || phone.slice(-4);
  return `•••• ••• ${visible}`;
}

function isLeadInDateRange(lead: FloatingLeadRow, range: DateRangeValue) {
  return lead.lead_date >= range.from && lead.lead_date <= range.to;
}

function getSalePoolHiddenReason(lead: FloatingLeadRow, currentSaleId?: string) {
  if (lead.is_closed) return "closed";
  if (lead.assigned_sale_id) return "assigned";
  if (lead.claim_count >= 3) return "max_claim_count";
  if (currentSaleId && lead.blocked_sale_ids.includes(currentSaleId)) return "blocked_for_sale";
  return null;
}

function getLeadCallStatusCount(lead: Pick<FloatingLeadRow, "call_1" | "call_2" | "call_3">) {
  if (lead.call_3?.trim()) return 3;
  if (lead.call_2?.trim()) return 2;
  if (lead.call_1?.trim()) return 1;
  return 0;
}

function uniqueLeads(leads: FloatingLeadRow[]) {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });
}

function formatVietnameseDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatLeadUpdatedAt(value: string) {
  if (!value) return "";
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000));
  if (diffSeconds < 60) return "Cập nhật vài giây trước";
  if (diffSeconds < 3600) return `Cập nhật ${Math.floor(diffSeconds / 60)} phút trước`;
  return `Cập nhật ${updatedAt.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function HeroKpiCard({
  title,
  value,
  subtitle,
  meta,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  meta: Array<[string, string]>;
  tone: "green" | "blue" | "amber";
}) {
  const styles = {
    green: "from-emerald-500 to-teal-500 shadow-emerald-500/20",
    blue: "from-blue-600 to-cyan-500 shadow-blue-500/20",
    amber: "from-amber-500 to-orange-500 shadow-amber-500/20",
  };
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border-0 bg-gradient-to-br text-white shadow-xl",
        styles[tone],
      )}
    >
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/80">{title}</p>
            <p className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{value}</p>
            <p className="mt-2 text-sm text-white/80">{subtitle}</p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
            <Target className="h-6 w-6" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-1/3 rounded-full bg-white/70" />
          </div>
          <div className="flex justify-between text-xs font-semibold text-white/85">
            <span>Tiến độ KPI</span>
            <span>Chưa đặt mục tiêu</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {meta.map(([label, itemValue]) => (
            <div key={label} className="rounded-2xl bg-white/12 px-3 py-2">
              <p className="text-xs text-white/70">{label}</p>
              <p className="mt-1 text-sm font-bold">{itemValue}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiProgressCard({ summary }: { summary: ReturnType<typeof summarizeSaleReports> }) {
  const rows = [
    {
      label: "Tỷ lệ chốt",
      value: formatNullablePercent(summary.closeRate),
      detail: `${formatInteger(summary.totalDataClosed)} data chốt`,
    },
    {
      label: "Doanh số",
      value: formatMoney(summary.totalRevenue),
      detail: "Target chưa đặt mục tiêu",
    },
    {
      label: "TB đơn",
      value: summary.averageOrder ? formatMoney(summary.averageOrder) : "—",
      detail: "Tính theo data đã chốt",
    },
  ];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-primary" />
          Tiến độ KPI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-black text-slate-950">{row.value}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
            <KpiMiniProgress label="Tiến độ" className="mt-3" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function KpiMiniProgress({ label, className }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">Chưa đặt mục tiêu</span>
      </div>
      <Progress value={0} className="h-1.5" />
    </div>
  );
}

function ShiftPerformanceCard({
  slotSummaries,
}: {
  slotSummaries: ReturnType<typeof summarizeSaleReportsBySlot>;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-emerald-600" />
          Hiệu suất theo ca
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {slotSummaries.map(({ slot, summary }) => {
          const closeRate = summary.closeRate ?? 0;
          return (
            <div key={slot.id} className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-950">{slot.tableLabel}</p>
                <ShiftBadge closeRate={closeRate} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <ShiftMetric label="Data nhận" value={formatInteger(summary.totalDataReceived)} />
                <ShiftMetric label="Data chốt" value={formatInteger(summary.totalDataClosed)} />
                <ShiftMetric label="Tỷ lệ" value={formatPercent(closeRate)} />
                <ShiftMetric label="Doanh số" value={formatMoneyCompact(summary.totalRevenue)} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SaleTrendCard({
  data,
}: {
  data: Array<{ date: string; closeRate: number; revenue: number }>;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-blue-600" />
          Xu hướng doanh số
        </CardTitle>
      </CardHeader>
      <CardContent className="h-60">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.map((item) => ({ ...item, label: shortDate(item.date) }))}>
              <XAxis dataKey="label" />
              <YAxis hide />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptySaleState />
        )}
      </CardContent>
    </Card>
  );
}

function DataOverviewCard({ summary }: { summary: ReturnType<typeof summarizeSaleReports> }) {
  const rows = [
    ["Data mới nhận", summary.newDataReceived],
    ["Data thả nổi nhận", summary.floatingDataReceived],
    ["Data mới chốt", summary.newDataClosed],
    ["Data thả nổi chốt", summary.floatingDataClosed],
    ["Khách cũ", summary.oldCustomers],
  ];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tổng quan dữ liệu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="font-black text-slate-950">{formatInteger(Number(value))}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({ activities }: { activities: SaleReportRow[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-amber-500" />
          Hoạt động gần đây
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length ? (
          activities.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="flex w-12 shrink-0 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                {item.slot_time}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">
                  {item.status === "submitted" ? "Đã gửi báo cáo" : "Đã lưu nháp"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(item.report_date)} · Doanh số{" "}
                  {formatMoney(Number(item.new_customer_revenue) + Number(item.floating_revenue))}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptySaleState />
        )}
      </CardContent>
    </Card>
  );
}

function KpiDetailCard({
  title,
  value,
  description,
  chartType,
  chartData,
}: {
  title: string;
  value: string;
  description: string;
  chartType: "bar" | "line";
  chartData: Array<{ label: string; value: number }>;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{title}</p>
            <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline">Chưa đặt mục tiêu</Badge>
        </div>
        <Progress value={0} className="h-2" />
        <div className="h-32">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={chartData}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip formatter={(itemValue) => `${itemValue}%`} />
                  <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip formatter={(itemValue) => formatMoney(Number(itemValue))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <EmptySaleState />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ShiftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ShiftBadge({ closeRate }: { closeRate: number }) {
  const label = closeRate >= 0.35 ? "Tốt" : closeRate >= 0.25 ? "Ổn" : "Cần cải thiện";
  const styles = {
    Tốt: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Ổn: "bg-blue-50 text-blue-700 border-blue-100",
    "Cần cải thiện": "bg-amber-50 text-amber-700 border-amber-100",
  };
  return <Badge className={cn("border", styles[label])}>{label}</Badge>;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

function formatMoneyCompact(value: number) {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  return formatMoney(value);
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("vi-VN");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100).toLocaleString("vi-VN")}%`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "—" : formatPercent(value);
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function shortDate(value: string) {
  return formatShortDate(value);
}

function formatRangeLabel(range: DateRangeValue) {
  if (range.from === range.to) return formatShortDate(range.from);
  return `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`;
}

function EmptySaleState() {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-xl bg-slate-50 text-sm text-muted-foreground">
      Chưa có dữ liệu báo cáo Sale trong khoảng này.
    </div>
  );
}
