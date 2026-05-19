import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { notificationTypeLabel } from "@/lib/notifications";

export type TelegramNotificationPayload = {
  recipient_profile_id: string;
  notification_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  message?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupe_key?: string | null;
};

const ADMIN_MANAGER_TELEGRAM_TYPES = new Set([
  "leave_request_created",
  "task_pending_review",
  "checklist_pending_review",
]);

const PERSONAL_TELEGRAM_TYPES = new Set([
  "announcement",
  "leave_request_approved",
  "leave_request_rejected",
  "task_approved",
  "task_rejected",
  "checklist_approved",
  "checklist_rejected",
  "task_assigned",
]);

const LEADER_REVIEW_TELEGRAM_TYPES = new Set(["task_pending_review", "checklist_pending_review"]);

type TelegramRecipientRole = "admin" | "manager" | "leader" | "employee";

export function getTelegramTypeLabel(type: string | null | undefined) {
  return notificationTypeLabel({ type });
}

export function shouldSendTelegramNotification(
  role: string | null | undefined,
  notificationType: string | null | undefined,
  metadata?: Record<string, unknown> | null,
) {
  const normalizedRole = String(role ?? "").toLowerCase();
  const normalizedType = String(notificationType ?? "");
  if (!normalizedType) return false;
  const recipientMode = String(metadata?.recipient_mode ?? metadata?.audience_type ?? "");
  if (normalizedType === "announcement" && recipientMode === "all_users") return false;
  if (normalizedRole === "admin" || normalizedRole === "manager") {
    return ADMIN_MANAGER_TELEGRAM_TYPES.has(normalizedType);
  }
  if (normalizedRole === "leader" && LEADER_REVIEW_TELEGRAM_TYPES.has(normalizedType)) return true;
  return PERSONAL_TELEGRAM_TYPES.has(normalizedType);
}

function canonicalTelegramType(
  type: string | null | undefined,
  entityType: string | null | undefined,
) {
  if (type === "task_review") {
    return entityType === "task_completion" ? "checklist_pending_review" : "task_pending_review";
  }
  if (type === "task_completion_pending_review") return "checklist_pending_review";
  if (type === "task_approved" && entityType === "task_completion") return "checklist_approved";
  if (type === "task_rejected" && entityType === "task_completion") return "checklist_rejected";
  return type ?? null;
}

async function getRecipientRole(profileId: string): Promise<TelegramRecipientRole> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", profileId);
  const roles = new Set((data ?? []).map((row) => String(row.role)));
  if (roles.has("admin")) return "admin";
  if (roles.has("manager")) return "manager";
  if (roles.has("leader")) return "leader";
  return "employee";
}

export async function sendTelegramNotification(payload: TelegramNotificationPayload) {
  try {
    const { error } = await supabase.functions.invoke("telegram-send", {
      body: payload,
    });
    if (error) {
      console.debug("[MKTRe telegram]", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.debug("[MKTRe telegram]", error);
    return false;
  }
}

export async function sendGroupAnnouncement(payload: {
  title: string;
  message: string;
  actor_profile_id: string;
  batch_id: string;
  action_url?: string | null;
}) {
  try {
    const { error } = await supabase.functions.invoke("telegram-group-reminders", {
      body: {
        action: "announcement",
        title: payload.title,
        message: payload.message,
        actor_profile_id: payload.actor_profile_id,
        batch_id: payload.batch_id,
        action_url: payload.action_url ?? null,
      },
    });
    if (error) {
      console.debug("[MKTRe telegram group announcement]", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.debug("[MKTRe telegram group announcement]", error);
    return false;
  }
}

export async function sendTelegramForNotification(notification: {
  id: string;
  target_profile_id?: string | null;
  recipient_profile_id?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  kind?: string | null;
  metadata?: Json | null;
}) {
  const recipientId =
    notification.target_profile_id ?? notification.recipient_profile_id ?? notification.user_id;
  if (!recipientId) {
    console.debug("[MKTRe telegram] skipped notification without recipient", {
      notificationId: notification.id,
      type: notification.type ?? notification.kind ?? null,
    });
    return false;
  }
  const metadata =
    notification.metadata &&
    typeof notification.metadata === "object" &&
    !Array.isArray(notification.metadata)
      ? (notification.metadata as Record<string, unknown>)
      : null;
  const telegramType = canonicalTelegramType(
    notification.type ?? notification.kind ?? null,
    notification.entity_type ?? null,
  );
  const recipientRole = await getRecipientRole(recipientId);
  if (!shouldSendTelegramNotification(recipientRole, telegramType, metadata)) {
    console.debug("[MKTRe telegram] skipped by role scope", {
      notificationId: notification.id,
      recipientRole,
      type: telegramType,
    });
    return false;
  }

  return sendTelegramNotification({
    recipient_profile_id: recipientId,
    notification_id: notification.id,
    entity_type: notification.entity_type ?? null,
    entity_id: notification.entity_id ?? null,
    title: notification.title,
    message: notification.message ?? notification.body ?? null,
    type: telegramType,
    metadata,
    dedupe_key: typeof metadata?.dedupe_key === "string" ? metadata.dedupe_key : null,
  });
}

export async function insertNotificationsWithTelegram(
  payloads: TablesInsert<"notifications"> | TablesInsert<"notifications">[],
) {
  const rows = Array.isArray(payloads) ? payloads : [payloads];
  const result = await supabase
    .from("notifications")
    .insert(rows)
    .select(
      "id, target_profile_id, user_id, entity_type, entity_id, title, message, body, type, kind, metadata",
    );

  if (!result.error && result.data?.length) {
    await Promise.allSettled(result.data.map((row) => sendTelegramForNotification(row)));
  }

  return result;
}
