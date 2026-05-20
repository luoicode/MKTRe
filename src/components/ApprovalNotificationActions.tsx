import { useState, type MouseEvent } from "react";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  approvalNotificationDetails,
  isApprovalNotificationProcessed,
  reviewApprovalNotification,
  type ApprovalNotificationLike,
} from "@/lib/approvalNotifications";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function ApprovalNotificationActions({
  notification,
  compact = false,
  onDone,
}: {
  notification: ApprovalNotificationLike;
  compact?: boolean;
  onDone?: () => void | Promise<void>;
}) {
  const { profile } = useAuth();
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const processed = isApprovalNotificationProcessed(notification);
  const details = approvalNotificationDetails(notification);

  const stop = (event: MouseEvent) => event.stopPropagation();

  const runReview = async (approved: boolean, note?: string | null) => {
    if (!profile?.id || busy || processed) return;
    if (!approved && !note?.trim()) {
      toast.error("Nhập lý do không duyệt");
      return;
    }
    setBusy(true);
    try {
      await reviewApprovalNotification({
        notification,
        reviewerProfileId: profile.id,
        approved,
        feedback: note,
      });
      toast.success(approved ? "Đã duyệt" : "Đã không duyệt");
      setRejectOpen(false);
      setFeedback("");
      await onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bạn không có quyền duyệt mục này");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" onClick={stop}>
      {processed ? (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          Đã xử lý
        </span>
      ) : (
        <>
          <Button
            size={compact ? "sm" : "default"}
            className="h-8 rounded-full bg-emerald-600 px-3 text-xs hover:bg-emerald-700"
            disabled={busy}
            onClick={() => void runReview(true)}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Duyệt
          </Button>
          <Button
            size={compact ? "sm" : "default"}
            variant="outline"
            className="h-8 rounded-full border-red-200 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Không duyệt
          </Button>
        </>
      )}
      <Button
        size={compact ? "sm" : "default"}
        variant="ghost"
        className="h-8 rounded-full px-3 text-xs"
        onClick={() => setDetailOpen(true)}
      >
        <Eye className="mr-1.5 h-3.5 w-3.5" />
        Xem chi tiết
      </Button>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{notification.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {(notification.message ?? notification.body) && (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                {notification.message ?? notification.body}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label} className="min-w-0 rounded-2xl border bg-white p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">{detail.label}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                    {detail.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lý do không duyệt</DialogTitle>
          </DialogHeader>
          <Textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Nhập feedback/lý do để nhân sự làm lại"
            className="min-h-28"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={busy}
              onClick={() => void runReview(false, feedback)}
            >
              Không duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
