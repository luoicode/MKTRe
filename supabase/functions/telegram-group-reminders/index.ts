/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "tick"
  | "report_due"
  | "report_missing"
  | "checklist_morning"
  | "checklist_afternoon"
  | "checklist_overdue_summary"
  | "announcement";

type Payload = {
  action: Action;
  slot_time?: string | null;
  title?: string | null;
  message?: string | null;
  actor_profile_id?: string | null;
  batch_id?: string | null;
  action_url?: string | null;
};

type DebugContext = {
  mode: string | null;
  step: string;
};

type OperationalUser = {
  id: string;
  full_name: string | null;
  username: string | null;
  teamIds: string[];
};

type IdRow = {
  id: string;
};

type UserRoleRow = {
  user_id: string;
  role: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  status: string | null;
};

type TeamMembershipRow = {
  user_id: string;
  team_id: string | null;
  role_in_team: string | null;
};

type ReportSlotRow = {
  id: string;
  slot_name: string | null;
  slot_time: string | null;
};

type AttendanceUserRow = {
  user_id: string;
};

type SlotReportUserRow = {
  user_id: string;
};

type DailyTaskTemplateRow = {
  id: string;
  team_id: string | null;
};

type TaskCompletionRow = {
  template_id: string;
  user_id: string;
  completed: boolean | null;
  status: string | null;
};

type TaskDeadlineRow = {
  assigned_to: string | null;
  status: string | null;
};

type AdminProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

type RoleOnlyRow = {
  role: string;
};

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  if (error && typeof error === "object") {
    const maybeError = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof maybeError.name === "string" ? maybeError.name : "NonErrorObject",
      message:
        typeof maybeError.message === "string"
          ? maybeError.message
          : JSON.stringify(error, null, 2),
      stack: typeof maybeError.stack === "string" ? maybeError.stack : null,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
  };
}

function logError(ctx: DebugContext, error: unknown, extra?: Record<string, unknown>) {
  console.error("[telegram-group-reminders][error]", {
    ...errorDetails(error),
    mode: ctx.mode,
    step: ctx.step,
    currentVNTime: nowVNParts(),
    ...extra,
  });
}

async function runStep<T>(ctx: DebugContext, step: string, fn: () => Promise<T>) {
  const previousStep = ctx.step;
  ctx.step = step;
  try {
    const result = await fn();
    ctx.step = previousStep;
    return result;
  } catch (error) {
    logError(ctx, error);
    throw error;
  }
}

function getGroupChatId() {
  return env("TELEGRAM_MARKETING_GROUP_CHAT_ID") || "-5105123838";
}

function todayVN() {
  return dateKeyVN(new Date());
}

function nowVNParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    minute: `${part("hour")}:${part("minute")}`,
  };
}

function dateKeyVN(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setDate(date.getDate() + days);
  return dateKeyVN(date);
}

function formatDateTimeVN(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSlot(value: string | null | undefined) {
  if (!value) return "chưa xác định";
  const trimmed = value.slice(0, 5);
  return trimmed.replace(":", "h");
}

function normalizeSlotTime(slot: string) {
  const normalized = slot.trim().toLowerCase().replace("h", ":");
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`Invalid slot time: ${slot}`);

  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  const second = match[3] ?? "00";
  return `${hour}:${minute}:${second}`;
}

function nameOf(user: Pick<OperationalUser, "full_name" | "username">) {
  return user.full_name?.trim() || user.username?.trim() || "Nhân sự";
}

function listNames(users: OperationalUser[]) {
  return users.map((user) => `- ${nameOf(user)}`).join("\n");
}

async function telegramApi(ctx: DebugContext, method: string, body: Record<string, unknown>) {
  const token = await runStep(ctx, "read secrets TELEGRAM_BOT_TOKEN", async () => {
    const value = env("TELEGRAM_BOT_TOKEN");
    if (!value) throw new Error("Missing TELEGRAM_BOT_TOKEN");
    return value;
  });

  await runStep(ctx, `send Telegram API:${method}`, async () => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[telegram-group-reminders][telegram-api-failed]", {
        status: response.status,
        body: errorText,
        mode: ctx.mode,
        step: ctx.step,
        currentVNTime: nowVNParts(),
      });
      throw new Error(`Telegram API ${response.status}: ${errorText.slice(0, 500)}`);
    }
  });
}

