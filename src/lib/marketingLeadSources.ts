import { supabase } from "@/integrations/supabase/client";

type SupabaseAny = typeof supabase & {
  from: (table: string) => SupabaseQueryBuilder;
};

const db = supabase as SupabaseAny;

interface SupabaseQueryBuilder<TData = unknown> extends PromiseLike<{
  data: TData;
  error: unknown;
}> {
  select: (columns?: string) => SupabaseQueryBuilder<TData>;
  insert: (values: unknown) => SupabaseQueryBuilder<TData>;
  update: (values: unknown) => SupabaseQueryBuilder<TData>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<TData>;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder<TData>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<TData>;
  limit: (count: number) => SupabaseQueryBuilder<TData>;
  single: () => SupabaseQueryBuilder<TData>;
}

interface LeadSourceRow {
  id: string;
  source_token: string;
  name: string;
  product: string;
  channel: LeadChannel;
  team_id: string | null;
  owner_user_id: string;
  is_active: boolean;
  created_at: string;
  teams?: { name?: string | null } | null;
}

interface MarketingContactRow {
  id: string;
  created_at: string;
  updated_at?: string | null;
  owner_user_id: string;
  team_id: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string;
  message: string | null;
  source_name: string | null;
  source_channel: string | null;
  sales_owner_name: string | null;
  sales_team_name: string | null;
  status: string | null;
  is_duplicate: boolean | null;
  duplicate_of_contact_id: string | null;
  duplicate_checked_at: string | null;
  eligible_for_sale_distribution: boolean | null;
  raw_payload: Record<string, unknown> | null;
  profiles?: {
    full_name?: string | null;
    username?: string | null;
    email?: string | null;
    employee_code?: string | null;
    company_name?: string | null;
  } | null;
  teams?: { name?: string | null } | null;
  lead_sources?: { name?: string | null; product?: string | null } | null;
}

interface ContactNoteRow {
  id: string;
  contact_id: string;
  content: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface CurrentProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
}

export type LeadChannel =
  | "Facebook mess"
  | "Facebook chuyển đổi"
  | "Tiktok chuyển đổi"
  | "Tiktok mess"
  | "Hotline"
  | "Google"
  | "Youtube";

export type LeadSourceStatus = "active" | "inactive";

export interface MarketingLeadSource {
  id: string;
  name: string;
  product: string;
  channel: LeadChannel;
  teamId: string | null;
  team: string;
  ownerUserId: string;
  token: string;
  status: LeadSourceStatus;
  createdAt: string;
}

export type ContactStatus =
  | "new"
  | "processing"
  | "called"
  | "resale_received"
  | "duplicate"
  | "success"
  | "cancelled"
  | "quoted"
  | "shipping"
  | "returned";

export interface MarketingContact {
  id: string;
  createdAt: string;
  createdAtFull: string;
  updatedAt?: string | null;
  name: string;
  email: string;
  phone: string;
  secondaryPhone?: string | null;
  salesOwner: string;
  salesOwnerEmployeeCode?: string | null;
  salesTeam: string;
  status: ContactStatus;
  source: LeadChannel;
  sourceName: string;
  sourceUrl?: string | null;
  marketerName: string;
  marketerEmployeeCode?: string | null;
  marketerCompanyName?: string | null;
  marketingTeam: string;
  product: string;
  note: string;
  saleNote?: string | null;
  notes: ContactNote[];
  latest_note?: string;
  noteHistory?: MarketingContactNoteHistory[];
  history: string[];
  activityGroups?: MarketingContactActivityGroup[];
  isDuplicate: boolean;
  duplicateOfContactId: string | null;
  duplicateCheckedAt: string;
  eligibleForSaleDistribution: boolean;
  orders?: MarketingContactOrder[];
}

