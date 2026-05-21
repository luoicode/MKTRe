import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getLeaderTeamIds } from "@/lib/dailyAggregates";
import { formatYmd } from "@/lib/dateRange";
import { getTaskDeadlineState, type TaskDeadlineState } from "@/lib/taskDeadline";
import {
  dispatchTelegramNotificationsForEntity,
  insertNotificationsWithTelegram,
  sendTelegramNotification,
} from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskDetailsModal, type TaskDetailsTask } from "@/components/workspace/TaskDetailsModal";
import { RefreshButton } from "@/components/RefreshButton";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { ReportImagePreviewDialog } from "@/components/ReportImagePreviewDialog";

type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type UserRow = Pick<Tables<"profiles">, "id" | "full_name" | "username" | "avatar_url">;
type MembershipRow = Pick<Tables<"team_memberships">, "team_id" | "user_id" | "role_in_team">;
type TaskRow = TaskDetailsTask;
type TemplateRow = Tables<"daily_task_templates">;
type OnboardingTemplateRow = Tables<"onboarding_task_templates">;
type CompletionRow = Tables<"task_completions">;
type TaskReadStateRow = Tables<"task_read_states">;
type TaskStatus = Enums<"task_status">;
type BoardStatus = "todo" | "rejected" | "pending_review" | "done";
type TaskPriority = "low" | "medium" | "high";
type DeadlineFilter = "all" | "today" | "overdue" | "future" | "none";
type DeadlineState = TaskDeadlineState;
type CompletionTarget =
  | { type: "task"; id: string; title: string; teamId: string | null }
  | { type: "template"; id: string; title: string; teamId: string | null };
type ReviewTarget =
  | { type: "task"; task: TaskRow }
  | { type: "template"; template: TemplateRow; completion: CompletionRow; user: UserRow | null };
type UnifiedChecklistItem =
  | { type: "task"; task: TaskRow; status: BoardStatus; deadlineState: DeadlineState }
  | { type: "template"; template: TemplateRow; status: BoardStatus; deadlineState: DeadlineState };
