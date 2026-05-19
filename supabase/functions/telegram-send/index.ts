import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SendPayload = {
  recipient_profile_id: string;
  notification_id?: string | null;
  title: string;
  message?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupe_key?: string | null;
};

const typeLabels: Record<string, string> = {
  announcement: "Thông báo",
  attendance_reminder: "Nhắc điểm danh",
  daily_checklist_incomplete: "Checklist chưa hoàn thành",
  leave_request_approved: "Đơn nghỉ đã được duyệt",
  leave_request_created: "Có đơn xin nghỉ mới",
  leave_request_rejected: "Đơn nghỉ không được duyệt",
  onboarding_approved: "Onboarding đã được duyệt",
  onboarding_rejected: "Yêu cầu làm lại onboarding",
  onboarding_review: "Chờ duyệt onboarding",
  onboarding_review_pending: "Chờ duyệt onboarding",
  report_missing_summary: "Tổng hợp chưa báo cáo",
  report_reminder: "Nhắc báo cáo",
  report_slot_due: "Sắp đến giờ báo cáo",
  report_slot_overdue: "Quá giờ báo cáo",
  report_slot_summary: "Tổng hợp báo cáo",
  task_approved: "Task đã duyệt",
  task_assigned: "Nhiệm vụ mới",
  task_deadline_due: "Task sắp đến hạn",
  task_due_soon: "Task sắp đến hạn",
  task_overdue: "Task quá hạn",
  task_pending_review: "Task chờ duyệt",
  task_rejected: "Task cần làm lại",
  task_review: "Chờ duyệt task",
};

function typeLabel(type: string | null | undefined) {
  if (!type) return "Thông báo";
  return (
    typeLabels[type] ??
    type
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function sendTelegramMessage(chatId: string, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${response.status}: ${body}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return Response.json(
      { error: "Missing Supabase environment" },
      { status: 500, headers: corsHeaders },
    );
  }

  const payload = (await req.json()) as SendPayload;
  const service = createClient(url, serviceKey);

  const log = async (
    status: "sent" | "failed" | "skipped",
    error: string | null,
    chatId?: string,
  ) =>
    service.from("telegram_notification_logs").insert({
      notification_id: payload.notification_id ?? null,
      recipient_profile_id: payload.recipient_profile_id,
      telegram_chat_id: chatId ?? null,
      status,
      error,
      dedupe_key: payload.dedupe_key ?? null,
    });

  try {
    if (!payload.recipient_profile_id || !payload.title) {
      return Response.json({ error: "Invalid payload" }, { status: 400, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authUser, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { data: callerProfile } = await service
      .from("profiles")
      .select("id")
      .eq("auth_user_id", authUser.user.id)
      .maybeSingle();
    if (!callerProfile) {
      return Response.json({ error: "No profile" }, { status: 403, headers: corsHeaders });
    }

    if (payload.notification_id) {
      const { data: previousLog } = await service
        .from("telegram_notification_logs")
        .select("id")
        .eq("notification_id", payload.notification_id)
        .eq("status", "sent")
        .limit(1);
      if (previousLog?.length) {
        return Response.json(
          { ok: true, status: "skipped", reason: "duplicate" },
          { headers: corsHeaders },
        );
      }

      const { data: notification } = await service
        .from("notifications")
        .select("target_profile_id, user_id, actor_profile_id, created_by")
        .eq("id", payload.notification_id)
        .maybeSingle();
      const targetId = notification?.target_profile_id ?? notification?.user_id;
      const canSend =
        targetId === payload.recipient_profile_id &&
        [
          notification?.actor_profile_id,
          notification?.created_by,
          notification?.target_profile_id,
          notification?.user_id,
        ].includes(callerProfile.id);
      if (!canSend) {
        return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
      }
    } else if (payload.recipient_profile_id !== callerProfile.id) {
      const { data: roles } = await service
        .from("user_roles")
        .select("role")
        .eq("user_id", callerProfile.id);
      const canSendByRole = (roles ?? []).some((row) =>
        ["admin", "manager", "leader"].includes(String(row.role)),
      );
      const canSendOwnLeaveRequest =
        payload.type === "leave_request_created" &&
        payload.metadata?.requester_id === callerProfile.id;
      const canSendDirect = canSendByRole || canSendOwnLeaveRequest;
      if (!canSendDirect) {
        return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
      }
    }

    if (payload.dedupe_key) {
      const { data: previousDedupe } = await service
        .from("telegram_notification_logs")
        .select("id")
        .eq("dedupe_key", payload.dedupe_key)
        .eq("status", "sent")
        .limit(1);
      if (previousDedupe?.length) {
        return Response.json(
          { ok: true, status: "skipped", reason: "duplicate" },
          { headers: corsHeaders },
        );
      }
    }

    const { data: account, error: accountError } = await service
      .from("telegram_accounts")
      .select("telegram_chat_id")
      .eq("profile_id", payload.recipient_profile_id)
      .eq("is_active", true)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.telegram_chat_id) {
      await log("skipped", "Telegram account not linked");
      return Response.json({ ok: true, status: "skipped" }, { headers: corsHeaders });
    }

    const text = [
      "🔔 MKTRe",
      "",
      payload.title,
      "",
      payload.message ?? "",
      "",
      `Loại: ${typeLabel(payload.type)}`,
      `Thời gian: ${formatTime()}`,
    ]
      .filter((line, index, lines) => line || lines[index - 1] !== "")
      .join("\n");

    await sendTelegramMessage(account.telegram_chat_id, text);
    await log("sent", null, account.telegram_chat_id);
    return Response.json({ ok: true, status: "sent" }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[telegram-send]", message);
    await log("failed", message).catch((logError) =>
      console.error("[telegram-send log]", logError),
    );
    return Response.json({ ok: true, status: "failed", error: message }, { headers: corsHeaders });
  }
});
