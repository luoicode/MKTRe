import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, Search } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { RefreshButton } from "@/components/RefreshButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  getFloatingLeadDisplayStatus,
  type FloatingLeadDisplayStatus,
  type FloatingLeadRow,
} from "@/lib/floatingLeads";
import { cn } from "@/lib/utils";

type LeaderFloatingLeadStatus =
  | "all"
  | "unassigned"
  | "called_1"
  | "called_2"
  | "called_3"
  | "closed"
  | "not_closed";

type LeadProfileOption = {
  id: string;
  name: string;
};

export function LeaderFloatingPoolWorkspace() {
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [marketingId, setMarketingId] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [status, setStatus] = useState<LeaderFloatingLeadStatus>("all");
  const [search, setSearch] = useState("");
  const normalizedRange = normalizeDateRange(range);

  const {
    data: leads = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["leader-floating-leads", normalizedRange.from, normalizedRange.to],
    queryFn: () => fetchLeaderFloatingLeads(normalizedRange.from, normalizedRange.to),
  });

  const marketers = useMemo(
    () =>
      uniqueProfileOptions(
        leads.map((lead) => ({
          id: lead.created_by,
          name: lead.created_by_name || "Marketing",
        })),
      ),
    [leads],
  );
  const sales = useMemo(
    () =>
      uniqueProfileOptions(
        leads
          .map((lead) => ({
            id: lead.assigned_sale_id || lead.closed_by || "",
            name: lead.assigned_sale_name || "Sale",
          }))
          .filter((item) => item.id),
      ),
    [leads],
  );

  const visibleLeads = useMemo(
    () =>
      leads.filter((lead) => {
        if (marketingId !== "all" && lead.created_by !== marketingId) return false;
        if (saleId !== "all" && lead.assigned_sale_id !== saleId && lead.closed_by !== saleId) {
          return false;
        }
        if (!matchesLeadStatusFilter(lead, status)) return false;
        if (search.trim() && !lead.phone.includes(search.trim())) return false;
        return true;
      }),
    [leads, marketingId, saleId, search, status],
  );

  const stats = useMemo(
    () => ({
      total: visibleLeads.length,
      assigned: visibleLeads.filter((lead) => !!lead.assigned_sale_id).length,
      closed: visibleLeads.filter((lead) => lead.is_closed).length,
    }),
    [visibleLeads],
  );

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Database className="h-5 w-5" />}
        title="Kho thả nổi Team"
        subtitle="Theo dõi data thả nổi do team Marketing của bạn đẩy cho Sale"
        rightContent={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <RefreshButton
              isRefreshing={isFetching}
              onRefresh={async () => {
                await refetch();
              }}
            />
            <div className="grid min-w-0 grid-cols-3 gap-2">
              <LeaderLeadStat label="Tổng số" value={stats.total} tone="slate" />
              <LeaderLeadStat label="Sale nhận" value={stats.assigned} tone="blue" />
              <LeaderLeadStat label="Đã chốt" value={stats.closed} tone="green" />
            </div>
          </div>
        }
      />

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter
              value={range}
              onChange={setRange}
              hideLabel
              className="flex flex-wrap items-end gap-2"
            />
            <CompactSelect value={marketingId} onValueChange={setMarketingId} label="Marketing">
              <SelectItem value="all">Tất cả Marketing</SelectItem>
              {marketers.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </CompactSelect>
            <CompactSelect value={saleId} onValueChange={setSaleId} label="Sale nhận">
              <SelectItem value="all">Tất cả Sale</SelectItem>
              {sales.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </CompactSelect>
            <CompactSelect
              value={status}
              onValueChange={(value) => setStatus(value as LeaderFloatingLeadStatus)}
              label="Tình trạng"
            >
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="unassigned">Chưa nhận</SelectItem>
              <SelectItem value="called_1">Đã gọi 1</SelectItem>
              <SelectItem value="called_2">Đã gọi 2</SelectItem>
              <SelectItem value="called_3">Đã gọi 3</SelectItem>
              <SelectItem value="closed">Đã chốt</SelectItem>
              <SelectItem value="not_closed">Chưa chốt</SelectItem>
            </CompactSelect>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="h-9 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm font-medium shadow-none transition-colors focus-visible:border-blue-300 focus-visible:ring-blue-100"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm số điện thoại"
              />
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
                    "Sale nhận",
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
                {visibleLeads.map((lead, index) => (
                  <LeaderLeadRow key={lead.id} lead={lead} index={index} />
                ))}
                {!visibleLeads.length && <EmptyTableRow colSpan={9} />}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function fetchLeaderFloatingLeads(from: string, to: string) {
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

function LeaderLeadRow({ lead, index }: { lead: FloatingLeadRow; index: number }) {
  const status = getFloatingLeadDisplayStatus(lead);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/70">
      <td className="px-3 py-2.5 text-center font-semibold text-slate-500">{index + 1}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
        {formatVietnameseDate(lead.lead_date)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-black text-slate-900">
          {lead.phone}
        </span>
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-700">
        {lead.created_by_name || "Marketing"}
      </td>
      <td className="px-3 py-2.5 text-slate-700">{lead.assigned_sale_name || "Chưa có"}</td>
      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">{lead.call_1 || "—"}</td>
      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">{lead.call_2 || "—"}</td>
      <td className="max-w-48 truncate px-3 py-2.5 text-slate-700">{lead.call_3 || "—"}</td>
      <td className="px-3 py-2.5">
        <FloatingLeadStatusBadge status={status} />
      </td>
    </tr>
  );
}

function CompactSelect({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className="h-9 w-40 rounded-xl border-slate-200 bg-white text-sm font-semibold shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
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

function LeaderLeadStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "green";
}) {
  const styles = {
    slate: "from-slate-900 to-slate-700 text-white",
    blue: "from-blue-50 to-cyan-50 text-blue-800",
    green: "from-emerald-50 to-teal-50 text-emerald-800",
  };

  return (
    <Card
      className={cn(
        "min-w-[92px] overflow-hidden rounded-xl border-0 bg-gradient-to-br",
        styles[tone],
      )}
    >
      <CardContent className="px-3 py-2">
        <p className="text-[11px] font-semibold leading-tight opacity-75">{label}</p>
        <p className="text-lg font-black leading-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        Không có lead phù hợp bộ lọc.
      </td>
    </tr>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function matchesLeadStatusFilter(lead: FloatingLeadRow, status: LeaderFloatingLeadStatus) {
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

function uniqueProfileOptions(items: LeadProfileOption[]) {
  const map = new Map<string, LeadProfileOption>();
  items.forEach((item) => {
    if (!item.id || map.has(item.id)) return;
    map.set(item.id, item);
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatVietnameseDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
