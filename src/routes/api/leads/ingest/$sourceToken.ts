import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SupabaseAny = typeof supabaseAdmin & {
  from: (table: string) => SupabaseQueryBuilder;
};

interface SupabaseQueryBuilder<TData = unknown> extends PromiseLike<{
  data: TData;
  error: unknown;
}> {
  select: (columns?: string) => SupabaseQueryBuilder<TData>;
  insert: (values: unknown) => SupabaseQueryBuilder<TData>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<TData>;
  gte: (column: string, value: unknown) => SupabaseQueryBuilder<TData>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<TData>;
  limit: (count: number) => SupabaseQueryBuilder<TData>;
  single: () => SupabaseQueryBuilder<TData>;
  maybeSingle: () => SupabaseQueryBuilder<TData>;
}

interface LeadSourceRow {
  id: string;
  source_token: string;
  name: string;
  channel: string;
  team_id: string | null;
  owner_user_id: string;
  is_active: boolean;
}

interface LeadIngestPayload {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  landing_url?: unknown;
  campaign_name?: unknown;
  adset_name?: unknown;
  ad_name?: unknown;
}

interface DuplicateCandidateRow {
  id: string;
  status: string | null;
  created_at: string;
}

const db = supabaseAdmin as SupabaseAny;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/leads/ingest/$sourceToken")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () =>
        jsonError(405, "METHOD_NOT_ALLOWED", "Endpoint này chỉ nhận phương thức POST."),
      POST: async ({ request, params }) => {
        const sourceToken = params.sourceToken?.trim();
        if (!sourceToken) {
          return jsonError(400, "MISSING_SOURCE_TOKEN", "Thiếu mã nguồn Marketing.");
        }

        const bodyResult = await readJsonBody(request);
        if (!bodyResult.ok) {
          return jsonError(400, "INVALID_JSON", "Body phải là JSON hợp lệ.");
        }

        const payload = bodyResult.body;
        const phone = toCleanString(payload.phone);
        if (!phone) {
          return jsonError(400, "MISSING_PHONE", "Thiếu số điện thoại khách hàng.");
        }

        const normalizedPhone = normalizeVietnamesePhone(phone);
        if (!isValidVietnamesePhone(normalizedPhone)) {
          return jsonError(400, "INVALID_PHONE", "Số điện thoại không hợp lệ.");
        }

        const { data: source, error: sourceError } = await db
          .from("lead_sources")
          .select("id, source_token, name, product, channel, team_id, owner_user_id, is_active")
          .eq("source_token", sourceToken)
          .maybeSingle();

        if (sourceError) {
          console.error("[lead-ingest][source_lookup]", sourceError);
          return jsonError(500, "SOURCE_LOOKUP_FAILED", "Không thể kiểm tra nguồn Marketing.");
        }

        if (!source) {
          return jsonError(404, "SOURCE_NOT_FOUND", "Nguồn Marketing không tồn tại.");
        }

        const leadSource = source as LeadSourceRow;

        if (!leadSource.is_active) {
          return jsonError(403, "SOURCE_DISABLED", "Nguồn Marketing đang tắt.");
        }

        const duplicate = await detectDuplicate({ normalizedPhone });

        if (!duplicate.ok) {
          return jsonError(500, "DUPLICATE_CHECK_FAILED", "Không thể kiểm tra trùng lead.");
        }

        const isDuplicate = Boolean(duplicate.contactId);
        const duplicateCheckedAt = new Date().toISOString();
        const { data: insertedContact, error: insertError } = await db
          .from("marketing_contacts")
          .insert({
            lead_source_id: leadSource.id,
            source_token: leadSource.source_token,
            owner_user_id: leadSource.owner_user_id,
            team_id: leadSource.team_id,
            customer_name: toCleanString(payload.name) || null,
            phone,
            normalized_phone: normalizedPhone,
            email: toCleanString(payload.email) || null,
            message: toCleanString(payload.message) || null,
            landing_url: toCleanString(payload.landing_url) || null,
            campaign_name: toCleanString(payload.campaign_name) || null,
            adset_name: toCleanString(payload.adset_name) || null,
            ad_name: toCleanString(payload.ad_name) || null,
            source_name: leadSource.name,
            source_channel: leadSource.channel,
            sales_owner_name: isDuplicate ? null : "Chưa phân phối",
            sales_team_name: isDuplicate ? null : "Chưa phân phối",
            status: isDuplicate ? "duplicate" : "new",
            is_duplicate: isDuplicate,
            duplicate_scope: isDuplicate ? "system_7_days_unclosed" : null,
            duplicate_of_contact_id: duplicate.contactId,
            duplicate_checked_at: duplicateCheckedAt,
            eligible_for_sale_distribution: !isDuplicate,
            raw_payload: payload,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("[lead-ingest][insert_contact]", insertError);
          return jsonError(500, "CONTACT_INSERT_FAILED", "Không thể lưu liên hệ khách hàng.");
        }

        const savedContact = insertedContact as { id: string };

        return jsonResponse(
          {
            success: true,
            contact_id: savedContact.id,
            duplicate: isDuplicate,
          },
          201,
        );
      },
    },
  },
});

async function detectDuplicate({
  normalizedPhone,
}: {
  normalizedPhone: string;
}): Promise<{ ok: true; contactId: string | null } | { ok: false }> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentError } = await db
    .from("marketing_contacts")
    .select("id, status, created_at")
    .eq("normalized_phone", normalizedPhone)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recentError) {
    console.error("[lead-ingest][duplicate_recent]", recentError);
    return { ok: false };
  }

  const candidates = (recentRows ?? []) as DuplicateCandidateRow[];
  const duplicateContact = candidates.find((contact) => !isClosedContactStatus(contact.status));

  return {
    ok: true,
    contactId: duplicateContact?.id ?? null,
  };
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: LeadIngestPayload } | { ok: false }> {
  try {
    return { ok: true, body: (await request.json()) as LeadIngestPayload };
  } catch {
    return { ok: false };
  }
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVietnamesePhone(rawPhone: string) {
  const hasPlus84 = rawPhone.trim().startsWith("+84");
  let digits = rawPhone.replace(/\D/g, "");

  if (hasPlus84 && digits.startsWith("84")) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith("84") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  } else if (!digits.startsWith("0") && digits.length === 9) {
    digits = `0${digits}`;
  }

  return digits;
}

function isValidVietnamesePhone(phone: string) {
  return /^0\d{8,10}$/.test(phone);
}

function isClosedContactStatus(status: string | null) {
  const normalizedStatus = (status ?? "").trim().toLowerCase();
  return [
    "success",
    "closed",
    "won",
    "converted",
    "chot",
    "chốt",
    "da_chot",
    "đã chốt",
    "thanh_cong",
    "thành công",
  ].includes(normalizedStatus);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

function jsonError(status: number, error: string, message: string) {
  return jsonResponse({ success: false, error, message }, status);
}