export interface ContactNote {
  id: string;
  contactId: string;
  content: string;
  createdById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface MarketingContactActivityGroup {
  actor: string;
  actions: Array<{
    content: string;
    time?: string | null;
  }>;
}

export interface MarketingContactNoteHistory {
  id: string;
  createdAt: string;
  content: string;
  createdBy: string;
}

export interface MarketingContactOrder {
  orderCode: string;
  date: string;
  shippingAddress?: string;
  confirmedAt?: string;
  product: string;
  revenue: number;
  status: string;
  currency?: string;
  paymentMethod?: string;
}

export interface CreateLeadSourceInput {
  name: string;
  product: string;
  channel: LeadChannel;
  ownerUserId: string;
  teamId: string | null;
}

export interface CreateMarketingContactInput {
  name: string;
  phone: string;
  source: LeadChannel;
  note: string;
  ownerUserId: string;
}

export const leadChannelOptions: LeadChannel[] = [
  "Facebook mess",
  "Facebook chuyển đổi",
  "Tiktok chuyển đổi",
  "Tiktok mess",
  "Hotline",
  "Google",
  "Youtube",
];

export function buildLeadIngestUrl(sourceToken: string) {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://workspace.vn";
  return `${origin}/api/leads/ingest/${sourceToken}`;
}

export function generateSourceToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomPart = Array.from({ length: 11 }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
  ).join("");
  return `src_${randomPart}`;
}

export function normalizeVietnamesePhone(rawPhone: string) {
  const trimmed = rawPhone.trim();
  const hasPlus84 = trimmed.startsWith("+84");
  let digits = trimmed.replace(/\D/g, "");

  if (hasPlus84 && digits.startsWith("84")) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith("84") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  } else if (!digits.startsWith("0") && digits.length === 9) {
    digits = `0${digits}`;
  }

  return digits;
}

