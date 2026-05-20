import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth, type AppRole } from "@/lib/auth";
import { getLeaderTeamIds } from "@/lib/dailyAggregates";
import { dateKeyVN, formatDateVN, todayStr } from "@/lib/reports";
import { calculateMonthlyWorkdays } from "@/lib/salary";
import { sendTelegramForNotification } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { PageShell, ScrollArea } from "@/components/layout/PageShell";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { RefreshButton } from "@/components/RefreshButton";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type AttendanceRecord = Tables<"attendance_records">;
type DailyTemplate = Tables<"daily_task_templates">;
type DailyCompletion = Tables<"task_completions">;
type LeaveRequest = Tables<"leave_requests">;
type TaskRow = Pick<Tables<"tasks">, "id" | "assigned_to" | "status" | "deadline">;

type ProfileLite = {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
};

type TeamLite = { id: string; name: string };
type MembershipLite = { user_id: string; team_id: string; role_in_team?: string | null };

const ATTENDANCE_TRACKED_TEAM_ROLES = new Set(["employee", "leader"]);

type AttendanceStatus =
  | "present"
  | "absent"
  | "leave_requested"
  | "approved_leave"
  | "rejected_leave";

type LeaveStatus = "pending" | "approved" | "rejected";
type ReviewDecision = "approved" | "rejected";
type LeaveType = "full_day" | "half_day" | "early_leave" | "late_arrival";

const attendanceLabels: Record<string, string> = {
  present: "Đã điểm danh",
  absent: "Vắng",
  leave_requested: "Xin nghỉ",
  approved_leave: "Nghỉ phép",
  rejected_leave: "Từ chối nghỉ",
};

const leaveLabels: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

const leaveTypeLabels: Record<LeaveType, string> = {
  full_day: "Nghỉ cả ngày",
  half_day: "Nghỉ nửa ngày",
  early_leave: "Về sớm",
  late_arrival: "Đến muộn",
};

function leaveTypeLabel(type: string | null | undefined) {
  return leaveTypeLabels[(type as LeaveType) || "full_day"] ?? "Nghỉ cả ngày";
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return dateKeyVN(date);
}

