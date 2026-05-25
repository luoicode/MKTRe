import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, Lock, Pencil, PhoneCall, Plus, Save, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { DateRangeFilter } from "@/components/DateRangeFilter";
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
import { useAuth } from "@/lib/auth";
import { initialDateRange, type DateRangeValue } from "@/lib/dateRange";
import {
  createMarketingFloatingLeads,
  fetchMarketingFloatingLeads,
  getFloatingLeadDisplayStatus,
  todayYmd,
  updateMarketingFloatingLeadSource,
  validateLeadPhones,
  type FloatingLeadDisplayStatus,
  type FloatingLeadRow,
} from "@/lib/floatingLeads";
import { cn } from "@/lib/utils";

export function MarketingFloatingPoolWorkspace() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(() => initialDateRange("today"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneInputs, setPhoneInputs] = useState<string[]>(() =>
    Array.from({ length: 5 }, () => ""),
  );
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});

  const leadsQuery = useQuery({
    queryKey: ["marketing-floating-leads", range.from, range.to],
    queryFn: () => fetchMarketingFloatingLeads(range.from, range.to),
  });
  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const stats = useMemo(
    () => ({
      total: leads.length,
      assigned: leads.filter((lead) => !!lead.assigned_sale_id).length,
      closed: leads.filter((lead) => lead.is_closed).length,
    }),
    [leads],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng.");
      const { phones, error } = validateLeadPhones(phoneInputs.join("\n"));
      if (error) throw new Error(error);
      return createMarketingFloatingLeads({
        phones,
        profileId: profile.id,
        profileName: profile.full_name || profile.username || "Marketing",
        leadDate: todayYmd(),
      });
    },
    onSuccess: async (rows) => {
      await queryClient.invalidateQueries({
        queryKey: ["marketing-floating-leads", range.from, range.to],
      });
      setPhoneInputs(Array.from({ length: 5 }, () => ""));
      setDialogOpen(false);
      toast.success(`Đã thêm ${rows.length} số vào kho thả nổi`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể thêm số");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ leadId, phone }: { leadId: string; phone: string }) =>
      updateMarketingFloatingLeadSource({ leadId, phone }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["marketing-floating-leads", range.from, range.to],
      });
      setEditingLeadId(null);
      toast.success("Đã cập nhật số điện thoại");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật lead");
    },
  });

  const startEditingLead = (lead: FloatingLeadRow) => {
    if (lead.assigned_sale_id) return;
    setPhoneDrafts((current) => ({ ...current, [lead.id]: lead.phone }));
    setEditingLeadId(lead.id);
  };

  const saveLeadPhone = (lead: FloatingLeadRow) => {
    const phone = phoneDrafts[lead.id] ?? lead.phone;
    updateMutation.mutate({ leadId: lead.id, phone });
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
        title="Kho thả nổi"
        subtitle="Đẩy data cho Sale xử lý và theo dõi tình trạng chăm sóc"
        rightContent={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <RefreshButton
              isRefreshing={leadsQuery.isFetching}
              onRefresh={async () => {
                await leadsQuery.refetch();
              }}
            />
            <div className="grid min-w-0 grid-cols-3 gap-2">
              <MarketingLeadStat label="Tổng số" value={stats.total} tone="slate" />
              <MarketingLeadStat label="Sale đã nhận" value={stats.assigned} tone="blue" />
              <MarketingLeadStat label="Đã chốt" value={stats.closed} tone="green" />
            </div>
          </div>
        }
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} hideLabel />
            <Button className="gap-2" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm số
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {leadsQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-white">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="w-14 px-4 py-3 text-center">STT</th>
                      <th className="w-28 px-3 py-3">Ngày</th>
                      <th className="w-40 px-3 py-3">Số điện thoại</th>
                      <th className="w-40 px-3 py-3">Sale nhận</th>
                      <th className="px-3 py-3">Cuộc gọi lần 1</th>
                      <th className="px-3 py-3">Cuộc gọi lần 2</th>
                      <th className="px-3 py-3">Cuộc gọi lần 3</th>
                      <th className="w-40 px-3 py-3">Tình trạng</th>
                      <th className="w-32 px-3 py-3">Cập nhật</th>
                      <th className="w-16 px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, index) => (
                      <MarketingLeadRow
                        key={lead.id}
                        index={index}
                        lead={lead}
                        isEditing={editingLeadId === lead.id}
                        phoneDraft={phoneDrafts[lead.id] ?? lead.phone}
                        isSaving={updateMutation.isPending}
                        onCopyPhone={copyPhone}
                        onEdit={() => startEditingLead(lead)}
                        onSave={() => saveLeadPhone(lead)}
                        onPhoneDraftChange={(phone) =>
                          setPhoneDrafts((current) => ({ ...current, [lead.id]: phone }))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 lg:hidden">
                {leads.map((lead, index) => (
                  <MarketingLeadMobileCard
                    key={lead.id}
                    index={index}
                    lead={lead}
                    isEditing={editingLeadId === lead.id}
                    phoneDraft={phoneDrafts[lead.id] ?? lead.phone}
                    isSaving={updateMutation.isPending}
                    onCopyPhone={copyPhone}
                    onEdit={() => startEditingLead(lead)}
                    onSave={() => saveLeadPhone(lead)}
                    onPhoneDraftChange={(phone) =>
                      setPhoneDrafts((current) => ({ ...current, [lead.id]: phone }))
                    }
                  />
                ))}
              </div>

              {!leads.length ? (
                <div className="p-6">
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center">
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                    <p className="mt-3 font-bold text-slate-900">Chưa có số trong khoảng này</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Bấm Thêm số để đẩy data cho đội Sale xử lý.
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm số vào kho thả nổi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              {phoneInputs.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <Input
                    value={value}
                    inputMode="tel"
                    placeholder={`Số điện thoại ${index + 1}`}
                    onChange={(event) =>
                      setPhoneInputs((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Nhập tối đa 5 số mỗi lần. Ô trống sẽ được bỏ qua, số trùng trong cùng lần nhập sẽ tự
              bỏ qua.
            </p>
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

function MarketingLeadRow({
  index,
  lead,
  isEditing,
  phoneDraft,
  isSaving,
  onCopyPhone,
  onEdit,
  onSave,
  onPhoneDraftChange,
}: {
  index: number;
  lead: FloatingLeadRow;
  isEditing: boolean;
  phoneDraft: string;
  isSaving: boolean;
  onCopyPhone: (phone: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onPhoneDraftChange: (phone: string) => void;
}) {
  const isAssigned = !!lead.assigned_sale_id;
  const displayStatus = getFloatingLeadDisplayStatus(lead);
  return (
    <tr
      className={cn(
        "border-b transition-colors last:border-b-0 hover:bg-slate-50/80",
        isAssigned && "bg-slate-50 text-slate-500",
        isEditing && "bg-blue-50/40 ring-1 ring-inset ring-blue-100",
      )}
    >
      <td className="px-4 py-3 text-center font-semibold text-slate-500">{index + 1}</td>
      <td className="whitespace-nowrap px-3 py-3 text-slate-500">
        {formatVietnameseDate(lead.lead_date)}
      </td>
      <td className="px-3 py-3">
        {isEditing ? (
          <Input
            value={phoneDraft}
            inputMode="tel"
            className="h-9 min-w-36"
            onChange={(event) => onPhoneDraftChange(event.target.value)}
          />
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-900 transition hover:bg-slate-200"
            onClick={() => onCopyPhone(lead.phone)}
          >
            <PhoneCall className="h-3.5 w-3.5 text-primary" />
            {lead.phone}
          </button>
        )}
      </td>
      <td className="px-3 py-3 font-semibold text-slate-700">
        {lead.assigned_sale_name || "Chưa có"}
      </td>
      <td className="px-3 py-3 text-slate-600">{lead.call_1 || "—"}</td>
      <td className="px-3 py-3 text-slate-600">{lead.call_2 || "—"}</td>
      <td className="px-3 py-3 text-slate-600">{lead.call_3 || "—"}</td>
      <td className="px-3 py-3">
        <MarketingLeadStatusBadge status={displayStatus} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
        {formatLeadUpdatedAt(lead.updated_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <MarketingLeadActionButton
          isAssigned={isAssigned}
          isEditing={isEditing}
          isSaving={isSaving}
          onEdit={onEdit}
          onSave={onSave}
        />
      </td>
    </tr>
  );
}

function MarketingLeadMobileCard({
  index,
  lead,
  isEditing,
  phoneDraft,
  isSaving,
  onCopyPhone,
  onEdit,
  onSave,
  onPhoneDraftChange,
}: {
  index: number;
  lead: FloatingLeadRow;
  isEditing: boolean;
  phoneDraft: string;
  isSaving: boolean;
  onCopyPhone: (phone: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onPhoneDraftChange: (phone: string) => void;
}) {
  const isAssigned = !!lead.assigned_sale_id;
  const displayStatus = getFloatingLeadDisplayStatus(lead);
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm",
        isAssigned && "bg-slate-50 text-slate-500",
        isEditing && "border-blue-200 bg-blue-50/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground">
            #{index + 1} · {formatVietnameseDate(lead.lead_date)}
          </p>
          {isEditing ? (
            <Input
              value={phoneDraft}
              inputMode="tel"
              className="mt-2 h-9"
              onChange={(event) => onPhoneDraftChange(event.target.value)}
            />
          ) : (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-2 text-base font-black text-slate-950"
              onClick={() => onCopyPhone(lead.phone)}
            >
              <PhoneCall className="h-4 w-4 text-primary" />
              {lead.phone}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MarketingLeadStatusBadge status={displayStatus} />
          <MarketingLeadActionButton
            isAssigned={isAssigned}
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={onEdit}
            onSave={onSave}
          />
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-900">Sale nhận:</span>{" "}
          {lead.assigned_sale_name || "Chưa có"}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Lần 1:</span> {lead.call_1 || "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Lần 2:</span> {lead.call_2 || "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Lần 3:</span> {lead.call_3 || "—"}
        </p>
      </div>
    </div>
  );
}

function MarketingLeadStatusBadge({ status }: { status: FloatingLeadDisplayStatus }) {
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

function MarketingLeadActionButton({
  isAssigned,
  isEditing,
  isSaving,
  onEdit,
  onSave,
}: {
  isAssigned: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
}) {
  if (isAssigned) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        className="h-9 w-9 rounded-xl p-0"
        title="Lead đã có Sale nhận"
        aria-label="Lead đã có Sale nhận"
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
        disabled={isSaving}
        title="Lưu số"
        aria-label="Lưu số"
        onClick={onSave}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 w-9 rounded-xl p-0"
      title="Sửa số"
      aria-label="Sửa số"
      onClick={onEdit}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}

function MarketingLeadStat({
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

function formatVietnameseDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatLeadUpdatedAt(value: string) {
  if (!value) return "";
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000));
  if (diffSeconds < 60) return "Vừa cập nhật";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} phút trước`;
  return updatedAt.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
