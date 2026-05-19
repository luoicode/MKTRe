import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { id?: number | string; username?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number | string; username?: string };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
    };
  };
};

type CallbackAction = "approve_task" | "reject_task" | "approve_leave" | "reject_leave";

type CallbackPayload = {
  action: CallbackAction;
  entityType: "task" | "task_completion" | "leave_request";
  entityId: string;
};

function parseStartCode(text: string | undefined) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return null;

  const directMatch = trimmed.match(/^\/start(?:@\w+)?(?:\s+|_)([A-Za-z0-9_-]{4,64})$/i);
  if (directMatch?.[1]) return directMatch[1].trim().toUpperCase();

  if (!/^\/start(?:@\w+)?/i.test(trimmed)) return null;

  const payload = trimmed
    .replace(/^\/start(?:@\w+)?/i, "")
    .trim()
    .replace(/^_+/, "")
    .trim();

  const payloadMatch = payload.match(/^([A-Za-z0-9_-]{4,64})$/);
  return payloadMatch?.[1]?.toUpperCase() ?? null;
}

function maskCode(code: string | null) {
  if (!code) return null;
  if (code.length <= 4) return "****";
  return `${code.slice(0, 2)}***${code.slice(-2)}`;
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
    const errorText = await response.text();
    console.error("[telegram-webhook] sendMessage failed", {
      status: response.status,
      body: errorText.slice(0, 500),
    });
  }
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[telegram-webhook] telegram api failed", {
      method,
      status: response.status,
      body: errorText.slice(0, 500),
    });
  }
}

function parseCallbackData(data: string | undefined): CallbackPayload | null {
  if (!data) return null;
  const [action, entityType, entityId] = data.split(":");

  if (action === "approve_leave" || action === "reject_leave") {
    const leaveRequestId = entityType;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leaveRequestId ?? "")
    ) {
      return null;
    }
    return { action, entityType: "leave_request", entityId: leaveRequestId };
  }

  if (action !== "approve_task" && action !== "reject_task") return null;
  if (entityType !== "task" && entityType !== "task_completion") return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId ?? "")) {
    return null;
  }
  return { action, entityType, entityId };
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    leave_request_approved: "Đơn nghỉ đã được duyệt",
    leave_request_rejected: "Đơn nghỉ không được duyệt",
    task_approved: "Task đã duyệt",
    task_rejected: "Task cần làm lại",
  };
  return labels[type] ?? "Thông báo";
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

