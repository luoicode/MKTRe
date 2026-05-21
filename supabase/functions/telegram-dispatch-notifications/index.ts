/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DispatchPayload = {
  notification_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  types?: string[] | null;
};

type NotificationRow = {
  id: string;
  target_profile_id: string | null;
  user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  message: string | null;
  body: string | null;
  type: string | null;
  kind: string | null;
  metadata: Record<string, unknown> | null;
};

type DispatchResult = {
  notification_id: string;
  recipient_profile_id: string | null;
  ok: boolean;
  status?: number;
  response?: unknown;
  error?: string;
};

const DEFAULT_TYPES = [
  "leave_request_created",
  "task_pending_review",
  "checklist_pending_review",
  "task_approved",
  "task_rejected",
];

function normalizeTypes(types: string[] | null | undefined) {
  const clean = (types ?? DEFAULT_TYPES).map((type) => String(type ?? "").trim()).filter(Boolean);
  return clean.length ? clean : DEFAULT_TYPES;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return Response.json(
      { ok: false, error: "Missing Supabase environment" },
      { status: 500, headers: corsHeaders },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const payload = (await req.json()) as DispatchPayload;
  const service = createClient(url, serviceKey);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authUser, error: authError } = await userClient.auth.getUser();
  if (authError || !authUser.user) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const types = normalizeTypes(payload.types);
  const fetchNotifications = async () => {
    let query = service
      .from("notifications")
      .select(
        "id, target_profile_id, user_id, entity_type, entity_id, title, message, body, type, kind, metadata",
      )
      .order("created_at", { ascending: false });

    if (payload.notification_id) {
      query = query.eq("id", payload.notification_id);
    } else {
      if (!payload.entity_type || !payload.entity_id) {
        throw new Error("entity_type and entity_id are required without notification_id");
      }
      query = query
        .eq("entity_type", payload.entity_type)
        .eq("entity_id", payload.entity_id)
        .in("type", types);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as NotificationRow[];
  };

  try {
    let notifications: NotificationRow[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      notifications = await fetchNotifications();
      if (notifications.length) break;
      await sleep(300);
    }

    console.log("[telegram-dispatch-notifications][lookup]", {
      notificationId: payload.notification_id ?? null,
      entityType: payload.entity_type ?? null,
      entityId: payload.entity_id ?? null,
      types,
      count: notifications.length,
    });

    const results: DispatchResult[] = await Promise.all(
      notifications.map(async (notification) => {
        const recipientProfileId = notification.target_profile_id ?? notification.user_id;
        if (!recipientProfileId) {
          return {
            notification_id: notification.id,
            recipient_profile_id: null,
            ok: false,
            error: "Missing recipient profile id",
          };
        }

        const response = await fetch(`${url}/functions/v1/telegram-send`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient_profile_id: recipientProfileId,
            notification_id: notification.id,
            entity_type: notification.entity_type,
            entity_id: notification.entity_id,
            title: notification.title,
            message: notification.message ?? notification.body ?? null,
            type: notification.type ?? notification.kind,
            metadata: notification.metadata,
            dedupe_key:
              typeof notification.metadata?.dedupe_key === "string"
                ? notification.metadata.dedupe_key
                : null,
          }),
        });
        const text = await response.text();
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        console.log("[telegram-dispatch-notifications][telegram-send]", {
          notificationId: notification.id,
          recipientProfileId,
          status: response.status,
          ok: response.ok,
          response: parsed,
        });
        return {
          notification_id: notification.id,
          recipient_profile_id: recipientProfileId,
          ok: response.ok,
          status: response.status,
          response: parsed,
        };
      }),
    );

    return Response.json(
      {
        ok: true,
        notification_count: notifications.length,
        dispatched_count: results.filter((result) => result.ok).length,
        results,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const name = error instanceof Error ? error.name : "UnknownError";
    const stack = error instanceof Error ? error.stack : null;
    console.error("[telegram-dispatch-notifications][error]", {
      name,
      message,
      stack,
      notificationId: payload.notification_id ?? null,
      entityType: payload.entity_type ?? null,
      entityId: payload.entity_id ?? null,
      types,
    });
    return Response.json(
      { ok: false, error: message, name },
      { status: 500, headers: corsHeaders },
    );
  }
});
