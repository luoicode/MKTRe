import { supabase } from "@/integrations/supabase/client";

type SupabaseAny = typeof supabase & {
  from: (table: string) => SupabaseQueryBuilder;
};

interface SupabaseQueryBuilder<TData = unknown> extends PromiseLike<{
  data: TData;
  error: unknown;
}> {
  select: (columns?: string) => SupabaseQueryBuilder<TData>;
  insert: (values: unknown) => SupabaseQueryBuilder<TData>;
  update: (values: unknown) => SupabaseQueryBuilder<TData>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<TData>;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder<TData>;
  is: (column: string, value: unknown) => SupabaseQueryBuilder<TData>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<TData>;
  single: () => SupabaseQueryBuilder<TData>;
}

const db = supabase as SupabaseAny;

export type SaleCrmStatus =
  | "sale_received"
  | "new"
  | "processing"
  | "called"
  | "quoted"
  | "shipping"
  | "success"
  | "returned"
  | "cancelled"
  | "duplicate";

export interface SaleCrmNote {
  id: string;
  customerId: string;
  note: string;
  createdById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface SaleCrmActivity {
  id: string;
  customerId: string;
  type: string;
  description: string;
  actorId: string | null;
  actorName: string;
  createdAt: string;
}

export interface SaleCrmSource {
  id: string;
  customerId: string;
  leadSourceId: string | null;
  sourceName: string;
  sourceChannel: string;
  landingUrl: string;
  productName: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  marketerId: string | null;
  marketerName: string;
  marketerEmployeeCode: string;
  marketerCompanyName: string;
  marketingTeam: string;
  createdAt: string;
}

export interface SaleCrmAssignment {
  id: string;
  customerId: string;
  fromSaleName: string;
  fromSaleTeamName: string;
  toSaleName: string;
  toSaleTeamName: string;
  assignmentType: string;
  reason: string;
  note: string;
  assignedByName: string;
  assignedAt: string;
}

export interface SaleCrmOrder {
  id: string;
  customerId: string;
  orderCode: string;
  productName: string;
  quantity: number;
  amount: number;
  status: string;
  orderDate: string;
  createdAt: string;
}

export interface SaleCrmContact {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  address: string;
  status: SaleCrmStatus;
  customerType: string;
  assignedSaleId: string | null;
  assignedSaleName: string;
  saleTeamId: string | null;
  saleTeamName: string;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  contactCount: number;
  totalOrders: number;
  completedOrders: number;
  completedRevenue: number;
  lifetimeValue: number;
  createdAt: string;
  updatedAt: string;
  sources: SaleCrmSource[];
  notes: SaleCrmNote[];
  activities: SaleCrmActivity[];
  assignments: SaleCrmAssignment[];
  orders: SaleCrmOrder[];
}

interface CustomerRow {
  id: string;
  customer_code: string | null;
  customer_name: string | null;
  phone: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  status: string | null;
  customer_type: string | null;
  assigned_sale_id: string | null;
  assigned_sale_name: string | null;
  sale_team_id: string | null;
  sale_team_name: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  contact_count: number | null;
  total_orders: number | null;
  completed_orders: number | null;
  completed_revenue: number | null;
  lifetime_value: number | null;
  created_at: string;
  updated_at: string | null;
}

interface CustomerSourceRow {
  id: string;
  customer_id: string;
  lead_source_id: string | null;
  source_name: string | null;
  source_channel: string | null;
  landing_url: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  marketer_id: string | null;
  marketer_name: string | null;
  created_at: string;
  lead_sources?: { product?: string | null } | null;
}

interface MarketerInfo {
  name: string;
  employeeCode: string;
  companyName: string;
  teamName: string;
}

interface MarketerProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  employee_code: string | null;
  company_name: string | null;
}

interface MarketerTeamMembershipRow {
  user_id: string;
  teams?: { name?: string | null } | null;
}

