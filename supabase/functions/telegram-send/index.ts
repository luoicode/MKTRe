/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

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
  onboarding_pending_review: "Chờ duyệt onboarding",
  onboarding_rejected: "Yêu cầu làm lại onboarding",
  onboarding_review: "Chờ duyệt onboarding",
  onboarding_review_pending: "Chờ duyệt onboarding",
  report_missing_summary: "Tổng hợp chưa báo cáo",
  report_reminder: "Nhắc báo cáo",
  report_slot_due: "Sắp đến giờ báo cáo",
  report_slot_missing_summary: "Tổng hợp chưa báo cáo",
  report_slot_overdue: "Quá giờ báo cáo",
  report_slot_submitted_summary: "Tổng hợp đã báo cáo",
  report_slot_summary: "Tổng hợp báo cáo",
  task_approved: "Task đã duyệt",
  task_assigned: "Nhiệm vụ mới",
  task_deadline_due: "Task sắp đến hạn",
  task_due_soon: "Task sắp đến hạn",
  task_overdue: "Task quá hạn",
  task_pending_review: "Task chờ duyệt",
  checklist_pending_review: "Checklist chờ duyệt",
  task_completion_pending_review: "Checklist chờ duyệt",
  task_rejected: "Task cần làm lại",
  task_review: "Chờ duyệt task",
};

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

type IdRow = {
  id: string;
};

type RoleRow = {
  role: string;
};

type ProfileNameRow = {
  full_name: string | null;
  username: string | null;
};

type TeamNameRow = {
  name: string | null;
};

type TeamMembershipRow = {
  team_id: string | null;
};

type LeaveRequestRow = {
  start_date: string;
  end_date: string;
  leave_type?: string | null;
  reason: string | null;
  user_id: string;
  created_at: string;
};

type TaskRow = {
  title: string | null;
  description: string | null;
  deadline: string | null;
  completion_note: string | null;
  proof_url: string | null;
  assigned_to: string | null;
  team_id: string | null;
  priority: string | null;
  onboarding_template_id?: string | null;
};

type TaskCompletionRow = {
  completion_date: string | null;
  completion_note: string | null;
  note: string | null;
  proof_url: string | null;
  priority: string | null;
  user_id: string | null;
  template_id: string | null;
};

type DailyTaskTemplateRow = {
  id?: string;
  title: string | null;
  description?: string | null;
  team_id?: string | null;
};

type OnboardingAnswerRow = {
  profile_id: string | null;
  section_id: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  review_note: string | null;
};

type OnboardingSectionRow = {
  title: string | null;
  description: string | null;
};

type ReportSlotRow = {
  slot_name: string | null;
  slot_time: string | null;
};

type AttendanceStatusRow = {
  status: string | null;
};

type NotificationLookupRow = {
  target_profile_id: string | null;
  user_id: string | null;
  actor_profile_id: string | null;
  created_by: string | null;
  entity_type: string | null;
  entity_id: string | null;
  type: string | null;
  kind: string | null;
  metadata: Record<string, unknown> | null;
};

type TelegramAccountRow = {
  telegram_chat_id: string | null;
};

const EMPTY_TEXT = "Không có";
const ADMIN_MANAGER_TELEGRAM_TYPES = new Set([
  "leave_request_created",
  "onboarding_pending_review",
  "onboarding_review",
  "onboarding_review_pending",
  "task_pending_review",
  "checklist_pending_review",
]);

const PERSONAL_TELEGRAM_TYPES = new Set([
  "announcement",
  "leave_request_approved",
  "leave_request_rejected",
  "task_approved",
  "task_rejected",
  "checklist_approved",
  "checklist_rejected",
  "task_assigned",
]);

const LEADER_REVIEW_TELEGRAM_TYPES = new Set([
  "onboarding_pending_review",
  "onboarding_review",
  "onboarding_review_pending",
  "task_pending_review",
  "checklist_pending_review",
]);

function canonicalTelegramType(
  type: string | null | undefined,
  entityType: string | null | undefined,
) {
  if (type === "task_review") {
    return entityType === "task_completion" ? "checklist_pending_review" : "task_pending_review";
  }
  if (type === "task_completion_pending_review") return "checklist_pending_review";
  if (type === "task_approved" && entityType === "task_completion") return "checklist_approved";
  if (type === "task_rejected" && entityType === "task_completion") return "checklist_rejected";
  return type ?? null;
}