async function sendNotificationTelegram(
  service: ReturnType<typeof createClient>,
  notification: {
    id: string;
    target_profile_id?: string | null;
    user_id?: string | null;
    title: string;
    message?: string | null;
    body?: string | null;
    type?: string | null;
  },
) {
  const recipientId = notification.target_profile_id ?? notification.user_id;
  if (!recipientId) return;

  const duplicate = await service
    .from("telegram_notification_logs")
    .select("id")
    .eq("notification_id", notification.id)
    .eq("status", "sent")
    .limit(1);
  if (duplicate.data?.length) return;

  const { data: account, error: accountError } = await service
    .from("telegram_accounts")
    .select("telegram_chat_id")
    .eq("profile_id", recipientId)
    .eq("is_active", true)
    .maybeSingle();

  if (accountError) throw accountError;

  const log = async (
    status: "sent" | "failed" | "skipped",
    error: string | null,
    chatId?: string,
  ) =>
    service.from("telegram_notification_logs").insert({
      notification_id: notification.id,
      recipient_profile_id: recipientId,
      telegram_chat_id: chatId ?? null,
      status,
      error,
    });

  if (!account?.telegram_chat_id) {
    await log("skipped", "Telegram account not linked");
    return;
  }

  const text = [
    "🔔 MKTRe",
    "",
    notification.title,
    "",
    notification.message ?? notification.body ?? "",
    "",
    `Loại: ${typeLabel(notification.type ?? "")}`,
    `Thời gian: ${formatTime()}`,
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");

  try {
    await sendTelegramMessage(account.telegram_chat_id, text);
    await log("sent", null, account.telegram_chat_id);
  } catch (error) {
    await log(
      "failed",
      error instanceof Error ? error.message : "Unknown error",
      account.telegram_chat_id,
    );
  }
}

async function handleCallback(service: ReturnType<typeof createClient>, update: TelegramUpdate) {
  const callback = update.callback_query;
  const callbackId = callback?.id;
  const telegramUserId = callback?.from?.id?.toString() ?? null;
  const chatId = callback?.message?.chat?.id?.toString();
  const messageId = callback?.message?.message_id;
  const parsed = parseCallbackData(callback?.data);

  if (!callbackId || !telegramUserId || !parsed) {
    if (callbackId) {
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Thao tác không hợp lệ.",
        show_alert: true,
      });
    }
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const logCallback = async (
    status: "success" | "failed" | "denied" | "duplicate",
    profileId: string | null,
    error: string | null,
  ) =>
    service.from("telegram_callback_logs").insert({
      telegram_user_id: telegramUserId,
      profile_id: profileId,
      action: parsed.action,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      status,
      error,
    });

  const { data: account, error: accountError } = await service
    .from("telegram_accounts")
    .select("profile_id")
    .eq("telegram_user_id", telegramUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (accountError || !account?.profile_id) {
    await logCallback("denied", null, accountError?.message ?? "Telegram account not linked");
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "Bạn chưa liên kết Telegram với MKTRe.",
      show_alert: true,
    });
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const reviewerProfileId = account.profile_id;
  const isLeaveRequest = parsed.entityType === "leave_request";
  const approved = parsed.action === "approve_task" || parsed.action === "approve_leave";
  const { data: result, error: reviewError } = isLeaveRequest
    ? await service.rpc("telegram_review_leave_request", {
        _reviewer_profile_id: reviewerProfileId,
        _leave_request_id: parsed.entityId,
        _approved: approved,
      })
    : await service.rpc("telegram_review_task", {
        _reviewer_profile_id: reviewerProfileId,
        _entity_type: parsed.entityType,
        _entity_id: parsed.entityId,
        _approved: approved,
      });

  const status = String((result as { status?: string } | null)?.status ?? "failed");
  const message = String(
    (result as { message?: string } | null)?.message ??
      reviewError?.message ??
      "Không xử lý được thao tác.",
  );

  if (reviewError || status === "failed") {
    await logCallback("failed", reviewerProfileId, reviewError?.message ?? message);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: message,
      show_alert: true,
    });
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  if (status === "denied") {
    await logCallback("denied", reviewerProfileId, message);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "Bạn không có quyền duyệt mục này.",
      show_alert: true,
    });
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  if (status === "duplicate") {
    await logCallback("duplicate", reviewerProfileId, message);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: isLeaveRequest ? "Đơn này đã được xử lý trước đó." : "Mục này đã được xử lý trước đó.",
      show_alert: true,
    });
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  await logCallback("success", reviewerProfileId, null);

  const { data: reviewer } = await service
    .from("profiles")
    .select("full_name, username")
    .eq("id", reviewerProfileId)
    .maybeSingle();
  const reviewerName = reviewer?.full_name ?? reviewer?.username ?? "MKTRe";

  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: approved ? "Đã duyệt." : "Đã không duyệt.",
  });

  if (chatId && messageId) {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: approved ? `✅ Đã duyệt bởi ${reviewerName}` : `❌ Đã không duyệt bởi ${reviewerName}`,
    });
  }

  const resultType = isLeaveRequest
    ? approved
      ? "leave_request_approved"
      : "leave_request_rejected"
    : approved
      ? "task_approved"
      : "task_rejected";
  const { data: notifications } = await service
    .from("notifications")
    .select("id, target_profile_id, user_id, title, message, body, type")
    .eq("entity_type", parsed.entityType)
    .eq("entity_id", parsed.entityId)
    .eq("type", resultType)
    .order("created_at", { ascending: false })
    .limit(3);

  await Promise.allSettled(
    (notifications ?? []).map((row) => sendNotificationTelegram(service, row)),
  );

  return Response.json({ ok: true }, { headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Missing Supabase environment");

    const service = createClient(url, serviceKey);
    const update = (await req.json()) as TelegramUpdate;
    if (update.callback_query) {
      return await handleCallback(service, update);
    }

    const messageText = update.message?.text;
    const chatId = update.message?.chat?.id?.toString();
    const telegramUserId = update.message?.from?.id?.toString() ?? null;
    const telegramUsername = update.message?.from?.username ?? null;
    const code = parseStartCode(messageText);

    console.log("[telegram-webhook] update received", {
      hasMessage: Boolean(update.message),
      hasText: Boolean(messageText),
      hasChatId: Boolean(chatId),
      code: maskCode(code),
    });

    if (!chatId || !code) {
      if (chatId) {
        await sendTelegramMessage(
          chatId,
          "Mã liên kết không hợp lệ. Vui lòng mở MKTRe và tạo mã liên kết Telegram mới.",
        );
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    const { data: linkCode, error: codeError } = await service
      .from("telegram_link_codes")
      .select("id, profile_id, expires_at, used_at")
      .eq("code", code)
      .maybeSingle();

    console.log("[telegram-webhook] link code lookup", {
      code: maskCode(code),
      found: Boolean(linkCode),
      used: Boolean(linkCode?.used_at),
      expired: linkCode ? new Date(linkCode.expires_at).getTime() < Date.now() : null,
      error: codeError?.message ?? null,
    });

    if (
      codeError ||
      !linkCode ||
      linkCode.used_at ||
      new Date(linkCode.expires_at).getTime() < Date.now()
    ) {
      await sendTelegramMessage(chatId, "Mã liên kết không hợp lệ hoặc đã hết hạn.");
      return Response.json({ ok: true, linked: false }, { headers: corsHeaders });
    }

    const { error: deleteError } = await service
      .from("telegram_accounts")
      .delete()
      .or(`profile_id.eq.${linkCode.profile_id},telegram_chat_id.eq.${chatId}`);
    if (deleteError) throw deleteError;

    const linkedAt = new Date().toISOString();
    const { error: accountError } = await service.from("telegram_accounts").upsert(
      {
        profile_id: linkCode.profile_id,
        telegram_chat_id: chatId,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        is_active: true,
        linked_at: linkedAt,
      },
      { onConflict: "profile_id" },
    );
    if (accountError) throw accountError;

    const { error: markUsedError } = await service
      .from("telegram_link_codes")
      .update({ used_at: linkedAt })
      .eq("id", linkCode.id);
    if (markUsedError) throw markUsedError;

    console.log("[telegram-webhook] linked account", {
      profileId: linkCode.profile_id,
      chatId,
      telegramUserId,
      username: telegramUsername,
    });

    await sendTelegramMessage(chatId, "✅ Đã liên kết Telegram với tài khoản MKTRe.");
    return Response.json({ ok: true, linked: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