export async function fetchEmployeeLeadSources(): Promise<MarketingLeadSource[]> {
  const { data, error } = await db
    .from("lead_sources")
    .select(
      "id, source_token, name, product, channel, team_id, owner_user_id, is_active, created_at, teams(name)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as LeadSourceRow[]).map(mapLeadSourceRow);
}

export async function createLeadSource(input: CreateLeadSourceInput): Promise<MarketingLeadSource> {
  const token = generateSourceToken();
  const { data, error } = await db
    .from("lead_sources")
    .insert({
      source_token: token,
      name: input.name,
      product: input.product,
      channel: input.channel,
      team_id: input.teamId,
      owner_user_id: input.ownerUserId,
      is_active: true,
    })
    .select(
      "id, source_token, name, product, channel, team_id, owner_user_id, is_active, created_at, teams(name)",
    )
    .single();

  if (error) throw error;
  return mapLeadSourceRow(data as LeadSourceRow);
}

export async function updateLeadSourceStatus(sourceId: string, isActive: boolean) {
  const { error } = await db
    .from("lead_sources")
    .update({ is_active: isActive })
    .eq("id", sourceId);

  if (error) throw error;
}

export async function fetchEmployeeMarketingContacts(): Promise<MarketingContact[]> {
  const { data, error } = await db
    .from("marketing_contacts")
    .select(
      "id, created_at, updated_at, owner_user_id, team_id, customer_name, email, phone, message, source_name, source_channel, sales_owner_name, sales_team_name, status, is_duplicate, duplicate_of_contact_id, duplicate_checked_at, eligible_for_sale_distribution, raw_payload, profiles(full_name, username, email, employee_code, company_name), teams(name), lead_sources(name, product)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as MarketingContactRow[];
  const notesByContactId = await fetchContactNotesByContactIds(rows.map((row) => row.id));

  return rows.map((row) => mapMarketingContactRow(row, notesByContactId.get(row.id) ?? []));
}

export async function createMarketingContact(input: CreateMarketingContactInput) {
  const normalizedPhone = normalizeVietnamesePhone(input.phone);
  const { data: existingRows, error: duplicateError } = await db
    .from("marketing_contacts")
    .select("id")
    .eq("owner_user_id", input.ownerUserId)
    .eq("normalized_phone", normalizedPhone)
    .limit(1);

  if (duplicateError) throw duplicateError;

  const matchingContacts = (existingRows ?? []) as Array<{ id: string }>;
  const isDuplicate = matchingContacts.length > 0;
  const duplicateCheckedAt = new Date().toISOString();
  const { data, error } = await db
    .from("marketing_contacts")
    .insert({
      source_token: "manual",
      owner_user_id: input.ownerUserId,
      customer_name: input.name,
      phone: input.phone,
      normalized_phone: normalizedPhone,
      message: input.note,
      source_name: "Tạo thủ công",
      source_channel: input.source,
      sales_owner_name: "Chưa phân phối",
      sales_team_name: "Chưa phân phối",
      status: isDuplicate ? "duplicate" : "new",
      is_duplicate: isDuplicate,
      duplicate_scope: isDuplicate ? "owner_user_id" : null,
      duplicate_of_contact_id: matchingContacts[0]?.id ?? null,
      duplicate_checked_at: duplicateCheckedAt,
      eligible_for_sale_distribution: !isDuplicate,
      raw_payload: {
        name: input.name,
        phone: input.phone,
        message: input.note,
        source: input.source,
      },
    })
    .select(
      "id, created_at, updated_at, owner_user_id, team_id, customer_name, email, phone, message, source_name, source_channel, sales_owner_name, sales_team_name, status, is_duplicate, duplicate_of_contact_id, duplicate_checked_at, eligible_for_sale_distribution, raw_payload, profiles(full_name, username, email, employee_code, company_name), teams(name), lead_sources(name, product)",
    )
    .single();

  if (error) throw error;
  return mapMarketingContactRow(data as MarketingContactRow, []);
}

function mapLeadSourceRow(row: LeadSourceRow): MarketingLeadSource {
  return {
    id: row.id,
    name: row.name,
    product: row.product,
    channel: row.channel,
    teamId: row.team_id ?? null,
    team: row.teams?.name ?? "Chưa xác định team",
    ownerUserId: row.owner_user_id,
    token: row.source_token,
    status: row.is_active ? "active" : "inactive",
    createdAt: row.created_at,
  };
}

export async function createContactNote(contactId: string, content: string): Promise<ContactNote> {
  const trimmedContent = content.trim();
  if (!trimmedContent) throw new Error("Nội dung ghi chú không được để trống.");

  const profile = await fetchCurrentProfileSummary();
  const { data, error } = await db
    .from("contact_notes")
    .insert({
      contact_id: contactId,
      content: trimmedContent,
      created_by: profile.id,
      created_by_name: profile.full_name || profile.username || profile.email,
    })
    .select(
      "id, contact_id, content, created_by, created_by_name, created_at, updated_at, deleted_at",
    )
    .single();

  if (error) throw error;
  return mapContactNoteRow(data as ContactNoteRow);
}

export async function updateContactNote(noteId: string, content: string): Promise<ContactNote> {
  const trimmedContent = content.trim();
  if (!trimmedContent) throw new Error("Nội dung ghi chú không được để trống.");

  const { data, error } = await db
    .from("contact_notes")
    .update({ content: trimmedContent })
    .eq("id", noteId)
    .select(
      "id, contact_id, content, created_by, created_by_name, created_at, updated_at, deleted_at",
    )
    .single();

  if (error) throw error;
  return mapContactNoteRow(data as ContactNoteRow);
}

export async function deleteContactNote(noteId: string): Promise<void> {
  const profile = await fetchCurrentProfileSummary();
  const { error } = await db
    .from("contact_notes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
    })
    .eq("id", noteId);

  if (error) throw error;
}

async function fetchContactNotesByContactIds(contactIds: string[]) {
  const uniqueContactIds = [...new Set(contactIds)].filter(Boolean);
  const notesByContactId = new Map<string, ContactNote[]>();
  if (!uniqueContactIds.length) return notesByContactId;

  const { data, error } = await db
    .from("contact_notes")
    .select(
      "id, contact_id, content, created_by, created_by_name, created_at, updated_at, deleted_at",
    )
    .in("contact_id", uniqueContactIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingContactNotesTableError(error)) return notesByContactId;
    throw error;
  }

  for (const note of (data ?? []) as ContactNoteRow[]) {
    if (note.deleted_at) continue;
    const mappedNote = mapContactNoteRow(note);
    const currentNotes = notesByContactId.get(mappedNote.contactId) ?? [];
    currentNotes.push(mappedNote);
    notesByContactId.set(mappedNote.contactId, currentNotes);
  }

  return notesByContactId;
}