function monthBounds(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(days).padStart(2, "0")}`,
    year,
    monthIndex,
  };
}

function currentMonth() {
  return todayStr().slice(0, 7);
}

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-");
  return `${monthIndex}/${year}`;
}

function dayRangeIso(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function tomorrowStr(today: string) {
  return addDays(today, 1);
}

function enumerateDates(from: string, to: string) {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daysInMonth(month: string) {
  const { year, monthIndex } = monthBounds(month);
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    return { date: `${month}-${String(index + 1).padStart(2, "0")}`, day: index + 1 };
  });
}

function computeStreak(records: AttendanceRecord[], endDate = todayStr()) {
  const presentDates = new Set(
    records
      .filter((record) => record.status === "present")
      .map((record) => getRecordDateKey(record)),
  );
  let cursor = endDate;
  let count = 0;
  while (presentDates.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function getRecordDateKey(record: AttendanceRecord) {
  if (record.attendance_date) return record.attendance_date;
  return dateKeyVN(record.checked_in_at || record.created_at);
}

function getTaskDateKey(task: TaskRow) {
  return task.deadline ? dateKeyVN(task.deadline) : null;
}

function DayIndicators({
  present,
  deadline,
  leave,
  current,
  missing,
}: {
  present?: boolean;
  deadline?: boolean;
  leave?: boolean;
  current?: boolean;
  missing?: boolean;
}) {
  const indicators = [
    present ? "attendance" : null,
    deadline ? "deadline" : null,
    leave ? "leave" : null,
    current ? "today" : null,
    missing ? "missing" : null,
  ].filter(Boolean) as Array<"attendance" | "deadline" | "leave" | "today" | "missing">;

  const dotClassByIndicator = {
    attendance: "bg-emerald-500",
    deadline: "bg-amber-400",
    leave: "bg-rose-400",
    today: "bg-violet-500",
    missing: "bg-slate-300",
  } satisfies Record<(typeof indicators)[number], string>;

  if (!indicators.length) return null;

  return (
    <span className="mt-1 flex h-1.5 justify-center gap-1">
      {indicators.map((indicator) => (
        <span
          key={indicator}
          className={cn(
            "h-1.5 w-1.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.9)]",
            dotClassByIndicator[indicator],
          )}
        />
      ))}
    </span>
  );
}

function isDoneStatus(status: string | null) {
  return status === "done" || status === "completed";
}

function isChecklistDone(completion: DailyCompletion) {
  return completion.completed || completion.status === "done" || completion.status === "completed";
}

function getTemplatesForUser(
  templates: DailyTemplate[],
  memberships: MembershipLite[],
  userId: string,
) {
  const userTeamIds = new Set(
    memberships
      .filter((membership) => membership.user_id === userId)
      .map((membership) => membership.team_id),
  );
  return templates.filter((template) => !template.team_id || userTeamIds.has(template.team_id));
}

function countChecklistForUserDate({
  userId,
  date,
  templates,
  memberships,
  completions,
}: {
  userId: string;
  date: string;
  templates: DailyTemplate[];
  memberships: MembershipLite[];
  completions: DailyCompletion[];
}) {
  const userTemplates = getTemplatesForUser(templates, memberships, userId);
  const done = userTemplates.filter((template) =>
    completions.some(
      (completion) =>
        completion.user_id === userId &&
        completion.template_id === template.id &&
        completion.completion_date === date &&
        isChecklistDone(completion),
    ),
  ).length;
  return { done, total: userTemplates.length };
}

function isAttendanceTrackedMembership(membership: MembershipLite) {
  return ATTENDANCE_TRACKED_TEAM_ROLES.has(String(membership.role_in_team ?? ""));
}

function isRejectedLeaveVisible(leave: LeaveRequest, now = new Date()) {
  if (leave.status !== "rejected") return true;
  if (!leave.reviewed_at) return true;
  return now.getTime() - new Date(leave.reviewed_at).getTime() < 24 * 60 * 60 * 1000;
}

function statusBadgeClass(status: string | null) {
  if (status === "present" || status === "approved" || status === "approved_leave") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending" || status === "leave_requested") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "absent" || status === "rejected" || status === "rejected_leave") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

async function notifyLeaveRequestTelegram({ leaveRequestId }: { leaveRequestId: string }) {
  const notifications = await getLeaveRequestNotifications(leaveRequestId, "leave_request_created");
  await Promise.allSettled(
    notifications.map((notification) => {
      const recipientProfileId = notification.target_profile_id ?? notification.user_id;
      console.debug("[leave_request_created][telegram]", notification.id, recipientProfileId);
      return sendTelegramForNotification(notification);
    }),
  );
}

async function notifyLeaveReviewTelegram(
  leaveRequestId: string,
  type: "leave_request_approved" | "leave_request_rejected",
) {
  const notifications = await getLeaveRequestNotifications(leaveRequestId, type);
  await Promise.allSettled(
    notifications.map((notification) => sendTelegramForNotification(notification)),
  );
}

async function getLeaveRequestNotifications(
  leaveRequestId: string,
  type: "leave_request_created" | "leave_request_approved" | "leave_request_rejected",
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, target_profile_id, user_id, entity_type, entity_id, title, message, body, type, kind, metadata",
      )
      .eq("entity_type", "leave_request")
      .eq("entity_id", leaveRequestId)
      .eq("type", type);

    if (error) {
      console.debug("[leave_request][telegram] notification lookup failed", error.message);
      return [];
    }
    if (data?.length) return data;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  console.debug("[leave_request][telegram] no notification rows found", { leaveRequestId, type });
  return [];
}

export function AttendanceWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const today = todayStr();
  const [month, setMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [teamFilter, setTeamFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>("approved");
  const initialLeaveDate = tomorrowStr(today);
  const [leaveForm, setLeaveForm] = useState({
    start_date: initialLeaveDate,
    end_date: initialLeaveDate,
    leave_type: "full_day" as LeaveType,
    reason: "",
  });
  const [reviewNote, setReviewNote] = useState("");

  const isEmployeeView = role === "employee";
  const canSelfCheckIn = role === "employee" || role === "leader";
  const { from, to } = monthBounds(month);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["attendance-workspace", role, profile?.id, month, selectedDate],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let visibleTeamIds: string[] = [];
      let teams: TeamLite[] = [];
      let memberships: MembershipLite[] = [];

      if (role === "admin" || role === "manager") {
        const { data: allTeams, error } = await supabase
          .from("teams")
          .select("id, name")
          .order("name");
        if (error) throw error;
        teams = allTeams ?? [];
        visibleTeamIds = teams.map((team) => team.id);
        const { data: allMemberships, error: membershipError } = await supabase
          .from("team_memberships")
          .select("user_id, team_id, role_in_team")
          .eq("is_active", true);
        if (membershipError) throw membershipError;
        memberships = (allMemberships ?? []).filter(isAttendanceTrackedMembership);
      } else if (role === "leader") {
        visibleTeamIds = await getLeaderTeamIds(profile!.id);
      } else {
        const { data: ownMemberships, error } = await supabase
          .from("team_memberships")
          .select("user_id, team_id, role_in_team")
          .eq("user_id", profile!.id)
          .eq("is_active", true);
        if (error) throw error;
        memberships = (ownMemberships ?? []).filter(isAttendanceTrackedMembership);
        visibleTeamIds = memberships.map((membership) => membership.team_id);
      }

      if (role !== "admin" && visibleTeamIds.length) {
        const [
          { data: scopedTeams, error: teamsError },
          { data: scopedMemberships, error: membershipError },
        ] = await Promise.all([
          supabase.from("teams").select("id, name").in("id", visibleTeamIds).order("name"),
          supabase
            .from("team_memberships")
            .select("user_id, team_id, role_in_team")
            .in("team_id", visibleTeamIds)
            .eq("is_active", true),
        ]);
        if (teamsError) throw teamsError;
        if (membershipError) throw membershipError;
        teams = scopedTeams ?? [];
        memberships = (scopedMemberships ?? []).filter(isAttendanceTrackedMembership);
      }

      const membershipUserIds = memberships.map((membership) => membership.user_id);
      const userIds = role === "employee" ? [profile!.id] : Array.from(new Set(membershipUserIds));

      const profilesQuery = supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("status", "active")
        .order("full_name");
      const { data: profiles, error: profilesError } = userIds.length
        ? await profilesQuery.in("id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const visibleUserIds =
        role === "employee"
          ? [profile!.id]
          : ((profiles ?? []) as ProfileLite[]).map((row) => row.id);

      const [
        { data: templates, error: templatesError },
        attendance,
        completions,
        leaves,
        monthTasks,
      ] = await Promise.all([
        supabase
          .from("daily_task_templates")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        visibleUserIds.length
          ? supabase
              .from("attendance_records")
              .select("*")
              .in("user_id", visibleUserIds)
              .gte("attendance_date", from)
              .lte("attendance_date", to)
          : Promise.resolve({ data: [], error: null }),
        visibleUserIds.length
          ? supabase
              .from("task_completions")
              .select("*")
              .in("user_id", visibleUserIds)
              .gte("completion_date", from)
              .lte("completion_date", to)
          : Promise.resolve({ data: [], error: null }),
        visibleUserIds.length
          ? supabase
              .from("leave_requests")
              .select("*")
              .in("user_id", visibleUserIds)
              .lte("start_date", to)
              .gte("end_date", from)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        visibleUserIds.length
          ? supabase
              .from("tasks")
              .select("id, assigned_to, status, deadline")
              .in("assigned_to", visibleUserIds)
              .gte("deadline", dayRangeIso(from).start)
              .lt("deadline", dayRangeIso(to).end)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (templatesError) throw templatesError;
      if (attendance.error) throw attendance.error;
      if (completions.error) throw completions.error;
      if (leaves.error) throw leaves.error;
      if (monthTasks.error) throw monthTasks.error;

      return {
        teams,
        memberships,
        profiles: (profiles ?? []) as ProfileLite[],
        visibleUserIds,
        templates: templates ?? [],
        attendance: attendance.data ?? [],
        completions: completions.data ?? [],
        leaveRequests: (leaves.data ?? []).filter((leave) => isRejectedLeaveVisible(leave)),
        dayTasks: (monthTasks.data ?? []) as TaskRow[],
      };
    },
  });

  const activeTemplates = useMemo(() => data?.templates ?? [], [data?.templates]);
  const employeeTodayChecklist =
    isEmployeeView && profile
      ? countChecklistForUserDate({
          userId: profile.id,
          date: today,
          templates: activeTemplates,
          memberships: data?.memberships ?? [],
          completions: data?.completions ?? [],
        })
      : null;

  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    (data?.attendance ?? [])
      .filter((record) => record.user_id === profile?.id)
      .forEach((record) => {
        const dateKey = getRecordDateKey(record);
        const existing = map.get(dateKey);
        if (!existing || record.status === "present") {
          map.set(dateKey, record);
        }
      });
    return map;
  }, [data?.attendance, profile?.id]);
  const todayAttendance = recordsByDate.get(today);
  const hasCheckedInToday = todayAttendance?.status === "present";

  const filteredProfiles = useMemo(() => {
    const selectedTeamUserIds =
      teamFilter === "all"
        ? null
        : new Set(
            (data?.memberships ?? []).filter((m) => m.team_id === teamFilter).map((m) => m.user_id),
          );
    return (data?.profiles ?? []).filter((user) => {
      if (selectedTeamUserIds && !selectedTeamUserIds.has(user.id)) return false;
      if (userFilter !== "all" && user.id !== userFilter) return false;
      const record = (data?.attendance ?? []).find(
        (item) => item.user_id === user.id && getRecordDateKey(item) === selectedDate,
      );
      const leave = (data?.leaveRequests ?? []).find(
        (item) =>
          item.user_id === user.id &&
          item.start_date <= selectedDate &&
          item.end_date >= selectedDate,
      );
      const status =
        leave?.status === "approved" ? "approved_leave" : (record?.status ?? "not_checked");
      return statusFilter === "all" || status === statusFilter;
    });
  }, [data, selectedDate, statusFilter, teamFilter, userFilter]);

  const selectedDateStats = useMemo(() => {
    const scopeProfiles =
      teamFilter === "all"
        ? (data?.profiles ?? [])
        : (data?.profiles ?? []).filter((user) =>
            (data?.memberships ?? []).some(
              (membership) => membership.team_id === teamFilter && membership.user_id === user.id,
            ),
          );
    const total = scopeProfiles.length;
    const checked = scopeProfiles.filter((user) =>
      (data?.attendance ?? []).some(
        (record) => record.user_id === user.id && getRecordDateKey(record) === selectedDate,
      ),
    ).length;
    const pendingLeaves = (data?.leaveRequests ?? []).filter(
      (request) => request.status === "pending",
    ).length;
    const completedChecklist = scopeProfiles.reduce((sum, user) => {
      const { done } = countChecklistForUserDate({
        userId: user.id,
        date: selectedDate,
        templates: activeTemplates,
        memberships: data?.memberships ?? [],
        completions: data?.completions ?? [],
      });
      return sum + done;
    }, 0);
    const checklistTotal = Math.max(
      1,
      scopeProfiles.reduce(
        (sum, user) =>
          sum + getTemplatesForUser(activeTemplates, data?.memberships ?? [], user.id).length,
        0,
      ),
    );
    return {
      total,
      checked,
      missing: Math.max(0, total - checked),
      pendingLeaves,
      checklistRate: Math.round((completedChecklist / checklistTotal) * 100),
    };
  }, [activeTemplates, data, selectedDate, teamFilter]);

  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  const canReviewLeaveRequest = (leave: LeaveRequest | null) => {
    if (!leave || !profile || !role) return false;
    if (role === "admin" || role === "manager") return true;
    if (role !== "leader" || leave.user_id === profile.id) return false;
    return (data?.memberships ?? []).some(
      (membership) =>
        membership.user_id === leave.user_id &&
        membership.role_in_team !== "leader" &&
        (data?.teams ?? []).some((team) => team.id === membership.team_id),
    );
  };

  const openReviewLeave = (leave: LeaveRequest, decision: ReviewDecision) => {
    if (!canReviewLeaveRequest(leave)) {
      toast.error("Bạn không có quyền duyệt mục này");
      return;
    }
    setReviewingLeave(leave);
    setReviewDecision(decision);
    setReviewNote("");
    setReviewOpen(true);
  };

  const checkInToday = async () => {
    if (!profile) return;
    if (!canSelfCheckIn) {
      toast.error("Admin/Manager không cần điểm danh");
      return;
    }
    if (hasCheckedInToday) {
      toast.info("Bạn đã điểm danh hôm nay");
      return;
    }
    const { error } = await supabase.from("attendance_records").upsert(
      {
        user_id: profile.id,
        attendance_date: today,
        status: "present" satisfies AttendanceStatus,
        checked_in_at: new Date().toISOString(),
      },
      { onConflict: "user_id,attendance_date" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã điểm danh hôm nay");
    await refetch();
    qc.invalidateQueries({ queryKey: ["analytics-dashboard"] });
    await qc.refetchQueries({ queryKey: ["analytics-dashboard"], type: "active" });
  };

  const submitLeaveRequest = async () => {
    if (!profile) return;
    if (leaveForm.start_date <= today || leaveForm.end_date <= today) {
      toast.error("Đơn xin nghỉ cần được tạo trước ít nhất 1 ngày.");
      return;
    }
    if (leaveForm.end_date < leaveForm.start_date) {
      toast.error("Ngày kết thúc không hợp lệ");
      return;
    }
    if (!leaveForm.reason.trim()) {
      toast.error("Nhập lý do xin nghỉ");
      return;
    }
    const { data: existingLeaves, error: existingError } = await supabase
      .from("leave_requests")
      .select("start_date, end_date, status")
      .eq("user_id", profile.id)
      .lte("start_date", leaveForm.end_date)
      .gte("end_date", leaveForm.start_date);
    if (existingError) {
      toast.error(existingError.message);
      return;
    }
    const requestedDates = enumerateDates(leaveForm.start_date, leaveForm.end_date);
    for (const date of requestedDates) {
      const overlapping = (existingLeaves ?? []).filter(
        (leave) => leave.start_date <= date && leave.end_date >= date,
      );
      if (overlapping.some((leave) => leave.status === "pending")) {
        toast.error("Bạn đang có đơn xin nghỉ chờ duyệt trong ngày này");
        return;
      }
      if (overlapping.length >= 2) {
        toast.error("Mỗi ngày chỉ được tạo tối đa 2 đơn xin nghỉ");
        return;
      }
    }
    const { data: leaveRequest, error } = await supabase
      .from("leave_requests")
      .insert({
        user_id: profile.id,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        leave_type: leaveForm.leave_type,
        reason: leaveForm.reason.trim(),
        status: "pending" satisfies LeaveStatus,
      })
      .select("id, user_id, start_date, end_date")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (leaveRequest) {
      await notifyLeaveRequestTelegram({
        leaveRequestId: leaveRequest.id,
      });
    }
    setLeaveOpen(false);
    setLeaveForm({
      start_date: initialLeaveDate,
      end_date: initialLeaveDate,
      leave_type: "full_day",
      reason: "",
    });
    toast.success("Đã gửi đơn xin nghỉ");
    await refetch();
  };

  const reviewLeave = async (status: ReviewDecision) => {
    if (!profile || !reviewingLeave) return;
    if (!canReviewLeaveRequest(reviewingLeave)) {
      toast.error("Bạn không có quyền duyệt mục này");
      return;
    }
    const { error } = await supabase
      .from("leave_requests")
      .update({
        status,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", reviewingLeave.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReviewOpen(false);
    setReviewingLeave(null);
    setReviewNote("");
    await notifyLeaveReviewTelegram(
      reviewingLeave.id,
      status === "approved" ? "leave_request_approved" : "leave_request_rejected",
    );
    toast.success(status === "approved" ? "Đã duyệt đơn nghỉ" : "Đã không duyệt đơn nghỉ");
    await refetch();
  };

  const employeeStreak = isEmployeeView ? computeStreak(data?.attendance ?? []) : 0;

  if (!profile || !role) return null;

  return (
    <PageShell>
      <WorkspacePageHeader
        title="Điểm danh"
        subtitle={
          isEmployeeView
            ? `${profile.full_name} · Tháng ${formatMonthLabel(month)}`
            : "Theo dõi điểm danh, checklist và lịch làm việc"
        }
        badge={
          isEmployeeView ? (
            <Badge
              className={cn(
                "gap-1 rounded-full bg-orange-50 text-orange-700 hover:bg-orange-50",
                employeeStreak >= 3 && "animate-pulse",
              )}
            >
              {employeeStreak >= 3 ? <span aria-hidden="true">🔥</span> : null}
              {employeeStreak} ngày
            </Badge>
          ) : null
        }
        actions={
          <>
            <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
            {isEmployeeView && employeeTodayChecklist ? (
              <ChecklistProgressPill checklist={employeeTodayChecklist} />
            ) : null}
            {canSelfCheckIn ? (
              <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                Xin nghỉ phép
              </Button>
            ) : null}
            {canSelfCheckIn ? (
              <Button onClick={checkInToday} disabled={hasCheckedInToday}>
                <UserCheck className="mr-2 h-4 w-4" />
                {hasCheckedInToday ? "Đã điểm danh" : "Điểm danh"}
              </Button>
            ) : null}
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : isEmployeeView ? (
        <EmployeeAttendanceView
          month={month}
          setMonth={setMonth}
          today={today}
          recordsByDate={recordsByDate}
          templates={activeTemplates}
          completions={data?.completions ?? []}
          memberships={data?.memberships ?? []}
          profileId={profile.id}
          leaveRequests={data?.leaveRequests ?? []}
          dayTasks={data?.dayTasks ?? []}
        />
      ) : (
        <ManagementAttendanceView
          role={role}
          month={month}
          selectedDate={selectedDate}
          setMonth={setMonth}
          setSelectedDate={setSelectedDate}
          teamFilter={teamFilter}
          setTeamFilter={setTeamFilter}
          userFilter={userFilter}
          setUserFilter={setUserFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          teams={data?.teams ?? []}
          profiles={data?.profiles ?? []}
          memberships={data?.memberships ?? []}
          filteredProfiles={filteredProfiles}
          records={data?.attendance ?? []}
          completions={data?.completions ?? []}
          leaveRequests={data?.leaveRequests ?? []}
          activeTemplates={activeTemplates}
          dayTasks={data?.dayTasks ?? []}
          stats={selectedDateStats}
          onReviewLeave={openReviewLeave}
          canReviewLeave={canReviewLeaveRequest}
        />
      )}

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Xin nghỉ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Từ ngày">
              <Input
                type="date"
                min={initialLeaveDate}
                value={leaveForm.start_date}
                onChange={(event) =>
                  setLeaveForm({
                    ...leaveForm,
                    start_date: event.target.value,
                    end_date:
                      leaveForm.end_date < event.target.value
                        ? event.target.value
                        : leaveForm.end_date,
                  })
                }
              />
            </Field>
            <Field label="Đến ngày">
              <Input
                type="date"
                min={leaveForm.start_date || initialLeaveDate}
                value={leaveForm.end_date}
                onChange={(event) => setLeaveForm({ ...leaveForm, end_date: event.target.value })}
              />
            </Field>
            <Field label="Loại đơn">
              <Select
                value={leaveForm.leave_type}
                onValueChange={(value) =>
                  setLeaveForm({ ...leaveForm, leave_type: value as LeaveType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(leaveTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Label>Lý do</Label>
              <Textarea
                value={leaveForm.reason}
                onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })}
                placeholder="Nhập lý do xin nghỉ"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={submitLeaveRequest}>Gửi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === "rejected" ? "Không duyệt đơn xin nghỉ" : "Duyệt đơn xin nghỉ"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Thời gian:</span>{" "}
              {reviewingLeave
                ? `${formatDateVN(reviewingLeave.start_date)} - ${formatDateVN(reviewingLeave.end_date)}`
                : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Lý do:</span> {reviewingLeave?.reason ?? "—"}
            </p>
            <Field label={reviewDecision === "rejected" ? "Lý do không duyệt" : "Ghi chú duyệt"}>
              <Textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  reviewDecision === "rejected"
                    ? "Nhập lý do không duyệt nếu cần"
                    : "Nhập ghi chú nếu cần"
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewOpen(false);
                setReviewingLeave(null);
              }}
            >
              Huỷ
            </Button>
            {canReviewLeaveRequest(reviewingLeave) ? (
              <Button
                variant={reviewDecision === "rejected" ? "destructive" : "default"}
                onClick={() => reviewLeave(reviewDecision)}
              >
                {reviewDecision === "rejected" ? "Không duyệt" : "Duyệt"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function EmployeeAttendanceView({
  month,
  setMonth,
  today,
  recordsByDate,
  templates,
  completions,
  memberships,
  profileId,
  leaveRequests,
  dayTasks,
}: {
  month: string;
  setMonth: (value: string) => void;
  today: string;
  recordsByDate: Map<string, AttendanceRecord>;
  templates: DailyTemplate[];
  completions: DailyCompletion[];
  memberships: MembershipLite[];
  profileId: string;
  leaveRequests: LeaveRequest[];
  dayTasks: TaskRow[];
}) {
  const monthDays = daysInMonth(month);
  const workdaySummary = calculateMonthlyWorkdays(
    profileId,
    month,
    Array.from(recordsByDate.values()),
    leaveRequests.filter((request) => request.status === "approved"),
    today,
  );
  const presentCount = workdaySummary.attendanceDays;
  const approvedLeaveDays = useMemo(() => {
    const weights = new Map<string, number>();
    for (const leave of leaveRequests.filter((request) => request.status === "approved")) {
      for (const date of enumerateDates(leave.start_date, leave.end_date)) {
        const weight =
          leave.leave_type === "full_day" ? 1 : leave.leave_type === "half_day" ? 0.5 : 0;
        weights.set(date, Math.max(weights.get(date) ?? 0, weight));
      }
    }
    return Array.from(weights.entries())
      .filter(([date]) => date.startsWith(month))
      .reduce((sum, [, weight]) => sum + weight, 0);
  }, [leaveRequests, month]);
  const historyDays = monthDays
    .filter((day) => day.date <= today)
    .slice()
    .reverse()
    .slice(0, 5);
  const taskDeadlineDates = useMemo(
    () =>
      new Set(
        dayTasks
          .filter((task) => task.deadline)
          .map((task) => getTaskDateKey(task))
          .filter(Boolean) as string[],
      ),
    [dayTasks],
  );

  return (
    <ScrollArea className="space-y-4 md:pr-2">
      <Card className="rounded-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Tháng {formatMonthLabel(month)}</CardTitle>
            <p className="text-sm text-muted-foreground">Lịch điểm danh cá nhân.</p>
          </div>
          <Input
            className="w-40"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((day) => {
              const record = recordsByDate.get(day.date);
              const isToday = day.date === today;
              const leave = leaveRequests.find(
                (request) =>
                  request.status === "approved" &&
                  request.start_date <= day.date &&
                  request.end_date >= day.date,
              );
              const hasDeadline = taskDeadlineDates.has(day.date);
              const isMissing = !record && !leave && day.date < today;
              return (
                <div
                  key={day.date}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-2xl border text-sm font-semibold",
                    record?.status === "present" &&
                      "border-emerald-200 bg-emerald-50 text-emerald-700",
                    (record?.status?.includes("leave") || leave) &&
                      "border-violet-200 bg-violet-50 text-violet-700",
                    record?.status === "absent" && "border-rose-200 bg-rose-50 text-rose-700",
                    isToday && "ring-2 ring-violet-400",
                  )}
                  title={record ? attendanceLabels[record.status] : "Chưa điểm danh"}
                >
                  {day.day}
                  <DayIndicators
                    present={record?.status === "present"}
                    deadline={hasDeadline}
                    leave={!!leave || !!record?.status?.includes("leave")}
                    current={isToday}
                    missing={isMissing}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <LegendDot className="bg-emerald-500" label="Đã điểm danh" />
            <LegendDot className="bg-amber-400" label="Có deadline" />
            <LegendDot className="bg-rose-400" label="Nghỉ phép" />
            <LegendDot className="bg-violet-500" label="Hôm nay" />
            <LegendDot className="bg-slate-300" label="Chưa điểm danh" />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
            ✅ Điểm danh đầy đủ: {presentCount}/{monthDays.length} ngày
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <StatCard icon={UserCheck} label="Số ngày đã điểm danh trong tháng" value={presentCount} />
        <StatCard
          icon={ShieldCheck}
          label="Số ngày nghỉ phép trong tháng"
          value={approvedLeaveDays}
          tone="amber"
        />
      </div>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Lịch sử điểm danh & checklist</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Điểm danh</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead>Đơn nghỉ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyDays.map((day) => {
                const record = recordsByDate.get(day.date);
                const checklist = countChecklistForUserDate({
                  userId: profileId,
                  date: day.date,
                  templates,
                  memberships,
                  completions,
                });
                const leave = leaveRequests.find(
                  (request) => request.start_date <= day.date && request.end_date >= day.date,
                );
                return (
                  <TableRow key={day.date}>
                    <TableCell className="font-medium">{formatDateVN(day.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(record?.status ?? null)}>
                        {record ? attendanceLabels[record.status] : "Chưa điểm danh"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {checklist.done}/{checklist.total}
                    </TableCell>
                    <TableCell>
                      {leave ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className={statusBadgeClass(leave.status)}>
                              {leaveLabels[leave.status]}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-slate-50 text-slate-600"
                            >
                              {leaveTypeLabel(leave.leave_type)}
                            </Badge>
                          </div>
                          {leave.review_note ? (
                            <p className="max-w-xs text-xs text-muted-foreground">
                              {leave.review_note}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ScrollArea>
  );
}

function ManagementAttendanceView({
  role,
  month,
  selectedDate,
  setMonth,
  setSelectedDate,
  teamFilter,
  setTeamFilter,
  userFilter,
  setUserFilter,
  statusFilter,
  setStatusFilter,
  teams,
  profiles,
  memberships,
  filteredProfiles,
  records,
  completions,
  leaveRequests,
  activeTemplates,
  dayTasks,
  stats,
  onReviewLeave,
  canReviewLeave,
}: {
  role: AppRole;
  month: string;
  selectedDate: string;
  setMonth: (value: string) => void;
  setSelectedDate: (value: string) => void;
  teamFilter: string;
  setTeamFilter: (value: string) => void;
  userFilter: string;
  setUserFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  teams: TeamLite[];
  profiles: ProfileLite[];
  memberships: MembershipLite[];
  filteredProfiles: ProfileLite[];
  records: AttendanceRecord[];
  completions: DailyCompletion[];
  leaveRequests: LeaveRequest[];
  activeTemplates: DailyTemplate[];
  dayTasks: TaskRow[];
  stats: {
    total: number;
    checked: number;
    missing: number;
    pendingLeaves: number;
    checklistRate: number;
  };
  onReviewLeave: (leave: LeaveRequest, decision: ReviewDecision) => void;
  canReviewLeave: (leave: LeaveRequest) => boolean;
}) {
  const teamById = new Map(teams.map((team) => [team.id, team.name]));
  const teamUsers =
    teamFilter === "all"
      ? profiles
      : profiles.filter((profile) =>
          memberships.some(
            (membership) => membership.team_id === teamFilter && membership.user_id === profile.id,
          ),
        );
  const calendarProfileId = userFilter !== "all" ? userFilter : null;

  return (
    <ScrollArea className="space-y-4 md:pr-2">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <ManagementCalendarCard
          month={month}
          selectedDate={selectedDate}
          records={records}
          leaveRequests={leaveRequests}
          dayTasks={dayTasks}
          calendarProfileId={calendarProfileId}
          onMonthChange={(nextMonth) => {
            setMonth(nextMonth);
            const currentMonth = selectedDate.slice(0, 7);
            if (currentMonth !== nextMonth) {
              const fallbackDate = todayStr().startsWith(nextMonth)
                ? todayStr()
                : `${nextMonth}-01`;
              setSelectedDate(fallbackDate);
            }
          }}
          onSelectDate={setSelectedDate}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard icon={UserCheck} label="Tổng nhân sự" value={stats.total} />
          <StatCard icon={CheckCircle2} label="Đã điểm danh" value={stats.checked} tone="green" />
          <StatCard icon={UserX} label="Chưa điểm danh" value={stats.missing} tone="red" />
          <StatCard icon={Clock} label="Chờ duyệt nghỉ" value={stats.pendingLeaves} tone="amber" />
        </div>
      </div>

      <Card className="rounded-3xl">
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Điểm danh ngày {formatDateVN(selectedDate)}</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              {role !== "leader" ? (
                <div className="w-44">
                  <Label className="text-xs text-muted-foreground">Team</Label>
                  <Select
                    value={teamFilter}
                    onValueChange={(value) => {
                      setTeamFilter(value);
                      setUserFilter("all");
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả team</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="w-48">
                <Label className="text-xs text-muted-foreground">Nhân sự</Label>
                <Select value={userFilter} onValueChange={setUserFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nhân sự</SelectItem>
                    {teamUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <Label className="text-xs text-muted-foreground">Trạng thái</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="present">Đã điểm danh</SelectItem>
                    <SelectItem value="not_checked">Chưa điểm danh</SelectItem>
                    <SelectItem value="approved_leave">Nghỉ phép</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6">Nhân sự</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Điểm danh</TableHead>
                <TableHead>Daily checklist</TableHead>
                <TableHead>Task deadline</TableHead>
                <TableHead>Streak</TableHead>
                <TableHead className="pr-6">Nghỉ phép</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((user) => {
                const record = records.find(
                  (item) => item.user_id === user.id && getRecordDateKey(item) === selectedDate,
                );
                const checklist = countChecklistForUserDate({
                  userId: user.id,
                  date: selectedDate,
                  templates: activeTemplates,
                  memberships,
                  completions,
                });
                const userTasks = dayTasks.filter(
                  (task) => task.assigned_to === user.id && getTaskDateKey(task) === selectedDate,
                );
                const doneTasks = userTasks.filter((task) => isDoneStatus(task.status)).length;
                const leave = leaveRequests.find(
                  (request) =>
                    request.user_id === user.id &&
                    request.start_date <= selectedDate &&
                    request.end_date >= selectedDate,
                );
                const userTeam = memberships.find((membership) => membership.user_id === user.id);
                const attendanceStatus =
                  leave?.status === "approved" ? "approved_leave" : (record?.status ?? null);
                return (
                  <TableRow key={user.id}>
                    <TableCell className="px-6">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size={36} />
                        <div>
                          <p className="font-semibold">{user.full_name}</p>
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{userTeam ? teamById.get(userTeam.team_id) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(attendanceStatus)}>
                        {attendanceStatus ? attendanceLabels[attendanceStatus] : "Chưa điểm danh"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {checklist.done}/{checklist.total}
                    </TableCell>
                    <TableCell>
                      {doneTasks}/{userTasks.length}
                    </TableCell>
                    <TableCell>
                      {computeStreak(
                        records.filter((item) => item.user_id === user.id),
                        selectedDate,
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      {leave ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className={statusBadgeClass(leave.status)}>
                              {leaveLabels[leave.status]}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-slate-50 text-slate-600"
                            >
                              {leaveTypeLabel(leave.leave_type)}
                            </Badge>
                          </div>
                          {leave.status === "pending" && canReviewLeave(leave) ? (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => onReviewLeave(leave, "approved")}
                              >
                                Duyệt
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => onReviewLeave(leave, "rejected")}
                              >
                                Không duyệt
                              </Button>
                            </>
                          ) : null}
                          {leave.review_note ? (
                            <span className="text-xs text-muted-foreground">
                              {leave.review_note}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filteredProfiles.length ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState text="Không có dữ liệu phù hợp bộ lọc." />
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ScrollArea>
  );
}

function ManagementCalendarCard({
  month,
  selectedDate,
  records,
  leaveRequests,
  dayTasks,
  calendarProfileId,
  onMonthChange,
  onSelectDate,
}: {
  month: string;
  selectedDate: string;
  records: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  dayTasks: TaskRow[];
  calendarProfileId: string | null;
  onMonthChange: (value: string) => void;
  onSelectDate: (value: string) => void;
}) {
  const monthDays = daysInMonth(month);
  const { year, monthIndex } = monthBounds(month);
  const firstDay = new Date(year, monthIndex - 1, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDay === 0 ? 0 : firstDay - 1 });
  const today = todayStr();
  const weekdayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  const changeMonth = (offset: number) => {
    const next = new Date(year, monthIndex - 1 + offset, 1);
    onMonthChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>
              Lịch làm việc tháng
              <br />
              {formatMonthLabel(month)}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changeMonth(-1)}>
              ◀ Tháng trước
            </Button>
            <div className="min-w-24 text-center text-sm font-semibold">
              Tháng {formatMonthLabel(month)}
            </div>
            <Button variant="outline" size="sm" onClick={() => changeMonth(1)}>
              Tháng sau ▶
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-foreground">
          {weekdayLabels.map((label) => (
            <div key={label} className={label === "CN" ? "text-rose-500" : ""}>
              {label}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {leadingBlanks.map((_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {monthDays.map((day) => {
            const dayRecords = calendarProfileId
              ? records.filter(
                  (record) =>
                    getRecordDateKey(record) === day.date && record.user_id === calendarProfileId,
                )
              : [];
            const hasPresent = dayRecords.some((record) => record.status === "present");
            const hasLeave = calendarProfileId
              ? leaveRequests.some(
                  (request) =>
                    request.user_id === calendarProfileId &&
                    request.status === "approved" &&
                    request.start_date <= day.date &&
                    request.end_date >= day.date,
                )
              : false;
            const hasDeadline = calendarProfileId
              ? dayTasks.some(
                  (task) =>
                    task.assigned_to === calendarProfileId && getTaskDateKey(task) === day.date,
                )
              : false;
            const isSelected = day.date === selectedDate;
            const isToday = day.date === today;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                className={cn(
                  "relative flex h-11 flex-col items-center justify-center rounded-2xl text-sm font-semibold transition hover:bg-slate-100",
                  hasPresent && "bg-emerald-100 text-emerald-700",
                  hasLeave && "bg-rose-50 text-rose-700",
                  hasDeadline && !hasPresent && "bg-amber-100 text-amber-800",
                  isToday && "ring-2 ring-violet-200",
                  isSelected && "bg-violet-600 text-white shadow-sm hover:bg-violet-600",
                )}
              >
                <span>{day.day}</span>
                <DayIndicators
                  present={hasPresent}
                  deadline={hasDeadline}
                  leave={hasLeave}
                  current={isToday && !isSelected}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <LegendDot className="bg-emerald-200" label="Đã điểm danh" />
          <LegendDot className="bg-amber-200" label="Có deadline" />
          <LegendDot className="bg-rose-100" label="Nghỉ phép" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-3.5 w-3.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ChecklistProgressPill({ checklist }: { checklist: { done: number; total: number } }) {
  const percent = checklist.total ? Math.min(100, (checklist.done / checklist.total) * 100) : 0;
  const completed = checklist.total > 0 && checklist.done >= checklist.total;

  return (
    <div
      className={cn(
        "min-w-[220px] rounded-2xl border bg-white px-3 py-2 shadow-sm",
        completed && "border-emerald-200 bg-emerald-50",
      )}
    >
      <div
        className={cn(
          "mb-1.5 flex items-center justify-between text-xs font-semibold",
          completed ? "text-emerald-700" : "text-slate-600",
        )}
      >
        <span>Checklist hôm nay</span>
        <span>
          {checklist.done}/{checklist.total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            completed ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof UserCheck;
  label: string;
  value: number | string;
  tone?: "slate" | "green" | "red" | "amber" | "violet";
}) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return (
    <Card className="rounded-3xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-2xl p-2", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
