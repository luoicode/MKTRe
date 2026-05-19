import type { Json } from "@/integrations/supabase/types";

export type NotificationLike = {
  type?: string | null;
  kind?: string | null;
  severity?: string | null;
  metadata?: Json | null;
};

const notificationTypeLabelMap: Record<string, string> = {
  announcement: "Thông báo",
  attendance_reminder: "Nhắc điểm danh",
  checklist_new: "Checklist mới",
  checklist_pending: "Checklist cần làm",
  daily_checklist_incomplete: "Checklist chưa hoàn thành",
  kpi_personal_low: "KPI cá nhân",
  kpi_team_low: "KPI team",
  leave_request_approved: "Nghỉ phép đã duyệt",
  leave_request_created: "Đơn xin nghỉ mới",
  leave_request_rejected: "Nghỉ phép không duyệt",
  leave_approved: "Nghỉ phép đã duyệt",
  leave_rejected: "Nghỉ phép bị từ chối",
  leave_request: "Đơn xin nghỉ",
  onboarding_approved: "Onboarding đã được duyệt",
  onboarding_rejected: "Yêu cầu làm lại onboarding",
  onboarding_review: "Chờ duyệt onboarding",
  onboarding_review_pending: "Chờ duyệt onboarding",
  report_missing: "Chưa báo cáo",
  report_missing_summary: "Tổng hợp chưa báo cáo",
  report_reminder: "Nhắc báo cáo",
  report_slot_due: "Sắp đến giờ báo cáo",
  report_slot_overdue: "Quá giờ báo cáo",
  report_slot_summary: "Tổng hợp báo cáo",
  checklist_pending_review: "Checklist chờ duyệt",
  task_approved: "Task đã duyệt",
  task_assigned: "Nhiệm vụ mới",
  task_deadline_due: "Task sắp đến hạn",
  task_due_soon: "Task sắp đến hạn",
  task_overdue: "Task quá hạn",
  task_completion_pending_review: "Checklist chờ duyệt",
  task_pending_review: "Task chờ duyệt",
  task_rejected: "Task cần làm lại",
  task_review: "Chờ duyệt task",
};

export function notificationTypeKey(notification: NotificationLike) {
  return (notification.type ?? notification.kind ?? "notification").trim();
}

export function notificationTypeLabel(notification: NotificationLike) {
  const key = notificationTypeKey(notification);
  if (notificationTypeLabelMap[key]) return notificationTypeLabelMap[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function notificationTypeBadgeClass(notification: NotificationLike) {
  const key = notificationTypeKey(notification);
  if (key.includes("onboarding")) {
    return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50";
  }
  if (notification.severity === "error" || key.includes("overdue") || key.includes("rejected")) {
    return "border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  }
  if (
    notification.severity === "warning" ||
    key.includes("review") ||
    key.includes("pending") ||
    key.includes("due")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }
  if (notification.severity === "success" || key.includes("approved")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  if (key.includes("task")) {
    return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
}