async function fetchCurrentProfileSummary() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const authUserId = authData.user?.id;
  if (!authUserId) throw new Error("User chưa đăng nhập.");

  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, username, email")
    .eq("auth_user_id", authUserId)
    .single();

  if (error) throw error;
  return data as CurrentProfileRow;
}

function mapMarketingContactRow(
  row: MarketingContactRow,
  contactNotes: ContactNote[],
): MarketingContact {
  const source = (row.source_channel ?? "Facebook mess") as LeadChannel;
  const status = normalizeContactStatus(row.status, Boolean(row.is_duplicate));
  const isDuplicate = Boolean(row.is_duplicate) || status === "duplicate";
  const eligibleForSaleDistribution = !isDuplicate && row.eligible_for_sale_distribution !== false;
  const rawPayload = row.raw_payload ?? {};
  const marketerName =
    row.profiles?.full_name || row.profiles?.username || row.profiles?.email || "";
  const marketerEmployeeCode = row.profiles?.employee_code ?? null;
  const marketerCompanyName = row.profiles?.company_name ?? null;
  const marketingTeam = row.teams?.name ?? "";
  const sourceName = row.source_name || row.lead_sources?.name || "";
  const sourceUrl = asString(rawPayload.landing_url);
  const saleNote = asString(rawPayload.sale_note);
  const legacyNoteHistory = parseContactNoteHistory(
    rawPayload.sale_notes ?? rawPayload.note_history ?? rawPayload.notes,
    String(row.created_at ?? ""),
    row.sales_owner_name || "",
  );

  if (!contactNotes.length && !legacyNoteHistory.length && saleNote.trim()) {
    legacyNoteHistory.push({
      id: `${row.id}-sale-note`,
      createdAt: String(row.updated_at ?? row.created_at ?? ""),
      content: saleNote.trim(),
      createdBy: row.sales_owner_name || "",
    });
  }

  const noteHistory = contactNotes.length
    ? contactNotes.map((note) => ({
        id: note.id,
        createdAt: note.createdAt,
        content: note.content,
        createdBy: note.createdBy,
      }))
    : legacyNoteHistory;
  const latestNote = contactNotes[0]?.content || noteHistory[0]?.content || saleNote;

  const history = [
    `Lead được tạo bởi ${formatActorLabel(marketerName, marketerEmployeeCode, marketingTeam)} từ ${sourceName || source}`,
    isDuplicate ? "Hệ thống đánh dấu trùng số điện thoại" : "Hệ thống nhận lead thành công",
  ];

  return {
    id: row.id,
    createdAtFull: String(row.created_at ?? ""),
    createdAt: String(row.created_at ?? "").slice(0, 10),
    updatedAt: row.updated_at ?? null,
    name: row.customer_name || asString(rawPayload.name) || "Chưa có tên",
    email: row.email || asString(rawPayload.email),
    phone: row.phone,
    secondaryPhone:
      asString(rawPayload.secondary_phone) ||
      asString(rawPayload.secondaryPhone) ||
      asString(rawPayload.alternate_phone) ||
      asString(rawPayload.alternatePhone),
    salesOwner: isDuplicate ? "—" : row.sales_owner_name || "Chưa phân phối",
    salesOwnerEmployeeCode: asString(rawPayload.sales_owner_employee_code),
    salesTeam: isDuplicate ? "—" : row.sales_team_name || "Chưa phân phối",
    status,
    source,
    sourceName,
    sourceUrl,
    marketerName,
    marketerEmployeeCode,
    marketerCompanyName,
    marketingTeam,
    product: row.lead_sources?.product ?? "",
    note: row.message || asString(rawPayload.message) || "Chưa có ghi chú.",
    saleNote: latestNote,
    notes: contactNotes,
    latest_note: latestNote || undefined,
    noteHistory,
    history,
    isDuplicate,
    duplicateOfContactId: row.duplicate_of_contact_id ?? null,
    duplicateCheckedAt: row.duplicate_checked_at ?? "",
    eligibleForSaleDistribution,
  };
}

