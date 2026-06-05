import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { initialDateRange, normalizeDateRange, type DateRangeValue } from "@/lib/dateRange";
import { getLeaderTeamIds } from "@/lib/dailyAggregates";
import {
  createMarketingFloatingLeads,
  getFloatingLeadDisplayStatus,
  todayYmd,
  type FloatingLeadDisplayStatus,
  type FloatingLeadRow,
} from "@/lib/floatingLeads";
import { MARKETING_ROLES } from "@/lib/roles";
import { usePagination } from "@/lib/usePagination";
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

type LeaderFloatingPoolData = {
  leads: FloatingLeadRow[];
  marketers: LeadProfileOption[];
  sales: LeadProfileOption[];
};

export function LeaderFloatingPoolWorkspace() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneText, setPhoneText] = useState("");
  const [invalidPhones, setInvalidPhones] = useState<string[]>([]);
  const [duplicatePhones, setDuplicatePhones] = useState<string[]>([]);
  const [marketingId, setMarketingId] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [status, setStatus] = useState<LeaderFloatingLeadStatus>("all");
  const [search, setSearch] = useState("");
  const normalizedRange = normalizeDateRange(range);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["leader-floating-leads", profile?.id, normalizedRange.from, normalizedRange.to],
    queryFn: () =>
      fetchLeaderFloatingPoolData(profile!.id, normalizedRange.from, normalizedRange.to),
    enabled: !!profile?.id,
  });
  const leads = useMemo(() => data?.leads ?? [], [data?.leads]);
  const marketers = useMemo(() => data?.marketers ?? [], [data?.marketers]);
  const sales = useMemo(() => data?.sales ?? [], [data?.sales]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng.");
      const { phones, invalid, duplicates } = parseLeaderLeadPhones(phoneText);
      setInvalidPhones(invalid);
      setDuplicatePhones(duplicates);
      if (!phones.length && !invalid.length) throw new Error("Nhập ít nhất 1 số điện thoại.");
      if (invalid.length) throw new Error("Vui lòng kiểm tra các số điện thoại không hợp lệ.");

      return createMarketingFloatingLeads({
        phones,
        profileId: profile.id,
        profileName: profile.full_name || profile.username || "Leader Marketing",
        leadDate: todayYmd(),
      });
    },
    onSuccess: async (rows) => {
      await queryClient.invalidateQueries({ queryKey: ["leader-floating-leads"] });
      setPhoneText("");
      setInvalidPhones([]);
      setDuplicatePhones([]);
      setDialogOpen(false);
      toast.success(`Đã thêm ${rows.length} số vào kho thả nổi`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể thêm số");
    },
  });

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
      unassigned: visibleLeads.filter((lead) => !lead.assigned_sale_id && !lead.is_closed).length,
      assigned: visibleLeads.filter((lead) => !!lead.assigned_sale_id && !lead.is_closed).length,
      closed: visibleLeads.filter((lead) => lead.is_closed).length,
    }),
    [visibleLeads],
  );
  const leadPagination = usePagination({
    items: visibleLeads,
    resetKey: `${normalizedRange.from}|${normalizedRange.to}|${search}|${status}|${marketingId}|${saleId}`,
  });

  return (
    <div className="space-y-4">
      <WorkspacePageHeader
        icon={<Database className="h-5 w-5" />}
        title="Kho thả nổi"
        subtitle="Theo dõi data thả nổi của team Marketing"
        rightContent={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <RefreshButton
              isRefreshing={isFetching}
              onRefresh={async () => {
                await refetch();
              }}
            />
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              <LeaderLeadStat label="Tổng lead" value={stats.total} tone="slate" />
              <LeaderLeadStat label="Chưa nhận" value={stats.unassigned} tone="amber" />
              <LeaderLeadStat label="Đã nhận" value={stats.assigned} tone="blue" />
              <LeaderLeadStat label="Đã chốt" value={stats.closed} tone="green" />
            </div>
          </div>
        }
        actions={
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Thêm số
          </Button>
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
                {leadPagination.paginatedItems.map((lead, index) => (
                  <LeaderLeadRow
                    key={lead.id}
                    lead={lead}
                    index={(leadPagination.page - 1) * leadPagination.pageSize + index}
                    marketers={marketers}
                    sales={sales}
                  />
                ))}
                {Array.from({ length: leadPagination.emptyRowsCount }).map((_, index) => (
                  <tr key={`empty-${index}`} className="h-[52px] border-t border-slate-100">
                    <td colSpan={9} />
                  </tr>
                ))}
                {!visibleLeads.length && <EmptyTableRow colSpan={9} />}
              </tbody>
            </table>
          </CardContent>
          <TablePagination
            page={leadPagination.page}
            totalPages={leadPagination.totalPages}
            onPageChange={leadPagination.setPage}
          />
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (open) {
            setInvalidPhones([]);
            setDuplicatePhones([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm số vào kho thả nổi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="leader-floating-phone-list">Danh sách số điện thoại</Label>
              <Textarea
                id="leader-floating-phone-list"
                value={phoneText}
                inputMode="tel"
                className="min-h-44 resize-y rounded-xl"
                placeholder={`Nhập mỗi số một dòng\nVí dụ:\n0988123123\n0977333772\n0855519019`}
                onChange={(event) => {
                  setPhoneText(event.target.value);
                  if (invalidPhones.length) setInvalidPhones([]);
                  if (duplicatePhones.length) setDuplicatePhones([]);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mỗi dòng là một số. Dòng trống sẽ được bỏ qua, số trùng trong cùng lần nhập sẽ tự bỏ
              qua.
            </p>
            {invalidPhones.length ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Số không hợp lệ:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {invalidPhones.map((phone) => (
                    <li key={phone}>{phone}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {duplicatePhones.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">Đã bỏ qua số trùng:</p>
                <p className="mt-1 break-words">{duplicatePhones.join(", ")}</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              className="gap-2"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Lưu số
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseLeaderLeadPhones(input: string) {
  const rawLines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const phones: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];

  rawLines.forEach((rawPhone) => {
    const normalizedPhone = rawPhone.replace(/\s+/g, " ");
    const digits = normalizedPhone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      invalid.push(rawPhone);
      return;
    }

    if (seen.has(digits)) {
      duplicates.push(normalizedPhone);
      return;
    }

    seen.add(digits);
    phones.push(normalizedPhone);
  });

  return { phones, invalid, duplicates };
}

async function fetchLeaderFloatingPoolData(
  profileId: string,
  from: string,
  to: string,
): Promise<LeaderFloatingPoolData> {
  const leaderTeamIds = await getLeaderTeamIds(profileId);
  if (!leaderTeamIds.length) return { leads: [], marketers: [], sales: [] };

  const { data: marketingTeams, error: teamsError } = await supabase
    .from("teams")
    .select("id")
    .in("id", leaderTeamIds)
    .eq("department", "marketing");
  if (teamsError) throw teamsError;

  const marketingTeamIds = (marketingTeams ?? []).map((team) => team.id);
  if (!marketingTeamIds.length) return { leads: [], marketers: [], sales: [] };

  const { data: memberships, error: membershipsError } = await supabase
    .from("team_memberships")
    .select("team_id, user_id, role_in_team")
    .in("team_id", marketingTeamIds)
    .eq("is_active", true);
  if (membershipsError) throw membershipsError;

  const membershipUserIds = Array.from(
    new Set(
      (memberships ?? [])
        .filter((membership) =>
          ["leader", "employee", "member"].includes(String(membership.role_in_team)),
        )
        .map((membership) => membership.user_id),
    ),
  );
  if (!membershipUserIds.length) return { leads: [], marketers: [], sales: [] };

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", membershipUserIds)
    .in("role", [...MARKETING_ROLES]);
  if (rolesError) throw rolesError;

  const marketingUserIds = Array.from(new Set((roles ?? []).map((role) => role.user_id)));
  if (!marketingUserIds.length) return { leads: [], marketers: [], sales: [] };

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", marketingUserIds)
    .eq("status", "active")
    .order("full_name");
  if (profilesError) throw profilesError;

  const marketers = uniqueProfileOptions(
    (profiles ?? []).map((profile) => ({
      id: profile.id,
      name: displayProfileName(profile),
    })),
  );
  const marketerIds = marketers.map((marketer) => marketer.id);
  if (!marketerIds.length) return { leads: [], marketers, sales: [] };

  const { data, error } = await supabase
    .from("floating_leads")
    .select("*")
    .in("created_by", marketerIds)
    .gte("lead_date", from)
    .lte("lead_date", to)
    .order("lead_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const leads = (data ?? []) as FloatingLeadRow[];
  const sales = uniqueProfileOptions(
    leads
      .map((lead) => ({
        id: lead.assigned_sale_id || lead.closed_by || "",
        name: lead.assigned_sale_name || "Sale",
      }))
      .filter((item) => item.id),
  );

  return { leads, marketers, sales };
}

function LeaderLeadRow({
  lead,
  index,
  marketers,
  sales,
}: {
  lead: FloatingLeadRow;
  index: number;
  marketers: LeadProfileOption[];
  sales: LeadProfileOption[];
}) {
  const status = getFloatingLeadDisplayStatus(lead);
  const marketerName =
    lead.created_by_name || marketers.find((item) => item.id === lead.created_by)?.name;
  const saleName =
    lead.assigned_sale_name ||
    sales.find((item) => item.id === lead.assigned_sale_id || item.id === lead.closed_by)?.name;

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
      <td className="px-3 py-2.5 font-medium text-slate-700">{marketerName || "Marketing"}</td>
      <td className="px-3 py-2.5 text-slate-700">{saleName || "Chưa có"}</td>
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
  tone: "slate" | "amber" | "blue" | "green";
}) {
  const styles = {
    slate: "from-slate-900 to-slate-700 text-white",
    amber: "from-amber-50 to-orange-50 text-amber-800",
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

function displayProfileName(profile?: {
  full_name?: string | null;
  username?: string | null;
  name?: string | null;
}) {
  return profile?.full_name || profile?.name || profile?.username || "Chưa rõ";
}

function formatVietnameseDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
