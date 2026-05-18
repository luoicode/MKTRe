import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  Pencil,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type UserRow = Pick<Tables<"profiles">, "id" | "full_name" | "username" | "avatar_url">;
export type TaskDetailsTask = Tables<"tasks"> & {
  profiles: UserRow | null;
  assignedByProfile?: UserRow | null;
  teams: TeamRow | null;
};

type TaskStatus = Enums<"task_status">;
type BoardStatus = TaskStatus;

interface TaskDetailsModalProps {
  open: boolean;
  task: TaskDetailsTask | null;
  currentProfileId?: string;
  canManage: boolean;
  canReview: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: TaskDetailsTask) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onSubmitReview: (task: TaskDetailsTask) => void;
  onReview: (task: TaskDetailsTask) => void;
}

export function TaskDetailsModal({
  open,
  task,
  currentProfileId,
  canManage,
  canReview,
  onOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
  onSubmitReview,
  onReview,
}: TaskDetailsModalProps) {
  if (!task) return null;

  const status = normalizeTaskStatus(task.status);
  const deadlineState = getDeadlineBadgeState(task.deadline, status);
  const isAssignee = task.assigned_to === currentProfileId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden p-0 sm:rounded-3xl">
        <DialogHeader className="w-full min-w-0 shrink-0 border-b bg-background px-5 py-5 pr-12 sm:px-6">
          <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="whitespace-normal break-words text-xl leading-snug">
                {task.title}
              </DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Badge
                  className={cn(
                    "max-w-full whitespace-normal rounded-full border",
                    priorityPillClass(task.priority),
                  )}
                >
                  {priorityLabel(task.priority)}
                </Badge>
                <Badge
                  className={cn(
                    "max-w-full whitespace-normal rounded-full border",
                    statusPillClass(status),
                  )}
                >
                  {statusLabel(status)}
                </Badge>
                {deadlineState !== "none" && (
                  <Badge
                    className={cn(
                      "max-w-full whitespace-normal rounded-full border",
                      deadlinePillClass(deadlineState),
                    )}
                  >
                    {deadlineLabel(deadlineState)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 w-full flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="w-full min-w-0 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Mô tả</h3>
            <div className="min-h-24 w-full min-w-0 whitespace-pre-wrap break-words rounded-2xl border bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {task.description?.trim() || "Chưa có mô tả."}
            </div>
          </section>

          <section className="mt-5 grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <DetailItem
              icon={<CalendarDays className="h-4 w-4" />}
              label="Deadline"
              value={formatDateTime(task.deadline) || "Chưa có deadline"}
            />
            <DetailItem
              icon={<Clock className="h-4 w-4" />}
              label="Ngày tạo"
              value={formatDateTime(task.created_at) || "—"}
            />
            <DetailItem
              icon={<UsersRound className="h-4 w-4" />}
              label="Team"
              value={task.teams?.name ?? "Chưa gán team"}
            />
            {task.assignedByProfile && (
              <DetailItem
                icon={<UserRound className="h-4 w-4" />}
                label="Người giao"
                value={task.assignedByProfile.full_name}
              />
            )}
          </section>

          {(task.profiles || task.assignedByProfile) && (
            <section className="mt-5 grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
              {task.profiles && <PersonBlock label="Người phụ trách" user={task.profiles} />}
              {task.assignedByProfile && (
                <PersonBlock label="Người giao" user={task.assignedByProfile} />
              )}
            </section>
          )}

          {(task.completion_note || task.proof_url || task.review_feedback) && (
            <section className="mt-5 w-full min-w-0 space-y-3 rounded-2xl border bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Thông tin hoàn thành</h3>
              {task.completion_note && (
                <div className="min-w-0 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ghi chú
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-6">
                    {task.completion_note}
                  </p>
                </div>
              )}
              {task.review_feedback && (
                <div className="min-w-0 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="text-xs font-semibold uppercase tracking-wide">Feedback</p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-6">
                    {task.review_feedback}
                  </p>
                </div>
              )}
              {task.proof_url && (
                <a
                  href={task.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5"
                >
                  <FileText className="h-4 w-4" />
                  <span className="truncate">Mở chứng từ</span>
                </a>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t bg-background px-5 py-4 sm:px-6">
          {isAssignee && status === "todo" && (
            <Button variant="outline" onClick={() => onStatusChange(task.id, "in_progress")}>
              <Play className="mr-2 h-4 w-4" /> Đã làm
            </Button>
          )}
          {isAssignee && status === "in_progress" && (
            <Button onClick={() => onSubmitReview(task)}>
              <Send className="mr-2 h-4 w-4" /> Gửi duyệt
            </Button>
          )}
          {isAssignee && status === "pending_review" && (
            <Badge className="h-10 rounded-xl border-violet-200 bg-violet-50 px-3 text-violet-700">
              Chờ leader duyệt
            </Badge>
          )}
          {isAssignee && status === "done" && (
            <Badge className="h-10 rounded-xl border-emerald-200 bg-emerald-50 px-3 text-emerald-700">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Đã hoàn thành
            </Badge>
          )}
          {canReview && status === "pending_review" && (
            <Button onClick={() => onReview(task)}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Duyệt
            </Button>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={() => onEdit(task)}>
                <Pencil className="mr-2 h-4 w-4" /> Sửa
              </Button>
              <Button variant="destructive" onClick={() => onDelete(task.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Xóa
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-white p-4">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 whitespace-normal break-words">{label}</span>
      </div>
      <p className="mt-2 min-w-0 whitespace-normal break-words text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function PersonBlock({ label, user }: { label: string; user: UserRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-4">
      <UserAvatar user={user} />
      <div className="min-w-0">
        <p className="whitespace-normal break-words text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="whitespace-normal break-words text-sm font-semibold text-slate-900">
          {user.full_name}
        </p>
        {user.username && (
          <p className="whitespace-normal break-words text-xs text-slate-500">@{user.username}</p>
        )}
      </div>
    </div>
  );
}

function UserAvatar({ user }: { user: UserRow }) {
  const avatarUrl = user.avatar_url?.trim();
  return (
    <Avatar className="h-10 w-10 shrink-0 overflow-hidden rounded-full border">
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt={user.full_name} className="h-full w-full object-cover" />
      )}
      <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-600">
        {getInitials(user.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}

function normalizeTaskStatus(value: string | null | undefined): BoardStatus {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["in_progress", "doing", "da_lam", "dang_lam", "started"].includes(normalized)) {
    return "in_progress";
  }
  if (["pending_review", "review", "dang_duyet", "cho_duyet"].includes(normalized)) {
    return "pending_review";
  }
  if (["done", "completed", "complete", "hoan_thanh", "finished"].includes(normalized)) {
    return "done";
  }
  return "todo";
}

function statusLabel(status: BoardStatus) {
  if (status === "todo") return "Cần làm";
  if (status === "in_progress") return "Đã làm";
  if (status === "pending_review") return "Đang duyệt";
  return "Hoàn thành";
}

function statusPillClass(status: BoardStatus) {
  if (status === "todo") return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (status === "in_progress") return "border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-50";
  if (status === "pending_review") {
    return "border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-50";
  }
  return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
}

function priorityLabel(value: string | null | undefined) {
  if (value === "high") return "Ưu tiên cao";
  if (value === "low") return "Ưu tiên thấp";
  return "Ưu tiên vừa";
}

function priorityPillClass(value: string | null | undefined) {
  if (value === "high") return "border-red-100 bg-red-50 text-red-700 hover:bg-red-50";
  if (value === "low") return "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50";
  return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
}

function getDeadlineBadgeState(deadline: string | null, status: BoardStatus) {
  if (status === "done") return "completed" as const;
  if (!deadline) return "none" as const;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return "none" as const;
  return due.getTime() < Date.now() ? ("overdue" as const) : ("upcoming" as const);
}

function deadlineLabel(state: ReturnType<typeof getDeadlineBadgeState>) {
  if (state === "overdue") return "Quá hạn";
  if (state === "upcoming") return "Sắp tới";
  if (state === "completed") return "Hoàn thành";
  return "";
}

function deadlinePillClass(state: ReturnType<typeof getDeadlineBadgeState>) {
  if (state === "overdue") return "border-red-100 bg-red-50 text-red-700 hover:bg-red-50";
  if (state === "upcoming") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  if (state === "completed") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  return "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50";
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitials(name: string | null | undefined) {
  const words = (name ?? "NV").trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