interface CustomerNoteRow {
  id: string;
  customer_id: string;
  note: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface CustomerActivityRow {
  id: string;
  customer_id: string;
  activity_type: string | null;
  description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

interface CustomerAssignmentRow {
  id: string;
  customer_id: string;
  from_sale_name: string | null;
  from_sale_team_name: string | null;
  to_sale_name: string | null;
  to_sale_team_name: string | null;
  assignment_type: string | null;
  reason: string | null;
  note: string | null;
  assigned_by_name: string | null;
  assigned_at: string;
}

interface CustomerOrderRow {
  id: string;
  customer_id: string;
  order_code: string | null;
  product_name: string | null;
  quantity: number | null;
  amount: number | null;
  status: string | null;
  order_date: string | null;
  created_at: string;
}

export interface SaleCrmActor {
  id: string;
  fullName: string;
  username?: string | null;
  email?: string | null;
}

export const saleCrmStatusOptions: Array<{ key: SaleCrmStatus; label: string }> = [
  { key: "sale_received", label: "Sale nhận" },
  { key: "new", label: "Mới" },
  { key: "processing", label: "Đang xử lí" },
  { key: "called", label: "Đã gọi" },
  { key: "quoted", label: "Báo giá" },
  { key: "shipping", label: "Đang giao" },
  { key: "success", label: "Hoàn thành" },
  { key: "returned", label: "Hoàn" },
  { key: "cancelled", label: "Huỷ" },
  { key: "duplicate", label: "Trùng" },
];

export function getSaleCrmStatusLabel(status: SaleCrmStatus) {
  return saleCrmStatusOptions.find((option) => option.key === status)?.label ?? status;
}

export async function fetchSaleCrmContacts(profileId: string): Promise<SaleCrmContact[]> {
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("assigned_sale_id", profileId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const customerRows = (data ?? []) as CustomerRow[];
  const customerIds = customerRows.map((customer) => customer.id);
  if (!customerIds.length) return [];

  const [sources, notes, activities, assignments, orders] = await Promise.all([
    fetchSources(customerIds),
    fetchNotes(customerIds),
    fetchActivities(customerIds),
    fetchAssignments(customerIds),
    fetchOrders(customerIds),
  ]);

  return customerRows.map((customer) =>
    mapCustomerRow(customer, {
      sources: sources.get(customer.id) ?? [],
      notes: notes.get(customer.id) ?? [],
      activities: activities.get(customer.id) ?? [],
      assignments: assignments.get(customer.id) ?? [],
      orders: orders.get(customer.id) ?? [],
    }),
  );
}

export async function createCustomerNote(customerId: string, content: string, actor: SaleCrmActor) {
  const note = content.trim();
  if (!note) throw new Error("Nội dung ghi chú không được để trống.");

  const { error } = await db.from("customer_notes").insert({
    customer_id: customerId,
    note,
    created_by: actor.id,
    created_by_name: getActorName(actor),
  });
  if (error) throw error;

  await createCustomerActivity(customerId, "note_created", `Thêm ghi chú: ${note}`, actor);
}

export async function updateCustomerNote(
  noteId: string,
  customerId: string,
  content: string,
  actor: SaleCrmActor,
) {
  const note = content.trim();
  if (!note) throw new Error("Nội dung ghi chú không được để trống.");

  const { error } = await db
    .from("customer_notes")
    .update({
      note,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (error) throw error;

  await createCustomerActivity(customerId, "note_updated", `Sửa ghi chú: ${note}`, actor);
}

export async function deleteCustomerNote(noteId: string, customerId: string, actor: SaleCrmActor) {
  const { error } = await db
    .from("customer_notes")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (error) throw error;

  await createCustomerActivity(customerId, "note_deleted", "Xoá ghi chú", actor);
}

export async function updateCustomerStatus(
  customerId: string,
  status: SaleCrmStatus,
  actor: SaleCrmActor,
) {
  const { error } = await db
    .from("customers")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);
  if (error) throw error;

  await createCustomerActivity(
    customerId,
    "status_changed",
    `Đổi trạng thái: ${getSaleCrmStatusLabel(status)}`,
    actor,
  );
}

export async function updateCustomerFollowup(
  customerId: string,
  lastContactAt: string | null,
  nextFollowupAt: string | null,
  actor: SaleCrmActor,
) {
  const { error } = await db
    .from("customers")
    .update({
      last_contact_at: lastContactAt || null,
      next_followup_at: nextFollowupAt || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);
  if (error) throw error;

  await createCustomerActivity(customerId, "followup_updated", "Cập nhật lịch liên hệ", actor);
}

async function createCustomerActivity(
  customerId: string,
  activityType: string,
  description: string,
  actor: SaleCrmActor,
) {
  const { error } = await db.from("customer_activities").insert({
    customer_id: customerId,
    activity_type: activityType,
    description,
    actor_id: actor.id,
    actor_name: getActorName(actor),
  });
  if (error) throw error;
}

async function fetchSources(customerIds: string[]) {
  const rowsByCustomerId = new Map<string, SaleCrmSource[]>();
  const { data, error } = await db
    .from("customer_sources")
    .select("*, lead_sources(product)")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as CustomerSourceRow[];
  const marketerInfoById = await fetchMarketerInfoById(
    rows.map((row) => row.marketer_id).filter(Boolean) as string[],
  );
  for (const row of rows) {
    pushMapValue(rowsByCustomerId, row.customer_id, mapSourceRow(row, marketerInfoById));
  }
  return rowsByCustomerId;
}

async function fetchMarketerInfoById(marketerIds: string[]) {
  const uniqueIds = Array.from(new Set(marketerIds));
  const marketerInfoById = new Map<string, MarketerInfo>();
  if (!uniqueIds.length) return marketerInfoById;

  const [{ data: profilesData, error: profilesError }, { data: teamsData, error: teamsError }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, username, email, employee_code, company_name")
        .in("id", uniqueIds),
      db
        .from("team_memberships")
        .select("user_id, teams(name)")
        .in("user_id", uniqueIds)
        .eq("is_active", true),
    ]);

  if (profilesError) throw profilesError;
  if (teamsError) throw teamsError;

  const teamByUserId = new Map<string, string>();
  for (const row of (teamsData ?? []) as MarketerTeamMembershipRow[]) {
    if (!teamByUserId.has(row.user_id)) {
      teamByUserId.set(row.user_id, row.teams?.name ?? "");
    }
  }

  for (const row of (profilesData ?? []) as MarketerProfileRow[]) {
    marketerInfoById.set(row.id, {
      name: row.full_name || row.username || row.email || "",
      employeeCode: row.employee_code ?? "",
      companyName: row.company_name ?? "",
      teamName: teamByUserId.get(row.id) ?? "",
    });
  }

  return marketerInfoById;
}

async function fetchNotes(customerIds: string[]) {
  const rowsByCustomerId = new Map<string, SaleCrmNote[]>();
  const { data, error } = await db
    .from("customer_notes")
    .select("*")
    .in("customer_id", customerIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as CustomerNoteRow[]) {
    pushMapValue(rowsByCustomerId, row.customer_id, mapNoteRow(row));
  }
  return rowsByCustomerId;
}

async function fetchActivities(customerIds: string[]) {
  const rowsByCustomerId = new Map<string, SaleCrmActivity[]>();
  const { data, error } = await db
    .from("customer_activities")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as CustomerActivityRow[]) {
    pushMapValue(rowsByCustomerId, row.customer_id, mapActivityRow(row));
  }
  return rowsByCustomerId;
}

async function fetchAssignments(customerIds: string[]) {
  const rowsByCustomerId = new Map<string, SaleCrmAssignment[]>();
  const { data, error } = await db
    .from("customer_assignments")
    .select("*")
    .in("customer_id", customerIds)
    .order("assigned_at", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as CustomerAssignmentRow[]) {
    pushMapValue(rowsByCustomerId, row.customer_id, mapAssignmentRow(row));
  }
  return rowsByCustomerId;
}

async function fetchOrders(customerIds: string[]) {
  const rowsByCustomerId = new Map<string, SaleCrmOrder[]>();
  const { data, error } = await db
    .from("customer_orders")
    .select("*")
    .in("customer_id", customerIds)
    .order("order_date", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as CustomerOrderRow[]) {
    pushMapValue(rowsByCustomerId, row.customer_id, mapOrderRow(row));
  }
  return rowsByCustomerId;
}

function mapCustomerRow(
  row: CustomerRow,
  related: {
    sources: SaleCrmSource[];
    notes: SaleCrmNote[];
    activities: SaleCrmActivity[];
    assignments: SaleCrmAssignment[];
    orders: SaleCrmOrder[];
  },
): SaleCrmContact {
  return {
    id: row.id,
    customerCode: row.customer_code ?? "",
    name: row.customer_name ?? "Chưa có tên",
    phone: row.phone ?? "",
    secondaryPhone: row.phone_secondary ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    status: normalizeSaleCrmStatus(row.status),
    customerType: row.customer_type ?? "",
    assignedSaleId: row.assigned_sale_id ?? null,
    assignedSaleName: row.assigned_sale_name ?? "Chưa phân phối",
    saleTeamId: row.sale_team_id ?? null,
    saleTeamName: row.sale_team_name ?? "Chưa phân phối",
    lastContactAt: row.last_contact_at,
    nextFollowupAt: row.next_followup_at,
    contactCount: Number(row.contact_count ?? 0),
    totalOrders: Number(row.total_orders ?? 0),
    completedOrders: Number(row.completed_orders ?? 0),
    completedRevenue: Number(row.completed_revenue ?? 0),
    lifetimeValue: Number(row.lifetime_value ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    ...related,
  };
}

function mapSourceRow(
  row: CustomerSourceRow,
  marketerInfoById: Map<string, MarketerInfo>,
): SaleCrmSource {
  const marketerInfo = row.marketer_id ? marketerInfoById.get(row.marketer_id) : undefined;
  return {
    id: row.id,
    customerId: row.customer_id,
    leadSourceId: row.lead_source_id,
    sourceName: row.source_name ?? "",
    sourceChannel: row.source_channel ?? "",
    landingUrl: row.landing_url ?? "",
    productName: row.lead_sources?.product ?? "",
    campaignName: row.campaign_name ?? "",
    adsetName: row.adset_name ?? "",
    adName: row.ad_name ?? "",
    marketerId: row.marketer_id,
    marketerName: marketerInfo?.name || row.marketer_name || "—",
    marketerEmployeeCode: marketerInfo?.employeeCode ?? "",
    marketerCompanyName: marketerInfo?.companyName ?? "",
    marketingTeam: marketerInfo?.teamName ?? "",
    createdAt: row.created_at,
  };
}

function mapNoteRow(row: CustomerNoteRow): SaleCrmNote {
  return {
    id: row.id,
    customerId: row.customer_id,
    note: row.note,
    createdById: row.created_by,
    createdBy: row.created_by_name ?? "—",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivityRow(row: CustomerActivityRow): SaleCrmActivity {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.activity_type ?? "",
    description: row.description ?? "—",
    actorId: row.actor_id,
    actorName: row.actor_name ?? "Hệ thống",
    createdAt: row.created_at,
  };
}

function mapAssignmentRow(row: CustomerAssignmentRow): SaleCrmAssignment {
  return {
    id: row.id,
    customerId: row.customer_id,
    fromSaleName: row.from_sale_name ?? "",
    fromSaleTeamName: row.from_sale_team_name ?? "",
    toSaleName: row.to_sale_name ?? "",
    toSaleTeamName: row.to_sale_team_name ?? "",
    assignmentType: row.assignment_type ?? "",
    reason: row.reason ?? "",
    note: row.note ?? "",
    assignedByName: row.assigned_by_name ?? "Hệ thống",
    assignedAt: row.assigned_at,
  };
}

function mapOrderRow(row: CustomerOrderRow): SaleCrmOrder {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderCode: row.order_code ?? "",
    productName: row.product_name ?? "",
    quantity: Number(row.quantity ?? 0),
    amount: Number(row.amount ?? 0),
    status: row.status ?? "",
    orderDate: row.order_date ?? row.created_at,
    createdAt: row.created_at,
  };
}

function pushMapValue<T>(map: Map<string, T[]>, key: string, value: T) {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

function normalizeSaleCrmStatus(status: string | null): SaleCrmStatus {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (
    normalized === "sale_received" ||
    normalized === "new" ||
    normalized === "processing" ||
    normalized === "called" ||
    normalized === "quoted" ||
    normalized === "shipping" ||
    normalized === "success" ||
    normalized === "returned" ||
    normalized === "cancelled" ||
    normalized === "duplicate"
  ) {
    return normalized;
  }
  if (normalized === "closed" || normalized === "completed" || normalized === "complete") {
    return "success";
  }
  if (normalized === "cancel" || normalized === "canceled" || normalized === "huỷ") {
    return "cancelled";
  }
  if (normalized === "quote" || normalized === "báo giá" || normalized === "bao_gia") {
    return "quoted";
  }
  if (normalized === "đang giao" || normalized === "dang_giao") return "shipping";
  if (normalized === "hoàn") return "returned";
  return "new";
}

function getActorName(actor: SaleCrmActor) {
  return actor.fullName || actor.username || actor.email || "Sale";
}
