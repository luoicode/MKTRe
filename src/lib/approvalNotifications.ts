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

export type ApprovalResolutionStatus = "pending" | "approved" | "rejected" | "completed";

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

export function getApprovalNotificationStatus(
  notification: ApprovalNotificationLike,
): ApprovalResolutionStatus {
  const metadata = metadataRecord(notification.metadata);
  const status = firstString(metadata, ["action_status", "approval_status", "resolution_status"]);
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "completed" || status === "done" || status === "resolved") return "completed";
  return "pending";
}

export function isApprovalNotificationProcessed(notification: ApprovalNotificationLike) {
  return getApprovalNotificationStatus(notification) !== "pending";
}

export function approvalNotificationStatusLabel(status: ApprovalResolutionStatus) {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Đã từ chối";
  if (status === "completed") return "Đã hoàn thành";
  return "Chờ duyệt";
}

export function approvalNotificationStatusClass(status: ApprovalResolutionStatus) {
  if (status === "approved" || status === "completed") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
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
        action_status: approved ? "approved" : "rejected",
        approval_status: approved ? "approved" : "rejected",
        approval_feedback: feedback,
        approved,
        resolved_at: now,
        resolved_by: reviewerProfileId,
        reviewed_by: reviewerProfileId,
        reviewed_at: now,
      } as Json,
    })
    .eq("id", notification.id);
  if (notificationError) throw notificationError;
}

export async function syncResolvedApprovalNotifications<T extends ApprovalNotificationLike>(
  notifications: T[],
  reviewerProfileId?: string | null,
): Promise<T[]> {
  const candidates = notifications.filter(
    (notification) =>
      isApprovalNotification(notification) &&
      !isApprovalNotificationProcessed(notification) &&
      notification.entity_type &&
      notification.entity_id,
  );
  if (!candidates.length) return notifications;

  const resolvedPairs = await Promise.all(
    candidates.map(async (notification) => {
      const status = await detectEntityResolutionStatus(notification);
      return status === "pending" ? null : ({ notification, status } as const);
    }),
  );
  const resolved = resolvedPairs.filter(Boolean) as Array<{
    notification: T;
    status: Exclude<ApprovalResolutionStatus, "pending">;
  }>;
  if (!resolved.length) return notifications;

  const now = new Date().toISOString();
  const updateResults = await Promise.all(
    resolved.map(({ notification, status }) => {
      const metadata = metadataRecord(notification.metadata);
      const reviewedAt = stringValue(metadata.reviewed_at) ?? now;
      const reviewedBy = stringValue(metadata.reviewed_by) ?? reviewerProfileId ?? null;
      const nextMetadata = {
        ...metadata,
        action_status: status,
        approval_status: status,
        approved: status === "approved" || status === "completed",
        resolved_at: now,
        resolved_by: reviewerProfileId ?? null,
        reviewed_at: reviewedAt,
        reviewed_by: reviewedBy,
      } as unknown as Json;
      return supabase
        .from("notifications")
        .update({
          is_read: true,
          metadata: nextMetadata,
        })
        .eq("id", notification.id);
    }),
  );

  const syncedResolved = resolved.filter((_, index) => !updateResults[index]?.error);
  const resolvedStatusById = new Map(
    syncedResolved.map((row) => [row.notification.id, row.status]),
  );
  return notifications.map((notification) => {
    const status = resolvedStatusById.get(notification.id);
    if (!status) return notification;
    const metadata = metadataRecord(notification.metadata);
    const reviewedAt = stringValue(metadata.reviewed_at) ?? now;
    const reviewedBy = stringValue(metadata.reviewed_by) ?? reviewerProfileId ?? null;
    return {
      ...notification,
      is_read: true,
      metadata: {
        ...metadata,
        action_status: status,
        approval_status: status,
        approved: status === "approved" || status === "completed",
        resolved_at: now,
        resolved_by: reviewerProfileId ?? null,
        reviewed_at: reviewedAt,
        reviewed_by: reviewedBy,
      } as unknown as Json,
    };
  });
}

async function detectEntityResolutionStatus(
  notification: ApprovalNotificationLike,
): Promise<ApprovalResolutionStatus> {
  const entityType = notification.entity_type;
  const entityId = notification.entity_id;
  if (!entityType || !entityId) return "pending";

  if (entityType === "task") {
    const { data } = await supabase.from("tasks").select("status").eq("id", entityId).maybeSingle();
    return statusToApprovalResolution(data?.status);
  }

  if (entityType === "task_completion") {
    const { data } = await supabase
      .from("task_completions")
      .select("status, completed")
      .eq("id", entityId)
      .maybeSingle();
    if (data?.completed) return "completed";
    return statusToApprovalResolution(data?.status);
  }

  if (entityType === "leave_request") {
    const { data } = await supabase
      .from("leave_requests")
      .select("status")
      .eq("id", entityId)
      .maybeSingle();
    return statusToApprovalResolution(data?.status);
  }

  if (entityType === "onboarding_answer") {
    const { data } = await supabase
      .from("onboarding_answers")
      .select("status")
      .eq("id", entityId)
      .maybeSingle();
    return statusToApprovalResolution(data?.status);
  }

  return "pending";
}

function statusToApprovalResolution(status: string | null | undefined): ApprovalResolutionStatus {
  if (!status) return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "done" || status === "completed") return "completed";
  return "pending";
}
