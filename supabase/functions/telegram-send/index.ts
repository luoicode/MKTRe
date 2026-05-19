import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SendPayload = {
  recipient_profile_id: string;
  notification_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
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
  task_completion_pending_review: "Checklist chờ duyệt",
  task_rejected: "Task cần làm lại",
  task_review: "Chờ duyệt task",
};

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

const EMPTY_TEXT = "Không có";
const ADMIN_MANAGER_TELEGRAM_TYPES = new Set([
  "leave_request_created",
  "task_pending_review",
  "checklist_pending_review",
  "task_assigned",
  "task_overdue",
  "employee_task_missing",
  "employee_task_late",
  "daily_checklist_incomplete_summary",
  "report_slot_overdue_summary",
  "daily_report_missing_summary",
]);

function canonicalTelegramType(
  type: string | null | undefined,
  entityType: string | null | undefined,
) {
  if (type === "task_review") {
    return entityType === "task_completion" ? "checklist_pending_review" : "task_pending_review";
  }
  if (type === "task_completion_pending_review") return "checklist_pending_review";
  return type ?? null;
}

function shouldSendTelegramNotification(
  role: string | null | undefined,
  notificationType: string | null | undefined,
) {
  const normalizedRole = String(role ?? "").toLowerCase();
  const normalizedType = String(notificationType ?? "");
  if (!normalizedType) return false;
  if (normalizedRole === "admin" || normalizedRole === "manager") {
    return ADMIN_MANAGER_TELEGRAM_TYPES.has(normalizedType);
  }
  return true;
}

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

