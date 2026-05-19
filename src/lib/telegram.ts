import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { notificationTypeLabel } from "@/lib/notifications";

export type TelegramNotificationPayload = {
  recipient_profile_id: string;
  notification_id?: string | null;
  title: string;
  message?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupe_key?: string | null;
};

export function getTelegramTypeLabel(type: string | null | undefined) {
  return notificationTypeLabel({ type });
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

export async function sendTelegramForNotification(notification: {
  id: string;
  target_profile_id?: string | null;
  recipient_profile_id?: string | null;
  user_id?: string | null;
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
  return sendTelegramNotification({
    recipient_profile_id: recipientId,
    notification_id: notification.id,
    title: notification.title,
    message: notification.message ?? notification.body ?? null,
    type: notification.type ?? notification.kind ?? null,
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
    .select("id, target_profile_id, user_id, title, message, body, type, kind, metadata");

  if (!result.error && result.data?.length) {
    await Promise.allSettled(result.data.map((row) => sendTelegramForNotification(row)));
  }

  return result;
}