async function sendGroupTelegramMessage(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  text: string,
  reminderType: string,
  reminderKey: string,
) {
  const chatId = await runStep(ctx, "read secrets TELEGRAM_MARKETING_GROUP_CHAT_ID", async () =>
    getGroupChatId(),
  );
  if (!chatId) {
    console.log("[group-reminder] skipped: missing_group_chat_id", { reminderType, reminderKey });
    await logGroupReminder(
      ctx,
      service,
      "skipped",
      reminderType,
      reminderKey,
      null,
      "Missing group chat id",
    );
    await logTelegram(ctx, service, "skipped", reminderKey, null, "Missing group chat id");
    return { status: "skipped" as const };
  }

  const { data: previous } = await runStep(ctx, "query group_reminder_logs dedupe", async () =>
    service
      .from("group_reminder_logs")
      .select("id")
      .eq("reminder_key", reminderKey)
      .eq("status", "sent")
      .limit(1),
  );
  const previousRows = (previous ?? []) as IdRow[];
  if (previousRows.length) {
    console.log("[group-reminder] skipped: already_sent", { reminderType, reminderKey });
    return { status: "skipped" as const, reason: "already_sent" };
  }

  try {
    await telegramApi(ctx, "sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    console.log("[group-reminder] sent", { reminderType, reminderKey, chatId });
    await logGroupReminder(ctx, service, "sent", reminderType, reminderKey, chatId, null);
    await logTelegram(ctx, service, "sent", reminderKey, chatId, null);
    return { status: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log("[group-reminder] failed", { reminderType, reminderKey, error: message });
    await logGroupReminder(ctx, service, "failed", reminderType, reminderKey, chatId, message);
    await logTelegram(ctx, service, "failed", reminderKey, chatId, message);
    throw error;
  }
}

async function logGroupReminder(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  status: "sent" | "failed" | "skipped",
  reminderType: string,
  reminderKey: string,
  chatId: string | null,
  error: string | null,
) {
  await runStep(ctx, "insert group_reminder_logs", async () => {
    const { error: insertError } = await service.from("group_reminder_logs").insert({
      reminder_type: reminderType,
      reminder_key: reminderKey,
      telegram_chat_id: chatId,
      status,
      error,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
    if (insertError) throw insertError;
  });
}

async function logTelegram(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  status: "sent" | "failed" | "skipped",
  dedupeKey: string,
  chatId: string | null,
  error: string | null,
) {
  await runStep(ctx, "insert telegram_notification_logs", async () => {
    const { error: insertError } = await service.from("telegram_notification_logs").insert({
      notification_id: null,
      recipient_profile_id: null,
      telegram_chat_id: chatId,
      status,
      error,
      dedupe_key: dedupeKey,
    });
    if (insertError) throw insertError;
  });
}

async function getOperationalUsers(ctx: DebugContext, service: ReturnType<typeof createClient>) {
  const [
    { data: roles, error: rolesError },
    { data: profiles, error: profilesError },
    { data: memberships, error: membershipsError },
  ] = await runStep(ctx, "query profiles", async () =>
    Promise.all([
      service.from("user_roles").select("user_id, role"),
      service.from("profiles").select("id, full_name, username, status").eq("status", "active"),
      service
        .from("team_memberships")
        .select("user_id, team_id, role_in_team")
        .eq("is_active", true)
        .eq("role_in_team", "employee"),
    ]),
  );
  if (rolesError) throw rolesError;
  if (profilesError) throw profilesError;
  if (membershipsError) throw membershipsError;

  const roleMap = new Map<string, Set<string>>();
  const roleRows = (roles ?? []) as UserRoleRow[];
  const profileRows = (profiles ?? []) as ProfileRow[];
  const membershipRows = (memberships ?? []) as TeamMembershipRow[];

  for (const row of roleRows) {
    const set = roleMap.get(row.user_id) ?? new Set<string>();
    set.add(String(row.role));
    roleMap.set(row.user_id, set);
  }

  const employeeMembershipIds = new Set(membershipRows.map((membership) => membership.user_id));
  const employeeIds = new Set<string>();
  for (const [userId, set] of roleMap.entries()) {
    const hasEmployeeRole = set.has("employee");
    const hasExcludedRole = set.has("admin") || set.has("manager");
    const hasNonEmployeeOperationalRole = set.has("leader");
    if (
      hasEmployeeRole &&
      employeeMembershipIds.has(userId) &&
      !hasExcludedRole &&
      !hasNonEmployeeOperationalRole
    ) {
      employeeIds.add(userId);
    }
  }

  const teamMap = new Map<string, string[]>();
  for (const membership of membershipRows) {
    if (!employeeIds.has(membership.user_id)) continue;
    const list = teamMap.get(membership.user_id) ?? [];
    if (membership.team_id) list.push(membership.team_id);
    teamMap.set(membership.user_id, list);
  }

  console.log("[group-reminder] employeeScopeUsers:", employeeIds.size);

  return profileRows
    .filter((profile: ProfileRow) => employeeIds.has(profile.id))
    .map((profile: ProfileRow) => ({
      id: profile.id,
      full_name: profile.full_name,
      username: profile.username,
      teamIds: teamMap.get(profile.id) ?? [],
    })) satisfies OperationalUser[];
}

async function getReportSlot(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  slotTime?: string | null,
) {
  let query = service
    .from("report_slots")
    .select("id, slot_name, slot_time")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (slotTime) query = query.eq("slot_time", normalizeSlotTime(slotTime));
  const { data, error } = await runStep(ctx, "query reports slot", async () =>
    query.limit(1).maybeSingle(),
  );
  if (error) throw error;
  if (!data) throw new Error(`Report slot not found: ${slotTime ?? "unknown"}`);
  return data as ReportSlotRow;
}

async function getApprovedLeaveUserIds(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  userIds: string[],
  dateKey: string,
) {
  if (!userIds.length) return new Set<string>();
  const { data, error } = await runStep(ctx, "query attendance approved leave", async () =>
    service
      .from("attendance_records")
      .select("user_id")
      .in("user_id", userIds)
      .eq("attendance_date", dateKey)
      .eq("status", "approved_leave"),
  );
  if (error) throw error;
  const rows = (data ?? []) as AttendanceUserRow[];
  return new Set(rows.map((row: AttendanceUserRow) => row.user_id));
}

function reminderKey(type: string, ...parts: Array<string | null | undefined>) {
  return [type, ...parts.filter(Boolean)].join("_");
}

async function sendReportDue(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  slotTime?: string | null,
  options: { test?: boolean } = {},
) {
  const slot = await getReportSlot(ctx, service, slotTime);
  const today = todayVN();
  const slotLabel = slot.slot_name ?? formatSlot(slot.slot_time);
  const type = options.test ? "test_report_due" : "report_due";
  const key = reminderKey(type, formatSlot(slot.slot_time), today);
  console.log("[group-reminder] matched: report_due", { slot: slotLabel, reminderKey: key });
  return sendGroupTelegramMessage(
    ctx,
    service,
    [
      "📊 Đến giờ báo cáo",
      `Khung giờ: ${slotLabel}`,
      "",
      "Hoàn thành báo cáo đúng giờ trên Workspace MIZ.",
    ].join("\n"),
    type,
    key,
  );
}

async function sendReportMissing(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  slotTime?: string | null,
  options: { test?: boolean } = {},
) {
  const slot = await getReportSlot(ctx, service, slotTime);
  const today = todayVN();
  const reportDate = formatSlot(slot.slot_time) === "13h55" ? addDays(today, -1) : today;
  const users = await getOperationalUsers(ctx, service);
  const userIds = users.map((user) => user.id);
  const leaveUserIds = await getApprovedLeaveUserIds(ctx, service, userIds, today);
  const expectedUsers = users.filter((user) => !leaveUserIds.has(user.id));

  const { data: reports, error } = expectedUsers.length
    ? await runStep(ctx, "query reports submitted users", async () =>
        service
          .from("slot_reports")
          .select("user_id")
          .eq("slot_id", slot.id)
          .eq("report_date", reportDate)
          .in(
            "user_id",
            expectedUsers.map((user: OperationalUser) => user.id),
          )
          .in("status", ["submitted", "approved"]),
      )
    : { data: [], error: null };
  if (error) throw error;

  const reportRows = (reports ?? []) as SlotReportUserRow[];
  const submittedIds = new Set(reportRows.map((report: SlotReportUserRow) => report.user_id));
  const missing = expectedUsers.filter((user) => !submittedIds.has(user.id));
  console.log("[group-reminder] pendingReports:", missing.length, {
    slot: slot.slot_name ?? formatSlot(slot.slot_time),
    reportDate,
  });
  if (!missing.length) {
    console.log("[group-reminder] skipped: no_missing_report");
    return { status: "skipped" as const, reason: "no_missing_report" };
  }

  const slotLabel = slot.slot_name ?? formatSlot(slot.slot_time);
  const type = options.test ? "test_report_missing" : "report_missing";
  const key = reminderKey(type, formatSlot(slot.slot_time), today);
  return sendGroupTelegramMessage(
    ctx,
    service,
    [
      "⚠️ Chưa báo cáo đúng giờ",
      "",
      `Khung giờ: ${slotLabel}`,
      "",
      "Các nhân sự chưa báo cáo:",
      listNames(missing),
      "",
      "Vui lòng hoàn thành ngay trên MKTRe.",
    ].join("\n"),
    type,
    key,
  );
}

async function sendChecklistReminder(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  variant: "morning" | "afternoon",
  options: { test?: boolean } = {},
) {
  const today = todayVN();
  const type = `${options.test ? "test_" : ""}checklist_${variant}`;
  const key = reminderKey(type, today);
  console.log(`[group-reminder] matched: checklist_${variant}`, { reminderKey: key });
  const text =
    variant === "morning"
      ? ["📝 Checklist đầu ngày", "", "Hãy hoàn thành checklist daily/task trên Workspace MIZ"]
      : [
          "📝 Checklist buổi chiều",
          "",
          "Nhân sự hãy kiểm tra lại checklist/task daily và hoàn thành các task còn thiếu.",
        ];
  return sendGroupTelegramMessage(ctx, service, text.join("\n"), type, key);
}

async function getChecklistIncompleteUsers(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  users: OperationalUser[],
  dateKey: string,
) {
  const { data: templates, error: templatesError } = await runStep(
    ctx,
    "query checklist templates",
    async () => service.from("daily_task_templates").select("id, team_id").eq("is_active", true),
  );
  if (templatesError) throw templatesError;
  const templateRows = (templates ?? []) as DailyTaskTemplateRow[];
  if (!templateRows.length) return [];

  const templateIds = templateRows.map((template: DailyTaskTemplateRow) => template.id);
  const { data: completions, error: completionsError } = await runStep(
    ctx,
    "query checklist completions",
    async () =>
      service
        .from("task_completions")
        .select("template_id, user_id, completed, status")
        .eq("completion_date", dateKey)
        .in("template_id", templateIds),
  );
  if (completionsError) throw completionsError;

  const completionRows = (completions ?? []) as TaskCompletionRow[];
  const completionKeys = new Set(
    completionRows
      .filter(
        (completion: TaskCompletionRow) =>
          completion.completed || ["done", "completed"].includes(String(completion.status)),
      )
      .map((completion: TaskCompletionRow) => `${completion.user_id}:${completion.template_id}`),
  );

  return users.filter((user: OperationalUser) => {
    const relevantTemplates = templateRows.filter(
      (template: DailyTaskTemplateRow) =>
        !template.team_id || user.teamIds.includes(template.team_id),
    );
    if (!relevantTemplates.length) return false;
    return relevantTemplates.some(
      (template: DailyTaskTemplateRow) => !completionKeys.has(`${user.id}:${template.id}`),
    );
  });
}

async function getTaskDeadlineIncompleteUsers(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  users: OperationalUser[],
  dateKey: string,
) {
  const start = `${dateKey}T00:00:00+07:00`;
  const end = `${addDays(dateKey, 1)}T00:00:00+07:00`;
  const userIds = users.map((user) => user.id);
  if (!userIds.length) return [];

  const { data: tasks, error } = await runStep(ctx, "query checklist/tasks", async () =>
    service
      .from("tasks")
      .select("assigned_to, status")
      .in("assigned_to", userIds)
      .gte("deadline", start)
      .lt("deadline", end),
  );
  if (error) throw error;

  const taskRows = (tasks ?? []) as TaskDeadlineRow[];
  const incompleteIds = new Set(
    taskRows
      .filter(
        (task: TaskDeadlineRow) =>
          !["done", "completed", "approved", "archived"].includes(String(task.status)),
      )
      .map((task: TaskDeadlineRow) => task.assigned_to),
  );
  return users.filter((user: OperationalUser) => incompleteIds.has(user.id));
}

async function sendChecklistOverdueSummary(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  options: { test?: boolean } = {},
) {
  const today = todayVN();
  const users = await getOperationalUsers(ctx, service);
  const leaveUserIds = await getApprovedLeaveUserIds(
    ctx,
    service,
    users.map((user) => user.id),
    today,
  );
  const expectedUsers = users.filter((user) => !leaveUserIds.has(user.id));
  const [checklistMissing, taskMissing] = await Promise.all([
    getChecklistIncompleteUsers(ctx, service, expectedUsers, today),
    getTaskDeadlineIncompleteUsers(ctx, service, expectedUsers, today),
  ]);
  console.log("[group-reminder] pendingChecklist:", checklistMissing.length);
  console.log("[group-reminder] pendingTaskDeadline:", taskMissing.length);

  if (!checklistMissing.length && !taskMissing.length) {
    console.log("[group-reminder] skipped: no_incomplete_work");
    return { status: "skipped" as const, reason: "no_incomplete_work" };
  }

  const type = options.test ? "test_overdue_summary" : "overdue_summary";
  const key = reminderKey(type, today);
  return sendGroupTelegramMessage(
    ctx,
    service,
    [
      "⚠️ Tổng hợp công việc chưa hoàn thành",
      "",
      "Checklist daily chưa hoàn thành:",
      checklistMissing.length ? listNames(checklistMissing) : "Không có",
      "",
      "Task deadline hôm nay chưa hoàn thành:",
      taskMissing.length ? listNames(taskMissing) : "Không có",
    ].join("\n"),
    type,
    key,
  );
}

function currentMinuteVN() {
  return nowVNParts().minute;
}

async function runSchedulerTick(ctx: DebugContext, service: ReturnType<typeof createClient>) {
  const now = nowVNParts();
  const minute = currentMinuteVN();
  const actions: Array<Promise<unknown>> = [];
  const matched: string[] = [];
  const reportSlots = ["11:55", "13:55", "16:55", "21:00"];
  const missingSlots: Record<string, string> = {
    "12:55": "11:55",
    "14:55": "13:55",
    "17:55": "16:55",
    "22:00": "21:00",
  };

  console.log("[group-reminder] current VN time", now);

  if (reportSlots.includes(minute)) {
    matched.push("report_due");
    actions.push(sendReportDue(ctx, service, minute));
  }
  if (missingSlots[minute]) {
    matched.push("report_missing");
    actions.push(sendReportMissing(ctx, service, missingSlots[minute]));
  }
  if (minute === "09:00") {
    matched.push("checklist_morning");
    actions.push(sendChecklistReminder(ctx, service, "morning"));
  }
  if (minute === "15:00") {
    matched.push("checklist_afternoon");
    actions.push(sendChecklistReminder(ctx, service, "afternoon"));
  }
  if (minute === "17:00") {
    matched.push("overdue_summary");
    actions.push(sendChecklistOverdueSummary(ctx, service));
  }

  console.log("[group-reminder] matched schedule", matched);
  if (!actions.length) {
    console.log("[group-reminder] skipped: no_matched_schedule", { minute });
    return { status: "skipped" as const, reason: `no_action_at_${minute}` };
  }
  const results = await Promise.allSettled(actions);
  return { status: "processed" as const, minute, results };
}

async function runTestMode(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  mode: string,
) {
  console.log("[group-reminder] test mode", { mode, now: nowVNParts() });
  if (mode === "test_checklist")
    return sendChecklistReminder(ctx, service, "morning", { test: true });
  if (mode === "test_report") return sendReportDue(ctx, service, "16:55", { test: true });
  if (mode === "test_overdue") return sendChecklistOverdueSummary(ctx, service, { test: true });
  return null;
}

async function assertAdmin(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  anonKey: string,
  authHeader: string | null,
) {
  if (!authHeader) throw new Error("Unauthorized");
  const url = await runStep(ctx, "read secrets SUPABASE_URL", async () => env("SUPABASE_URL"));
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authUser, error } = await runStep(ctx, "query auth user", async () =>
    userClient.auth.getUser(),
  );
  if (error || !authUser.user) throw new Error("Unauthorized");

  const { data: profile, error: profileError } = await runStep(
    ctx,
    "query profiles admin actor",
    async () =>
      service
        .from("profiles")
        .select("id, full_name, username")
        .eq("auth_user_id", authUser.user.id)
        .maybeSingle(),
  );
  if (profileError) throw profileError;
  if (!profile) throw new Error("No profile");

  const { data: roles, error: rolesError } = await runStep(ctx, "query admin roles", async () =>
    service.from("user_roles").select("role").eq("user_id", profile.id),
  );
  if (rolesError) throw rolesError;
  const roleRows = (roles ?? []) as RoleOnlyRow[];
  if (!roleRows.some((row: RoleOnlyRow) => row.role === "admin")) {
    throw new Error("Only admin can broadcast group announcements");
  }
  return profile as AdminProfileRow;
}

async function sendGroupAnnouncement(
  ctx: DebugContext,
  service: ReturnType<typeof createClient>,
  anonKey: string,
  authHeader: string | null,
  payload: Payload,
) {
  const actor = await assertAdmin(ctx, service, anonKey, authHeader);
  const title = payload.title?.trim();
  const message = payload.message?.trim();
  if (!title || !message) throw new Error("Missing announcement title/message");
  const key = reminderKey(
    "announcement",
    payload.batch_id ?? title,
    payload.actor_profile_id ?? actor.id,
  );
  const openUrl = payload.action_url?.trim() || env("MKTRE_APP_URL") || env("SITE_URL") || "";

  return sendGroupTelegramMessage(
    ctx,
    service,
    [
      "📢 THÔNG BÁO TỪ HỆ THỐNG",
      "",
      `Tiêu đề: ${title}`,
      "",
      "Nội dung:",
      message,
      "",
      `Người gửi: ${actor.full_name ?? actor.username ?? "Admin"}`,
      `Thời gian: ${formatDateTimeVN()}`,
      ...(openUrl ? ["", `🔗 Mở MKTRe: ${openUrl.replace(/\/$/, "")}`] : []),
    ].join("\n"),
    "announcement",
    key,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const requestUrl = new URL(req.url);
  const testMode = requestUrl.searchParams.get("mode");
  const ctx: DebugContext = { mode: testMode, step: "start" };

  try {
    console.log("[telegram-group-reminders][request]", {
      mode: ctx.mode,
      currentVNTime: nowVNParts(),
    });

    const { url, serviceKey, anonKey } = await runStep(ctx, "read secrets", async () => {
      const values = {
        url: env("SUPABASE_URL"),
        serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
        anonKey: env("SUPABASE_ANON_KEY"),
      };
      if (!values.url || !values.serviceKey || !values.anonKey) {
        throw new Error("Missing Supabase environment");
      }
      return values;
    });

    const service = await runStep(ctx, "create service client", async () =>
      createClient(url, serviceKey),
    );

    if (testMode) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader !== `Bearer ${serviceKey}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }
      const result = await runTestMode(ctx, service, testMode);
      if (!result) {
        return Response.json({ error: "Unknown test mode" }, { status: 400, headers: corsHeaders });
      }
      return Response.json({ ok: true, mode: testMode, ...result }, { headers: corsHeaders });
    }

    const payload = await runStep(
      ctx,
      "parse request body",
      async () => (await req.json()) as Payload,
    );
    ctx.mode = payload.action ?? ctx.mode;

    if (payload.action === "announcement") {
      const result = await sendGroupAnnouncement(
        ctx,
        service,
        anonKey,
        req.headers.get("Authorization"),
        payload,
      );
      return Response.json({ ok: true, ...result }, { headers: corsHeaders });
    }

    if (payload.action === "tick") {
      const result = await runSchedulerTick(ctx, service);
      return Response.json({ ok: true, ...result }, { headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceKey}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const result =
      payload.action === "report_due"
        ? await sendReportDue(ctx, service, payload.slot_time)
        : payload.action === "report_missing"
          ? await sendReportMissing(ctx, service, payload.slot_time)
          : payload.action === "checklist_morning"
            ? await sendChecklistReminder(ctx, service, "morning")
            : payload.action === "checklist_afternoon"
              ? await sendChecklistReminder(ctx, service, "afternoon")
              : payload.action === "checklist_overdue_summary"
                ? await sendChecklistOverdueSummary(ctx, service)
                : null;

    if (!result) {
      return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
    }
    return Response.json({ ok: true, ...result }, { headers: corsHeaders });
  } catch (error) {
    const details = errorDetails(error);
    logError(ctx, error);
    return Response.json(
      {
        ok: false,
        error: details.message,
        name: details.name,
        mode: ctx.mode,
        step: ctx.step,
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
