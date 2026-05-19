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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Missing Supabase environment");

    const update = (await req.json()) as TelegramUpdate;
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

    const supabase = createClient(url, serviceKey);
    const { data: linkCode, error: codeError } = await supabase
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

    const { error: deleteError } = await supabase
      .from("telegram_accounts")
      .delete()
      .or(`profile_id.eq.${linkCode.profile_id},telegram_chat_id.eq.${chatId}`);
    if (deleteError) throw deleteError;

    const linkedAt = new Date().toISOString();
    const { error: accountError } = await supabase.from("telegram_accounts").upsert(
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

    const { error: markUsedError } = await supabase
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
