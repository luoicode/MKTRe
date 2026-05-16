import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  MailCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { todayStr } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

export function NotificationsBell() {
  const { profile, role } = useAuth();
  const profileId = profile?.id;
  const qc = useQueryClient();
  const queryClientRef = useRef(qc);
  const navigate = useNavigate();
  const [virtualReadIds, setVirtualReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    queryClientRef.current = qc;
  }, [qc]);

  useEffect(() => {
    if (!profileId) return;
    const raw = window.localStorage.getItem(`mktre-virtual-notification-reads:${profileId}`);
    setVirtualReadIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
  }, [profileId]);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", profileId, role],
    enabled: !!profileId,
    queryFn: async () => {
      const { data: notifications, error } = await supabase
        .from("notifications")
        .select(
          "id, title, message, body, type, kind, scope, severity, is_read, entity_type, entity_id, metadata, created_at",
        )
        .eq("target_profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      const virtualNotifications =
        role === "employee" || role === "leader"
          ? await buildEmployeeReminderNotifications(profileId!, notifications ?? [])
          : [];
      return {
        notifications: notifications ?? [],
        virtualNotifications,
      };
    },
  });

  useEffect(() => {
    if (!profileId) return;
    const channelName = `notifications:${profileId}`;
    const realtimeTopic = `realtime:${channelName}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      for (const existing of supabase.getChannels()) {
        if (existing.topic === realtimeTopic || existing.topic === channelName) {
          void supabase.removeChannel(existing);
        }
      }

      channel = supabase.channel(channelName);
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `target_profile_id=eq.${profileId}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const incoming = payload.new as NotificationRow;
              queryClientRef.current.setQueriesData<{
                notifications: NotificationRow[];
                virtualNotifications: VirtualNotification[];
              }>({ queryKey: ["notifications", profileId] }, (current) => {
                if (!current) return current;
                if (current.notifications.some((notification) => notification.id === incoming.id)) {
                  return current;
                }
                return {
                  ...current,
                  notifications: [incoming, ...current.notifications]
                    .sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )
                    .slice(0, 15),
                };
              });
              return;
            }
            queryClientRef.current.invalidateQueries({ queryKey: ["notifications", profileId] });
          },
        )
        .subscribe((status, error) => {
          if (error && import.meta.env.DEV) {
            console.warn("[NotificationsBell] realtime subscription error", status, error);
          }
        });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[NotificationsBell] realtime setup skipped", error);
      }
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [profileId]);

  const allNotifications = useMemo(
    () =>
      [...(data?.virtualNotifications ?? []), ...(data?.notifications ?? [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 15),
    [data],
  );

  const unread = useMemo(
    () =>
      allNotifications.filter((n) =>
        isVirtualNotification(n) ? !virtualReadIds.has(n.id) : !n.is_read,
      ).length,
    [allNotifications, virtualReadIds],
  );

  const markAllRead = async () => {
    if (!profile || !allNotifications.length) return;
    const unreadRows = (data?.notifications ?? []).filter((n) => !n.is_read).map((n) => n.id);
    const virtualUnreadIds = (data?.virtualNotifications ?? [])
      .filter((n) => !virtualReadIds.has(n.id))
      .map((n) => n.id);
    if (unreadRows.length) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("target_profile_id", profile.id)
        .in("id", unreadRows);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    if (virtualUnreadIds.length) {
      const next = new Set([...virtualReadIds, ...virtualUnreadIds]);
      setVirtualReadIds(next);
      window.localStorage.setItem(
        `mktre-virtual-notification-reads:${profile.id}`,
        JSON.stringify(Array.from(next)),
      );
    }
    toast.success("Đã đánh dấu đã đọc");
    qc.invalidateQueries({ queryKey: ["notifications", profile.id] });
  };

  const markOneRead = async (
    event: MouseEvent,
    notification: NotificationRow | VirtualNotification,
  ) => {
    event.stopPropagation();
    if (!profile) return;
    if (isVirtualNotification(notification)) {
      const next = new Set([...virtualReadIds, notification.id]);
      setVirtualReadIds(next);
      window.localStorage.setItem(
        `mktre-virtual-notification-reads:${profile.id}`,
        JSON.stringify(Array.from(next)),
      );
      return;
    }
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id)
      .eq("target_profile_id", profile.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["notifications", profile.id] });
  };

  const openNotification = async (notification: NotificationRow | VirtualNotification) => {
    if (!profile) return;
    if (isVirtualNotification(notification)) {
      const next = new Set([...virtualReadIds, notification.id]);
      setVirtualReadIds(next);
      window.localStorage.setItem(
        `mktre-virtual-notification-reads:${profile.id}`,
        JSON.stringify(Array.from(next)),
      );
    } else if (!notification.is_read) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("target_profile_id", profile.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: ["notifications", profile.id] });
    }

    const target = notificationToPath(notification, role);
    if (target) navigate({ to: target });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <p className="text-sm font-semibold">Thông báo</p>
            <p className="text-xs text-muted-foreground">{unread} chưa đọc</p>
          </div>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Đọc tất cả
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : allNotifications.length ? (
          <div className="max-h-96 overflow-y-auto">
            {allNotifications.map((n) => {
              const isUnread = isVirtualNotification(n) ? !virtualReadIds.has(n.id) : !n.is_read;
              const Icon = severityIcon(n.severity);
              return (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`block w-full border-b p-3 text-left transition last:border-0 hover:bg-muted/50 ${
                    isUnread ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 gap-2">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityClass(n.severity)}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                          <p className="text-sm font-medium">{n.title}</p>
                        </div>
                      </div>
                    </div>
                    <Badge variant={isUnread ? "default" : "outline"}>{n.type ?? n.kind}</Badge>
                  </div>
                  {(n.message ?? n.body) && (
                    <p className="mt-1 text-sm text-muted-foreground">{n.message ?? n.body}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("vi-VN")}
                    </p>
                    {isUnread && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => markOneRead(event, n)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            void markOneRead(event as unknown as MouseEvent, n);
                          }
                        }}
                        className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <MailCheck className="mr-1 h-3.5 w-3.5" />
                        Đã đọc
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">Chưa có thông báo.</div>
        )}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              if (role) navigate({ to: `/${role}/notifications` });
            }}
          >
            Xem tất cả thông báo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type NotificationRow = {
  id: string;
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

type VirtualNotification = NotificationRow & { virtual: true };

function isVirtualNotification(
  row: NotificationRow | VirtualNotification,
): row is VirtualNotification {
  return "virtual" in row && row.virtual;
}

async function buildEmployeeReminderNotifications(
  profileId: string,
  existingNotifications: NotificationRow[],
): Promise<VirtualNotification[]> {
  const date = todayStr();
  const now = new Date();
  const notifications: VirtualNotification[] = [];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id")
    .eq("assigned_to", profileId)
    .neq("status", "done")
    .or(`task_date.eq.${date},deadline.not.is.null,status.eq.pending_review`);
  if ((tasks ?? []).length > 0) {
    notifications.push({
      id: `virtual-task-${date}`,
      virtual: true,
      title: "Bạn có task cần hoàn thành hôm nay",
      body: `${tasks?.length ?? 0} task đang chờ xác nhận.`,
      kind: "task",
      type: "task_overdue",
      severity: "warning",
      is_read: false,
      entity_type: "task",
      created_at: `${date}T00:00:00`,
    });
  }

  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", profileId)
    .eq("is_active", true);
  const teamIds = (memberships ?? []).map((membership) => membership.team_id);
  const [{ data: templates }, { data: completions }, { data: slots }, { data: reports }] =
    await Promise.all([
      supabase.from("daily_task_templates").select("id, team_id").eq("is_active", true),
      supabase
        .from("task_completions")
        .select("template_id")
        .eq("user_id", profileId)
        .eq("completion_date", date)
        .eq("completed", true),
      supabase.from("report_slots").select("id, slot_name, slot_time").eq("is_active", true),
      supabase
        .from("slot_reports")
        .select("slot_id, report_date, status")
        .eq("user_id", profileId)
        .in("report_date", [date, addDays(date, -1)]),
    ]);

  const completedTemplateIds = new Set((completions ?? []).map((row) => row.template_id));
  const pendingTemplateCount = (templates ?? []).filter(
    (template) =>
      (!template.team_id || teamIds.includes(template.team_id)) &&
      !completedTemplateIds.has(template.id),
  ).length;
  if (pendingTemplateCount > 0) {
    notifications.push({
      id: `virtual-checklist-${date}`,
      virtual: true,
      title: "Bạn còn checklist thường ngày chưa xác nhận",
      body: `${pendingTemplateCount} checklist đang chờ xác nhận.`,
      kind: "task",
      type: "checklist_pending",
      severity: "warning",
      is_read: false,
      entity_type: "task_completion",
      created_at: `${date}T00:00:00`,
    });
  }

  const submitted = new Set(
    (reports ?? [])
      .filter((report) => report.status === "submitted" || report.status === "approved")
      .map((report) => `${report.report_date}:${report.slot_id}`),
  );
  const missingSlots = (slots ?? []).filter((slot) => {
    const reportDate = isPreviousDaySlot(slot) ? addDays(date, -1) : date;
    const timing = slotTimingState(slot, reportDate, now);
    if (timing !== "due" && timing !== "overdue") return false;
    return !submitted.has(`${reportDate}:${slot.id}`);
  });
  for (const slot of missingSlots) {
    const reportDate = isPreviousDaySlot(slot) ? addDays(date, -1) : date;
    const timing = slotTimingState(slot, reportDate, now);
    const type = timing === "due" ? "report_slot_due" : "report_slot_overdue";
    if (hasReportSlotNotification(existingNotifications, type, reportDate, slot.id)) continue;
    notifications.push({
      id: `virtual-report-${type}-${reportDate}-${slot.id}`,
      virtual: true,
      title: timing === "due" ? "Đến giờ báo cáo" : "Quá giờ báo cáo",
      body:
        timing === "due"
          ? `Đã đến giờ nhập báo cáo khung ${slot.slot_name}`
          : `Bạn đã quá giờ báo cáo khung ${slot.slot_name}`,
      kind: "report",
      type,
      severity: timing === "due" ? "warning" : "error",
      is_read: false,
      entity_type: "report",
      metadata: { report_date: reportDate, slot_id: slot.id, slot_time: slot.slot_time },
      created_at: `${reportDate}T${slot.slot_time}`,
    });
  }

  return notifications;
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

function notificationToPath(
  notification: NotificationRow | VirtualNotification,
  role: string | null,
) {
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

function isPreviousDaySlot(slot: { slot_name: string; slot_time: string }) {
  return slot.slot_name.includes("13") || slot.slot_time.startsWith("13:");
}

function slotTimingState(
  slot: { slot_name: string; slot_time: string },
  reportDate: string,
  now: Date,
) {
  const [hh = "0", mm = "0"] = slot.slot_time.replace("h", ":").split(":");
  const [year, month, day] = reportDate.split("-").map(Number);
  const slotAt = new Date(year, month - 1, day, Number(hh), Number(mm), 0, 0);
  const diffMinutes = (now.getTime() - slotAt.getTime()) / 60_000;
  if (diffMinutes < -30) return "upcoming";
  if (diffMinutes <= 60) return "due";
  return "overdue";
}

function hasReportSlotNotification(
  notifications: NotificationRow[],
  type: string,
  reportDate: string,
  slotId: string,
) {
  return notifications.some((notification) => {
    if (notification.type !== type) return false;
    const metadata = notification.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    return metadata.report_date === reportDate && metadata.slot_id === slotId;
  });
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
