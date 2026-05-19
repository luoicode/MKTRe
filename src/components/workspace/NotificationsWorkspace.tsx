import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellPlus,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  MailCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import { notificationTypeBadgeClass, notificationTypeLabel } from "@/lib/notifications";
import { insertNotificationsWithTelegram } from "@/lib/telegram";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageContent, PageHeader, PageShell } from "@/components/layout/PageShell";
import { toast } from "sonner";

type TargetScope = "system" | "team";
type ReadFilter = "all" | "unread" | "read";
type NotificationSeverity = "info" | "success" | "warning" | "error";

const PAGE_SIZE = 20;

type NotificationRow = {
  id: string;
  target_profile_id?: string | null;
  actor_profile_id?: string | null;
  created_by?: string | null;
  title: string;
  body: string | null;
  message?: string | null;
  kind?: string | null;
  type?: string | null;
  scope?: string | null;
  severity?: string | null;
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Json | null;
  created_at: string;
};

type SentNotificationHistory = NotificationRow & {
  recipient_count: number;
  recipient_mode: "all_users" | "team" | "unknown";
  team_name: string | null;
};

function isTargetScope(value: string): value is TargetScope {
  return value === "system" || value === "team";
}

export function NotificationsWorkspace({ mode = "auto" }: { mode?: "auto" | "history" | "inbox" }) {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canCreate = role === "admin" || role === "manager";
  const isHistoryMode = mode === "history" || (mode === "auto" && canCreate);
  const pageTitle = mode === "inbox" ? "Tất cả thông báo" : "Thông báo";
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    body: string;
    severity: NotificationSeverity;
    target_scope: TargetScope;
    team_id: string;
  }>({
    title: "",
    body: "",
    severity: "info",
    target_scope: role === "admin" ? "system" : "team",
    team_id: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-workspace", role, profile?.id, readFilter, visibleCount],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let teamIds: string[] | undefined;
      if (role === "leader") teamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") teamIds = await getManagerTeamIds(profile!.id);
      let teamsQuery = supabase.from("teams").select("id, name").order("name");
      if (teamIds?.length) teamsQuery = teamsQuery.in("id", teamIds);

      let notificationsQuery = supabase
        .from("notifications")
        .select(
          "id, target_profile_id, actor_profile_id, created_by, title, message, body, type, kind, scope, severity, is_read, entity_type, entity_id, metadata, created_at",
        )
        .order("created_at", { ascending: false });

      if (isHistoryMode) {
        notificationsQuery = notificationsQuery
          .or(`actor_profile_id.eq.${profile!.id},created_by.eq.${profile!.id}`)
          .or("type.eq.announcement,kind.eq.announcement");
      } else {
        const recipientFilter = `target_profile_id.eq.${profile!.id},user_id.eq.${profile!.id}`;
        notificationsQuery = notificationsQuery.or(recipientFilter);
        if (readFilter === "unread") {
          notificationsQuery = notificationsQuery.eq("is_read", false);
        } else if (readFilter === "read") {
          notificationsQuery = notificationsQuery.eq("is_read", true);
        } else {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          notificationsQuery = notificationsQuery.or(
            `is_read.eq.false,created_at.gte.${cutoff.toISOString()}`,
          );
        }
      }

      const [{ data: teams, error: teamsError }, notificationsResult] = await Promise.all([
        teamsQuery,
        notificationsQuery.range(
          0,
          isHistoryMode ? Math.max(visibleCount * 250, 500) : visibleCount,
        ),
      ]);
      if (teamsError) throw teamsError;
      if (notificationsResult.error) throw notificationsResult.error;

      const memberships = teams?.length
        ? await supabase
            .from("team_memberships")
            .select("user_id, team_id")
            .in(
              "team_id",
              teams.map((team) => team.id),
            )
            .eq("is_active", true)
        : { data: [] };
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const { data: activeProfiles } = await supabase
        .from("profiles")
        .select("id, status")
        .eq("status", "active");

      const fetchedNotifications = (notificationsResult.data ?? []) as NotificationRow[];
      const teamNameById = new Map((teams ?? []).map((team) => [team.id, team.name]));
      const historyNotifications = buildSentHistory(fetchedNotifications, teamNameById);
      if (isHistoryMode) {
        console.debug("[MKTRe announcement history]", {
          currentUserId: profile!.id,
          rowsCountBeforeGroup: fetchedNotifications.length,
          groupsCountAfterGroup: historyNotifications.length,
          batchIds: historyNotifications.slice(0, 5).map((notification) => {
            const metadata = readMetadata(notification.metadata);
            return metadata.batch_id ?? notification.id;
          }),
        });
      }
      const adminIds = (adminRoles ?? []).map((row) => row.user_id);
      return {
        teams: teams ?? [],
        memberships: memberships.data ?? [],
        adminIds,
        activeUserIds: (activeProfiles ?? [])
          .map((row) => row.id)
          .filter((id) => id !== profile!.id && !adminIds.includes(id)),
        notifications: isHistoryMode
          ? historyNotifications.slice(0, visibleCount)
          : fetchedNotifications.slice(0, visibleCount),
        hasMore: isHistoryMode
          ? historyNotifications.length > visibleCount
          : fetchedNotifications.length > visibleCount,
      };
    },
  });

  const create = async () => {
    if (!form.title.trim()) {
      toast.error("Nhập tiêu đề thông báo");
      return;
    }
    if (form.target_scope === "team" && !form.team_id) {
      toast.error("Chọn team nhận thông báo");
      return;
    }
    if (!canCreate) {
      toast.error("Bạn chỉ có quyền đọc thông báo");
      return;
    }
    if (role === "manager" && form.target_scope !== "team") {
      toast.error("Manager chỉ được gửi thông báo theo team quản lý");
      return;
    }
    const targetIds =
      form.target_scope === "system"
        ? (data?.activeUserIds ?? [])
        : (data?.memberships ?? [])
            .filter((membership) => membership.team_id === form.team_id)
            .map((membership) => membership.user_id);
    const uniqueTargetIds = Array.from(new Set(targetIds));
    if (!uniqueTargetIds.length) {
      toast.error("Không có người nhận phù hợp");
      return;
    }
    const batchId = crypto.randomUUID();
    const selectedTeam = data?.teams.find((team) => team.id === form.team_id);
    const baseMetadata = {
      batch_id: batchId,
      created_by: profile!.id,
      audience_type: form.target_scope === "system" ? "all_users" : "team",
      recipient_count: uniqueTargetIds.length,
      recipient_mode: form.target_scope === "system" ? "all_users" : "team",
      ...(form.target_scope === "team"
        ? { team_id: form.team_id, team_name: selectedTeam?.name ?? null }
        : {}),
    };
    const payloads: TablesInsert<"notifications">[] = uniqueTargetIds.map((targetId) => ({
      target_profile_id: targetId,
      actor_profile_id: profile!.id,
      type: "announcement",
      scope: form.target_scope,
      entity_type: null,
      entity_id: null,
      title: form.title.trim(),
      message: form.body || null,
      severity: form.severity,
      metadata: baseMetadata,
      is_read: false,
      user_id: targetId,
      created_by: profile!.id,
      kind: "announcement",
      team_id: form.target_scope === "team" ? form.team_id : null,
      body: form.body || null,
    }));
    const { data: insertedRows, error } = await insertNotificationsWithTelegram(payloads);
    if (error) {
      toast.error(error.message);
      return;
    }
    console.debug("[MKTRe announcement create]", {
      actorId: profile!.id,
      audience_type: baseMetadata.audience_type,
      team_id: form.target_scope === "team" ? form.team_id : null,
      recipientIds: uniqueTargetIds,
      batch_id: batchId,
      insertedNotificationCount: payloads.length,
      insertedIds: (insertedRows ?? []).map((row) => row.id),
    });
    toast.success("Đã tạo thông báo");
    setCreateOpen(false);
    setVisibleCount(PAGE_SIZE);
    setForm((f) => ({
      ...f,
      title: "",
      body: "",
      team_id: "",
      target_scope: role === "admin" ? "system" : "team",
    }));
    await invalidateNotifications();
  };

  const invalidateNotifications = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["notifications-workspace"] }),
      qc.invalidateQueries({ queryKey: ["notifications", profile?.id] }),
    ]);
  };

  const markOneRead = async (notificationId: string) => {
    if (!profile) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .or(`target_profile_id.eq.${profile.id},user_id.eq.${profile.id}`);
    if (error) {
      toast.error(error.message);
      return;
    }
    await invalidateNotifications();
  };

  const markAllRead = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false)
      .or(`target_profile_id.eq.${profile.id},user_id.eq.${profile.id}`);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã đánh dấu đã đọc");
    await invalidateNotifications();
  };

  const openNotification = async (notification: NotificationRow) => {
    if (!notification.is_read) await markOneRead(notification.id);
    const target = notificationToPath(notification, role);
    if (target) navigate({ to: target });
  };

  const onFilterChange = (value: string) => {
    setReadFilter(value as ReadFilter);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <PageShell>
      <PageHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isHistoryMode
              ? "Tạo tin tức, nhắc báo cáo, KPI hoặc task mới."
              : "Hộp thông báo và các cập nhật mới nhất."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="shadow-sm">
              <BellPlus className="mr-2 h-4 w-4" />
              Tạo thông báo
            </Button>
          )}
          {!isHistoryMode && (
            <Button variant="outline" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Đọc tất cả
            </Button>
          )}
        </div>
      </PageHeader>

      {canCreate && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tạo thông báo</DialogTitle>
              <DialogDescription>
                Gửi thông báo đến toàn bộ người dùng hoặc một team theo quyền hiện tại.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tiêu đề">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Nhập tiêu đề thông báo"
                />
              </Field>
              <Field label="Mức độ">
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v as NotificationSeverity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Người nhận">
                <Select
                  value={form.target_scope}
                  onValueChange={(v) => {
                    if (isTargetScope(v)) setForm({ ...form, target_scope: v, team_id: "" });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {role === "admin" && <SelectItem value="system">Tất cả người dùng</SelectItem>}
                    <SelectItem value="team">Theo team</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.target_scope === "team" && (
                <Field label="Team">
                  <Select
                    value={form.team_id}
                    onValueChange={(v) => setForm({ ...form, team_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn team" />
                    </SelectTrigger>
                    <SelectContent>
                      {data?.teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <div className="md:col-span-2">
                <Label>Nội dung</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Nhập nội dung gửi đến người nhận"
                  className="min-h-28"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Huỷ
              </Button>
              <Button onClick={create}>
                <BellPlus className="mr-2 h-4 w-4" />
                Gửi thông báo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <PageContent className="overflow-hidden">
        <Card className="flex h-full min-h-0 flex-col">
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{isHistoryMode ? "Lịch sử thông báo" : "Thông báo gần đây"}</CardTitle>
            {!isHistoryMode && (
              <Select value={readFilter} onValueChange={onFilterChange}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="unread">Chưa đọc</SelectItem>
                  <SelectItem value="read">Đã đọc</SelectItem>
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            {isLoading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            ) : data?.notifications.length ? (
              <div className={"max-h-[520px] space-y-3 overflow-y-auto pr-2"}>
                {data.notifications.map((n) =>
                  isHistoryMode ? (
                    <SentNotificationCard key={n.id} notification={n as SentNotificationHistory} />
                  ) : (
                    <NotificationCard
                      key={n.id}
                      notification={n}
                      onOpen={() => openNotification(n)}
                      onMarkRead={() => markOneRead(n.id)}
                    />
                  ),
                )}
                {data.hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    >
                      Tải thêm
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Chưa có thông báo.
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageShell>
  );
}

function buildSentHistory(
  notifications: NotificationRow[],
  teamNameById: Map<string, string>,
): SentNotificationHistory[] {
  const grouped = new Map<
    string,
    { first: NotificationRow; count: number; targetIds: Set<string> }
  >();

  for (const notification of notifications) {
    const metadata = readMetadata(notification.metadata);
    const key =
      metadata.batch_id ??
      [
        notification.title,
        notification.message ?? notification.body ?? "",
        notification.scope ?? "",
        notification.created_at,
      ].join("|");
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (notification.target_profile_id) existing.targetIds.add(notification.target_profile_id);
    } else {
      grouped.set(key, {
        first: notification,
        count: 1,
        targetIds: new Set(notification.target_profile_id ? [notification.target_profile_id] : []),
      });
    }
  }

  return Array.from(grouped.values())
    .map(({ first, count, targetIds }) => {
      const metadata = readMetadata(first.metadata);
      const recipientMode: SentNotificationHistory["recipient_mode"] =
        metadata.recipient_mode === "all_users"
          ? "all_users"
          : metadata.recipient_mode === "team"
            ? "team"
            : "unknown";
      const teamName =
        metadata.team_name ??
        (metadata.team_id ? (teamNameById.get(metadata.team_id) ?? null) : null);
      return {
        ...first,
        recipient_count: metadata.recipient_count ?? (targetIds.size || count),
        recipient_mode: recipientMode,
        team_name: teamName,
      };
    })
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

function readMetadata(metadata: Json | null | undefined): {
  batch_id?: string;
  recipient_count?: number;
  recipient_mode?: string;
  team_id?: string;
  team_name?: string;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const record = metadata as Record<string, Json>;
  return {
    batch_id: typeof record.batch_id === "string" ? record.batch_id : undefined,
    recipient_count:
      typeof record.recipient_count === "number" ? record.recipient_count : undefined,
    recipient_mode: typeof record.recipient_mode === "string" ? record.recipient_mode : undefined,
    team_id: typeof record.team_id === "string" ? record.team_id : undefined,
    team_name: typeof record.team_name === "string" ? record.team_name : undefined,
  };
}

function SentNotificationCard({ notification }: { notification: SentNotificationHistory }) {
  const Icon = severityIcon(notification.severity);
  const recipientLabel =
    notification.recipient_mode === "all_users"
      ? "Tất cả người dùng"
      : notification.team_name
        ? `Team ${notification.team_name}`
        : "Theo team";

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityClass(notification.severity)}`} />
          <div className="min-w-0">
            <p className="font-semibold">{notification.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {notification.message ?? notification.body}
            </p>
          </div>
        </div>
        <Badge variant="outline">{notification.severity ?? "info"}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{recipientLabel}</Badge>
        <span>{notification.recipient_count} người nhận</span>
        <span>·</span>
        <span>{new Date(notification.created_at).toLocaleString("vi-VN")}</span>
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  onOpen,
  onMarkRead,
}: {
  notification: NotificationRow;
  onOpen: () => void;
  onMarkRead: () => void;
}) {
  const Icon = severityIcon(notification.severity);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className={`rounded-xl border p-3 text-left transition hover:bg-muted/50 ${
        notification.is_read ? "bg-card" : "bg-primary/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityClass(notification.severity)}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
              <p className="font-semibold">{notification.title}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {notification.message ?? notification.body}
            </p>
          </div>
        </div>
        <Badge className={notificationTypeBadgeClass(notification)}>
          {notificationTypeLabel(notification)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {notification.scope ?? "personal"} ·{" "}
          {new Date(notification.created_at).toLocaleString("vi-VN")}
        </span>
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onMarkRead();
            }}
          >
            <MailCheck className="mr-1.5 h-3.5 w-3.5" />
            Đã đọc
          </Button>
        )}
      </div>
    </div>
  );
}

function severityIcon(severity?: string | null) {
  if (severity === "success") return CheckCircle2;
  if (severity === "warning") return TriangleAlert;
  if (severity === "error") return XCircle;
  return Info;
}

function severityClass(severity?: string | null) {
  if (severity === "success") return "text-emerald-600";
  if (severity === "warning") return "text-amber-600";
  if (severity === "error") return "text-destructive";
  return "text-primary";
}

function notificationToPath(notification: NotificationRow, role: string | null) {
  if (!role) return null;
  const base = `/${role}`;
  if (notification.entity_type === "task" || notification.entity_type === "task_completion") {
    return `${base}/tasks`;
  }
  if (notification.entity_type === "kpi") return `${base}/kpi`;
  if (notification.entity_type === "report") {
    if (role === "employee") return "/employee/report";
    if (role === "leader") return "/leader/report-slots";
    if (role === "manager") return "/manager/reports";
    if (role === "admin") return "/admin/reports";
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
