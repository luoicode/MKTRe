import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
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
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import { formatYmd } from "@/lib/dateRange";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type UserRow = Pick<Tables<"profiles">, "id" | "full_name" | "username" | "avatar_url">;
type MembershipRow = Pick<Tables<"team_memberships">, "team_id" | "user_id" | "role_in_team">;
type TaskRow = Tables<"tasks"> & {
  profiles: UserRow | null;
  teams: TeamRow | null;
};
type TemplateRow = Tables<"daily_task_templates">;
type CompletionRow = Tables<"task_completions">;
type TaskStatus = Enums<"task_status">;
type BoardStatus = TaskStatus;
type CompletionTarget =
  | { type: "task"; id: string; title: string; teamId: string | null }
  | { type: "template"; id: string; title: string; teamId: string | null };
type ReviewTarget =
  | { type: "task"; task: TaskRow }
  | { type: "template"; template: TemplateRow; completion: CompletionRow; user: UserRow | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const boardColumns: Array<{ status: BoardStatus; title: string; tone: string }> = [
  { status: "todo", title: "Cần làm", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  {
    status: "in_progress",
    title: "Đã làm",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    status: "pending_review",
    title: "Đang duyệt",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    status: "done",
    title: "Hoàn thành",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
];

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export function TasksWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const canAssign = role === "manager" || role === "leader";
  const isEmployee = role === "employee";
  const date = formatYmd(new Date());
  const [task, setTask] = useState({
    team_id: "",
    assigned_to: "",
    title: "",
    description: "",
    deadline: "",
  });
  const [template, setTemplate] = useState({ team_id: "", title: "", description: "" });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState({ title: "", description: "" });
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [completionForm, setCompletionForm] = useState({ note: "", proof_url: "" });
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BoardStatus | "all">("all");
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tasks-workspace", role, profile?.id, date],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") teamIds = await getManagerTeamIds(profile!.id);
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
            .eq("role_in_team", "employee")
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
      if (role === "admin") tasksQuery = tasksQuery.limit(0);
      const { data: rawTasks, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      const taskProfileIds = Array.from(
        new Set((rawTasks ?? []).map((row) => row.assigned_to).filter(Boolean)),
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
      const tasks: TaskRow[] = (rawTasks ?? [])
        .filter((row) => shouldShowTaskOnBoard(row, date))
        .map((row) => ({
          ...row,
          profiles: profileMap.get(row.assigned_to) ?? null,
          teams: row.team_id ? (teamMap.get(row.team_id) ?? null) : null,
        }));

      let templatesQuery = supabase
        .from("daily_task_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (role === "admin") templatesQuery = templatesQuery.limit(0);
      const { data: templates } = await templatesQuery;
      const { data: completions } = await supabase
        .from("task_completions")
        .select("*")
        .eq("completion_date", date);

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
      }

      return {
        teams,
        memberships: (memberships ?? []) as MembershipRow[],
        users: users ?? [],
        tasks,
        templates: ((templates ?? []) as TemplateRow[]).filter(
          (row) => !row.team_id || activeTeamIds.includes(row.team_id),
        ),
        completions: (completions ?? []) as CompletionRow[],
      };
    },
  });

  useEffect(() => {
    if (role !== "leader" || !data?.teams.length) return;
    const teamId = data.teams[0].id;
    setTask((current) => (current.team_id ? current : { ...current, team_id: teamId }));
    setTemplate((current) => (current.team_id ? current : { ...current, team_id: teamId }));
  }, [data?.teams, role]);

  const taskUsers = task.team_id
    ? getUsersForTeam(data?.users ?? [], data?.memberships ?? [], task.team_id)
    : [];
  const teamMembers = useMemo(() => data?.users ?? [], [data?.users]);
  const shownTasks = useMemo(() => {
    const rows = data?.tasks ?? [];
    return rows.filter((item) => {
      const matchesUser =
        !canAssign || selectedUserId === "all" || item.assigned_to === selectedUserId;
      return matchesUser;
    });
  }, [canAssign, data?.tasks, selectedUserId]);
  const totalWorkCount = (data?.tasks.length ?? 0) + (data?.templates.length ?? 0);
  const completedTaskCount = (data?.tasks ?? []).filter((item) => item.status === "done").length;
  const completedTemplateCount = (data?.templates ?? []).filter((item) => {
    const status = getTemplateBoardStatus(
      item,
      data?.completions ?? [],
      data?.users ?? [],
      data?.memberships ?? [],
      profile?.id,
      isEmployee,
    );
    return status === "done";
  }).length;
  const completedWorkCount = completedTaskCount + completedTemplateCount;
  const progressValue = totalWorkCount ? (completedWorkCount / totalWorkCount) * 100 : 0;

  useEffect(() => {
    if (selectedUserId === "all") return;
    if (!teamMembers.some((member) => member.id === selectedUserId)) setSelectedUserId("all");
  }, [selectedUserId, teamMembers]);

  const filteredTasks = useMemo(() => {
    const keyword = taskSearch.trim().toLowerCase();
    return shownTasks
      .filter((item) => {
        const matchesKeyword =
          !keyword ||
          [item.title, item.description, item.profiles?.full_name, item.teams?.name].some((value) =>
            value?.toLowerCase().includes(keyword),
          );
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        return matchesKeyword && matchesStatus;
      })
      .sort((a, b) => compareTaskUrgency(a, b, date));
  }, [date, shownTasks, statusFilter, taskSearch]);

  const filteredTemplates = useMemo(() => {
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
      const status = getTemplateBoardStatus(
        item,
        data?.completions ?? [],
        data?.users ?? [],
        data?.memberships ?? [],
        profile?.id,
        isEmployee,
      );
      const matchesKeyword =
        !keyword ||
        [
          item.title,
          item.description,
          data?.teams.find((team) => team.id === item.team_id)?.name,
        ].some((value) => value?.toLowerCase().includes(keyword));
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesKeyword && matchesStatus && matchesUser;
    });
  }, [
    data?.completions,
    data?.memberships,
    data?.teams,
    data?.templates,
    data?.users,
    isEmployee,
    profile?.id,
    selectedUserId,
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
    toast.success("Đã giao task");
    setTask((current) => ({ ...current, title: "", description: "", deadline: "" }));
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

  const updateTaskStatus = async (id: string, status: TaskStatus) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã cập nhật task");
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const startTemplate = async (item: TemplateRow) => {
    if (!profile) return;
    const payload: TablesInsert<"task_completions"> = {
      template_id: item.id,
      user_id: profile.id,
      completion_date: date,
      completed: false,
      completed_at: null,
      status: "in_progress",
    };
    const { error } = await supabase
      .from("task_completions")
      .upsert(payload, { onConflict: "template_id,user_id,completion_date" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã bắt đầu checklist");
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
  };

  const submitForReview = async () => {
    if (!profile || !completionTarget) return;
    const note = completionForm.note.trim() || null;
    const proofUrl = completionForm.proof_url.trim() || null;
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
      const { error } = await supabase
        .from("task_completions")
        .upsert(payload, { onConflict: "template_id,user_id,completion_date" });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Đã gửi duyệt");
    setCompletionTarget(null);
    qc.invalidateQueries({ queryKey: ["tasks-workspace"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const startEditTemplate = (row: TemplateRow) => {
    setEditingTemplateId(row.id);
    setEditingTemplate({ title: row.title ?? "", description: row.description ?? "" });
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

  const reviewItem = async (approved: boolean) => {
    if (!profile || !reviewTarget) return;
    const now = new Date().toISOString();
    if (reviewTarget.type === "task") {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: approved ? "done" : "in_progress",
          completed_at: approved ? now : null,
          reviewed_at: now,
          reviewed_by: profile.id,
          review_feedback: reviewFeedback.trim() || null,
        })
        .eq("id", reviewTarget.task.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("task_completions")
        .update({
          status: approved ? "done" : "in_progress",
          completed: approved,
          completed_at: approved ? now : null,
          reviewed_at: now,
          reviewed_by: profile.id,
          review_feedback: reviewFeedback.trim() || null,
        })
        .eq("id", reviewTarget.completion.id);
      if (error) {
        toast.error(error.message);
        return;
      }
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
          <Plus className="mr-2 h-4 w-4" /> Tạo checklist
        </Button>
      </div>
    </div>
  );

  const renderTaskCard = (item: TaskRow) => (
    <div
      key={item.id}
      className={cn(
        "overflow-hidden rounded-[1.35rem] border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        getDeadlineState(item.deadline, item.status, date) === "overdue"
          ? "border-red-200"
          : "border-slate-200",
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
          <MoreHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            • Internal
          </Badge>
          <Badge
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              statusPillClass(item.status),
            )}
          >
            • {statusShortLabel(item.status)}
          </Badge>
          {getDeadlineState(item.deadline, item.status, date) !== "none" && (
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                deadlinePillClass(getDeadlineState(item.deadline, item.status, date)),
              )}
            >
              • {deadlineStateLabel(getDeadlineState(item.deadline, item.status, date))}
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

        <div className="mt-2 flex flex-wrap gap-2">
          {item.assigned_to === profile?.id && item.status === "todo" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-lg px-2.5 text-xs"
              onClick={() => updateTaskStatus(item.id, "in_progress")}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> Đã làm
            </Button>
          )}
          {item.assigned_to === profile?.id && item.status === "in_progress" && (
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
          {item.assigned_to === profile?.id && item.status === "pending_review" && (
            <Badge className="h-7 rounded-lg border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-700">
              Chờ leader duyệt
            </Badge>
          )}
          {item.assigned_to === profile?.id && item.status === "done" && (
            <Badge className="h-7 rounded-lg border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Đã xong
            </Badge>
          )}
          {canAssign && item.status === "pending_review" && (
            <Button
              size="sm"
              className="h-7 rounded-lg px-2.5 text-xs"
              onClick={() => setReviewTarget({ type: "task", task: item })}
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

  const renderTemplateCard = (item: TemplateRow) => {
    const completion = data?.completions.find(
      (row) => row.template_id === item.id && row.user_id === profile?.id,
    );
    const templateUsers = item.team_id
      ? getUsersForTeam(data?.users ?? [], data?.memberships ?? [], item.team_id)
      : (data?.users ?? []);
    const templateCompletions = (data?.completions ?? []).filter(
      (row) => row.template_id === item.id,
    );
    const doneUsers = templateUsers.filter((user) =>
      templateCompletions.some(
        (row) => row.user_id === user.id && (row.completed || row.status === "done"),
      ),
    );
    const pendingReviewRows = templateCompletions.filter((row) => row.status === "pending_review");
    const currentStatus = getTemplateBoardStatus(
      item,
      data?.completions ?? [],
      data?.users ?? [],
      data?.memberships ?? [],
      profile?.id,
      isEmployee,
    );

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

          {canAssign && pendingReviewRows.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <p className="text-[11px] font-semibold text-violet-700">Chờ duyệt</p>
              {pendingReviewRows.slice(0, 3).map((row) => {
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
                onClick={() => startTemplate(item)}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" /> Đã làm
              </Button>
            )}
            {isEmployee && currentStatus === "in_progress" && (
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
            {templateUsers.slice(0, 3).map((user) => (
              <UserAvatar key={user.id} user={user} />
            ))}
            {!templateUsers.length && <UserAvatar user={null} />}
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

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
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
                <RotateCcw className="mr-2 h-4 w-4" /> Yêu cầu làm lại
              </Button>
              <Button onClick={() => reviewItem(true)}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Duyệt hoàn thành
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

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Thêm checklist thường ngày</DialogTitle>
          </DialogHeader>
          {templateForm}
        </DialogContent>
      </Dialog>

      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-5">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                {isEmployee ? "Công Việc Của Tôi" : "Checklist công việc"}
              </h1>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {isEmployee
                ? `${profile?.full_name ?? "Marketing"} · Cập nhật lúc ${new Intl.DateTimeFormat(
                    "vi-VN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    },
                  ).format(new Date())}`
                : "Quản lý nhiệm vụ, checklist và luồng duyệt của đội ngũ"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isEmployee && (
              <Badge className="rounded-full border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 shadow-sm">
                <span className="mr-2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {Math.round(progressValue)}% hoàn thành hôm nay
              </Badge>
            )}
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
        </div>

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

          <StatusTabs value={statusFilter} onChange={setStatusFilter} />

          {canAssign && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="h-12 w-full rounded-2xl bg-white shadow-sm sm:w-56">
                <SelectValue placeholder="Người phụ trách" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả team</SelectItem>
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
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-72 items-center justify-center rounded-3xl border bg-white md:min-h-0 md:flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="min-w-0 md:min-h-0 md:flex-1 md:overflow-hidden">
          <div className="grid gap-5 overflow-x-auto pb-2 md:h-full md:min-h-0 md:grid-cols-4 md:overflow-visible">
            {boardColumns.map((column) => {
              const columnTasks = filteredTasks.filter((item) => item.status === column.status);
              const columnTemplates = filteredTemplates.filter((item) => {
                const status = getTemplateBoardStatus(
                  item,
                  data?.completions ?? [],
                  data?.users ?? [],
                  data?.memberships ?? [],
                  profile?.id,
                  isEmployee,
                );
                return status === column.status;
              });
              const count = columnTasks.length + columnTemplates.length;

              return (
                <section
                  key={column.status}
                  className="min-h-80 min-w-[280px] md:flex md:min-h-0 md:min-w-0 md:flex-col md:overflow-hidden"
                >
                  <div className="mb-4 flex shrink-0 items-center gap-3">
                    <span className={cn("h-3 w-3 rounded-full", columnDotClass(column.status))} />
                    <h2 className="text-base font-bold text-slate-900">{column.title}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {count}
                    </span>
                  </div>
                  <div className="space-y-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
                    {columnTemplates.map((item) => renderTemplateCard(item))}
                    {columnTasks.map((item) => renderTaskCard(item))}
                    {!count && <Empty text="Trống" />}
                  </div>
                </section>
              );
            })}
          </div>
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

function CardActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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
      <DropdownMenuContent align="end" className="w-36 rounded-2xl border bg-white p-1.5 shadow-lg">
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
}: {
  value: BoardStatus | "all";
  onChange: (value: BoardStatus | "all") => void;
}) {
  const options: Array<{ value: BoardStatus | "all"; label: string }> = [
    { value: "all", label: "Tất cả" },
    ...boardColumns.map((column) => ({ value: column.status, label: column.title })),
  ];

  return (
    <div className="flex h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-w-24 rounded-xl px-4 text-sm font-semibold transition",
            value === option.value
              ? "bg-slate-950 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function columnDotClass(status: BoardStatus) {
  if (status === "todo") return "bg-orange-500";
  if (status === "in_progress") return "bg-blue-500";
  if (status === "pending_review") return "bg-violet-500";
  return "bg-emerald-500";
}

function statusShortLabel(status: BoardStatus) {
  if (status === "todo") return "Cần làm";
  if (status === "in_progress") return "Đã làm";
  if (status === "pending_review") return "Đang duyệt";
  return "Hoàn thành";
}

function statusPillClass(status: BoardStatus) {
  if (status === "todo") return "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50";
  if (status === "in_progress") return "border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-50";
  if (status === "pending_review") {
    return "border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-50";
  }
  return "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
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

function getTemplateBoardStatus(
  item: TemplateRow,
  completions: CompletionRow[],
  users: UserRow[],
  memberships: MembershipRow[],
  currentUserId: string | undefined,
  isEmployee: boolean,
): BoardStatus {
  const rows = completions.filter((row) => row.template_id === item.id);
  if (isEmployee) {
    return normalizeCompletionStatus(rows.find((row) => row.user_id === currentUserId));
  }

  const templateUsers = item.team_id ? getUsersForTeam(users, memberships, item.team_id) : users;
  if (rows.some((row) => row.status === "pending_review")) return "pending_review";
  if (
    templateUsers.length > 0 &&
    templateUsers.every((user) =>
      rows.some((row) => row.user_id === user.id && (row.completed || row.status === "done")),
    )
  ) {
    return "done";
  }
  if (rows.some((row) => row.status === "in_progress")) return "in_progress";
  return "todo";
}

function normalizeCompletionStatus(row: CompletionRow | undefined): BoardStatus {
  if (!row) return "todo";
  if (row.status === "todo" || row.status === "in_progress" || row.status === "pending_review") {
    return row.status;
  }
  if (row.completed || row.status === "done") return "done";
  return "todo";
}

function shouldShowTaskOnBoard(
  task: Pick<TaskRow, "task_date" | "deadline" | "status" | "completed_at">,
  today: string,
) {
  if (task.task_date === today) return true;
  if (task.status === "pending_review") return true;
  if (task.status !== "done" && task.deadline) return true;
  return task.status === "done" && isSameLocalDate(task.completed_at, today);
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
  const state = getDeadlineState(task.deadline, task.status, today);
  if (state === "overdue") return 0;
  if (state === "today") return 1;
  if (task.status === "pending_review") return 2;
  if (state === "future") return 3;
  return 4;
}

function getDeadlineState(deadline: string | null, status: TaskStatus, today: string) {
  if (!deadline || status === "done") return "none" as const;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return "none" as const;
  const start = new Date(`${today}T00:00:00`);
  const next = new Date(start);
  next.setDate(start.getDate() + 1);
  if (due < start) return "overdue" as const;
  if (due < next) return "today" as const;
  return "future" as const;
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