function shouldSendTelegramNotification(
  role: string | null | undefined,
  notificationType: string | null | undefined,
  metadata?: Record<string, unknown> | null,
) {
  const normalizedRole = String(role ?? "").toLowerCase();
  const normalizedType = String(notificationType ?? "");
  if (!normalizedType) return false;
  const recipientMode = String(metadata?.recipient_mode ?? metadata?.audience_type ?? "");
  if (normalizedType === "announcement" && recipientMode === "all_users") return false;
  if (normalizedRole === "admin" || normalizedRole === "manager") {
    return ADMIN_MANAGER_TELEGRAM_TYPES.has(normalizedType);
  }
  if (normalizedRole === "leader" && LEADER_REVIEW_TELEGRAM_TYPES.has(normalizedType)) return true;
  return PERSONAL_TELEGRAM_TYPES.has(normalizedType);
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

  const responseBody = await response.text();
  console.log("[telegram-send][telegram_api_response]", {
    chatId,
    status: response.status,
    ok: response.ok,
    body: responseBody.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${response.status}: ${responseBody}`);
  }
}

function getMetadataProfileIds(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return [];
  const keys = [
    "requester_id",
    "submitter_id",
    "assignee_id",
    "assigned_to",
    "assigned_user_id",
    "employee_id",
    "profile_id",
    "user_id",
  ];
  return keys
    .map((key) => metadata[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function isReviewNotification(type: string | null | undefined) {
  return [
    "task_review",
    "task_pending_review",
    "checklist_pending_review",
    "task_completion_pending_review",
    "onboarding_pending_review",
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

function leaveTypeLabel(value: string | null | undefined) {
  if (value === "half_day") return "Nghỉ nửa ngày";
  if (value === "early_leave") return "Về sớm";
  if (value === "late_arrival") return "Đến muộn";
  return "Nghỉ cả ngày";
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
  const profile = data as ProfileNameRow | null;
  return profile?.full_name ?? profile?.username ?? EMPTY_TEXT;
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
    const team = data as TeamNameRow | null;
    if (team?.name) return team.name;
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
  const membership = data as TeamMembershipRow | null;
  if (!membership?.team_id) return EMPTY_TEXT;

  const { data: team } = await service
    .from("teams")
    .select("name")
    .eq("id", membership.team_id)
    .maybeSingle();
  const teamRow = team as TeamNameRow | null;
  return teamRow?.name ?? EMPTY_TEXT;
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
  const membership = data as TeamMembershipRow | null;
  return membership?.team_id ?? null;
}

async function routeForProfile(
  service: ReturnType<typeof createClient>,
  profileId: string,
  page: "attendance" | "tasks",
) {
  const { data } = await service.from("user_roles").select("role").eq("user_id", profileId);
  const roleRows = (data ?? []) as RoleRow[];
  const roles = new Set(roleRows.map((row: RoleRow) => String(row.role)));
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
  const roleRows = (data ?? []) as RoleRow[];
  const roles = new Set(roleRows.map((row: RoleRow) => String(row.role)));
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
  let leaveType = leaveTypeLabel(getMetadataString(payload.metadata, "leave_type"));
  let reason = EMPTY_TEXT;
  let sentAt = formatTime();

  const { data } = await service
    .from("leave_requests")
    .select("start_date, end_date, leave_type, reason, user_id, created_at")
    .eq("id", leaveRequestId)
    .maybeSingle();

  const leaveRequest = data as LeaveRequestRow | null;
  if (leaveRequest) {
    startDate = compactDateOnly(leaveRequest.start_date);
    endDate = compactDateOnly(leaveRequest.end_date);
    leaveType = leaveTypeLabel(leaveRequest.leave_type);
    reason = valueOrEmpty(leaveRequest.reason);
    sentAt = compactDate(leaveRequest.created_at);
    requesterName = await getProfileName(service, leaveRequest.user_id);
    teamName = await getTeamName(service, { profileId: leaveRequest.user_id });
  }

  const text = [
    "🏖 Đơn xin nghỉ mới",
    "",
    `👤 Nhân sự: ${requesterName}`,
    `👥 Team: ${teamName}`,
    `🏷 Loại đơn: ${leaveType}`,
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
  if (
    !entityType ||
    !entityId ||
    !["task", "task_completion", "onboarding_answer"].includes(entityType)
  )
    return null;

  let title = payload.message ?? payload.title;
  let assigneeName = EMPTY_TEXT;
  let teamName = EMPTY_TEXT;
  let itemType = entityType === "task" ? "Task" : "Checklist thường ngày";
  let priority = EMPTY_TEXT;
  let deadline = EMPTY_TEXT;
  let description = EMPTY_TEXT;
  let note = EMPTY_TEXT;
  let proofUrl = "";

  if (entityType === "onboarding_answer") {
    itemType = "Onboarding";
    const { data } = await service
      .from("onboarding_answers")
      .select("profile_id, section_id, submitted_at, completed_at, review_note")
      .eq("id", entityId)
      .maybeSingle();
    const answer = data as OnboardingAnswerRow | null;
    if (answer) {
      const { data: section } = answer.section_id
        ? await service
            .from("onboarding_sections")
            .select("title, description")
            .eq("id", answer.section_id)
            .maybeSingle()
        : { data: null };
      const sectionRow = section as OnboardingSectionRow | null;
      title = sectionRow?.title ?? getMetadataString(payload.metadata, "section_title") ?? title;
      description = valueOrEmpty(
        sectionRow?.description ?? getMetadataString(payload.metadata, "section_description"),
      );
      deadline = compactDate(answer.submitted_at ?? answer.completed_at);
      note = valueOrEmpty(answer.review_note ?? getMetadataString(payload.metadata, "note"));
      priority = EMPTY_TEXT;
      assigneeName = await getProfileName(service, answer.profile_id);
      teamName = await getTeamName(service, { profileId: answer.profile_id });
    }
  } else if (entityType === "task") {
    const { data } = await service
      .from("tasks")
      .select(
        "title, description, deadline, completion_note, proof_url, assigned_to, team_id, priority, onboarding_template_id",
      )
      .eq("id", entityId)
      .maybeSingle();
    const task = data as TaskRow | null;
    if (task) {
      title = task.title ?? title;
      deadline = compactDate(task.deadline);
      description = valueOrEmpty(task.description);
      note = valueOrEmpty(task.completion_note);
      proofUrl = task.proof_url ?? "";
      priority = priorityLabel(task.priority);
      itemType = task.onboarding_template_id ? "Onboarding" : "Task";
      assigneeName = await getProfileName(service, task.assigned_to);
      teamName = await getTeamName(service, { teamId: task.team_id, profileId: task.assigned_to });
    }
  } else {
    const { data } = await service
      .from("task_completions")
      .select("completion_date, completion_note, note, proof_url, priority, user_id, template_id")
      .eq("id", entityId)
      .maybeSingle();
    const completion = data as TaskCompletionRow | null;
    if (completion) {
      const { data: template } = await service
        .from("daily_task_templates")
        .select("title, description, team_id")
        .eq("id", completion.template_id)
        .maybeSingle();
      const templateRow = template as DailyTaskTemplateRow | null;
      title = templateRow?.title ?? title;
      description = valueOrEmpty(templateRow?.description);
      deadline = compactDateOnly(completion.completion_date);
      note = valueOrEmpty(completion.completion_note ?? completion.note);
      proofUrl = completion.proof_url ?? "";
      priority = priorityLabel(completion.priority);
      assigneeName = await getProfileName(service, completion.user_id);
      teamName = await getTeamName(service, {
        teamId: templateRow?.team_id,
        profileId: completion.user_id,
      });
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
  const task = data as TaskRow;

  const header =
    payload.type === "task_assigned"
      ? "📌 Nhiệm vụ mới"
      : payload.type === "task_overdue" || payload.type === "employee_task_late"
        ? "🚨 Task quá hạn"
        : "⏰ Nhắc task";

  return [
    header,
    "",
    `👤 Người phụ trách: ${await getProfileName(service, task.assigned_to)}`,
    `👥 Team: ${await getTeamName(service, { teamId: task.team_id, profileId: task.assigned_to })}`,
    `🧩 Tên việc: ${valueOrEmpty(task.title)}`,
    `🔥 Ưu tiên: ${priorityLabel(task.priority)}`,
    `📅 Deadline: ${compactDate(task.deadline)}`,
    `📝 Mô tả: ${valueOrEmpty(task.description)}`,
    `🗒 Ghi chú: ${valueOrEmpty(task.completion_note)}`,
    `🔗 Chứng từ: ${valueOrEmpty(task.proof_url)}`,
  ].join("\n");
}

async function buildReportMessage(service: ReturnType<typeof createClient>, payload: SendPayload) {
  const type = payload.type ?? "";
  if (!["report_reminder", "report_slot_due", "report_slot_overdue"].includes(type)) return null;

  let slotLabel =
    getMetadataString(payload.metadata, "slot_time") ??
    getMetadataString(payload.metadata, "slot") ??
    "chưa xác định";
  const slotLookupId = payload.entity_id ?? getMetadataString(payload.metadata, "slot_id");
  if (slotLookupId) {
    const { data: slot } = await service
      .from("report_slots")
      .select("slot_name, slot_time")
      .eq("id", slotLookupId)
      .maybeSingle();
    const slotRow = slot as ReportSlotRow | null;
    slotLabel =
      slotRow?.slot_name ?? (slotRow?.slot_time ? formatSlotTime(slotRow.slot_time) : slotLabel);
  }

  if (type === "report_slot_overdue") {
    return [
      "🚨 Bạn đã quá giờ báo cáo",
      "",
      `Khung giờ: ${slotLabel}`,
      "Vui lòng gửi báo cáo ngay trong thời gian cho phép.",
    ].join("\n");
  }

  return [
    "⏰ Sắp đến giờ báo cáo",
    "",
    `Khung giờ: ${slotLabel}`,
    "Vui lòng chuẩn bị gửi báo cáo đúng giờ.",
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

  const templateRows = (templates ?? []) as DailyTaskTemplateRow[];
  const templateIds = templateRows
    .map((template: DailyTaskTemplateRow) => template.id)
    .filter((id): id is string => Boolean(id));
  const { data: completions } = templateIds.length
    ? await service
        .from("task_completions")
        .select("template_id")
        .eq("user_id", userId)
        .eq("completion_date", date)
        .in("template_id", templateIds)
        .in("status", ["done", "completed"])
    : { data: [] };

  const completionRows = (completions ?? []) as Array<{ template_id: string }>;
  const completedIds = new Set(completionRows.map((completion) => completion.template_id));
  const missingTitles = templateRows
    .filter((template: DailyTaskTemplateRow) => !template.id || !completedIds.has(template.id))
    .map((template: DailyTaskTemplateRow) => template.title ?? EMPTY_TEXT)
    .slice(0, 5);
  const attendanceRow = attendance as AttendanceStatusRow | null;

  return [
    "⏰ Nhắc việc",
    "",
    `👤 Nhân sự: ${await getProfileName(service, userId)}`,
    `📅 Ngày: ${compactDateOnly(date)}`,
    `✅ Điểm danh: ${attendanceStatusLabel(attendanceRow?.status)}`,
    `📋 Checklist hôm nay: ${completedIds.size}/${templateRows.length}`,
    `📝 Việc còn thiếu: ${missingTitles.length ? missingTitles.join(", ") : EMPTY_TEXT}`,
  ].join("\n");
}

function buildSummaryMessage(payload: SendPayload) {
  const type = payload.type ?? "";
  const isSubmittedSummary =
    type === "report_slot_submitted_summary" || type === "report_slot_summary";
  const isMissingSummary =
    type === "report_slot_missing_summary" ||
    type === "report_slot_overdue_summary" ||
    type === "daily_report_missing_summary";
  const isChecklistSummary = type === "daily_checklist_incomplete_summary";

  const names = getMetadataStringList(
    payload.metadata,
    isSubmittedSummary
      ? ["submitted_users", "submitted_names", "employees", "employee_names", "users", "names"]
      : ["missing_users", "missing_names", "employees", "employee_names", "users", "names"],
  );
  const listText = names.length
    ? names.map((name) => `- ${name}`).join("\n")
    : valueOrEmpty(payload.message) === EMPTY_TEXT
      ? "Chưa có dữ liệu"
      : valueOrEmpty(payload.message);
  const slot =
    getMetadataString(payload.metadata, "slot_time") ??
    getMetadataString(payload.metadata, "slot") ??
    "chưa xác định";

  if (isSubmittedSummary) {
    return [`📊 Báo cáo khung ${slot}`, "", "Đã báo cáo:", listText].join("\n");
  }

  if (isMissingSummary) {
    const title =
      type === "daily_report_missing_summary"
        ? "🚨 Chưa báo cáo trong ngày"
        : `🚨 Chưa báo cáo khung ${slot}`;
    return [title, "", "Chưa báo cáo:", listText].join("\n");
  }

  if (isChecklistSummary) {
    return ["🚨 Chưa hoàn thành checklist/task hôm nay", "", listText].join("\n");
  }

  return null;
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
      const previousLogRows = (previousLog ?? []) as IdRow[];
      if (previousLogRows.length) {
        await log("skipped", "Duplicate sent notification");
        return Response.json(
          { ok: true, status: "skipped", reason: "duplicate" },
          { headers: corsHeaders },
        );
      }

      const { data: notification } = await service
        .from("notifications")
        .select(
          "target_profile_id, user_id, actor_profile_id, created_by, entity_type, entity_id, type, kind, metadata",
        )
        .eq("id", payload.notification_id)
        .maybeSingle();
      const notificationRow = notification as NotificationLookupRow | null;
      payload.entity_type ??= notificationRow?.entity_type ?? null;
      payload.entity_id ??= notificationRow?.entity_id ?? null;
      payload.metadata ??= notificationRow?.metadata ?? null;
      payload.type = canonicalTelegramType(
        payload.type ?? notificationRow?.type ?? notificationRow?.kind,
        payload.entity_type,
      );
      const targetId = notificationRow?.target_profile_id ?? notificationRow?.user_id;
      const metadataProfileIds = getMetadataProfileIds(notificationRow?.metadata);
      const canSend =
        targetId === payload.recipient_profile_id &&
        [
          notificationRow?.actor_profile_id,
          notificationRow?.created_by,
          notificationRow?.target_profile_id,
          notificationRow?.user_id,
          ...metadataProfileIds,
        ].includes(callerProfile.id);
      if (!canSend) {
        await log(
          "failed",
          `Forbidden dispatch by ${callerProfile.id} for notification ${payload.notification_id}`,
        );
        console.warn("[telegram-send][forbidden]", {
          notificationId: payload.notification_id,
          callerProfileId: callerProfile.id,
          recipientProfileId: payload.recipient_profile_id,
          targetId,
          type: payload.type,
          entityType: payload.entity_type,
          entityId: payload.entity_id,
          metadataProfileIds,
        });
        return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
      }
    } else if (payload.recipient_profile_id !== callerProfile.id) {
      const { data: roles } = await service
        .from("user_roles")
        .select("role")
        .eq("user_id", callerProfile.id);
      const roleRows = (roles ?? []) as RoleRow[];
      const canSendByRole = roleRows.some((row: RoleRow) =>
        ["admin", "manager", "leader"].includes(String(row.role)),
      );
      const canSendOwnLeaveRequest =
        payload.type === "leave_request_created" &&
        payload.metadata?.requester_id === callerProfile.id;
      const canSendDirect = canSendByRole || canSendOwnLeaveRequest;
      if (!canSendDirect) {
        await log(
          "failed",
          `Forbidden direct dispatch by ${callerProfile.id} for ${payload.type ?? "unknown"}`,
        );
        return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
      }
    }

    payload.type = canonicalTelegramType(payload.type, payload.entity_type);
    console.log("[telegram-send][dispatch]", {
      notificationId: payload.notification_id ?? null,
      recipientProfileId: payload.recipient_profile_id,
      type: payload.type,
      entityType: payload.entity_type ?? null,
      entityId: payload.entity_id ?? null,
    });
    const recipientRole = await getRecipientRole(service, payload.recipient_profile_id);
    if (!shouldSendTelegramNotification(recipientRole, payload.type, payload.metadata)) {
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
      const previousDedupeRows = (previousDedupe ?? []) as IdRow[];
      if (previousDedupeRows.length) {
        await log("skipped", "Duplicate dedupe key");
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
    const accountRow = account as TelegramAccountRow | null;
    if (!accountRow?.telegram_chat_id) {
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

    await sendTelegramMessage(accountRow.telegram_chat_id, text, interactiveMessage?.replyMarkup);
    await log("sent", null, accountRow.telegram_chat_id);
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