function mapContactNoteRow(row: ContactNoteRow): ContactNote {
  return {
    id: row.id,
    contactId: row.contact_id,
    content: row.content,
    createdById: row.created_by ?? null,
    createdBy: row.created_by_name || "—",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function isMissingContactNotesTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  return (
    record.code === "42P01" ||
    record.message?.includes("contact_notes") ||
    record.message?.includes("schema cache")
  );
}

function formatActorLabel(name: string, employeeCode?: string | null, team?: string | null) {
  const codeLabel = employeeCode?.trim() || "Chưa có mã NV";
  const teamLabel = team?.trim() || "Chưa có team";
  return `${name || "Chưa cập nhật"} (${codeLabel} - ${teamLabel})`;
}

function normalizeContactStatus(status: string | null, isDuplicate: boolean): ContactStatus {
  if (isDuplicate) return "duplicate";
  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  if (
    normalizedStatus === "new" ||
    normalizedStatus === "processing" ||
    normalizedStatus === "called" ||
    normalizedStatus === "resale_received" ||
    normalizedStatus === "duplicate" ||
    normalizedStatus === "success" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "quoted" ||
    normalizedStatus === "shipping" ||
    normalizedStatus === "returned"
  ) {
    return normalizedStatus;
  }
  if (normalizedStatus === "closed") return "success";
  if (normalizedStatus === "completed" || normalizedStatus === "complete") return "success";
  if (
    normalizedStatus === "cancel" ||
    normalizedStatus === "canceled" ||
    normalizedStatus === "huỷ" ||
    normalizedStatus === "hủy"
  ) {
    return "cancelled";
  }
  if (
    normalizedStatus === "quote" ||
    normalizedStatus === "quoted" ||
    normalizedStatus === "bao_gia" ||
    normalizedStatus === "báo giá"
  ) {
    return "quoted";
  }
  if (
    normalizedStatus === "delivering" ||
    normalizedStatus === "shipping" ||
    normalizedStatus === "dang_giao" ||
    normalizedStatus === "đang giao"
  ) {
    return "shipping";
  }
  if (
    normalizedStatus === "returned" ||
    normalizedStatus === "return" ||
    normalizedStatus === "hoan" ||
    normalizedStatus === "hoàn"
  ) {
    return "returned";
  }
  return "new";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseContactNoteHistory(
  value: unknown,
  fallbackCreatedAt: string,
  fallbackCreatedBy: string,
) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const content =
        asString(record.content) ||
        asString(record.note) ||
        asString(record.message) ||
        asString(record.text);
      if (!content.trim()) return null;

      return {
        id: asString(record.id) || `note-${index}`,
        createdAt:
          asString(record.created_at) ||
          asString(record.createdAt) ||
          asString(record.time) ||
          fallbackCreatedAt,
        content: content.trim(),
        createdBy:
          asString(record.created_by_name) ||
          asString(record.createdByName) ||
          asString(record.created_by) ||
          asString(record.createdBy) ||
          asString(record.actor) ||
          fallbackCreatedBy,
      };
    })
    .filter((item): item is { id: string; createdAt: string; content: string; createdBy: string } =>
      Boolean(item),
    );
}
