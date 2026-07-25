import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, PhoneCall, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  fetchFloatingLeadActivities,
  updateFloatingLeadCrm,
  type FloatingLeadCrmRow,
} from "@/lib/floatingLeadCrm";

const statuses = [
  "Chưa gọi",
  "Không nghe máy",
  "Hẹn gọi lại",
  "Đang cân nhắc",
  "Đã bị chốt",
  "Không mua",
  "Khách trêu",
];

export function FloatingLeadDetailDialog({
  lead,
  open,
  editable,
  onOpenChange,
  onUpdated,
}: {
  lead: FloatingLeadCrmRow | null;
  open: boolean;
  editable: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("Chưa gọi");
  const [callResult, setCallResult] = useState("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  useEffect(() => {
    if (!lead) return;
    setStatus(lead.status || "Chưa gọi");
    setCallResult("");
    setNote(lead.note ?? "");
    setFollowUpAt(lead.follow_up_at?.slice(0, 16) ?? "");
  }, [lead]);

  const activitiesQuery = useQuery({
    queryKey: ["floating-lead-activities", lead?.id],
    queryFn: () => fetchFloatingLeadActivities(lead!.id),
    enabled: open && !!lead?.id,
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!lead) throw new Error("Không tìm thấy lead.");
      return updateFloatingLeadCrm({
        leadId: lead.id,
        status,
        callResult,
        note,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
        clearFollowUp: !followUpAt && !!lead.follow_up_at,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["floating-lead-activities", lead?.id] });
      setCallResult("");
      onUpdated?.();
      toast.success("Đã cập nhật lead");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Không thể cập nhật"),
  });

  if (!lead) return null;
  const info = [
    ["Khách hàng", lead.customer_name || "—"],
    ["Số điện thoại", lead.phone],
    ["Địa chỉ", lead.address || "—"],
    ["Loại cây trồng", lead.loai_cay_trong || "—"],
    ["Diện tích", lead.dien_tich || "—"],
    ["Tình trạng cây", lead.tinh_trang_cay_trong || "—"],
    ["Giai đoạn cây", lead.giai_doan_cay_trong || "—"],
    ["Nguồn", lead.source_type || lead.source || "—"],
    ["Ngày nhập", formatDateTime(lead.imported_at || lead.created_at)],
    ["Marketing", lead.created_by_name || "—"],
    ["Sale phụ trách", lead.assigned_sale_name || "Chưa phân công"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(94vw,1080px)] max-w-none flex-col overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserRound className="h-5 w-5 text-blue-600" />
            {lead.customer_name || lead.phone}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-slate-50/70 p-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-700">
              Thông tin lead
            </h3>
            <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {info.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid min-h-0 gap-4">
            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700">
                Lịch sử xử lý
              </h3>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {activitiesQuery.isLoading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                ) : activitiesQuery.data?.length ? (
                  activitiesQuery.data.map((activity) => (
                    <div
                      key={activity.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">
                          {activity.created_by_name || "Hệ thống"}
                        </p>
                        <span className="whitespace-nowrap text-[11px] text-slate-500">
                          {formatDateTime(activity.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        {activity.note || activity.new_value || activity.activity_type}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">Chưa có lịch sử xử lý.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
                <PhoneCall className="h-4 w-4 text-blue-600" /> Cập nhật nhanh
              </h3>
              {editable ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label>Trạng thái</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Kết quả cuộc gọi</Label>
                    <Input
                      value={callResult}
                      onChange={(event) => setCallResult(event.target.value)}
                      placeholder="Ví dụ: Khách hẹn gọi lại"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Ngày hẹn gọi lại</Label>
                    <Input
                      type="datetime-local"
                      value={followUpAt}
                      onChange={(event) => setFollowUpAt(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Ghi chú</Label>
                    <Textarea
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Ghi chú chăm sóc khách hàng"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 text-sm">
                  <p>
                    <span className="font-semibold text-slate-500">Trạng thái:</span> {lead.status}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500">Lần gọi gần nhất:</span>{" "}
                    {lead.latest_call_result || "—"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500">Ghi chú:</span>{" "}
                    {lead.note || "—"}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock3 className="h-4 w-4" />{" "}
                    {lead.follow_up_at ? formatDateTime(lead.follow_up_at) : "Chưa có lịch hẹn"}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>

        <DialogFooter className="border-t bg-white px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {editable ? (
            <Button
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Lưu cập nhật
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