type CompletionDetail = {
  completion: CompletionRow;
  submitter: UserRow | null;
  reviewer: UserRow | null;
  canReview: boolean;
  canComment: boolean;
};
type TemplateUserScopeOptions = {
  currentUserId: string | undefined;
  isEmployee: boolean;
  selectedTeamId: string;
  selectedUserId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const boardColumns: Array<{ status: BoardStatus; title: string; tone: string }> = [
  { status: "todo", title: "Cần làm", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  {
    status: "rejected",
    title: "Chưa duyệt",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    status: "pending_review",
    title: "Đợi duyệt",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    status: "done",
    title: "Hoàn thành",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
];
const employeeBoardColumns: Array<{
  status: BoardStatus;
  title: string;
  icon: string;
  countClass: string;
}> = [
  { status: "todo", title: "Cần làm", icon: "📋", countClass: "bg-blue-100 text-blue-700" },
  {
    status: "rejected",
    title: "Chưa duyệt",
    icon: "📝",
    countClass: "bg-amber-100 text-amber-700",
  },
  {
    status: "pending_review",
    title: "Đợi duyệt",
    icon: "⏳",
    countClass: "bg-violet-100 text-violet-700",
  },
  {
    status: "done",
    title: "Hoàn thành",
    icon: "✅",
    countClass: "bg-emerald-100 text-emerald-700",
  },
];

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeTaskStatus(value: string | null | undefined): BoardStatus {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    [
      "in_progress",
      "doing",
      "da_lam",
      "đa_lam",
      "dang_lam",
      "đang_lam",
      "started",
      "processing",
      "process",
      "assigned",
    ].includes(normalized)
  ) {
    return "todo";
  }
  if (
    [
      "rejected",
      "changes_requested",
      "change_requested",
      "tu_choi",
      "khong_duyet",
      "khong_dat",
      "can_lam_lai",
    ].includes(normalized)
  ) {
    return "rejected";
  }
  if (
    [
      "pending_review",
      "review",
      "dang_duyet",
      "đang_duyet",
      "cho_duyet",
      "chờ_duyet",
      "waiting_review",
      "submitted",
    ].includes(normalized)
  ) {
    return "pending_review";
  }
  if (
    ["done", "completed", "complete", "approved", "hoan_thanh", "finished"].includes(normalized)
  ) {
    return "done";
  }
  return "todo";
}

export function TasksWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const canAssign = role === "admin" || role === "manager" || role === "leader";
  const canManageOnboardingTemplates = role === "admin" || role === "manager";
  const isEmployee = role === "employee";
  const usesKanbanBoard = isEmployee || canAssign;
  const date = formatYmd(new Date());
  const [task, setTask] = useState({
    team_id: "",
    assigned_to: "",
    title: "",
    description: "",
    link_url: "",
    deadline: "",
    priority: "medium" as TaskPriority,
  });
  const [template, setTemplate] = useState({ team_id: "", title: "", description: "" });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState({ title: "", description: "" });
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [completionForm, setCompletionForm] = useState({ note: "", proof_url: "" });
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [commentTarget, setCommentTarget] = useState<ReviewTarget | null>(null);
  const [commentFeedback, setCommentFeedback] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BoardStatus | "all">("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [onboardingDialogOpen, setOnboardingDialogOpen] = useState(false);
  const [onboardingTemplatesExpanded, setOnboardingTemplatesExpanded] = useState(false);
  const [editingOnboardingTemplate, setEditingOnboardingTemplate] =
    useState<OnboardingTemplateRow | null>(null);
  const [onboardingTemplate, setOnboardingTemplate] = useState({
    title: "",
    description: "",
    link_url: "",
    priority: "medium" as TaskPriority,
    deadline_hours: 24,
    sort_order: 0,
    is_active: true,
  });
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [employeeDetailItem, setEmployeeDetailItem] = useState<UnifiedChecklistItem | null>(null);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotPreviewOpen, setScreenshotPreviewOpen] = useState(false);
  const checklistBoardRef = useRef<HTMLDivElement>(null);
  const [editTaskForm, setEditTaskForm] = useState({
    title: "",
    description: "",
    link_url: "",
    deadline: "",
    priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["tasks-workspace", role, profile?.id, date],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "employee") {
        const { data: employeeMemberships } = await supabase
          .from("team_memberships")
          .select("team_id")
          .eq("user_id", profile!.id)
          .eq("is_active", true);
        teamIds = (employeeMemberships ?? []).map((membership) => membership.team_id);
      }

      let teams: TeamRow[] = [];
      if (teamIds && teamIds.length === 0) {
        teams = [];
      } else {
        let teamsQuery = supabase.from("teams").select("id, name").order("name");
        if (teamIds?.length) teamsQuery = teamsQuery.in("id", teamIds);
        const { data: teamRows } = await teamsQuery;
        teams = teamRows ?? [];
      }
      const activeTeamIds = teamIds ?? teams.map((team) => team.id);

      const { data: memberships } = activeTeamIds.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id, role_in_team")
            .in("team_id", activeTeamIds)
            .eq("is_active", true)
        : { data: [] };
      const userIds = Array.from(
        new Set((memberships ?? []).map((membership) => membership.user_id)),
      );
      const { data: users } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .in("id", userIds)
            .order("full_name")
        : { data: [] };

      let tasksQuery = supabase
        .from("tasks")
        .select("*")
        .or(`task_date.eq.${date},deadline.not.is.null,status.eq.pending_review`)
        .order("created_at", { ascending: false });
      if (role === "employee") tasksQuery = tasksQuery.eq("assigned_to", profile!.id);
      if ((role === "leader" || role === "manager") && activeTeamIds.length) {
        tasksQuery = tasksQuery.in("team_id", activeTeamIds);
      }
      if ((role === "leader" || role === "manager") && !activeTeamIds.length) {
        tasksQuery = tasksQuery.limit(0);
      }
      const { data: rawTasks, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      const taskProfileIds = Array.from(
        new Set(
          (rawTasks ?? [])
            .flatMap((row) => [row.assigned_to, row.assigned_by, row.created_by])
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const { data: taskProfiles } = taskProfileIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .in("id", taskProfileIds)
            .order("full_name")
        : { data: [] };
      const profileMap = new Map(
        [...(users ?? []), ...(taskProfiles ?? [])].map((user) => [user.id, user]),
      );
      const teamMap = new Map(teams.map((team) => [team.id, team]));
      const normalizedTaskRows = (rawTasks ?? []).map((row) => ({
        ...row,
        status: normalizeTaskStatus(row.status),
      }));
      const tasks: TaskRow[] = normalizedTaskRows
        .filter((row) => shouldShowTaskOnBoard(row, date))
        .map((row) => ({
          ...row,
          profiles: profileMap.get(row.assigned_to) ?? null,
          assignedByProfile:
            profileMap.get(row.assigned_by ?? "") ?? profileMap.get(row.created_by ?? "") ?? null,
          teams: row.team_id ? (teamMap.get(row.team_id) ?? null) : null,
        }));
      const taskIds = tasks.map((row) => row.id);
      const { data: taskReadStates, error: taskReadStatesError } = taskIds.length
        ? await supabase
            .from("task_read_states")
            .select("*")
            .eq("user_id", profile!.id)
            .in("task_id", taskIds)
        : { data: [], error: null };
      if (taskReadStatesError) throw taskReadStatesError;

      const templatesQuery = supabase
        .from("daily_task_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      const { data: templates } = await templatesQuery;
      const { data: onboardingTemplates, error: onboardingTemplatesError } =
        canManageOnboardingTemplates
          ? await supabase
              .from("onboarding_task_templates")
              .select("*")
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true })
          : { data: [], error: null };
      if (onboardingTemplatesError) throw onboardingTemplatesError;
      const { data: completions } = await supabase
        .from("task_completions")
        .select("*")
        .eq("completion_date", date);
      const completionProfileIds = Array.from(
        new Set(
          (completions ?? [])
            .flatMap((row) => [row.user_id, row.reviewed_by])
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const { data: completionProfiles } = completionProfileIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .in("id", completionProfileIds)
        : { data: [] };

      if (import.meta.env.DEV) {
        console.info("[TasksWorkspace] task load debug", {
          currentProfileId: profile?.id,
          currentRole: role,
          selectedTeamId: task.team_id || null,
          visibleTeamIds: activeTeamIds,
          todayDate: date,
          rawTasksReturned: rawTasks ?? [],
          filteredTasksShown: tasks,
        });
        console.debug(
          "[MKTRe task status debug]",
          (rawTasks ?? []).map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            normalized_status: normalizeTaskStatus(row.status),
            team_id: row.team_id,
            assigned_user_id: row.assigned_to,
          })),
        );
      }

      return {
        teams,
        memberships: (memberships ?? []) as MembershipRow[],
        users: users ?? [],
        tasks,
        taskReadStates: (taskReadStates ?? []) as TaskReadStateRow[],
        templates: ((templates ?? []) as TemplateRow[]).filter(
          (row) => !row.team_id || activeTeamIds.includes(row.team_id),
        ),
        onboardingTemplates: (onboardingTemplates ?? []) as OnboardingTemplateRow[],
        completions: (completions ?? []) as CompletionRow[],
        completionProfiles: (completionProfiles ?? []) as UserRow[],
      };
    },
  });

  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    };
  }, [screenshotUrl]);

  useEffect(() => {
    if (screenshotMode) document.body.classList.add("screenshot-mode");
    else document.body.classList.remove("screenshot-mode");
    return () => document.body.classList.remove("screenshot-mode");
  }, [screenshotMode]);

  useEffect(() => {
    if (role !== "leader" || !data?.teams.length) return;
    const teamId = data.teams[0].id;
    setTask((current) => (current.team_id ? current : { ...current, team_id: teamId }));
    setTemplate((current) => (current.team_id ? current : { ...current, team_id: teamId }));
  }, [data?.teams, role]);

  const taskUsers = task.team_id
    ? getUsersForTeam(data?.users ?? [], data?.memberships ?? [], task.team_id)
    : [];
  const teamMembers = useMemo(() => {
    if (selectedTeamId === "all") return data?.users ?? [];
    return getUsersForTeam(data?.users ?? [], data?.memberships ?? [], selectedTeamId);
  }, [data?.memberships, data?.users, selectedTeamId]);
  const shownTasks = useMemo(() => {
    const rows = data?.tasks ?? [];
    return rows.filter((item) => {
      const matchesTeam = !canAssign || selectedTeamId === "all" || item.team_id === selectedTeamId;
      const matchesUser =
        !canAssign || selectedUserId === "all" || item.assigned_to === selectedUserId;
      return matchesTeam && matchesUser;
    });
  }, [canAssign, data?.tasks, selectedTeamId, selectedUserId]);

  useEffect(() => {
    if (selectedUserId === "all") return;
    if (!teamMembers.some((member) => member.id === selectedUserId)) setSelectedUserId("all");
  }, [selectedUserId, teamMembers]);

  const taskReadStateMap = useMemo(
    () => new Map((data?.taskReadStates ?? []).map((row) => [row.task_id, row])),
    [data?.taskReadStates],
  );

  const isTaskUnread = useCallback(
    (item: TaskRow) => {
      const readState = taskReadStateMap.get(item.id);
      return !readState || readState.last_seen_status !== normalizeTaskStatus(item.status);
    },
    [taskReadStateMap],
  );

  useEffect(() => {
    if (!profile || !canAssign || !data?.tasks.length) return;
    const dueTasks = data.tasks.filter((item) => {
      const state = getDeadlineState(item.deadline, item.status, date);
      return item.assigned_to && (state === "today" || state === "overdue");
    });
    if (!dueTasks.length) return;

    let cancelled = false;
    const emit = async () => {
      for (const item of dueTasks) {
        if (cancelled) return;
        const state = getDeadlineState(item.deadline, item.status, date);
        const type = state === "overdue" ? "task_overdue" : "task_deadline_due";
        const dedupeKey = `${type}:${item.id}:${date}`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("target_profile_id", item.assigned_to)
          .eq("type", type)
          .contains("metadata", { dedupe_key: dedupeKey })
          .limit(1);
        if (existing?.length || cancelled) continue;
        await insertNotificationsWithTelegram({
          target_profile_id: item.assigned_to,
          actor_profile_id: profile.id,
          user_id: item.assigned_to,
          created_by: profile.id,
          type,
          kind: type,
          scope: "personal",
          target_scope: "personal",
          entity_type: "task",
          entity_id: item.id,
          team_id: item.team_id,
          title: state === "overdue" ? "Task đã quá hạn" : "Task sắp đến hạn",
          message: item.title,
          body: item.title,
          severity: state === "overdue" ? "error" : "warning",
          is_read: false,
          metadata: {
            dedupe_key: dedupeKey,
            task_id: item.id,
            deadline: item.deadline,
          },
        });
      }
    };
    void emit();
    return () => {
      cancelled = true;
    };
  }, [canAssign, data?.tasks, date, profile]);

  const baseFilteredTasks = useMemo(() => {
    const keyword = taskSearch.trim().toLowerCase();
    return shownTasks
      .filter((item) => {
        const matchesKeyword =
          !keyword ||
          [item.title, item.description, item.profiles?.full_name, item.teams?.name].some((value) =>
            value?.toLowerCase().includes(keyword),
          );
        const deadlineState = getDeadlineState(item.deadline, item.status, date);
        const matchesDeadline =
          deadlineFilter === "all" ||
          deadlineFilter === deadlineState ||
          (deadlineFilter === "none" && deadlineState === "none");
        return matchesKeyword && matchesDeadline;
      })
      .sort((a, b) => compareTaskUrgency(a, b, date));
  }, [date, deadlineFilter, shownTasks, taskSearch]);

  const baseFilteredTemplates = useMemo(() => {
    const selectedUserTeamIds = new Set(
      (data?.memberships ?? [])
        .filter((membership) => membership.user_id === selectedUserId)
        .map((membership) => membership.team_id),
    );
    return (data?.templates ?? []).filter((item) => {
      const keyword = taskSearch.trim().toLowerCase();
      const matchesUser =
        selectedUserId === "all" ||
        item.team_id === null ||
        (item.team_id ? selectedUserTeamIds.has(item.team_id) : false);
      const matchesTeam =
        selectedTeamId === "all" || item.team_id === null || item.team_id === selectedTeamId;
      const matchesKeyword =
        !keyword ||
        [
          item.title,
          item.description,
          data?.teams.find((team) => team.id === item.team_id)?.name,
        ].some((value) => value?.toLowerCase().includes(keyword));
      const matchesDeadline = deadlineFilter === "all" || deadlineFilter === "today";
      return matchesKeyword && matchesUser && matchesTeam && matchesDeadline;
    });
  }, [
    data?.memberships,
    data?.teams,
    data?.templates,
    selectedTeamId,
    selectedUserId,
    deadlineFilter,
    taskSearch,
  ]);

  const baseChecklistItems = useMemo<UnifiedChecklistItem[]>(() => {
    const taskItems: UnifiedChecklistItem[] = baseFilteredTasks.map((item) => {
      const status = normalizeTaskStatus(item.status);
      return {
        type: "task",
        task: item,
        status,
        deadlineState: getDeadlineState(item.deadline, status, date),
      };
    });
    const templateItems: UnifiedChecklistItem[] = baseFilteredTemplates.map((item) => {
      const templateUsers = getTemplateScopedUsers(
        item,
        data?.users ?? [],
        data?.memberships ?? [],
        {
          currentUserId: profile?.id,
          isEmployee,
          selectedTeamId,
          selectedUserId,
        },
      );
      const status = getTemplateBoardStatus(item, data?.completions ?? [], templateUsers);
      return {
        type: "template",
        template: item,
        status,
        deadlineState: status === "done" ? "none" : "today",
      };
    });
    return [...templateItems, ...taskItems];
  }, [
    baseFilteredTasks,
    baseFilteredTemplates,
    data?.completions,
    data?.memberships,
    data?.users,
    date,
    isEmployee,
    profile?.id,
    selectedTeamId,
    selectedUserId,
  ]);

  const visibleChecklistItems = useMemo(
    () =>
      baseChecklistItems.filter((item) => statusFilter === "all" || item.status === statusFilter),
    [baseChecklistItems, statusFilter],
  );

  const filteredTemplates = useMemo(
    () =>
      visibleChecklistItems
        .filter(
          (item): item is Extract<UnifiedChecklistItem, { type: "template" }> =>
            item.type === "template",
        )
        .map((item) => item.template),
    [visibleChecklistItems],
  );

  const filteredTasks = useMemo(
    () =>
      visibleChecklistItems
        .filter(
          (item): item is Extract<UnifiedChecklistItem, { type: "task" }> => item.type === "task",
        )
        .map((item) => item.task),
    [visibleChecklistItems],
  );

  const tabCounts = useMemo(() => {
    const counts = new Map<BoardStatus | "all", number>([["all", 0]]);
    for (const column of boardColumns) counts.set(column.status, 0);
    for (const item of baseChecklistItems) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    }
    return counts;
  }, [baseChecklistItems]);

  const unreadTabs = useMemo(() => {
    const tabs = new Set<BoardStatus | "all">();
    for (const item of baseFilteredTasks) {
      if (!isTaskUnread(item)) continue;
      tabs.add("all");
      tabs.add(normalizeTaskStatus(item.status));
    }
    return tabs;
  }, [baseFilteredTasks, isTaskUnread]);

  const markTasksSeen = async (items: TaskRow[]) => {
    if (!profile?.id || !items.length) return;
    const nowIso = new Date().toISOString();
    const payload = items.map((item) => ({
      task_id: item.id,
      user_id: profile.id,
      last_seen_status: normalizeTaskStatus(item.status),
      seen_at: nowIso,
    }));
    const { error } = await supabase
      .from("task_read_states")
      .upsert(payload, { onConflict: "task_id,user_id" });
    if (error) {
      if (import.meta.env.DEV) console.warn("[MKTRe task reads] mark seen failed", error);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const markTabSeen = (value: BoardStatus | "all") => {
    const tasksToMark = baseFilteredTasks.filter((item) => {
      if (!isTaskUnread(item)) return false;
      return value === "all" || normalizeTaskStatus(item.status) === value;
    });
    void markTasksSeen(tasksToMark);
  };

  const handleStatusFilterChange = (value: BoardStatus | "all") => {
    setStatusFilter(value);
    markTabSeen(value);
  };
  const totalWorkCount = visibleChecklistItems.length;
  const completedWorkCount = visibleChecklistItems.filter((item) => item.status === "done").length;
  const overdueTaskCount = visibleChecklistItems.filter(
    (item) => item.deadlineState === "overdue",
  ).length;
  const incompleteWorkCount = Math.max(0, totalWorkCount - completedWorkCount);
  const progressValue = totalWorkCount ? (completedWorkCount / totalWorkCount) * 100 : 0;
  const employeeTotalCount = baseChecklistItems.length;
  const employeeCompletedCount = baseChecklistItems.filter((item) => item.status === "done").length;
  const employeeInProgressCount = baseChecklistItems.filter(
    (item) => item.status === "rejected",
  ).length;
  const employeeOverdueCount = baseChecklistItems.filter(
    (item) => item.deadlineState === "overdue",
  ).length;
  const employeeProgressValue = employeeTotalCount
    ? (employeeCompletedCount / employeeTotalCount) * 100
    : 0;
  const compactTotalCount = employeeTotalCount;
  const compactCompletedCount = employeeCompletedCount;
  const compactInProgressCount = employeeInProgressCount;
  const compactOverdueCount = employeeOverdueCount;
  const compactProgressValue = employeeProgressValue;
  const boardEmptyText =
    baseChecklistItems.length > 0 && visibleChecklistItems.length === 0
      ? "Không có task phù hợp với bộ lọc"
      : "Trống";
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  const captureChecklistBoard = async () => {
    const target = checklistBoardRef.current;
    if (!target) return;
    setScreenshotBusy(true);
    setScreenshotMode(true);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f8fafc",
      });
      const blob = await (await fetch(dataUrl)).blob();
      setScreenshotBlob(blob);
      setScreenshotUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return URL.createObjectURL(blob);
      });
      setScreenshotPreviewOpen(true);
    } catch {
      toast.error("Không tạo được ảnh checklist");
    } finally {
      setScreenshotMode(false);
      setScreenshotBusy(false);
    }
  };

  const canReviewTask = useCallback(
    (item: Pick<TaskRow, "assigned_to" | "team_id">) => {
      if (!profile || !role || !item.assigned_to) return false;
      if (role === "admin" || role === "manager") return true;
      if (role !== "leader" || item.assigned_to === profile.id || !item.team_id) return false;
      return (data?.memberships ?? []).some(
        (membership) =>
          membership.team_id === item.team_id &&
          membership.user_id === item.assigned_to &&
          membership.role_in_team !== "leader" &&
          (data?.teams ?? []).some((team) => team.id === membership.team_id),
      );
    },
    [data?.memberships, data?.teams, profile, role],
  );

  const canReviewTemplateCompletion = useCallback(
    (template: Pick<TemplateRow, "team_id">, completion: Pick<CompletionRow, "user_id">) => {
      if (!profile || !role) return false;
      if (role === "admin" || role === "manager") return true;
      if (role !== "leader" || completion.user_id === profile.id) return false;
      return (data?.memberships ?? []).some((membership) => {
        if (membership.user_id !== completion.user_id) return false;
        if (membership.role_in_team === "leader") return false;
        if (template.team_id && membership.team_id !== template.team_id) return false;
        return (data?.teams ?? []).some((team) => team.id === membership.team_id);
      });
    },
    [data?.memberships, data?.teams, profile, role],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[MKTRe tasks stats]", {
      rawTasksCount: data?.tasks.length ?? 0,
      visibleTasksCount: shownTasks.length,
      filteredTasksCount: filteredTasks.length,
      unifiedItemsCount: visibleChecklistItems.length,
      filters: {
        search: taskSearch,
        status: statusFilter,
        team: selectedTeamId,
        assignee: selectedUserId,
        deadline: deadlineFilter,
        role,
      },
    });
  }, [
    data?.tasks.length,
    deadlineFilter,
    filteredTasks.length,
    visibleChecklistItems.length,
    role,
    selectedTeamId,
    selectedUserId,
    shownTasks.length,
    statusFilter,
    taskSearch,
  ]);

  const createTask = async () => {
    const teamId = normalizeUuid(task.team_id);
    const assignedTo = normalizeUuid(task.assigned_to);
    const assignedBy = normalizeUuid(profile?.id);
    if (!teamId || !assignedTo || !assignedBy || !task.title.trim()) {
      toast.error("Chọn team, nhân viên và nhập tiêu đề task");
      return;
    }
    if (!taskUsers.some((user) => user.id === assignedTo)) {
      toast.error("Nhân viên được giao phải là thành viên active của team đã chọn");
      return;
    }
    const payload = {
      p_team_id: teamId,
      p_assigned_to: assignedTo,
      p_title: task.title.trim(),
      p_description: task.description.trim() || null,
      p_task_date: date,
      p_deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      p_priority: task.priority,
    };
    if (import.meta.env.DEV) {
      console.info("[TasksWorkspace] create task rpc payload", {
        team_id: payload.p_team_id,
        assigned_to: payload.p_assigned_to,
        assigned_by: assignedBy,
        created_by: null,
        task_date: payload.p_task_date,
      });
    }
    const { data: createdTask, error } = await supabase.rpc("create_task_rpc", payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (import.meta.env.DEV) console.info("[TasksWorkspace] created task rpc result", createdTask);
    const createdTaskId = Array.isArray(createdTask)
      ? createdTask[0]?.id
      : (createdTask as { id?: string } | null)?.id;
    const taskLinkUrl = task.link_url.trim() || null;
    if (createdTaskId && taskLinkUrl) {
      const { error: linkError } = await supabase
        .from("tasks")
        .update({ link_url: taskLinkUrl })
        .eq("id", createdTaskId);
      if (linkError) {
        toast.error(linkError.message);
        return;
      }
    }
    await sendTelegramNotification({
      recipient_profile_id: assignedTo,
      entity_type: "task",
      entity_id: createdTaskId ?? null,
      title: "Nhiệm vụ mới",
      message: `Bạn có task mới: ${task.title.trim()}.`,
      type: "task_assigned",
      metadata: {
        task_id: createdTaskId ?? null,
        team_id: teamId,
      },
      dedupe_key: `task_assigned:${createdTaskId ?? task.title.trim()}:${assignedTo}`,
    });
    toast.success("Đã giao task");
    setTask((current) => ({
      ...current,
      title: "",
      description: "",
      link_url: "",
      deadline: "",
      priority: "medium",
    }));
    setTaskDialogOpen(false);
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
    await refetch();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const createTemplate = async () => {
    if (!template.title.trim()) {
      toast.error("Nhập tên việc thường ngày");
      return;
    }
    if (editingTemplateId) {
      const { error } = await supabase
        .from("daily_task_templates")
        .update({
          team_id: normalizeUuid(template.team_id),
          title: template.title.trim(),
          description: template.description.trim() || null,
        })
        .eq("id", editingTemplateId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Đã cập nhật checklist");
      setEditingTemplateId(null);
      setTemplate((current) => ({ ...current, title: "", description: "" }));
      setTemplateDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
      return;
    }
    const payload: TablesInsert<"daily_task_templates"> = {
      ...template,
      team_id: normalizeUuid(template.team_id),
      created_by: profile?.id,
    };
    const { error } = await supabase.from("daily_task_templates").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã tạo việc thường ngày");
    setTemplate((current) => ({ ...current, title: "", description: "" }));
    setTemplateDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const notifyPendingReviewTelegram = async (
    entityType: "task" | "task_completion",
    entityId: string,
  ) => {
    await dispatchTelegramNotificationsForEntity({
      entity_type: entityType,
      entity_id: entityId,
      types: ["task_review", "task_pending_review", "checklist_pending_review"],
    });
  };

  const submitForReview = async () => {
    if (!profile || !completionTarget) return;
    const note = completionForm.note.trim() || null;
    const proofUrl = completionForm.proof_url.trim() || null;
    let reviewEntity: { entityType: "task" | "task_completion"; entityId: string } | null = null;
    if (completionTarget.type === "task") {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: "pending_review",
          completion_note: note,
          proof_url: proofUrl,
          submitted_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq("id", completionTarget.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      reviewEntity = { entityType: "task", entityId: completionTarget.id };
    } else {
      const payload: TablesInsert<"task_completions"> = {
        template_id: completionTarget.id,
        user_id: profile.id,
        completion_date: date,
        completed: false,
        completed_at: null,
        note,
        completion_note: note,
        proof_url: proofUrl,
        status: "pending_review",
        submitted_at: new Date().toISOString(),
      };
      const { data: completionRow, error } = await supabase
        .from("task_completions")
        .upsert(payload, { onConflict: "template_id,user_id,completion_date" })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      if (completionRow?.id) {
        reviewEntity = { entityType: "task_completion", entityId: completionRow.id };
      }
    }
    if (reviewEntity) {
      await notifyPendingReviewTelegram(reviewEntity.entityType, reviewEntity.entityId);
    }
    toast.success("Đã gửi duyệt");
    setCompletionTarget(null);
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const startEditTemplate = (row: TemplateRow) => {
    setEditingTemplateId(row.id);
    setEditingTemplate({ title: row.title ?? "", description: row.description ?? "" });
    setTemplate({
      team_id: row.team_id ?? "",
      title: row.title ?? "",
      description: row.description ?? "",
    });
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!editingTemplateId || !editingTemplate.title.trim()) {
      toast.error("Nhập tên việc thường ngày");
      return;
    }
    const { error } = await supabase
      .from("daily_task_templates")
      .update(editingTemplate)
      .eq("id", editingTemplateId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã cập nhật checklist");
    setEditingTemplateId(null);
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm("Xóa checklist này?")) return;
    const { error } = await supabase
      .from("daily_task_templates")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa checklist");
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const openOnboardingTemplateDialog = (row?: OnboardingTemplateRow) => {
    setEditingOnboardingTemplate(row ?? null);
    setOnboardingTemplate(
      row
        ? {
            title: row.title,
            description: row.description ?? "",
            link_url: row.link_url ?? "",
            priority: normalizePriority(row.priority),
            deadline_hours: row.deadline_hours,
            sort_order: row.sort_order,
            is_active: row.is_active,
          }
        : {
            title: "",
            description: "",
            link_url: "",
            priority: "medium",
            deadline_hours: 24,
            sort_order: (data?.onboardingTemplates.length ?? 0) + 1,
            is_active: true,
          },
    );
    setOnboardingDialogOpen(true);
  };

  const saveOnboardingTemplate = async () => {
    if (!onboardingTemplate.title.trim()) {
      toast.error("Nhập tên checklist onboarding");
      return;
    }
    const activeCount =
      data?.onboardingTemplates.filter(
        (item) => item.is_active && item.id !== editingOnboardingTemplate?.id,
      ).length ?? 0;
    if (onboardingTemplate.is_active && activeCount >= 4) {
      toast.error("Chỉ được bật tối đa 4 checklist onboarding mặc định");
      return;
    }

    const payload = {
      title: onboardingTemplate.title.trim(),
      description: onboardingTemplate.description.trim() || null,
      link_url: onboardingTemplate.link_url.trim() || null,
      priority: onboardingTemplate.priority,
      deadline_hours: Number(onboardingTemplate.deadline_hours) || 24,
      sort_order: Number(onboardingTemplate.sort_order) || 0,
      is_active: onboardingTemplate.is_active,
    };

    const { error } = editingOnboardingTemplate
      ? await supabase
          .from("onboarding_task_templates")
          .update(payload)
          .eq("id", editingOnboardingTemplate.id)
      : await supabase
          .from("onboarding_task_templates")
          .insert({ ...payload, created_by: profile?.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingOnboardingTemplate ? "Đã cập nhật template" : "Đã tạo template");
    setOnboardingDialogOpen(false);
    setEditingOnboardingTemplate(null);
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const toggleOnboardingTemplate = async (row: OnboardingTemplateRow, isActive: boolean) => {
    const activeCount =
      data?.onboardingTemplates.filter((item) => item.is_active && item.id !== row.id).length ?? 0;
    if (isActive && activeCount >= 4) {
      toast.error("Chỉ được bật tối đa 4 checklist onboarding mặc định");
      return;
    }
    const { error } = await supabase
      .from("onboarding_task_templates")
      .update({ is_active: isActive })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isActive ? "Đã bật template" : "Đã tắt template");
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const deleteOnboardingTemplate = async (id: string) => {
    if (!window.confirm("Xóa template onboarding này?")) return;
    const { data: deletedRow, error } = await supabase
      .from("onboarding_task_templates")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!deletedRow) {
      toast.error("Không xoá được template onboarding");
      return;
    }
    toast.success("Đã xoá template onboarding");
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const startEditTask = (row: TaskRow) => {
    setTaskDetailsOpen(false);
    setEditingTask(row);
    setEditTaskForm({
      title: row.title ?? "",
      description: row.description ?? "",
      link_url: row.link_url ?? "",
      deadline: formatDateTimeLocal(row.deadline),
      priority: normalizePriority(row.priority),
      status: normalizeTaskStatus(row.status),
    });
  };

  const saveTask = async () => {
    if (!editingTask || !editTaskForm.title.trim()) {
      toast.error("Nhập tiêu đề task");
      return;
    }
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editTaskForm.title.trim(),
        description: editTaskForm.description.trim() || null,
        link_url: editTaskForm.link_url.trim() || null,
        deadline: editTaskForm.deadline ? new Date(editTaskForm.deadline).toISOString() : null,
        priority: editTaskForm.priority,
        status: editTaskForm.status,
        completed_at:
          editTaskForm.status === "done"
            ? (editingTask.completed_at ?? new Date().toISOString())
            : null,
      })
      .eq("id", editingTask.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã cập nhật task");
    await markTasksSeen([{ ...editingTask, status: editTaskForm.status }]);
    setEditingTask(null);
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm("Xóa nhiệm vụ này?")) return;
    const { data: deletedTask, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!deletedTask) {
      toast.error("Không xoá được task. Có thể task đã bị xoá hoặc bạn không có quyền.");
      return;
    }
    toast.success("Đã xóa task");
    if (selectedTask?.id === id) {
      setTaskDetailsOpen(false);
      setSelectedTask(null);
    }
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
    await refetch();
  };

  const openTaskDetails = (row: TaskRow) => {
    void markTasksSeen([row]);
    setSelectedTask(row);
    setTaskDetailsOpen(true);
  };

  const openEmployeeItemDetails = (item: UnifiedChecklistItem) => {
    if (item.type === "task") void markTasksSeen([item.task]);
    setEmployeeDetailItem(item);
  };

  const getTemplateCompletion = (templateId: string) =>
    data?.completions.find((row) => row.template_id === templateId && row.user_id === profile?.id);

  const getUnifiedItemLink = (item: UnifiedChecklistItem) => {
    if (item.type === "task") {
      return getTaskWorkLink(item.task);
    }
    const completion = getTemplateCompletion(item.template.id);
    return completion?.proof_url || extractFirstUrl(item.template.description);
  };

  const openUnifiedItemLink = (item: UnifiedChecklistItem) => {
    const link = getUnifiedItemLink(item);
    if (!link) {
      toast.info("Chưa có link cho công việc này");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const openUnifiedItemDetails = (item: UnifiedChecklistItem) => {
    if (item.type === "task") {
      openTaskDetails(item.task);
      return;
    }
    setEmployeeDetailItem(item);
  };

  const profileById = useMemo(() => {
    return new Map(
      [...(data?.users ?? []), ...(data?.completionProfiles ?? [])].map((user) => [user.id, user]),
    );
  }, [data?.completionProfiles, data?.users]);

  const getTemplateDetailCompletions = (item: UnifiedChecklistItem | null): CompletionDetail[] => {
    if (!item || item.type !== "template") return [];
    const templateUsers = getTemplateScopedUsers(
      item.template,
      data?.users ?? [],
      data?.memberships ?? [],
      { currentUserId: profile?.id, isEmployee, selectedTeamId, selectedUserId },
    );
    const templateUserIds = new Set(templateUsers.map((user) => user.id));
    return (data?.completions ?? [])
      .filter(
        (row) =>
          row.template_id === item.template.id &&
          templateUserIds.has(row.user_id) &&
          hasSubmittedTemplateCompletion(row),
      )
      .map((completion) => ({
        completion,
        submitter: profileById.get(completion.user_id) ?? null,
        reviewer: completion.reviewed_by ? (profileById.get(completion.reviewed_by) ?? null) : null,
        canReview: canReviewTemplateCompletion(item.template, completion),
        canComment: canAssign && canReviewTemplateCompletion(item.template, completion),
      }));
  };

  const getFirstReviewableTemplateCompletion = (item: TemplateRow) => {
    const templateUsers = getTemplateScopedUsers(item, data?.users ?? [], data?.memberships ?? [], {
      currentUserId: profile?.id,
      isEmployee,
      selectedTeamId,
      selectedUserId,
    });
    const templateUserIds = new Set(templateUsers.map((user) => user.id));
    return (
      (data?.completions ?? []).find(
        (row) =>
          row.template_id === item.id &&
          templateUserIds.has(row.user_id) &&
          normalizeTaskStatus(row.status) === "pending_review" &&
          canReviewTemplateCompletion(item, row),
      ) ?? null
    );
  };

  const openUnifiedItemReview = (item: UnifiedChecklistItem) => {
    if (item.type === "task") {
      openTaskReview(item.task);
      return;
    }
    const completion = getFirstReviewableTemplateCompletion(item.template);
    if (!completion) {
      toast.error("Không có checklist đang chờ duyệt hoặc bạn không có quyền duyệt");
      return;
    }
    const user = data?.users.find((entry) => entry.id === completion.user_id) ?? null;
    setReviewTarget({ type: "template", template: item.template, completion, user });
  };

  const openTemplateCompletionReview = (
    template: TemplateRow,
    completion: CompletionRow,
    user: UserRow | null,
  ) => {
    if (!canReviewTemplateCompletion(template, completion)) {
      toast.error("Bạn không có quyền duyệt mục này");
      return;
    }
    setEmployeeDetailItem(null);
    setReviewTarget({ type: "template", template, completion, user });
  };

  const submitEmployeeItem = (item: UnifiedChecklistItem) => {
    setCompletionTarget({
      type: item.type === "task" ? "task" : "template",
      id: item.type === "task" ? item.task.id : item.template.id,
      title: item.type === "task" ? item.task.title : item.template.title,
      teamId: item.type === "task" ? item.task.team_id : item.template.team_id,
    });
  };

  const openTaskSubmitReview = (row: TaskRow) => {
    setTaskDetailsOpen(false);
    setCompletionTarget({
      type: "task",
      id: row.id,
      title: row.title,
      teamId: row.team_id,
    });
  };

  const openTaskReview = (row: TaskRow) => {
    if (!canReviewTask(row)) {
      toast.error("Bạn không có quyền duyệt mục này");
      return;
    }
    setTaskDetailsOpen(false);
    setReviewTarget({ type: "task", task: row });
  };

  const openTaskComment = (row: TaskRow) => {
    if (!canAssign) {
      toast.error("Bạn không có quyền comment mục này");
      return;
    }
    setTaskDetailsOpen(false);
    setCommentFeedback(row.review_feedback ?? "");
    setCommentTarget({ type: "task", task: row });
  };

  const getFirstCommentableTemplateCompletion = (item: TemplateRow) => {
    const templateUsers = getTemplateScopedUsers(item, data?.users ?? [], data?.memberships ?? [], {
      currentUserId: profile?.id,
      isEmployee,
      selectedTeamId,
      selectedUserId,
    });
    const templateUserIds = new Set(templateUsers.map((user) => user.id));
    return (
      (data?.completions ?? []).find(
        (row) =>
          row.template_id === item.id &&
          templateUserIds.has(row.user_id) &&
          ["pending_review", "rejected", "done"].includes(normalizeTaskStatus(row.status)) &&
          canReviewTemplateCompletion(item, row),
      ) ?? null
    );
  };

  const openUnifiedItemComment = (item: UnifiedChecklistItem) => {
    if (item.type === "task") {
      openTaskComment(item.task);
      return;
    }
    const completion = getFirstCommentableTemplateCompletion(item.template);
    if (!completion) {
      toast.error("Chưa có lượt gửi để comment hoặc bạn không có quyền");
      return;
    }
    const user = data?.users.find((entry) => entry.id === completion.user_id) ?? null;
    setCommentFeedback(completion.review_feedback ?? "");
    setCommentTarget({ type: "template", template: item.template, completion, user });
  };

  const openTemplateCompletionComment = (
    template: TemplateRow,
    completion: CompletionRow,
    user: UserRow | null,
  ) => {
    if (!canAssign || !canReviewTemplateCompletion(template, completion)) {
      toast.error("Bạn không có quyền comment mục này");
      return;
    }
    setEmployeeDetailItem(null);
    setCommentFeedback(completion.review_feedback ?? "");
    setCommentTarget({ type: "template", template, completion, user });
  };

  const saveComment = async () => {
    if (!profile || !commentTarget) return;
    const feedback = commentFeedback.trim();
    if (!feedback) {
      toast.error("Nhập nội dung comment/feedback");
      return;
    }
    const result =
      commentTarget.type === "task"
        ? await supabase
            .from("tasks")
            .update({
              review_feedback: feedback,
              reviewed_by: profile.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", commentTarget.task.id)
        : await supabase
            .from("task_completions")
            .update({
              review_feedback: feedback,
              reviewed_by: profile.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", commentTarget.completion.id);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Đã lưu comment");
    setCommentTarget(null);
    setCommentFeedback("");
    await qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const reviewItem = async (approved: boolean) => {
    if (!profile || !reviewTarget) return;
    const allowed =
      reviewTarget.type === "task"
        ? canReviewTask(reviewTarget.task)
        : canReviewTemplateCompletion(reviewTarget.template, reviewTarget.completion);
    if (!allowed) {
      toast.error("Bạn không có quyền duyệt mục này");
      return;
    }
    const now = new Date().toISOString();
    const feedback = reviewFeedback.trim() || (approved ? null : "Không duyệt, cần làm lại.");
    if (reviewTarget.type === "task") {
      const nextStatus = approved ? "done" : "rejected";
      const { error } = await supabase
        .from("tasks")
        .update({
          status: nextStatus,
          completed_at: approved ? now : null,
          reviewed_at: now,
          reviewed_by: profile.id,
          review_feedback: feedback,
        })
        .eq("id", reviewTarget.task.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await dispatchTelegramNotificationsForEntity({
        entity_type: "task",
        entity_id: reviewTarget.task.id,
        types: [approved ? "task_approved" : "task_rejected"],
      });
      await markTasksSeen([{ ...reviewTarget.task, status: nextStatus }]);
    } else {
      const { error } = await supabase
        .from("task_completions")
        .update({
          status: approved ? "done" : "rejected",
          completed: approved,
          completed_at: approved ? now : null,
          reviewed_at: now,
          reviewed_by: profile.id,
          review_feedback: feedback,
        })
        .eq("id", reviewTarget.completion.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await dispatchTelegramNotificationsForEntity({
        entity_type: "task_completion",
        entity_id: reviewTarget.completion.id,
        types: [approved ? "task_approved" : "task_rejected"],
      });
    }
    toast.success(approved ? "Đã duyệt hoàn thành" : "Đã yêu cầu làm lại");
    setReviewTarget(null);
    setReviewFeedback("");
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const taskForm = (
    <div className="grid gap-3 md:grid-cols-2">
      {role === "leader" ? (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Team</p>
          <p className="font-medium">
            {data?.teams.find((team) => team.id === task.team_id)?.name ?? "Chưa có team"}
          </p>
        </div>
      ) : (
        <Field label="Team">
          <TeamSelect
            teams={data?.teams ?? []}
            value={task.team_id}
            onChange={(value) => setTask({ ...task, team_id: value, assigned_to: "" })}
          />
        </Field>
      )}
      <Field label="Nhân viên">
        <UserSelect
          users={taskUsers}
          value={task.assigned_to}
          onChange={(value) => setTask({ ...task, assigned_to: value })}
          disabled={!task.team_id}
        />
      </Field>
      <Field label="Tiêu đề">
        <Input
          value={task.title}
          onChange={(event) => setTask({ ...task, title: event.target.value })}
        />
      </Field>
      <Field label="Deadline">
        <Input
          type="datetime-local"
          value={task.deadline}
          onChange={(event) => setTask({ ...task, deadline: event.target.value })}
        />
      </Field>
      <Field label="Mức ưu tiên">
        <Select
          value={task.priority}
          onValueChange={(value) => setTask({ ...task, priority: value as TaskPriority })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Thấp</SelectItem>
            <SelectItem value="medium">Vừa</SelectItem>
            <SelectItem value="high">Cao</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Link công việc">
          <Input
            value={task.link_url}
            onChange={(event) => setTask({ ...task, link_url: event.target.value })}
            placeholder="https://drive.google.com/..."
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Label>Mô tả</Label>
        <Textarea
          value={task.description}
          onChange={(event) => setTask({ ...task, description: event.target.value })}
        />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={createTask}>
          <Plus className="mr-2 h-4 w-4" /> Giao task
        </Button>
      </div>
    </div>
  );

  const templateForm = (
    <div className="grid gap-3">
      {role === "leader" ? (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Team</p>
          <p className="font-medium">
            {data?.teams.find((team) => team.id === template.team_id)?.name ?? "Chưa có team"}
          </p>
        </div>
      ) : (
        <Field label="Team">
          <TeamSelect
            teams={data?.teams ?? []}
            value={template.team_id}
            onChange={(value) => setTemplate({ ...template, team_id: value })}
          />
        </Field>
      )}
      <Field label="Tên việc">
        <Input
          value={template.title}
          onChange={(event) => setTemplate({ ...template, title: event.target.value })}
        />
      </Field>
      <Field label="Mô tả">
        <Textarea
          value={template.description}
          onChange={(event) => setTemplate({ ...template, description: event.target.value })}
        />
      </Field>
      <div className="flex justify-end">
        <Button onClick={createTemplate}>
          {editingTemplateId ? (
            <>
              <Save className="mr-2 h-4 w-4" /> Lưu checklist
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Tạo checklist
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderEmployeeTaskCard = (item: UnifiedChecklistItem) => {
    const title = getUnifiedItemTitle(item);
    const description = getUnifiedItemDescription(item);
    const status = item.status;
    const link = getUnifiedItemLink(item);
    const feedback = getUnifiedItemFeedback(item, getTemplateCompletion);

    return (
      <button
        key={getUnifiedItemKey(item)}
        type="button"
        onClick={() => openEmployeeItemDetails(item)}
        className={cn(
          "group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/25",
          item.deadlineState === "overdue" ? "border-red-200" : "border-slate-200",
        )}
      >
        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-base font-bold leading-snug text-slate-950">{title}</p>
            {description && (
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {item.type === "template" ? (
              <Badge className="rounded-full border-pink-100 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600 hover:bg-pink-50">
                Hằng ngày
              </Badge>
            ) : (
              <Badge className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                {item.task.deadline
                  ? `Deadline: ${formatDateOnly(item.task.deadline)}`
                  : "Không deadline"}
              </Badge>
            )}
            {item.deadlineState === "overdue" && (
              <Badge className="rounded-full border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                Quá hạn
              </Badge>
            )}
          </div>

          {feedback && status !== "done" && (
            <p className="line-clamp-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Feedback: {feedback}
            </p>
          )}

          {(status !== "done" || link) && (
            <div
              className="screenshot-hide flex flex-wrap items-center gap-2 pt-1"
              onClick={(event) => event.stopPropagation()}
            >
              {link && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl px-3 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    openUnifiedItemLink(item);
                  }}
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" /> Mở link
                </Button>
              )}

              {status !== "done" && (status === "rejected" || status === "pending_review") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl px-3 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEmployeeItemDetails(item);
                  }}
                >
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Feedback
                </Button>
              )}

              {status !== "done" && status === "todo" && (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-xl px-4 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    submitEmployeeItem(item);
                  }}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi
                </Button>
              )}

              {status !== "done" && status === "rejected" && (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-xl bg-amber-600 px-4 text-xs hover:bg-amber-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    submitEmployeeItem(item);
                  }}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi lại
                </Button>
              )}
            </div>
          )}
        </div>
      </button>
    );
  };

  const renderManagerTaskCard = (item: UnifiedChecklistItem) => {
    const title = getUnifiedItemTitle(item);
    const description = getUnifiedItemDescription(item);
    const status = item.status;
    const link = getUnifiedItemLink(item);
    const feedback = getUnifiedItemFeedback(item, getTemplateCompletion);
    const canReview =
      item.type === "task"
        ? canReviewTask(item.task)
        : Boolean(getFirstReviewableTemplateCompletion(item.template));

    return (
      <button
        key={getUnifiedItemKey(item)}
        type="button"
        onClick={() => openUnifiedItemDetails(item)}
        className={cn(
          "group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/25",
          item.deadlineState === "overdue" ? "border-red-200" : "border-slate-200",
        )}
      >
        <div className="min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-base font-bold leading-snug text-slate-950">
                {title}
              </p>
              {description && (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{description}</p>
              )}
            </div>
            {item.type === "task" && (
              <UserAvatar user={item.task.profiles} className="h-9 w-9 border" />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {item.type === "template" ? (
              <Badge className="rounded-full border-pink-100 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600 hover:bg-pink-50">
                Hằng ngày
              </Badge>
            ) : (
              <Badge className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                {item.task.deadline
                  ? `Deadline: ${formatDateOnly(item.task.deadline)}`
                  : "Không deadline"}
              </Badge>
            )}
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                statusPillClass(status),
              )}
            >
              {statusShortLabel(status)}
            </Badge>
            {item.deadlineState === "overdue" && (
              <Badge className="rounded-full border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                Quá hạn
              </Badge>
            )}
          </div>

          {feedback && status !== "done" && (
            <p className="line-clamp-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Feedback: {feedback}
            </p>
          )}

          {item.type === "template" && (
            <TemplateProgressLine
              users={getTemplateScopedUsers(
                item.template,
                data?.users ?? [],
                data?.memberships ?? [],
                { currentUserId: profile?.id, isEmployee, selectedTeamId, selectedUserId },
              )}
              completions={(data?.completions ?? []).filter(
                (row) => row.template_id === item.template.id,
              )}
            />
          )}

          <div
            className="screenshot-hide flex flex-wrap items-center gap-2 pt-1"
            onClick={(event) => event.stopPropagation()}
          >
            {link && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl px-3 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  openUnifiedItemLink(item);
                }}
              >
                <Link2 className="mr-1.5 h-3.5 w-3.5" /> Mở link
              </Button>
            )}

            {status === "todo" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl px-3 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "task") startEditTask(item.task);
                  else startEditTemplate(item.template);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Chỉnh sửa
              </Button>
            )}

            {(status === "rejected" || status === "pending_review") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl px-3 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  openUnifiedItemComment(item);
                }}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Comment
              </Button>
            )}

            {status === "pending_review" && canReview && (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl px-4 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  openUnifiedItemReview(item);
                }}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Duyệt
              </Button>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderTaskCard = (item: TaskRow) => {
    const status = normalizeTaskStatus(item.status);
    const deadlineState = getDeadlineState(item.deadline, status, date);

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => openTaskDetails(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTaskDetails(item);
          }
        }}
        className={cn(
          "cursor-pointer overflow-hidden rounded-[1.35rem] border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30",
          deadlineState === "overdue" ? "border-red-200" : "border-slate-200",
        )}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-base font-bold leading-snug text-slate-950">
                {item.title}
              </p>
              {item.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">
                  {item.description}
                </p>
              )}
            </div>
            {canAssign ? (
              <div onClick={(event) => event.stopPropagation()}>
                <CardActionsMenu
                  onView={() => openTaskDetails(item)}
                  onEdit={() => startEditTask(item)}
                  onDelete={() => deleteTask(item.id)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="mt-0.5 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  openTaskDetails(item);
                }}
              >
                <MoreHorizontal className="h-5 w-5 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              • Internal
            </Badge>
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                priorityPillClass(item.priority),
              )}
            >
              • {priorityLabel(item.priority)}
            </Badge>
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                statusPillClass(status),
              )}
            >
              • {statusShortLabel(status)}
            </Badge>
            {deadlineState !== "none" && (
              <Badge
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  deadlinePillClass(deadlineState),
                )}
              >
                • {deadlineStateLabel(deadlineState)}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-600">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{formatDeadline(item.deadline)}</span>
            </span>
          </div>

          {(item.completion_note || item.proof_url || item.review_feedback) && (
            <div className="mt-4 space-y-1 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
              {item.completion_note && (
                <p className="line-clamp-2">Ghi chú: {item.completion_note}</p>
              )}
              {item.review_feedback && (
                <p className="line-clamp-2 text-amber-700">Feedback: {item.review_feedback}</p>
              )}
              {item.proof_url && (
                <a
                  className="block truncate font-medium text-primary underline"
                  href={item.proof_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở chứng từ
                </a>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
            {item.assigned_to === profile?.id && status === "todo" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() =>
                  setCompletionTarget({
                    type: "task",
                    id: item.id,
                    title: item.title,
                    teamId: item.team_id,
                  })
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi duyệt
              </Button>
            )}
            {item.assigned_to === profile?.id && status === "rejected" && (
              <Button
                size="sm"
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() =>
                  setCompletionTarget({
                    type: "task",
                    id: item.id,
                    title: item.title,
                    teamId: item.team_id,
                  })
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi duyệt
              </Button>
            )}
            {item.assigned_to === profile?.id && status === "pending_review" && (
              <Badge className="h-7 rounded-lg border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-700">
                Chờ leader duyệt
              </Badge>
            )}
            {item.assigned_to === profile?.id && status === "done" && (
              <Badge className="h-7 rounded-lg border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Đã xong
              </Badge>
            )}
            {canReviewTask(item) && status === "pending_review" && (
              <Button
                size="sm"
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() => openTaskReview(item)}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Duyệt
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="flex items-center -space-x-2">
            <UserAvatar user={item.profiles} />
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
            {item.proof_url && (
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" /> 1
              </span>
            )}
            {(item.completion_note || item.review_feedback) && (
              <span className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" /> 1
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderTemplateCard = (item: TemplateRow) => {
    const completion = data?.completions.find(
      (row) => row.template_id === item.id && row.user_id === profile?.id,
    );
    const templateUsers = getTemplateScopedUsers(item, data?.users ?? [], data?.memberships ?? [], {
      currentUserId: profile?.id,
      isEmployee,
      selectedTeamId,
      selectedUserId,
    });
    const templateCompletions = (data?.completions ?? []).filter(
      (row) => row.template_id === item.id,
    );
    const doneUsers = getCompletedTemplateUsers(templateUsers, templateCompletions);
    const pendingUsers = getPendingTemplateUsers(templateUsers, templateCompletions);
    const templateUserIds = new Set(templateUsers.map((user) => user.id));
    const pendingReviewRows = templateCompletions.filter(
      (row) =>
        templateUserIds.has(row.user_id) && normalizeTaskStatus(row.status) === "pending_review",
    );
    const currentStatus = getTemplateBoardStatus(item, data?.completions ?? [], templateUsers);

    if (editingTemplateId === item.id && canAssign) {
      return (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="space-y-3">
            <Input
              value={editingTemplate.title}
              onChange={(event) =>
                setEditingTemplate({ ...editingTemplate, title: event.target.value })
              }
            />
            <Textarea
              value={editingTemplate.description}
              onChange={(event) =>
                setEditingTemplate({ ...editingTemplate, description: event.target.value })
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveTemplate}>
                <Save className="mr-2 h-4 w-4" /> Lưu
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingTemplateId(null)}>
                <X className="mr-2 h-4 w-4" /> Hủy
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-base font-bold leading-snug text-slate-950">
                {item.title}
              </p>
              {item.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">
                  {item.description}
                </p>
              )}
            </div>
            {canAssign ? (
              <CardActionsMenu
                onEdit={() => startEditTemplate(item)}
                onDelete={() => deleteTemplate(item.id)}
              />
            ) : (
              <MoreHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              • Internal
            </Badge>
            <Badge className="rounded-full border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
              • Hằng ngày
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-600">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
              <span>Hôm nay</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <ListChecks className="h-4 w-4 text-slate-500" />
              {doneUsers.length}/{templateUsers.length}
            </span>
          </div>

          {(completion?.completion_note ||
            completion?.proof_url ||
            completion?.review_feedback) && (
            <div className="mt-4 space-y-1 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
              {completion?.completion_note && (
                <p className="line-clamp-2">Ghi chú: {completion.completion_note}</p>
              )}
              {completion?.review_feedback && (
                <p className="line-clamp-2 text-amber-700">
                  Feedback: {completion.review_feedback}
                </p>
              )}
              {completion?.proof_url && (
                <a
                  className="block truncate font-medium text-primary underline"
                  href={completion.proof_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở chứng từ
                </a>
              )}
            </div>
          )}

          {canAssign && pendingReviewRows.some((row) => canReviewTemplateCompletion(item, row)) && (
            <div className="mt-4 space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <p className="text-[11px] font-semibold text-violet-700">Chờ duyệt</p>
              {pendingReviewRows
                .filter((row) => canReviewTemplateCompletion(item, row))
                .slice(0, 3)
                .map((row) => {
                  const user = templateUsers.find((entry) => entry.id === row.user_id) ?? null;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        setReviewTarget({ type: "template", template: item, completion: row, user })
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-left text-xs text-slate-700 shadow-sm transition hover:bg-violet-50"
                    >
                      <span className="truncate">{user?.full_name ?? "Nhân viên"}</span>
                      <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />
                    </button>
                  );
                })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {isEmployee && currentStatus === "todo" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() =>
                  setCompletionTarget({
                    type: "template",
                    id: item.id,
                    title: item.title,
                    teamId: item.team_id,
                  })
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi duyệt
              </Button>
            )}
            {isEmployee && currentStatus === "rejected" && (
              <Button
                size="sm"
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() =>
                  setCompletionTarget({
                    type: "template",
                    id: item.id,
                    title: item.title,
                    teamId: item.team_id,
                  })
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Gửi duyệt
              </Button>
            )}
            {isEmployee && currentStatus === "pending_review" && (
              <Badge className="h-7 rounded-lg border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-700">
                Chờ leader duyệt
              </Badge>
            )}
            {isEmployee && currentStatus === "done" && (
              <Badge className="h-7 rounded-lg border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Đã xong
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="flex items-center -space-x-2">
            {pendingUsers.slice(0, 3).map((user) => (
              <UserAvatar key={user.id} user={user} />
            ))}
            {pendingUsers.length > 3 && (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-600">
                +{pendingUsers.length - 3}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
            {completion?.proof_url && (
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" /> 1
              </span>
            )}
            {(completion?.completion_note || completion?.review_feedback) && (
              <span className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" /> 1
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOnboardingTemplateCard = (item: OnboardingTemplateRow) => (
    <div
      key={item.id}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-950">{item.title}</p>
            <Badge className={cn("rounded-full border text-xs", priorityPillClass(item.priority))}>
              {priorityLabel(item.priority)}
            </Badge>
            <Badge variant={item.is_active ? "default" : "secondary"} className="rounded-full">
              {item.is_active ? "Active" : "Tắt"}
            </Badge>
          </div>
          {item.description && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              Deadline {item.deadline_hours}h
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Thứ tự {item.sort_order}</span>
            {item.link_url && (
              <a
                href={item.link_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-600"
                onClick={(event) => event.stopPropagation()}
              >
                Mở link
              </a>
            )}
          </div>
        </div>
        <CardActionsMenu
          onEdit={() => openOnboardingTemplateDialog(item)}
          onDelete={() => deleteOnboardingTemplate(item.id)}
        />
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-xs font-medium text-slate-500">Bật template</span>
        <Switch
          checked={item.is_active}
          onCheckedChange={(checked) => toggleOnboardingTemplate(item, checked)}
        />
      </div>
    </div>
  );

  const currentSelectedTask = selectedTask
    ? (data?.tasks.find((item) => item.id === selectedTask.id) ?? selectedTask)
    : null;

  return (
    <div
      ref={usesKanbanBoard ? checklistBoardRef : undefined}
      className={cn(
        "space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden md:pr-2",
        screenshotMode && "bg-slate-50 p-4",
      )}
    >
      <ReportImagePreviewDialog
        open={screenshotPreviewOpen}
        imageUrl={screenshotUrl}
        blob={screenshotBlob}
        filename={`checklist-${formatYmd(new Date())}.png`}
        isGenerating={screenshotBusy}
        onClose={() => setScreenshotPreviewOpen(false)}
      />

      <EmployeeTaskDetailDialog
        open={!!employeeDetailItem}
        item={employeeDetailItem}
        assignee={profile ? { full_name: profile.full_name, username: profile.username } : null}
        completion={
          employeeDetailItem?.type === "template"
            ? (getTemplateCompletion(employeeDetailItem.template.id) ?? null)
            : null
        }
        completionDetails={getTemplateDetailCompletions(employeeDetailItem)}
        canManage={canAssign && !isEmployee}
        canReview={
          employeeDetailItem?.type === "template"
            ? Boolean(getFirstReviewableTemplateCompletion(employeeDetailItem.template))
            : false
        }
        completedUsers={
          employeeDetailItem?.type === "template"
            ? getSubmittedTemplateUsers(
                getTemplateScopedUsers(
                  employeeDetailItem.template,
                  data?.users ?? [],
                  data?.memberships ?? [],
                  { currentUserId: profile?.id, isEmployee, selectedTeamId, selectedUserId },
                ),
                (data?.completions ?? []).filter(
                  (row) => row.template_id === employeeDetailItem.template.id,
                ),
              )
            : []
        }
        onEdit={(item) => {
          if (item.type === "template") startEditTemplate(item.template);
        }}
        onDelete={(item) => {
          if (item.type === "template") void deleteTemplate(item.template.id);
        }}
        onComment={openUnifiedItemComment}
        onReview={openUnifiedItemReview}
        onReject={openUnifiedItemReview}
        onReviewCompletion={(template, completion, user) =>
          openTemplateCompletionReview(template, completion, user)
        }
        onRejectCompletion={(template, completion, user) =>
          openTemplateCompletionReview(template, completion, user)
        }
        onCommentCompletion={(template, completion, user) =>
          openTemplateCompletionComment(template, completion, user)
        }
        onOpenChange={(open) => {
          if (!open) setEmployeeDetailItem(null);
        }}
      />

      <TaskDetailsModal
        open={taskDetailsOpen}
        task={currentSelectedTask}
        currentProfileId={profile?.id}
        canManage={canAssign}
        canReview={currentSelectedTask ? canReviewTask(currentSelectedTask) : false}
        onOpenChange={(open) => {
          setTaskDetailsOpen(open);
          if (!open) setSelectedTask(null);
        }}
        onEdit={startEditTask}
        onDelete={deleteTask}
        onComment={openTaskComment}
        onSubmitReview={openTaskSubmitReview}
        onReview={openTaskReview}
        onReject={openTaskReview}
      />

      <Dialog open={!!completionTarget} onOpenChange={(open) => !open && setCompletionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gửi duyệt công việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{completionTarget?.title}</p>
            <Field label="Link chứng từ nếu có">
              <Input
                value={completionForm.proof_url}
                onChange={(event) =>
                  setCompletionForm({ ...completionForm, proof_url: event.target.value })
                }
                placeholder="https://..."
              />
            </Field>
            <Field label="Ghi chú nếu cần">
              <Textarea
                value={completionForm.note}
                onChange={(event) =>
                  setCompletionForm({ ...completionForm, note: event.target.value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCompletionTarget(null)}>
                Hủy
              </Button>
              <Button onClick={submitForReview}>
                <Send className="mr-2 h-4 w-4" /> Gửi duyệt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duyệt công việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-950">
                {reviewTarget?.type === "task"
                  ? reviewTarget.task.title
                  : reviewTarget?.template.title}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {reviewTarget?.type === "task"
                  ? reviewTarget.task.profiles?.full_name
                  : reviewTarget?.user?.full_name}
              </p>
              {reviewTarget?.type === "task" && reviewTarget.task.completion_note && (
                <p className="mt-2 text-xs text-slate-600">
                  Ghi chú: {reviewTarget.task.completion_note}
                </p>
              )}
              {reviewTarget?.type === "template" && reviewTarget.completion.completion_note && (
                <p className="mt-2 text-xs text-slate-600">
                  Ghi chú: {reviewTarget.completion.completion_note}
                </p>
              )}
              {reviewTarget?.type === "task" && reviewTarget.task.proof_url && (
                <a
                  className="mt-2 block truncate text-xs font-medium text-primary underline"
                  href={reviewTarget.task.proof_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở chứng từ
                </a>
              )}
              {reviewTarget?.type === "template" && reviewTarget.completion.proof_url && (
                <a
                  className="mt-2 block truncate text-xs font-medium text-primary underline"
                  href={reviewTarget.completion.proof_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở chứng từ
                </a>
              )}
            </div>
            <Field label="Feedback nếu yêu cầu làm lại">
              <Textarea
                value={reviewFeedback}
                onChange={(event) => setReviewFeedback(event.target.value)}
                placeholder="Nhập lý do hoặc yêu cầu chỉnh sửa..."
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewTarget(null)}>
                Hủy
              </Button>
              <Button variant="secondary" onClick={() => reviewItem(false)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Không duyệt
              </Button>
              <Button onClick={() => reviewItem(true)}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Duyệt hoàn thành
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!commentTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCommentTarget(null);
            setCommentFeedback("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment / Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-950">
                {commentTarget?.type === "task"
                  ? commentTarget.task.title
                  : commentTarget?.template.title}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {commentTarget?.type === "task"
                  ? commentTarget.task.profiles?.full_name
                  : commentTarget?.user?.full_name}
              </p>
            </div>
            <Field label="Nội dung comment/feedback">
              <Textarea
                value={commentFeedback}
                onChange={(event) => setCommentFeedback(event.target.value)}
                placeholder="Nhập góp ý, yêu cầu chỉnh sửa hoặc ghi chú quản trị..."
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCommentTarget(null);
                  setCommentFeedback("");
                }}
              >
                Hủy
              </Button>
              <Button onClick={saveComment}>
                <MessageCircle className="mr-2 h-4 w-4" /> Lưu comment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thêm nhiệm vụ có thời hạn</DialogTitle>
          </DialogHeader>
          {taskForm}
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) {
            setEditingTemplateId(null);
            setTemplate((current) => ({ ...current, title: "", description: "" }));
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? "Sửa checklist thường ngày" : "Thêm checklist thường ngày"}
            </DialogTitle>
          </DialogHeader>
          {templateForm}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa nhiệm vụ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tiêu đề">
              <Input
                value={editTaskForm.title}
                onChange={(event) =>
                  setEditTaskForm({ ...editTaskForm, title: event.target.value })
                }
              />
            </Field>
            <Field label="Trạng thái">
              <Select
                value={editTaskForm.status}
                onValueChange={(value) =>
                  setEditTaskForm({ ...editTaskForm, status: value as TaskStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {boardColumns.map((column) => (
                    <SelectItem key={column.status} value={column.status}>
                      {column.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Deadline">
              <Input
                type="datetime-local"
                value={editTaskForm.deadline}
                onChange={(event) =>
                  setEditTaskForm({ ...editTaskForm, deadline: event.target.value })
                }
              />
            </Field>
            <Field label="Mức ưu tiên">
              <Select
                value={editTaskForm.priority}
                onValueChange={(value) =>
                  setEditTaskForm({ ...editTaskForm, priority: value as TaskPriority })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Thấp</SelectItem>
                  <SelectItem value="medium">Vừa</SelectItem>
                  <SelectItem value="high">Cao</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Link công việc">
                <Input
                  value={editTaskForm.link_url}
                  onChange={(event) =>
                    setEditTaskForm({ ...editTaskForm, link_url: event.target.value })
                  }
                  placeholder="https://drive.google.com/..."
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Label>Mô tả</Label>
              <Textarea
                value={editTaskForm.description}
                onChange={(event) =>
                  setEditTaskForm({ ...editTaskForm, description: event.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="outline" onClick={() => setEditingTask(null)}>
                Hủy
              </Button>
              <Button onClick={saveTask}>
                <Save className="mr-2 h-4 w-4" /> Lưu thay đổi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={onboardingDialogOpen}
        onOpenChange={(open) => {
          setOnboardingDialogOpen(open);
          if (!open) setEditingOnboardingTemplate(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingOnboardingTemplate ? "Sửa checklist onboarding" : "Thêm checklist onboarding"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Tiêu đề">
                <Input
                  value={onboardingTemplate.title}
                  onChange={(event) =>
                    setOnboardingTemplate({ ...onboardingTemplate, title: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Mức ưu tiên">
              <Select
                value={onboardingTemplate.priority}
                onValueChange={(value) =>
                  setOnboardingTemplate({
                    ...onboardingTemplate,
                    priority: value as TaskPriority,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Thấp</SelectItem>
                  <SelectItem value="medium">Vừa</SelectItem>
                  <SelectItem value="high">Cao</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Deadline sau bao nhiêu giờ">
              <Input
                type="number"
                min={1}
                max={720}
                value={onboardingTemplate.deadline_hours}
                onChange={(event) =>
                  setOnboardingTemplate({
                    ...onboardingTemplate,
                    deadline_hours: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Thứ tự">
              <Input
                type="number"
                value={onboardingTemplate.sort_order}
                onChange={(event) =>
                  setOnboardingTemplate({
                    ...onboardingTemplate,
                    sort_order: Number(event.target.value),
                  })
                }
              />
            </Field>
            <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Tính vào checklist mặc định</p>
              </div>
              <Switch
                checked={onboardingTemplate.is_active}
                onCheckedChange={(checked) =>
                  setOnboardingTemplate({ ...onboardingTemplate, is_active: checked })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Field label="Link nếu có">
                <Input
                  value={onboardingTemplate.link_url}
                  onChange={(event) =>
                    setOnboardingTemplate({
                      ...onboardingTemplate,
                      link_url: event.target.value,
                    })
                  }
                  placeholder="https://drive.google.com/..."
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Mô tả">
                <Textarea
                  value={onboardingTemplate.description}
                  onChange={(event) =>
                    setOnboardingTemplate({
                      ...onboardingTemplate,
                      description: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="outline" onClick={() => setOnboardingDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={saveOnboardingTemplate}>
                <Save className="mr-2 h-4 w-4" /> Lưu template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkspacePageHeader
        className="md:sticky md:top-0 md:z-20"
        title={isEmployee ? "Checklist Công Việc" : "Checklist công việc"}
        subtitle={
          isEmployee
            ? "Nhân sự - Quản lý nhiệm vụ cá nhân"
            : "Quản lý nhiệm vụ, checklist và luồng duyệt của đội ngũ"
        }
        contentClassName={usesKanbanBoard ? "lg:items-start" : undefined}
        rightContent={
          usesKanbanBoard ? (
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              <EmployeeSummaryPill label="Tổng task" value={compactTotalCount} />
              <EmployeeSummaryPill
                label="Hoàn thành"
                value={compactCompletedCount}
                tone="success"
              />
              <EmployeeSummaryPill
                label="Chưa duyệt"
                value={compactInProgressCount}
                tone="warning"
              />
              <EmployeeSummaryPill label="Quá hạn" value={compactOverdueCount} tone="danger" />
              <EmployeeSummaryPill label="Tiến độ" value={`${Math.round(compactProgressValue)}%`} />
            </div>
          ) : null
        }
        actions={
          <>
            {usesKanbanBoard ? (
              <div className="screenshot-hide flex flex-wrap items-center gap-2">
                <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
                <Button
                  variant="outline"
                  className="rounded-2xl bg-white"
                  onClick={() => void captureChecklistBoard()}
                  disabled={screenshotBusy}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {screenshotBusy ? "Đang chụp..." : "Chụp màn hình"}
                </Button>
                {canAssign && (
                  <>
                    <Button
                      variant="outline"
                      className="rounded-2xl bg-white"
                      onClick={() => setTemplateDialogOpen(true)}
                    >
                      <ClipboardList className="mr-2 h-4 w-4" /> Thêm checklist
                    </Button>
                    <Button className="rounded-2xl px-5" onClick={() => setTaskDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Thêm nhiệm vụ
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
            )}
            {canAssign && !usesKanbanBoard && (
              <>
                <Button
                  variant="outline"
                  className="rounded-2xl bg-white"
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  <ClipboardList className="mr-2 h-4 w-4" /> Thêm checklist
                </Button>
                <Button className="rounded-2xl px-5" onClick={() => setTaskDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Thêm nhiệm vụ
                </Button>
              </>
            )}
          </>
        }
      >
        {canAssign && !usesKanbanBoard && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Tổng task" value={totalWorkCount} />
            <SummaryCard label="Đã hoàn thành" value={completedWorkCount} tone="success" />
            <SummaryCard label="Chưa hoàn thành" value={incompleteWorkCount} tone="warning" />
            <SummaryCard label="Quá hạn" value={overdueTaskCount} tone="danger" />
            <SummaryCard label="Tỉ lệ hoàn thành" value={`${Math.round(progressValue)}%`} />
          </div>
        )}
      </WorkspacePageHeader>

      {usesKanbanBoard ? (
        <div className="space-y-3 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:pt-2">
          {!isEmployee && canManageOnboardingTemplates && (
            <section className="screenshot-hide shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                onClick={() => setOnboardingTemplatesExpanded((current) => !current)}
                aria-expanded={onboardingTemplatesExpanded}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      Checklist onboarding mặc định
                    </p>
                    <Badge className="rounded-full border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50">
                      {data?.onboardingTemplates.length ?? 0} template
                    </Badge>
                    <Badge className="rounded-full border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      {(data?.onboardingTemplates ?? []).filter((item) => item.is_active).length}{" "}
                      active
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    Clone tự động cho employee mới. Bấm mũi tên để mở rộng.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-600">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        onboardingTemplatesExpanded && "rotate-180",
                      )}
                    />
                  </span>
                </div>
              </button>
              {onboardingTemplatesExpanded && (
                <div className="border-t bg-slate-50/70 p-4">
                  <div className="mb-4 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => openOnboardingTemplateDialog()}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Thêm template
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {(data?.onboardingTemplates ?? []).map(renderOnboardingTemplateCard)}
                    {!data?.onboardingTemplates.length && (
                      <div className="rounded-2xl border border-dashed bg-white p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-4">
                        Chưa có checklist onboarding mặc định.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {!isEmployee && (
            <div className="screenshot-hide flex shrink-0 flex-wrap items-center gap-3">
              <div className="relative min-w-72 flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={taskSearch}
                  onChange={(event) => setTaskSearch(event.target.value)}
                  placeholder="Tìm nhiệm vụ..."
                  className="h-12 rounded-2xl border-slate-200 bg-white pl-11 text-base shadow-sm"
                />
              </div>

              <Select
                value={selectedTeamId}
                onValueChange={(value) => {
                  setSelectedTeamId(value);
                  setSelectedUserId("all");
                }}
              >
                <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-52">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả team</SelectItem>
                  {(data?.teams ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-56">
                  <SelectValue placeholder="Người phụ trách" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      <span className="flex items-center gap-2">
                        <UserAvatar user={member} className="border" />
                        <span>{member.full_name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={deadlineFilter}
                onValueChange={(value) => setDeadlineFilter(value as DeadlineFilter)}
              >
                <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-48">
                  <SelectValue placeholder="Deadline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả deadline</SelectItem>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="overdue">Quá hạn</SelectItem>
                  <SelectItem value="future">Sắp tới</SelectItem>
                  <SelectItem value="none">Chưa có deadline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center rounded-3xl border bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 md:h-0 md:min-h-[420px] md:flex-1 md:grid-cols-2 md:overflow-hidden xl:grid-cols-4">
              {employeeBoardColumns.map((column) => {
                const columnItems = baseChecklistItems.filter(
                  (item) => item.status === column.status,
                );
                return (
                  <section
                    key={column.status}
                    className="flex min-h-[360px] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm md:h-full md:min-h-0 md:overflow-hidden"
                  >
                    <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
                      <h2 className="flex min-w-0 items-center gap-2 text-lg font-extrabold uppercase tracking-tight text-slate-950">
                        <span>{column.icon}</span>
                        <span className="truncate">{column.title}</span>
                      </h2>
                      <span
                        className={cn(
                          "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold",
                          column.countClass,
                        )}
                      >
                        {columnItems.length}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                      {columnItems.map((item) =>
                        isEmployee ? renderEmployeeTaskCard(item) : renderManagerTaskCard(item),
                      )}
                      {!columnItems.length && (
                        <div className="rounded-2xl border border-dashed bg-slate-50 p-5 text-center text-sm text-slate-500">
                          Trống
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:pt-4">
          {canManageOnboardingTemplates && (
            <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Checklist onboarding mặc định
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Clone tự động cho employee mới. Tối đa 4 template active.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={() => openOnboardingTemplateDialog()}
                >
                  <Plus className="mr-2 h-4 w-4" /> Thêm template
                </Button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(data?.onboardingTemplates ?? []).map(renderOnboardingTemplateCard)}
                {!data?.onboardingTemplates.length && (
                  <div className="rounded-2xl border border-dashed bg-white p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-4">
                    Chưa có checklist onboarding mặc định.
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-72 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder={isEmployee ? "Tìm công việc của tôi..." : "Tìm nhiệm vụ..."}
                className="h-12 rounded-2xl border-slate-200 bg-white pl-11 text-base shadow-sm"
              />
            </div>

            <StatusTabs
              value={statusFilter}
              onChange={handleStatusFilterChange}
              counts={tabCounts}
              unreadTabs={unreadTabs}
            />

            {canAssign && (
              <>
                {role !== "leader" && (
                  <Select
                    value={selectedTeamId}
                    onValueChange={(value) => {
                      setSelectedTeamId(value);
                      setSelectedUserId("all");
                    }}
                  >
                    <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-52">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả team</SelectItem>
                      {(data?.teams ?? []).map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-56">
                    <SelectValue placeholder="Người phụ trách" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả người phụ trách</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <span className="flex items-center gap-2">
                          <UserAvatar user={member} className="border" />
                          <span>{member.full_name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={deadlineFilter}
                  onValueChange={(value) => setDeadlineFilter(value as DeadlineFilter)}
                >
                  <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-48">
                    <SelectValue placeholder="Deadline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả deadline</SelectItem>
                    <SelectItem value="today">Hôm nay</SelectItem>
                    <SelectItem value="overdue">Quá hạn</SelectItem>
                    <SelectItem value="future">Sắp tới</SelectItem>
                    <SelectItem value="none">Chưa có deadline</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center rounded-3xl border bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="min-w-0">
              <div className="grid gap-5 pb-2 md:grid-cols-2">
                {filteredTemplates.map((item) => renderTemplateCard(item))}
                {filteredTasks.map((item) => renderTaskCard(item))}
              </div>
              {filteredTasks.length + filteredTemplates.length === 0 && (
                <div className="rounded-3xl border border-dashed bg-white p-10">
                  <Empty text={boardEmptyText} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSelect({
  teams,
  value,
  onChange,
  includeGlobal,
}: {
  teams: TeamRow[];
  value: string;
  onChange: (value: string) => void;
  includeGlobal?: boolean;
}) {
  return (
    <Select
      value={value || (includeGlobal ? "global" : "")}
      onValueChange={(value) => onChange(value === "global" ? "" : value)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Chọn team" />
      </SelectTrigger>
      <SelectContent>
        {includeGlobal && <SelectItem value="global">Tất cả</SelectItem>}
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CardActionsMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Mở menu công việc"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-2xl border bg-white p-1.5 shadow-lg">
        {onView && (
          <DropdownMenuItem
            onClick={onView}
            className="cursor-pointer rounded-xl text-sm font-medium hover:bg-slate-50 focus:bg-slate-50"
          >
            <FileText className="mr-2 h-4 w-4 text-slate-600" /> Chi tiết
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onEdit}
          className="cursor-pointer rounded-xl text-sm font-medium hover:bg-sky-50 focus:bg-sky-50"
        >
          <Pencil className="mr-2 h-4 w-4 text-sky-600" /> Sửa
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="cursor-pointer rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Xóa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusTabs({
  value,
  onChange,
  counts,
  unreadTabs,
}: {
  value: BoardStatus | "all";
  onChange: (value: BoardStatus | "all") => void;
  counts: Map<BoardStatus | "all", number>;
  unreadTabs: Set<BoardStatus | "all">;
}) {
  const options: Array<{ value: BoardStatus | "all"; label: string }> = [
    { value: "all", label: "Tất cả" },
    ...boardColumns.map((column) => ({ value: column.status, label: column.title })),
  ];

  return (
    <div className="flex h-12 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "relative flex min-w-max items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
            value === option.value
              ? "bg-slate-950 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          <span>{option.label}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px]",
              value === option.value ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
            )}
          >
            {counts.get(option.value) ?? 0}
          </span>
          {unreadTabs.has(option.value) && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </button>
      ))}
    </div>
  );
}

function EmployeeTaskDetailDialog({
  open,
  item,
  assignee,
  completion,
  completionDetails,
  canManage,
  canReview,
  completedUsers,
  onEdit,
  onDelete,
  onComment,
  onReview,
  onReject,
  onReviewCompletion,
  onRejectCompletion,
  onCommentCompletion,
  onOpenChange,
}: {
  open: boolean;
  item: UnifiedChecklistItem | null;
  assignee: Pick<UserRow, "full_name" | "username"> | null;
  completion: CompletionRow | null;
  completionDetails: CompletionDetail[];
  canManage: boolean;
  canReview: boolean;
  completedUsers: UserRow[];
  onEdit: (item: UnifiedChecklistItem) => void;
  onDelete: (item: UnifiedChecklistItem) => void;
  onComment: (item: UnifiedChecklistItem) => void;
  onReview: (item: UnifiedChecklistItem) => void;
  onReject: (item: UnifiedChecklistItem) => void;
  onReviewCompletion: (
    template: TemplateRow,
    completion: CompletionRow,
    user: UserRow | null,
  ) => void;
  onRejectCompletion: (
    template: TemplateRow,
    completion: CompletionRow,
    user: UserRow | null,
  ) => void;
  onCommentCompletion: (
    template: TemplateRow,
    completion: CompletionRow,
    user: UserRow | null,
  ) => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const title = getUnifiedItemTitle(item);
  const description = getUnifiedItemDescription(item) || "Không có";
  const status = item.status;
  const taskAssignee = item.type === "task" ? item.task.profiles : assignee;
  const createdAt = item.type === "task" ? item.task.created_at : item.template.created_at;
  const deadline = item.type === "task" ? item.task.deadline : null;
  const feedback = getUnifiedItemFeedback(item, () => completion) || "Không có";
  const note =
    item.type === "task"
      ? item.task.completion_note || "Không có"
      : completion?.completion_note || completion?.note || "Không có";
  const link =
    item.type === "task"
      ? getTaskWorkLink(item.task)
      : completion?.proof_url || extractFirstUrl(item.template.description);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-3xl p-0 sm:max-h-[90vh]">
        <DialogHeader className="shrink-0 border-b bg-white px-6 py-5">
          <DialogTitle className="pr-8 text-2xl font-extrabold leading-tight text-slate-950">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 pb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailLine label="Người thực hiện" value={taskAssignee?.full_name ?? "Không có"} />
            <DetailLine label="Ngày tạo" value={formatDateOnly(createdAt)} />
            <DetailLine
              label="Deadline"
              value={item.type === "template" ? "Hằng ngày" : formatDateOnly(deadline)}
              danger={item.deadlineState === "overdue"}
            />
            <DetailLine
              label="Trạng thái"
              value={item.type === "template" ? "Theo từng lượt gửi" : employeeStatusLabel(status)}
            />
          </div>

          <section className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Mô tả / kế hoạch
            </p>
            <p className="whitespace-pre-wrap break-words text-base leading-7 text-slate-700">
              {description}
            </p>
          </section>

          {item.type === "task" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DetailRichBlock label="Feedback gần nhất" value={feedback} />
              <DetailRichBlock label="Ghi chú gửi duyệt" value={note} />
            </div>
          )}

          {item.type === "task" ? (
            <section className="mt-5 rounded-2xl border bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Người đã làm</p>
              {completedUsers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {completedUsers.map((user) => (
                    <div
                      key={user.id}
                      title={user.full_name}
                      className="flex items-center gap-2 rounded-full border bg-slate-50 py-1 pl-1 pr-3 text-xs font-semibold text-slate-700"
                    >
                      <UserAvatar user={user} className="h-8 w-8 border" />
                      <span className="max-w-40 truncate">{user.full_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Chưa có nhân sự hoàn thành.</p>
              )}
            </section>
          ) : (
            <section className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Lượt gửi duyệt</p>
                <Badge variant="outline" className="rounded-full">
                  {completionDetails.length} lượt gửi
                </Badge>
              </div>
              {completionDetails.length ? (
                completionDetails.map((detail) => (
                  <CompletionReviewCard
                    key={detail.completion.id}
                    detail={detail}
                    template={item.template}
                    onReview={onReviewCompletion}
                    onReject={onRejectCompletion}
                    onComment={onCommentCompletion}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                  Chưa có nhân sự gửi duyệt.
                </div>
              )}
            </section>
          )}

          {link && (
            <div className="mt-5">
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Mở link content / chứng từ</span>
              </a>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t bg-white px-6 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            {item.type === "task" && canReview && status === "pending_review" && (
              <>
                <Button variant="secondary" className="rounded-2xl" onClick={() => onReject(item)}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Không duyệt
                </Button>
                <Button className="rounded-2xl" onClick={() => onReview(item)}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Duyệt
                </Button>
              </>
            )}
            {item.type === "task" && canManage && (
              <>
                <Button variant="outline" className="rounded-2xl" onClick={() => onComment(item)}>
                  <MessageCircle className="mr-2 h-4 w-4" /> Comment
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => onEdit(item)}>
                  <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-2xl"
                  onClick={() => onDelete(item)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Xóa
                </Button>
              </>
            )}
            <Button variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompletionReviewCard({
  detail,
  template,
  onReview,
  onReject,
  onComment,
}: {
  detail: CompletionDetail;
  template: TemplateRow;
  onReview: (template: TemplateRow, completion: CompletionRow, user: UserRow | null) => void;
  onReject: (template: TemplateRow, completion: CompletionRow, user: UserRow | null) => void;
  onComment: (template: TemplateRow, completion: CompletionRow, user: UserRow | null) => void;
}) {
  const { completion, submitter, reviewer, canReview, canComment } = detail;
  const status = normalizeTaskStatus(completion.status);
  const proofUrl = completion.proof_url?.trim();
  const submitNote = completion.completion_note || completion.note || "Không có";
  const feedback = completion.review_feedback || "Không có";
  const showReviewActions = canReview && status === "pending_review";
  const showCommentAction = canComment && (status === "pending_review" || status === "rejected");

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={submitter} className="h-10 w-10 border" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">
              {submitter?.full_name ?? "Không rõ nhân sự"}
            </p>
            <p className="text-xs text-slate-500">
              Gửi lúc: {formatDateTime(completion.submitted_at || completion.completed_at)}
            </p>
          </div>
        </div>
        <Badge className={cn("rounded-full border", statusPillClass(status))}>
          {completionStatusLabel(status)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DetailRichBlock label="Ghi chú gửi duyệt" value={submitNote} />
        <DetailRichBlock label="Feedback / Comment" value={feedback} />
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <DetailLine label="Người duyệt" value={reviewer?.full_name ?? "Chưa có"} />
        <DetailLine label="Thời gian duyệt" value={formatDateTime(completion.reviewed_at)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {proofUrl && (
          <Button variant="outline" className="rounded-2xl" asChild>
            <a href={proofUrl} target="_blank" rel="noreferrer">
              <Link2 className="mr-2 h-4 w-4" /> Mở link
            </a>
          </Button>
        )}
        {showReviewActions && (
          <>
            <Button
              variant="secondary"
              className="rounded-2xl"
              onClick={() => onReject(template, completion, submitter)}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Không duyệt
            </Button>
            <Button
              className="rounded-2xl"
              onClick={() => onReview(template, completion, submitter)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Duyệt
            </Button>
          </>
        )}
        {showCommentAction && (
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onComment(template, completion, submitter)}
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Comment
          </Button>
        )}
        {(status === "done" || status === "rejected") && (
          <Button variant="outline" className="rounded-2xl" onClick={() => toast.info(feedback)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Xem feedback
          </Button>
        )}
      </div>
    </article>
  );
}

function DetailLine({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 whitespace-normal break-words text-base font-bold text-slate-950",
          danger && "text-red-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRichBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-white p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
        {value}
      </p>
    </div>
  );
}

function TemplateProgressLine({
  users,
  completions,
}: {
  users: UserRow[];
  completions: CompletionRow[];
}) {
  const doneUsers = getCompletedTemplateUsers(users, completions);
  const pendingUsers = getPendingTemplateUsers(users, completions);
  return (
    <div className="rounded-xl border bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
        <span>Tiến độ checklist</span>
        <span>
          {doneUsers.length}/{users.length}
        </span>
      </div>
      {pendingUsers.length > 0 && (
        <div className="mt-2 flex items-center -space-x-2">
          {pendingUsers.slice(0, 4).map((user) => (
            <UserAvatar key={user.id} user={user} className="h-8 w-8 border" />
          ))}
          {pendingUsers.length > 4 && (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[11px] font-semibold text-slate-600">
              +{pendingUsers.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function columnDotClass(status: BoardStatus) {
  if (status === "todo") return "bg-orange-500";
  if (status === "rejected") return "bg-amber-500";
  if (status === "pending_review") return "bg-violet-500";
  return "bg-emerald-500";
}

function statusShortLabel(status: BoardStatus) {
  if (status === "todo") return "Cần làm";
  if (status === "rejected") return "Chưa duyệt";
  if (status === "pending_review") return "Đợi duyệt";
  return "Hoàn thành";
}

function statusPillClass(status: BoardStatus) {
  if (status === "todo") return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (status === "rejected") {
    return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }
  if (status === "pending_review") {
    return "border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-50";
  }
  return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
}

function normalizePriority(value: string | null | undefined): TaskPriority {
  return value === "low" || value === "high" || value === "medium" ? value : "medium";
}

function priorityLabel(value: string | null | undefined) {
  const priority = normalizePriority(value);
  if (priority === "high") return "Ưu tiên cao";
  if (priority === "low") return "Ưu tiên thấp";
  return "Ưu tiên vừa";
}

function priorityPillClass(value: string | null | undefined) {
  const priority = normalizePriority(value);
  if (priority === "high") return "border-red-100 bg-red-50 text-red-700 hover:bg-red-50";
  if (priority === "low") return "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50";
  return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
}

function UserSelect({
  users,
  value,
  onChange,
  disabled,
}: {
  users: UserRow[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Chọn nhân viên" />
      </SelectTrigger>
      <SelectContent>
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <span className="flex items-center gap-2">
              <UserAvatar user={user} className="border" />
              <span>{user.full_name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserAvatar({
  user,
  className,
}: {
  user: Pick<UserRow, "full_name" | "avatar_url"> | null;
  className?: string;
}) {
  const avatarUrl = user?.avatar_url?.trim();
  return (
    <Avatar
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white align-middle",
        className,
      )}
    >
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={user?.full_name ?? "Avatar"}
          className="h-full w-full object-cover"
        />
      )}
      <AvatarFallback className="flex h-full w-full items-center justify-center bg-slate-200 text-xs font-semibold leading-none text-slate-600">
        {getInitials(user?.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}

function getUsersForTeam(users: UserRow[], memberships: MembershipRow[], teamId: string) {
  const userIds = new Set(
    memberships
      .filter((membership) => membership.team_id === teamId)
      .map((membership) => membership.user_id),
  );
  return users.filter((user) => userIds.has(user.id));
}

function getTemplateScopedUsers(
  item: TemplateRow,
  users: UserRow[],
  memberships: MembershipRow[],
  options: TemplateUserScopeOptions,
) {
  if (options.isEmployee) {
    return users.filter((user) => user.id === options.currentUserId);
  }

  let scopedUsers = item.team_id ? getUsersForTeam(users, memberships, item.team_id) : users;

  if (!item.team_id && options.selectedTeamId !== "all") {
    scopedUsers = getUsersForTeam(users, memberships, options.selectedTeamId);
  }

  if (options.selectedUserId !== "all") {
    scopedUsers = scopedUsers.filter((user) => user.id === options.selectedUserId);
  }

  return scopedUsers;
}

function isTemplateCompletionDone(row: CompletionRow | undefined) {
  return Boolean(row && (row.completed || normalizeTaskStatus(row.status) === "done"));
}

function hasSubmittedTemplateCompletion(row: CompletionRow | undefined) {
  if (!row) return false;
  const status = normalizeTaskStatus(row.status);
  return Boolean(
    status === "pending_review" ||
    status === "rejected" ||
    status === "done" ||
    row.completed ||
    row.submitted_at ||
    row.completed_at ||
    row.completion_note ||
    row.proof_url,
  );
}

function getCompletedTemplateUsers(users: UserRow[], completions: CompletionRow[]) {
  return users.filter((user) =>
    completions.some((row) => row.user_id === user.id && isTemplateCompletionDone(row)),
  );
}

function getPendingTemplateUsers(users: UserRow[], completions: CompletionRow[]) {
  return users.filter(
    (user) => !completions.some((row) => row.user_id === user.id && isTemplateCompletionDone(row)),
  );
}

function getSubmittedTemplateUsers(users: UserRow[], completions: CompletionRow[]) {
  return users.filter((user) =>
    completions.some((row) => row.user_id === user.id && hasSubmittedTemplateCompletion(row)),
  );
}

function getTemplateBoardStatus(
  item: TemplateRow,
  completions: CompletionRow[],
  templateUsers: UserRow[],
): BoardStatus {
  const templateUserIds = new Set(templateUsers.map((user) => user.id));
  const rows = completions.filter(
    (row) => row.template_id === item.id && templateUserIds.has(row.user_id),
  );
  if (rows.some((row) => normalizeTaskStatus(row.status) === "pending_review")) {
    return "pending_review";
  }
  if (
    templateUsers.length > 0 &&
    templateUsers.every((user) =>
      rows.some((row) => row.user_id === user.id && isTemplateCompletionDone(row)),
    )
  ) {
    return "done";
  }
  if (rows.some((row) => normalizeTaskStatus(row.status) === "rejected")) return "rejected";
  return "todo";
}

function shouldShowTaskOnBoard(
  task: Pick<TaskRow, "task_date" | "deadline" | "status" | "completed_at">,
  today: string,
) {
  const status = normalizeTaskStatus(task.status);
  if (task.task_date === today) return true;
  if (status === "pending_review") return true;
  if (status !== "done" && task.deadline) return true;
  return status === "done" && isSameLocalDate(task.completed_at, today);
}

function compareTaskUrgency(a: TaskRow, b: TaskRow, today: string) {
  const priorityA = taskUrgencyPriority(a, today);
  const priorityB = taskUrgencyPriority(b, today);
  if (priorityA !== priorityB) return priorityA - priorityB;
  const deadlineA = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const deadlineB = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
  if (deadlineA !== deadlineB) return deadlineA - deadlineB;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function taskUrgencyPriority(task: TaskRow, today: string) {
  const status = normalizeTaskStatus(task.status);
  const state = getDeadlineState(task.deadline, status, today);
  if (state === "overdue") return 0;
  if (state === "today") return 1;
  if (status === "pending_review") return 2;
  if (state === "future") return 3;
  return 4;
}

function getDeadlineState(
  deadline: string | null,
  statusValue: string | null | undefined,
  today: string,
): DeadlineState {
  return getTaskDeadlineState({ deadline, status: statusValue }, new Date(), today);
}

function deadlineStateLabel(state: ReturnType<typeof getDeadlineState>) {
  if (state === "overdue") return "Quá hạn";
  if (state === "today") return "Hôm nay";
  if (state === "future") return "Sắp tới";
  return "";
}

function deadlinePillClass(state: ReturnType<typeof getDeadlineState>) {
  if (state === "overdue") return "border-red-100 bg-red-50 text-red-700 hover:bg-red-50";
  if (state === "today") return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (state === "future") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  return "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50";
}

function isSameLocalDate(value: string | null, today: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return formatYmd(date) === today;
}

function getInitials(name: string | null | undefined) {
  const words = (name ?? "NV").trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function formatDeadline(deadline: string | null) {
  if (!deadline) return "Chưa có deadline";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(deadline));
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function EmployeeSummaryPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-slate-100 bg-white text-slate-950";
  return (
    <div
      className={cn(
        "flex h-11 min-w-0 items-center justify-between gap-2 rounded-2xl border px-3 shadow-sm sm:min-w-[112px]",
        toneClass,
      )}
    >
      <p className="truncate text-[11px] font-semibold leading-tight text-slate-500">{label}</p>
      <p className="shrink-0 text-lg font-black leading-none">{value}</p>
    </div>
  );
}

function getUnifiedItemKey(item: UnifiedChecklistItem) {
  return item.type === "task" ? `task:${item.task.id}` : `template:${item.template.id}`;
}

function getUnifiedItemTitle(item: UnifiedChecklistItem) {
  return item.type === "task" ? item.task.title : item.template.title;
}

function getUnifiedItemDescription(item: UnifiedChecklistItem) {
  return item.type === "task" ? item.task.description : item.template.description;
}

function getUnifiedItemFeedback(
  item: UnifiedChecklistItem,
  getTemplateCompletion: (templateId: string) => CompletionRow | null | undefined,
) {
  if (item.type === "task") return item.task.review_feedback;
  return getTemplateCompletion(item.template.id)?.review_feedback ?? null;
}

function employeeStatusLabel(status: BoardStatus) {
  if (status === "todo") return "Cần làm";
  if (status === "rejected") return "Chưa duyệt";
  if (status === "pending_review") return "Đợi duyệt";
  return "Hoàn thành";
}

function completionStatusLabel(status: BoardStatus) {
  if (status === "pending_review") return "Chờ duyệt";
  if (status === "rejected") return "Không duyệt";
  if (status === "done") return "Đã duyệt";
  return "Cần làm";
}

function extractFirstUrl(value: string | null | undefined) {
  const match = value?.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function getTaskWorkLink(task: Pick<TaskRow, "link_url" | "description">) {
  return task.link_url?.trim() || extractFirstUrl(task.description);
}

function formatDateOnly(value: string | null) {
  if (!value) return "Không có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Không có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
