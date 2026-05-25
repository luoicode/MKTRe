import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type InAppNotificationType =
  | "lead_assigned"
  | "lead_released"
  | "lead_closed"
  | "report_submitted"
  | "report_overdue"
  | "training_new"
  | "onboarding_unlocked"
  | "kpi_warning";

export type InAppNotificationInput = {
  userId: string;
  type: InAppNotificationType;
  title: string;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  eventKey?: string | null;
  metadata?: Json;
};

export async function createInAppNotification(input: InAppNotificationInput) {
  const { data, error } = await supabase.rpc("create_in_app_notification", {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title,
    p_description: input.description ?? null,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_event_key: input.eventKey ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data;
}

export function notificationEventKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== "")
    .map((part) => String(part).replace(/\s+/g, "-"))
    .join(":");
}