async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${response.status}: ${body}`);
  }
}

function isReviewNotification(type: string | null | undefined) {
  return [
    "task_review",
    "task_pending_review",
    "checklist_pending_review",
    "task_completion_pending_review",
    "onboarding_review",
    "onboarding_review_pending",
  ].includes(type ?? "");
}

function isLeaveRequestNotification(type: string | null | undefined) {
  return type === "leave_request_created";
}

function mktreUrl() {
  return (
    Deno.env.get("MKTRE_APP_URL") ??
    Deno.env.get("SITE_URL") ??
    Deno.env.get("PUBLIC_SITE_URL") ??
    "https://mktre.local"
  ).replace(/\/$/, "");
}

function compactDate(value: string | null | undefined) {
  if (!value) return EMPTY_TEXT;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compactDateOnly(value: string | null | undefined) {
  if (!value) return EMPTY_TEXT;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function getMetadataStringList(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (Array.isArray(value)) {
      const list = value
        .map((item) => (typeof item === "string" ? item.trim() : null))
        .filter(Boolean) as string[];
      if (list.length) return list;
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function valueOrEmpty(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : EMPTY_TEXT;
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_TEXT;
}

function formatMetric(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_TEXT;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatSlotTime(value: string | null | undefined) {
  if (!value) return EMPTY_TEXT;
  return value.slice(0, 5);
}

function priorityLabel(priority: string | null | undefined) {
  if (priority === "high") return "Cao";
  if (priority === "medium") return "Vừa";
  if (priority === "low") return "Thấp";
  return EMPTY_TEXT;
}

function attendanceStatusLabel(status: string | null | undefined) {
  if (status === "present") return "Đã điểm danh";
  if (status === "approved_leave") return "Nghỉ phép đã duyệt";
  if (status === "leave_requested") return "Đã xin nghỉ";
  if (status === "absent") return "Vắng";
  if (status === "rejected_leave") return "Nghỉ phép không duyệt";
  return EMPTY_TEXT;
}

async function getProfileName(
  service: ReturnType<typeof createClient>,
  profileId: string | null | undefined,
) {
  if (!profileId) return EMPTY_TEXT;
  const { data } = await service
    .from("profiles")
    .select("full_name, username")
    .eq("id", profileId)
    .maybeSingle();
  return data?.full_name ?? data?.username ?? EMPTY_TEXT;
}

async function getTeamName(
  service: ReturnType<typeof createClient>,
  params: { teamId?: string | null; profileId?: string | null },
) {
  if (params.teamId) {
    const { data } = await service
      .from("teams")
      .select("name")
      .eq("id", params.teamId)
      .maybeSingle();
    if (data?.name) return data.name;
  }

  if (!params.profileId) return EMPTY_TEXT;
  const { data } = await service
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", params.profileId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.team_id) return EMPTY_TEXT;

  const { data: team } = await service
    .from("teams")
    .select("name")
    .eq("id", data.team_id)
    .maybeSingle();
  return team?.name ?? EMPTY_TEXT;
}

async function getPrimaryTeamIdForProfile(
  service: ReturnType<typeof createClient>,
  profileId: string | null | undefined,
) {
  if (!profileId) return null;
  const { data } = await service
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", profileId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.team_id ?? null;
}

async function routeForProfile(
  service: ReturnType<typeof createClient>,
  profileId: string,
  page: "attendance" | "tasks",
) {
  const { data } = await service.from("user_roles").select("role").eq("user_id", profileId);
  const roles = new Set((data ?? []).map((row) => String(row.role)));
  const role = roles.has("admin")
    ? "admin"
    : roles.has("manager")
      ? "manager"
      : roles.has("leader")
        ? "leader"
        : "employee";
  return `${mktreUrl()}/${role}/${page}`;
}

async function getRecipientRole(service: ReturnType<typeof createClient>, profileId: string) {
  const { data } = await service.from("user_roles").select("role").eq("user_id", profileId);
  const roles = new Set((data ?? []).map((row) => String(row.role)));
  if (roles.has("admin")) return "admin";
  if (roles.has("manager")) return "manager";
  if (roles.has("leader")) return "leader";
  return "employee";
}

async function buildLeaveRequestMessageAndMarkup(
  service: ReturnType<typeof createClient>,
  payload: SendPayload,
) {
  if (!isLeaveRequestNotification(payload.type)) return null;

  const leaveRequestId =
    payload.entity_type === "leave_request" && payload.entity_id
      ? payload.entity_id
      : getMetadataString(payload.metadata, "leave_request_id");
  if (!leaveRequestId) return null;

  let requesterName = EMPTY_TEXT;
  let teamName = EMPTY_TEXT;
  let startDate = compactDateOnly(getMetadataString(payload.metadata, "start_date"));
  let endDate = compactDateOnly(getMetadataString(payload.metadata, "end_date"));
  let reason = EMPTY_TEXT;
  let sentAt = formatTime();

  const { data } = await service
    .from("leave_requests")
    .select("start_date, end_date, reason, user_id, created_at")
    .eq("id", leaveRequestId)
    .maybeSingle();

  if (data) {
    startDate = compactDateOnly(data.start_date);
    endDate = compactDateOnly(data.end_date);
    reason = valueOrEmpty(data.reason);
    sentAt = compactDate(data.created_at);
    requesterName = await getProfileName(service, data.user_id);
    teamName = await getTeamName(service, { profileId: data.user_id });
  }

  const text = [
    "🏖 Đơn xin nghỉ mới",
    "",
    `👤 Nhân sự: ${requesterName}`,
    `👥 Team: ${teamName}`,
    `📅 Từ ngày: ${startDate}`,
    `📅 Đến ngày: ${endDate}`,
    `📝 Lý do: ${reason}`,
    `⏰ Gửi lúc: ${sentAt}`,
  ].join("\n");

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Duyệt", callback_data: `approve_leave:${leaveRequestId}` },
        { text: "❌ Không duyệt", callback_data: `reject_leave:${leaveRequestId}` },
      ],
      [
        {
          text: "👁 Mở MKTRe",
          url: await routeForProfile(service, payload.recipient_profile_id, "attendance"),
        },
      ],
    ],
  };

  return { text, replyMarkup };
}

async function buildReviewMessageAndMarkup(
  service: ReturnType<typeof createClient>,
  payload: SendPayload,
) {
  if (!isReviewNotification(payload.type)) return null;

  const entityType = payload.entity_type;
  const entityId = payload.entity_id;
  if (!entityType || !entityId || !["task", "task_completion"].includes(entityType)) return null;

  let title = payload.message ?? payload.title;
  let assigneeName = EMPTY_TEXT;
  let teamName = EMPTY_TEXT;
  let itemType = entityType === "task" ? "Task" : "Checklist thường ngày";
  let priority = EMPTY_TEXT;
  let deadline = EMPTY_TEXT;
  let description = EMPTY_TEXT;
  let note = EMPTY_TEXT;
  let proofUrl = "";

  if (entityType === "task") {
    const { data } = await service
      .from("tasks")
      .select(
        "title, description, deadline, completion_note, proof_url, assigned_to, team_id, priority, onboarding_template_id",
      )
      .eq("id", entityId)
      .maybeSingle();
    if (data) {
      title = data.title ?? title;
      deadline = compactDate(data.deadline);
      description = valueOrEmpty(data.description);
      note = valueOrEmpty(data.completion_note);
      proofUrl = data.proof_url ?? "";
      priority = priorityLabel(data.priority);
      itemType = data.onboarding_template_id ? "Onboarding" : "Task";
      assigneeName = await getProfileName(service, data.assigned_to);
      teamName = await getTeamName(service, { teamId: data.team_id, profileId: data.assigned_to });
    }
  } else {
    const { data } = await service
      .from("task_completions")
      .select("completion_date, completion_note, note, proof_url, priority, user_id, template_id")
      .eq("id", entityId)
      .maybeSingle();
    if (data) {
      const { data: template } = await service
        .from("daily_task_templates")
        .select("title, description, team_id")
        .eq("id", data.template_id)
        .maybeSingle();
      title = template?.title ?? title;
      description = valueOrEmpty(template?.description);
      deadline = compactDateOnly(data.completion_date);
      note = valueOrEmpty(data.completion_note ?? data.note);
      proofUrl = data.proof_url ?? "";
      priority = priorityLabel(data.priority);
      assigneeName = await getProfileName(service, data.user_id);
      teamName = await getTeamName(service, { teamId: template?.team_id, profileId: data.user_id });
    }
  }

  const text = [
    "📌 Task/Checklist chờ duyệt",
    "",
    `👤 Người gửi: ${assigneeName}`,
    `👥 Team: ${teamName}`,
    `🧩 Tên việc: ${title}`,
    `🏷 Loại: ${itemType}`,
    `🔥 Ưu tiên: ${priority}`,
    `📅 Deadline: ${deadline}`,
    `📝 Mô tả: ${description}`,
    `🗒 Ghi chú gửi duyệt: ${note}`,
    `🔗 Chứng từ: ${valueOrEmpty(proofUrl)}`,
  ].join("\n");

  const openUrl = await routeForProfile(service, payload.recipient_profile_id, "tasks");
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Duyệt", callback_data: `approve_task:${entityType}:${entityId}` },
        { text: "❌ Không duyệt", callback_data: `reject_task:${entityType}:${entityId}` },
      ],
      [{ text: "👁 Mở MKTRe", url: openUrl }],
    ],
  };

  return { text, replyMarkup };
}

async function buildTaskMessage(service: ReturnType<typeof createClient>, payload: SendPayload) {
  const taskTypes = new Set([
    "task_assigned",
    "task_deadline_due",
    "task_due_soon",
    "task_overdue",
    "employee_task_missing",
    "employee_task_late",
  ]);
  if (payload.entity_type !== "task" || !payload.entity_id || !taskTypes.has(payload.type ?? "")) {
    return null;
  }

  const { data } = await service
    .from("tasks")
    .select(
      "title, description, deadline, completion_note, proof_url, assigned_to, team_id, priority",
    )
    .eq("id", payload.entity_id)
    .maybeSingle();
  if (!data) return null;

  const header =
    payload.type === "task_assigned"
      ? "📌 Nhiệm vụ mới"
      : payload.type === "task_overdue" || payload.type === "employee_task_late"
        ? "🚨 Task quá hạn"
        : "⏰ Nhắc task";

  return [
    header,
    "",
    `👤 Người phụ trách: ${await getProfileName(service, data.assigned_to)}`,
    `👥 Team: ${await getTeamName(service, { teamId: data.team_id, profileId: data.assigned_to })}`,
    `🧩 Tên việc: ${valueOrEmpty(data.title)}`,
    `🔥 Ưu tiên: ${priorityLabel(data.priority)}`,
    `📅 Deadline: ${compactDate(data.deadline)}`,
    `📝 Mô tả: ${valueOrEmpty(data.description)}`,
    `🗒 Ghi chú: ${valueOrEmpty(data.completion_note)}`,
    `🔗 Chứng từ: ${valueOrEmpty(data.proof_url)}`,
  ].join("\n");
}

async function buildReportMessage(service: ReturnType<typeof createClient>, payload: SendPayload) {
  if (payload.entity_type !== "report" && !payload.type?.startsWith("report_")) return null;

  const reportDate = getMetadataString(payload.metadata, "report_date");
  const slotId = payload.entity_id ?? getMetadataString(payload.metadata, "slot_id");
  const slotTimeFromMetadata = getMetadataString(payload.metadata, "slot_time");

  let report: {
    ads_cost: number | null;
    mess_count: number | null;
    data_count: number | null;
    total_revenue: number | null;
    note: string | null;
    report_date: string | null;
    slot_id: string | null;
    user_id: string | null;
    team_id: string | null;
  } | null = null;

  if (payload.entity_id) {
    const byId = await service
      .from("slot_reports")
      .select(
        "ads_cost, mess_count, data_count, total_revenue, note, report_date, slot_id, user_id, team_id",
      )
      .eq("id", payload.entity_id)
      .maybeSingle();
    report = byId.data ?? null;
  }

  if (!report && reportDate && slotId) {
    const bySlot = await service
      .from("slot_reports")
      .select(
        "ads_cost, mess_count, data_count, total_revenue, note, report_date, slot_id, user_id, team_id",
      )
      .eq("user_id", payload.recipient_profile_id)
      .eq("report_date", reportDate)
      .eq("slot_id", slotId)
      .maybeSingle();
    report = bySlot.data ?? null;
  }

  let slotLabel = slotTimeFromMetadata ?? EMPTY_TEXT;
  const slotLookupId = report?.slot_id ?? slotId;
  if (slotLookupId) {
    const { data: slot } = await service
      .from("report_slots")
      .select("slot_name, slot_time")
      .eq("id", slotLookupId)
      .maybeSingle();
    slotLabel = slot?.slot_name ?? formatSlotTime(slot?.slot_time) ?? slotLabel;
  }

  const profileId = report?.user_id ?? payload.recipient_profile_id;
  const teamName = await getTeamName(service, { teamId: report?.team_id, profileId });

  return [
    "📊 Báo cáo",
    "",
    `👤 Nhân sự: ${await getProfileName(service, profileId)}`,
    `👥 Team: ${teamName}`,
    `🕒 Khung giờ: ${valueOrEmpty(slotLabel)}`,
    `📅 Ngày báo cáo: ${compactDateOnly(report?.report_date ?? reportDate)}`,
    `💰 Doanh số: ${formatMetric(report?.total_revenue)}`,
    `💸 Chi phí ads: ${formatMetric(report?.ads_cost)}`,
    `💬 Mess: ${formatMetric(report?.mess_count)}`,
    `📋 Data: ${formatMetric(report?.data_count)}`,
    `📝 Ghi chú: ${valueOrEmpty(report?.note)}`,
  ].join("\n");
}

async function buildReminderMessage(
  service: ReturnType<typeof createClient>,
  payload: SendPayload,
) {
  const reminderTypes = new Set([
    "attendance_reminder",
    "daily_checklist_incomplete",
    "task_due_soon",
    "task_overdue",
    "report_slot_due",
    "report_slot_overdue",
  ]);
  if (!reminderTypes.has(payload.type ?? "")) return null;

  const userId = payload.recipient_profile_id;
  const date =
    getMetadataString(payload.metadata, "date") ??
    getMetadataString(payload.metadata, "attendance_date") ??
    getMetadataString(payload.metadata, "completion_date") ??
    getMetadataString(payload.metadata, "report_date") ??
    new Date().toISOString().slice(0, 10);

  const { data: attendance } = await service
    .from("attendance_records")
    .select("status")
    .eq("user_id", userId)
    .eq("attendance_date", date)
    .maybeSingle();

  const teamId = await getPrimaryTeamIdForProfile(service, userId);
  const templatesQuery = service
    .from("daily_task_templates")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { data: templates } = teamId
    ? await templatesQuery.or(`team_id.eq.${teamId},team_id.is.null`)
    : await templatesQuery.is("team_id", null);

  const templateIds = (templates ?? []).map((template) => template.id);
  const { data: completions } = templateIds.length
    ? await service
        .from("task_completions")
        .select("template_id")
        .eq("user_id", userId)
        .eq("completion_date", date)
        .in("template_id", templateIds)
        .in("status", ["done", "completed"])
    : { data: [] };

  const completedIds = new Set((completions ?? []).map((completion) => completion.template_id));
  const missingTitles = (templates ?? [])
    .filter((template) => !completedIds.has(template.id))
    .map((template) => template.title)
    .slice(0, 5);

  return [
    "⏰ Nhắc việc",
    "",
    `👤 Nhân sự: ${await getProfileName(service, userId)}`,
    `📅 Ngày: ${compactDateOnly(date)}`,
    `✅ Điểm danh: ${attendanceStatusLabel(attendance?.status)}`,
    `📋 Checklist hôm nay: ${completedIds.size}/${templates?.length ?? 0}`,
    `📝 Việc còn thiếu: ${missingTitles.length ? missingTitles.join(", ") : EMPTY_TEXT}`,
  ].join("\n");
}

function buildSummaryMessage(payload: SendPayload) {
  const type = payload.type ?? "";
  const names = getMetadataStringList(payload.metadata, [
    "missing_users",
    "missing_names",
    "employees",
    "employee_names",
    "users",
    "names",
  ]);
  const listText = names.length
    ? names.map((name) => `- ${name}`).join("\n")
    : valueOrEmpty(payload.message);
  const teamName = valueOrEmpty(getMetadataString(payload.metadata, "team_name"));
  const slot = valueOrEmpty(
    getMetadataString(payload.metadata, "slot_time") ?? getMetadataString(payload.metadata, "slot"),
  );
  const date = compactDateOnly(
    getMetadataString(payload.metadata, "report_date") ??
      getMetadataString(payload.metadata, "date") ??
      getMetadataString(payload.metadata, "completion_date"),
  );

  if (type === "report_slot_overdue_summary") {
    return [
      `🚨 Chưa báo cáo khung ${slot}`,
      "",
      `👥 Team: ${teamName}`,
      `📅 Ngày: ${date}`,
      listText,
    ].join("\n");
  }

  if (type === "daily_report_missing_summary") {
    return [
      "🚨 Chưa báo cáo trong ngày",
      "",
      `👥 Team: ${teamName}`,
      `📅 Ngày: ${date}`,
      listText,
    ].join("\n");
  }

  if (type === "daily_checklist_incomplete_summary") {
    return [
      "🚨 Chưa hoàn thành checklist/task hôm nay",
      "",
      `👥 Team: ${teamName}`,
      `📅 Ngày: ${date}`,
      listText,
    ].join("\n");
  }

  return null;
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
        .select(
          "target_profile_id, user_id, actor_profile_id, created_by, entity_type, entity_id, type, kind",
        )
        .eq("id", payload.notification_id)
        .maybeSingle();
      payload.entity_type ??= notification?.entity_type ?? null;
      payload.entity_id ??= notification?.entity_id ?? null;
      payload.type = canonicalTelegramType(
        payload.type ?? notification?.type ?? notification?.kind,
        payload.entity_type,
      );
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

    payload.type = canonicalTelegramType(payload.type, payload.entity_type);
    const recipientRole = await getRecipientRole(service, payload.recipient_profile_id);
    if (!shouldSendTelegramNotification(recipientRole, payload.type)) {
      await log("skipped", `Telegram disabled for ${recipientRole}:${payload.type ?? "unknown"}`);
      return Response.json(
        { ok: true, status: "skipped", reason: "role_scope" },
        { headers: corsHeaders },
      );
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

    const interactiveMessage =
      (await buildLeaveRequestMessageAndMarkup(service, payload)) ??
      (await buildReviewMessageAndMarkup(service, payload));
    const enrichedText =
      interactiveMessage?.text ??
      buildSummaryMessage(payload) ??
      (await buildTaskMessage(service, payload)) ??
      (await buildReportMessage(service, payload)) ??
      (await buildReminderMessage(service, payload));
    const text =
      enrichedText ??
      [
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

    await sendTelegramMessage(account.telegram_chat_id, text, interactiveMessage?.replyMarkup);
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
