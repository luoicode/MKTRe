import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type FloatingLeadRow = Tables<"floating_leads">;

export type FloatingLeadStatus =
  | "Chưa gọi"
  | "Không nghe máy"
  | "Hẹn gọi lại"
  | "Đang cân nhắc"
  | "Đã bị chốt"
  | "Không mua"
  | "Khách trêu";

export type FloatingLeadCareDraft = Pick<
  FloatingLeadRow,
  "call_1" | "call_2" | "call_3" | "note"
> & { is_closed: boolean };

export type FloatingLeadCallField = "call_1" | "call_2" | "call_3";

export type FloatingLeadDisplayStatus =
  | "Đã bị chốt"
  | "Đã gọi 3"
  | "Đã gọi 2"
  | "Đã gọi 1"
  | "Chưa gọi";

export const floatingLeadStatuses: FloatingLeadStatus[] = [
  "Chưa gọi",
  "Không nghe máy",
  "Hẹn gọi lại",
  "Đang cân nhắc",
  "Đã bị chốt",
  "Không mua",
  "Khách trêu",
];

export function isFloatingLeadStatus(value: string): value is FloatingLeadStatus {
  return floatingLeadStatuses.includes(value as FloatingLeadStatus);
}

export function getFloatingLeadCallSlot(lead: Pick<FloatingLeadRow, "claim_count">) {
  return Math.min(Math.max((lead.claim_count ?? 0) + 1, 1), 3);
}

export function getFloatingLeadCallField(lead: Pick<FloatingLeadRow, "claim_count">) {
  const slot = getFloatingLeadCallSlot(lead);
  return `call_${slot}` as FloatingLeadCallField;
}

export function getFloatingLeadDisplayStatus(
  lead: Pick<FloatingLeadRow, "is_closed" | "call_1" | "call_2" | "call_3">,
): FloatingLeadDisplayStatus {
  if (lead.is_closed) return "Đã bị chốt";
  if (lead.call_3?.trim()) return "Đã gọi 3";
  if (lead.call_2?.trim()) return "Đã gọi 2";
  if (lead.call_1?.trim()) return "Đã gọi 1";
  return "Chưa gọi";
}

export async function fetchSaleFloatingLeads(from?: string, to?: string) {
  let query = supabase
    .from("floating_leads")
    .select("*")
    .order("lead_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (from) query = query.gte("lead_date", from);
  if (to) query = query.lte("lead_date", to);

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function fetchMarketingFloatingLeads(from: string, to: string) {
  const { data, error } = await supabase
    .from("floating_leads")
    .select("*")
    .gte("lead_date", from)
    .lte("lead_date", to)
    .order("lead_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createMarketingFloatingLeads({
  phones,
  profileId,
  profileName,
  leadDate,
}: {
  phones: string[];
  profileId: string;
  profileName: string;
  leadDate: string;
}) {
  const rows: TablesInsert<"floating_leads">[] = phones.map((phone) => ({
    phone,
    created_by: profileId,
    created_by_name: profileName,
    lead_date: leadDate,
    status: "Chưa gọi",
  }));

  const { data, error } = await supabase.from("floating_leads").insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function claimFloatingLead({
  leadId,
  profileId,
  profileName,
}: {
  leadId: string;
  profileId: string;
  profileName: string;
}) {
  const payload: TablesUpdate<"floating_leads"> = {
    assigned_sale_id: profileId,
    assigned_sale_name: profileName,
    assigned_at: new Date().toISOString(),
    last_claimed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("floating_leads")
    .update(payload)
    .eq("id", leadId)
    .eq("is_closed", false)
    .lt("claim_count", 3)
    .is("assigned_sale_id", null)
    .not("blocked_sale_ids", "cs", `{${profileId}}`)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Lead đã có người nhận hoặc đã xử lý đủ 3 lượt");
  return data;
}

export async function updateFloatingLeadCare({
  lead,
  draft,
  profileId,
}: {
  lead: FloatingLeadRow;
  draft: FloatingLeadCareDraft;
  profileId: string;
}) {
  const callField = getFloatingLeadCallField(lead);
  const payload: TablesUpdate<"floating_leads"> = {
    [callField]: draft[callField] || null,
  };

  if (draft.is_closed) {
    payload.is_closed = true;
    payload.closed_by = profileId;
    payload.closed_at = new Date().toISOString();
    payload.status = "Đã bị chốt";
  }

  const { data, error } = await supabase
    .from("floating_leads")
    .update(payload)
    .eq("id", lead.id)
    .eq("assigned_sale_id", profileId)
    .eq("is_closed", false)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Lead đã được khóa hoặc không thuộc bạn");
  return data;
}

export async function releaseExpiredFloatingLeadsForSale(profileId: string) {
  const { data, error } = await supabase.rpc("release_expired_floating_leads_for_sale", {
    p_sale_id: profileId,
  });
  if (error) throw error;
  return data ?? 0;
}

export async function updateMarketingFloatingLeadSource({
  leadId,
  phone,
}: {
  leadId: string;
  phone: string;
}) {
  const normalizedPhone = normalizeLeadPhone(phone);
  const digits = normalizedPhone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Số điện thoại không hợp lệ");
  }

  const payload: TablesUpdate<"floating_leads"> = {
    phone: normalizedPhone,
  };

  const { data, error } = await supabase
    .from("floating_leads")
    .update(payload)
    .eq("id", leadId)
    .is("assigned_sale_id", null)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export function todayYmd() {
  const now = new Date();
  const vnDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const year = vnDate.getFullYear();
  const month = String(vnDate.getMonth() + 1).padStart(2, "0");
  const day = String(vnDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeLeadPhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function validateLeadPhones(input: string) {
  const rawLines = input.split(/\r?\n/).map(normalizeLeadPhone).filter(Boolean);

  if (!rawLines.length) {
    return { phones: [] as string[], error: "Nhập ít nhất 1 số điện thoại." };
  }

  if (rawLines.length > 5) {
    return { phones: [] as string[], error: "Chỉ được nhập tối đa 5 số/lần." };
  }

  const seen = new Set<string>();
  const phones: string[] = [];
  for (const phone of rawLines) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { phones: [] as string[], error: `Số điện thoại không hợp lệ: ${phone}` };
    }
    if (seen.has(digits)) continue;
    seen.add(digits);
    phones.push(phone);
  }

  return { phones, error: null as string | null };
}
