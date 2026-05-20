import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ApprovalNotificationLike = {
  id: string;
  target_profile_id?: string | null;
  user_id?: string | null;
  title: string;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  kind?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Json | null;
};

export type ApprovalDetail = {
  label: string;
  value: string;
};

const APPROVAL_TYPES = new Set([
  "onboarding_pending_review",
  "onboarding_review",
  "onboarding_review_pending",
  "task_review",
  "task_pending_review",
  "task_completion_pending_review",
  "checklist_pending_review",
  "leave_request_created",
]);

function metadataRecord(metadata: Json | null | undefined): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(metadata[key]);
    if (value) return value;
  }
  return null;
}

function assertUpdatedRow(
  data: { id: string } | null,
  fallbackMessage = "Mục này đã được xử lý trước đó hoặc bạn không có quyền duyệt.",
) {
  if (!data?.id) throw new Error(fallbackMessage);
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  }).format(date);
}

function leaveTypeLabel(value: string | null) {
  if (value === "half_day") return "Nghỉ nửa ngày";
  if (value === "early_leave") return "Về sớm";
  if (value === "late_arrival") return "Đến muộn";
  return "Nghỉ cả ngày";
}

export function isApprovalNotification(notification: ApprovalNotificationLike) {
  const type = notification.type ?? notification.kind ?? "";
  return APPROVAL_TYPES.has(type);
}

export function isApprovalNotificationProcessed(notification: ApprovalNotificationLike) {
  const metadata = metadataRecord(notification.metadata);
  return Boolean(stringValue(metadata.approval_status));
}

export function approvalNotificationDetails(notification: ApprovalNotificationLike) {
  const metadata = metadataRecord(notification.metadata);
  const type = notification.type ?? notification.kind ?? "";
  const entityType = notification.entity_type ?? "";
  const details: ApprovalDetail[] = [];
  const push = (label: string, value: string | null | undefined) => {
    details.push({ label, value: value?.trim() || "Không có" });
  };

  if (type === "leave_request_created" || entityType === "leave_request") {
    push("Người gửi", firstString(metadata, ["requester_name", "submitter_name", "employee_name"]));
    push("Team", firstString(metadata, ["team_name"]));
    push("Loại đơn", leaveTypeLabel(firstString(metadata, ["leave_type"])));
    push("Từ ngày", formatDate(firstString(metadata, ["start_date"])));
    push("Đến ngày", formatDate(firstString(metadata, ["end_date"])));
    push("Lý do", firstString(metadata, ["reason", "note"]));
    push("Thời gian gửi", formatDate(firstString(metadata, ["submitted_at", "created_at"])));
    return details;
  }

  if (entityType === "onboarding_answer" || type.includes("onboarding")) {
    push("Người gửi", firstString(metadata, ["submitter_name", "requester_name", "employee_name"]));
    push("Team", firstString(metadata, ["team_name"]));
    push("Tên checklist onboarding", firstString(metadata, ["section_title", "title"]));
    push("Mô tả", firstString(metadata, ["description", "section_description"]));
    push("Deadline", formatDate(firstString(metadata, ["deadline", "due_at"])));
    push("Chứng từ/link", firstString(metadata, ["proof_url", "link_url"]));
    push("Ghi chú gửi duyệt", firstString(metadata, ["submit_note", "proof_note", "note"]));
    return details;
  }

  push("Người gửi", firstString(metadata, ["submitter_name", "assignee_name", "employee_name"]));
  push("Team", firstString(metadata, ["team_name"]));
  push("Tên task/checklist", firstString(metadata, ["task_title", "template_title", "title"]));
  push("Loại", firstString(metadata, ["item_type", "task_type", "checklist_type"]));
  push("Deadline", formatDate(firstString(metadata, ["deadline", "due_at", "completion_date"])));
  push("Mô tả/kế hoạch", firstString(metadata, ["description"]));
  push("Link công việc", firstString(metadata, ["link_url", "task_url"]));
  push("Chứng từ", firstString(metadata, ["proof_url"]));
  push("Ghi chú gửi duyệt", firstString(metadata, ["completion_note", "submit_note", "note"]));
  push("Feedback gần nhất", firstString(metadata, ["review_feedback", "feedback"]));
  return details;
}

export async function reviewApprovalNotification(params: {
  notification: ApprovalNotificationLike;
  reviewerProfileId: string;
  approved: boolean;
  feedback?: string | null;
}) {
  const { notification, reviewerProfileId, approved } = params;
  const feedback = params.feedback?.trim() || (approved ? null : "Không duyệt, cần làm lại.");
  const now = new Date().toISOString();
  const entityType = notification.entity_type;
  const entityId = notification.entity_id;

  if (!entityType || !entityId) throw new Error("Thông báo thiếu thông tin mục cần duyệt.");

  if (entityType === "task") {
    const { data, error } = await supabase
      .from("tasks")
      .update({
        status: approved ? "done" : "rejected",
        completed_at: approved ? now : null,
        reviewed_at: now,
        reviewed_by: reviewerProfileId,
        review_feedback: feedback,
      })
      .eq("id", entityId)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    assertUpdatedRow(data);
  } else if (entityType === "task_completion") {
    const { data, error } = await supabase
      .from("task_completions")
      .update({
        status: approved ? "done" : "rejected",
        completed: approved,
        completed_at: approved ? now : null,
        reviewed_at: now,
        reviewed_by: reviewerProfileId,
        review_feedback: feedback,
      })
      .eq("id", entityId)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    assertUpdatedRow(data);
  } else if (entityType === "leave_request") {
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: approved ? "approved" : "rejected",
        reviewed_at: now,
        reviewed_by: reviewerProfileId,
        review_note: feedback,
      })
      .eq("id", entityId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    assertUpdatedRow(data, "Đơn này đã được xử lý trước đó hoặc bạn không có quyền duyệt.");
  } else if (entityType === "onboarding_answer") {
    const { error } = await supabase.rpc("telegram_review_onboarding_answer", {
      _reviewer_profile_id: reviewerProfileId,
      _answer_id: entityId,
      _approved: approved,
      _feedback: feedback,
    });
    if (error) throw error;
  } else {
    throw new Error("Loại mục duyệt không hợp lệ.");
  }

  const metadata = metadataRecord(notification.metadata);
  const { error: notificationError } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      metadata: {
        ...metadata,
        approval_status: approved ? "approved" : "rejected",
        approval_feedback: feedback,
        approved,
        reviewed_by: reviewerProfileId,
        reviewed_at: now,
      } as Json,
    })
    .eq("id", notification.id);
  if (notificationError) throw notificationError;
}
