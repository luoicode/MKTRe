import { supabase } from "@/integrations/supabase/client";

export const FLOATING_LEAD_BATCH_SIZE = 100;

export type FloatingLeadCrmRow = {
  id: string;
  phone: string;
  source: string | null;
  created_by: string | null;
  created_by_name: string | null;
  assigned_sale_id: string | null;
  assigned_sale_name: string | null;
  lead_date: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  lifecycle_status: string;
  customer_name: string | null;
  normalized_phone: string | null;
  address: string | null;
  loai_cay_trong: string | null;
  dien_tich: string | null;
  tinh_trang_cay_trong: string | null;
  giai_doan_cay_trong: string | null;
  source_type: string | null;
  imported_at: string | null;
  call_count: number;
  last_called_at: string | null;
  latest_call_result: string | null;
  follow_up_at: string | null;
};

export type FloatingLeadActivity = {
  id: string;
  lead_id: string;
  activity_type: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type FloatingLeadImportRecord = {
  row_index: number;
  customer_name: string;
  phone: string;
  address: string;
  loai_cay_trong: string;
  dien_tich: string;
  tinh_trang_cay_trong: string;
  giai_doan_cay_trong: string;
  source_type: string;
};

export type FloatingLeadImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row_index: number; phone: string; reason: string }>;
};

export type FloatingLeadFilters = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  marketingId?: string;
  saleId?: string;
  from?: string;
  to?: string;
  crop?: string;
  sourceType?: string;
};

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => RpcResult<unknown>;
};

const rpcClient = supabase as unknown as RpcClient;

export function normalizeFloatingPhone(phone: unknown) {
  const compact = String(phone ?? "")
    .trim()
    .replace(/[.\-()\s]/g, "")
    .replace(/[^\d+]/g, "");
  if (compact.startsWith("+84")) return `0${compact.slice(3)}`;
  if (compact.startsWith("84") && compact.length >= 10 && compact.length <= 11) {
    return `0${compact.slice(2)}`;
  }
  return compact.replace(/\D/g, "");
}

export function isValidFloatingPhone(phone: string) {
  return /^0\d{8,10}$/.test(phone);
}

export async function fetchFloatingLeadsPage(filters: FloatingLeadFilters) {
  const { data, error } = await rpcClient.rpc("fetch_floating_leads_page", {
    p_page: filters.page,
    p_page_size: Math.min(filters.pageSize, 100),
    p_search: filters.search?.trim() || null,
    p_status: filters.status && filters.status !== "all" ? filters.status : null,
    p_marketing_id:
      filters.marketingId && filters.marketingId !== "all" ? filters.marketingId : null,
    p_sale_id: filters.saleId && filters.saleId !== "all" ? filters.saleId : null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_crop: filters.crop && filters.crop !== "all" ? filters.crop : null,
    p_source_type: filters.sourceType && filters.sourceType !== "all" ? filters.sourceType : null,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { rows?: FloatingLeadCrmRow[]; total?: number };
  return { rows: result.rows ?? [], total: Number(result.total ?? 0) };
}

export async function importFloatingLeadBatch(input: {
  records: FloatingLeadImportRecord[];
  duplicateStrategy: "skip" | "update" | "insert_anyway";
  importId: string;
  fileName: string;
}) {
  if (input.records.length < 1 || input.records.length > FLOATING_LEAD_BATCH_SIZE) {
    throw new Error(`Mỗi batch chỉ được có tối đa ${FLOATING_LEAD_BATCH_SIZE} dòng.`);
  }
  const { data, error } = await rpcClient.rpc("import_floating_leads_batch", {
    p_records: input.records,
    p_duplicate_strategy: input.duplicateStrategy,
    p_import_id: input.importId,
    p_file_name: input.fileName,
  });
  if (error) throw new Error(error.message);
  return data as FloatingLeadImportResult;
}

export async function bulkUpdateFloatingLeads(
  leadIds: string[],
  action: "delete" | "assign_sale" | "status",
  value?: string,
) {
  const { data, error } = await rpcClient.rpc("bulk_update_floating_leads", {
    p_lead_ids: leadIds,
    p_action: action,
    p_value: value ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function resetFloatingLeads(from?: string, to?: string) {
  const { data, error } = await rpcClient.rpc("reset_floating_leads", {
    p_from: from || null,
    p_to: to || null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function fetchFloatingLeadActivities(leadId: string) {
  const { data, error } = await supabase
    .from("floating_lead_activities" as never)
    .select("*" as never)
    .eq("lead_id" as never, leadId)
    .order("created_at" as never, { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FloatingLeadActivity[];
}

export async function updateFloatingLeadCrm(input: {
  leadId: string;
  status?: string;
  callResult?: string;
  note?: string;
  followUpAt?: string;
  clearFollowUp?: boolean;
}) {
  const { data, error } = await rpcClient.rpc("update_floating_lead_crm", {
    p_lead_id: input.leadId,
    p_status: input.status || null,
    p_call_result: input.callResult?.trim() || null,
    p_note: input.note?.trim() || null,
    p_follow_up_at: input.followUpAt || null,
    p_clear_follow_up: input.clearFollowUp ?? false,
  });
  if (error) throw new Error(error.message);
  return data as FloatingLeadCrmRow;
}

export async function updateAdminFloatingLeadDetails(lead: FloatingLeadCrmRow) {
  const { data, error } = await rpcClient.rpc("admin_update_floating_lead_details", {
    p_lead_id: lead.id,
    p_customer_name: lead.customer_name ?? "",
    p_phone: lead.phone,
    p_address: lead.address ?? "",
    p_crop: lead.loai_cay_trong ?? "",
    p_area: lead.dien_tich ?? "",
    p_crop_condition: lead.tinh_trang_cay_trong ?? "",
    p_crop_stage: lead.giai_doan_cay_trong ?? "",
    p_source_type: lead.source_type ?? "",
  });
  if (error) throw new Error(error.message);
  return data as FloatingLeadCrmRow;
}

export type FloatingLeadProfileOption = { id: string; name: string };

export async function fetchFloatingLeadProfiles(role: "sale" | "marketing") {
  const roles: Array<"sale" | "employee" | "leader"> =
    role === "sale" ? ["sale"] : ["employee", "leader"];
  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", roles);
  if (roleError) throw roleError;
  const ids = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
  if (!ids.length) return [] as FloatingLeadProfileOption[];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", ids)
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name || profile.username || "Chưa đặt tên",
  }));
}
