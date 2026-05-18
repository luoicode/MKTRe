import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  useSlots,
  todayStr,
  formatVnd,
  formatVndSigned,
  formatPercent,
  fmtInt,
  parseVndInput,
  calculateReportMetrics,
  formatDateVN,
  formatDateTimeVN,
  type ReportSlot,
} from "@/lib/reports";
import { VndInput } from "@/components/VndInput";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FolderOpen,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { SubmittedReportCard, type SubmittedReportData } from "@/components/SubmittedReportCard";
import { isReconciliationSlot } from "@/lib/reportAudit";
import { chooseReportImageDirectory } from "@/utils/reportImageStorage";

export const Route = createFileRoute("/_authenticated/employee/report")({
  component: EmployeeReport,
});

interface FormState {
  ads_cost: string;
  mess_count: string;
  data_count: string;
  closed_orders: string;
  daily_data_revenue: string;
  total_orders: string;
  total_revenue: string;
  note: string;
}
const empty: FormState = {
  ads_cost: "",
  mess_count: "",
  data_count: "",
  closed_orders: "",
  daily_data_revenue: "",
  total_orders: "",
  total_revenue: "",
  note: "",
};

interface ReportEntrySlot extends ReportSlot {
  reportDate: string;
  dueDate: string;
  group: "today" | "previous_day";
  groupLabel: string;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function slotMinutes(slot: ReportSlot) {
  const raw = slot.slot_time || slot.slot_name;
  const [hh = "0", mm = "0"] = raw.replace("h", ":").split(":");
  return Number(hh) * 60 + Number(mm);
}

function isPreviousDaySlot(slot: ReportSlot) {
  return slot.slot_name.includes("13") || slot.slot_time.startsWith("13:");
}

function buildEntrySlots(slots: ReportSlot[] | undefined, baseDate: string): ReportEntrySlot[] {
  return (slots ?? [])
    .filter((s) => s.is_active)
    .map((slot) => {
      const previous = isPreviousDaySlot(slot);
      return {
        ...slot,
        reportDate: previous ? addDays(baseDate, -1) : baseDate,
        dueDate: baseDate,
        group: previous ? ("previous_day" as const) : ("today" as const),
        groupLabel: previous ? "Hôm trước" : "Hôm nay",
      };
    })
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "today" ? -1 : 1;
      return slotMinutes(a) - slotMinutes(b);
    });
}

function getAutoSlot(slots: ReportEntrySlot[], now: Date) {
  const openSlot = [...slots]
    .sort((a, b) => dueAt(a).getTime() - dueAt(b).getTime())
    .find((s) => isOpen(s, now));
  if (openSlot) return openSlot.id;

  const futureSlot = [...slots]
    .sort((a, b) => openAt(a).getTime() - openAt(b).getTime())
    .find((s) => openAt(s).getTime() > now.getTime());
  return futureSlot?.id ?? slots[slots.length - 1]?.id;
}

function shouldAutoAdvance(
  active: ReportEntrySlot | undefined,
  slots: ReportEntrySlot[],
  nextId: string | undefined,
  now: Date,
) {
  if (!active || !nextId || active.id === nextId) return false;
  if (isLocked(active, now)) return true;
  const next = slots.find((slot) => slot.id === nextId);
  return !!next && isOpen(next, now) && !isOpen(active, now);
}

type SlotTimingState = "not_open" | "open" | "locked";

function dueAt(slot: ReportEntrySlot) {
  const raw = slot.slot_time || slot.slot_name;
  const [hh = "0", mm = "0"] = raw.replace("h", ":").split(":");
  const [year, month, day] = slot.dueDate.split("-").map(Number);
  return new Date(year, month - 1, day, Number(hh), Number(mm), 0, 0);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function openAt(slot: ReportEntrySlot) {
  return addMinutes(dueAt(slot), -60);
}

function closeAt(slot: ReportEntrySlot) {
  return addMinutes(dueAt(slot), 60);
}

function isOpen(slot: ReportEntrySlot, now: Date) {
  return now.getTime() >= openAt(slot).getTime() && now.getTime() <= closeAt(slot).getTime();
}

function isLocked(slot: ReportEntrySlot, now: Date) {
  return now.getTime() > closeAt(slot).getTime();
}

function slotTimingState(slot: ReportEntrySlot, now: Date): SlotTimingState {
  if (now.getTime() < openAt(slot).getTime()) return "not_open";
  if (isOpen(slot, now)) return "open";
  return "locked";
}

function isReminderWindow(slot: ReportEntrySlot, now: Date) {
  const reminderAt = addMinutes(dueAt(slot), -30);
  return now.getTime() >= reminderAt.getTime() && now.getTime() <= dueAt(slot).getTime();
}

function canEditReport(
  slot: ReportEntrySlot,
  now: Date,
  existing?: { status: string | null; submitted_at?: string | null } | null,
) {
  if (!isOpen(slot, now)) return false;
  if (!existing) return true;
  const status = String(existing.status ?? "");
  if (status === "approved" || status === "locked") return false;
  if (status === "submitted") {
    if (!existing.submitted_at) return false;
    return now.getTime() - new Date(existing.submitted_at).getTime() <= 20 * 60_000;
  }
  return true;
}

function slotVisual(
  slot: ReportEntrySlot,
  now: Date,
  report: { status: string | null } | undefined,
) {
  if (report && ["submitted", "approved"].includes(String(report.status))) {
    return {
      label: "Đã gửi",
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 data-[state=active]:bg-emerald-600 data-[state=active]:text-white",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }
  const state = slotTimingState(slot, now);
  if (state === "locked") {
    return {
      label: "Đã khoá",
      icon: AlertCircle,
      className:
        "border-red-200 bg-red-50 text-red-700 opacity-90 data-[state=active]:bg-red-600 data-[state=active]:text-white",
      badge: "bg-red-100 text-red-700",
    };
  }
  if (state === "open") {
    return {
      label: "Đang mở",
      icon: Clock3,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 data-[state=active]:bg-emerald-600 data-[state=active]:text-white",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }
  return {
    label: "Chưa mở",
    icon: Clock3,
    className:
      "border-slate-200 bg-slate-50 text-slate-500 opacity-80 data-[state=active]:bg-slate-700 data-[state=active]:text-white",
    badge: "bg-slate-100 text-slate-600",
  };
}

async function ensureReportSlotNotification(
  profileId: string,
  item: {
    slot: ReportEntrySlot;
    type: "report_slot_due";
    severity: "warning";
    title: string;
    message: string;
  },
) {
  const dedupeKey = `${item.type}:${profileId}:${item.slot.dueDate}:${item.slot.id}`;
  const metadata = {
    dedupe_key: dedupeKey,
    report_date: item.slot.reportDate,
    due_date: item.slot.dueDate,
    slot_id: item.slot.id,
    slot_time: item.slot.slot_time,
  };
  const { data: existing, error: existingError } = await supabase
    .from("notifications")
    .select("id")
    .eq("target_profile_id", profileId)
    .eq("type", item.type)
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1);

  if (existingError) {
    if (import.meta.env.DEV)
      console.warn("[report-slot-notification] lookup failed", existingError);
    return false;
  }
  if ((existing ?? []).length > 0) return true;

  const { data: legacyExisting, error: legacyExistingError } = await supabase
    .from("notifications")
    .select("id")
    .eq("target_profile_id", profileId)
    .eq("type", item.type)
    .contains("metadata", {
      report_date: item.slot.reportDate,
      slot_id: item.slot.id,
      slot_time: item.slot.slot_time,
    })
    .limit(1);

  if (legacyExistingError) {
    if (import.meta.env.DEV)
      console.warn("[report-slot-notification] legacy lookup failed", legacyExistingError);
    return false;
  }
  if ((legacyExisting ?? []).length > 0) return true;

  const payload: TablesInsert<"notifications"> = {
    target_profile_id: profileId,
    actor_profile_id: profileId,
    type: item.type,
    scope: "personal",
    entity_type: "report",
    entity_id: item.slot.id,
    title: item.title,
    message: item.message,
    severity: item.severity,
    metadata,
    is_read: false,
    user_id: profileId,
    created_by: profileId,
    kind: item.type,
    team_id: null,
    body: item.message,
  };

  const { error } = await supabase.from("notifications").insert(payload);
  if (error) {
    if (error.code === "23505") return true;
    if (import.meta.env.DEV) console.warn("[report-slot-notification] insert failed", error);
    return false;
  }
  return true;
}

export function EmployeeReport() {
  const { profile, role } = useAuth();
  const { data: slots } = useSlots();
  const [date] = useState(todayStr());
  const [now, setNow] = useState(() => new Date());
  const [activeSlot, setActiveSlot] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState<SubmittedReportData | null>(null);
  const [reportNotificationKeys, setReportNotificationKeys] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const entrySlots = useMemo(() => buildEntrySlots(slots, date), [slots, date]);
  const todaySlots = entrySlots.filter((s) => s.group === "today");
  const previousDaySlots = entrySlots.filter((s) => s.group === "previous_day");
  const activeEntry = entrySlots.find((s) => s.id === activeSlot);
  const { data: slotReports } = useQuery({
    queryKey: ["my-slot-statuses", profile?.id, date],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_reports")
        .select("slot_id, report_date, status")
        .eq("user_id", profile!.id)
        .in("report_date", [date, addDays(date, -1)]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: exportContext } = useQuery({
    queryKey: ["report-export-context", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data: membership, error: membershipError } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", profile!.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership?.team_id) return { teamName: null as string | null };

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("name")
        .eq("id", membership.team_id)
        .maybeSingle();
      if (teamError) throw teamError;
      return { teamName: team?.name ?? null };
    },
  });
  const reportBySlotDate = useMemo(
    () =>
      new Map(
        (slotReports ?? []).map((report) => [`${report.report_date}:${report.slot_id}`, report]),
      ),
    [slotReports],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!entrySlots.length) return;
    if (!activeSlot) {
      setActiveSlot(getAutoSlot(entrySlots, now));
      return;
    }
    if (submitted) return;
    const next = getAutoSlot(entrySlots, now);
    if (shouldAutoAdvance(activeEntry, entrySlots, next, now)) {
      setActiveSlot(next);
      setSubmitted(null);
    }
  }, [entrySlots, activeSlot, activeEntry, now, submitted]);

  useEffect(() => {
    if (!profile || (role !== "employee" && role !== "leader") || !slotReports) return;
    let cancelled = false;

    const submittedReports = reportBySlotDate;
    const pendingSlots = entrySlots
      .map((slot) => {
        const report = submittedReports.get(`${slot.reportDate}:${slot.id}`);
        if (report && ["submitted", "approved"].includes(String(report.status))) return null;
        if (!isReminderWindow(slot, now)) return null;
        const type = "report_slot_due" as const;
        return {
          slot,
          type,
          severity: "warning" as const,
          title: "Sắp đến giờ báo cáo",
          message: `Sắp đến giờ báo cáo khung ${slot.slot_name}`,
          key: `${type}:${slot.dueDate}:${slot.id}`,
        };
      })
      .filter(Boolean) as Array<{
      slot: ReportEntrySlot;
      type: "report_slot_due";
      severity: "warning";
      title: string;
      message: string;
      key: string;
    }>;

    const unseen = pendingSlots.filter((item) => !reportNotificationKeys.has(item.key));
    if (!unseen.length) return;

    void (async () => {
      const completedKeys: string[] = [];
      for (const item of unseen) {
        const emitted = await ensureReportSlotNotification(profile.id, item);
        if (emitted) completedKeys.push(item.key);
      }
      if (!cancelled && completedKeys.length) {
        setReportNotificationKeys((current) => {
          const next = new Set(current);
          for (const key of completedKeys) next.add(key);
          return next;
        });
        qc.invalidateQueries({ queryKey: ["notifications", profile.id] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entrySlots, now, profile, qc, reportBySlotDate, reportNotificationKeys, role, slotReports]);

  const handleSubmitted = (payload: SubmittedReportData) => {
    setSubmitted(payload);
  };

  return (
    <div className="w-full min-w-0 space-y-3 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Báo cáo của bạn</h1>
        <p className="text-sm text-muted-foreground">
          Hôm nay: {formatDateVN(date)}
          {activeEntry && (
            <>
              {" "}
              · Đang nhập: {activeEntry.groupLabel} ({formatDateVN(activeEntry.reportDate)})
            </>
          )}
        </p>
      </div>

      {!slots ? (
        <div className="flex justify-center py-10 md:min-h-0 md:flex-1 md:items-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Tabs
          value={activeSlot}
          onValueChange={(v) => {
            setActiveSlot(v);
            setSubmitted(null);
          }}
          className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        >
          <div className="grid shrink-0 gap-2 md:grid-cols-[1fr_200px]">
            <Card>
              <CardHeader className="px-3 py-2">
                <CardTitle className="text-base">Hôm nay</CardTitle>
                <CardDescription>11h55, 16h55, 21h00</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-muted/50 p-1 sm:grid-cols-3">
                  {todaySlots.map((s) => {
                    const visual = slotVisual(
                      s,
                      now,
                      reportBySlotDate.get(`${s.reportDate}:${s.id}`),
                    );
                    const Icon = visual.icon;
                    return (
                      <TabsTrigger
                        key={s.id}
                        value={s.id}
                        className={`h-auto items-start justify-start gap-2 border py-1.5 text-left ${visual.className}`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-semibold">{s.slot_name}</span>
                          <span
                            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${visual.badge}`}
                          >
                            {visual.label}
                          </span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-3 py-2">
                <CardTitle className="text-base">Hôm trước</CardTitle>
                <CardDescription>{formatDateVN(addDays(date, -1))}</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <TabsList className="grid h-auto w-full grid-cols-1 bg-muted/50 p-1">
                  {previousDaySlots.map((s) => {
                    const visual = slotVisual(
                      s,
                      now,
                      reportBySlotDate.get(`${s.reportDate}:${s.id}`),
                    );
                    const Icon = visual.icon;
                    return (
                      <TabsTrigger
                        key={s.id}
                        value={s.id}
                        className={`h-auto items-start justify-start gap-2 border py-1.5 text-left ${visual.className}`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-semibold">{s.slot_name}</span>
                          <span
                            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${visual.badge}`}
                          >
                            {visual.label}
                          </span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </CardContent>
            </Card>
          </div>
          {entrySlots.map((s) => (
            <TabsContent
              key={s.id}
              value={s.id}
              className="mt-3 md:min-h-0 md:flex-1 md:overflow-hidden data-[state=active]:md:block data-[state=inactive]:md:hidden"
            >
              {profile && activeSlot === s.id && (
                <SlotForm
                  profileId={profile.id}
                  fullName={profile.full_name}
                  slotId={s.id}
                  slotName={s.slot_name}
                  date={s.reportDate}
                  entrySlot={s}
                  now={now}
                  groupLabel={s.groupLabel}
                  teamName={exportContext?.teamName ?? null}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["my-reports"] })}
                  onSubmitted={handleSubmitted}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {submitted && <SubmittedReportCard data={submitted} onClose={() => setSubmitted(null)} />}
    </div>
  );
}

function NumberInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = "0",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Input
      className="h-8 text-sm"
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits);
      }}
    />
  );
}

function SlotForm({
  profileId,
  fullName,
  slotId,
  slotName,
  date,
  entrySlot,
  now,
  groupLabel,
  teamName,
  onSaved,
  onSubmitted,
}: {
  profileId: string;
  fullName: string;
  slotId: string;
  slotName: string;
  date: string;
  entrySlot: ReportEntrySlot;
  now: Date;
  groupLabel: string;
  teamName?: string | null;
  onSaved: () => void;
  onSubmitted: (d: SubmittedReportData) => void;
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const {
    data: existing,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["slot_report", profileId, date, slotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_reports")
        .select("*")
        .eq("user_id", profileId)
        .eq("report_date", date)
        .eq("slot_id", slotId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: hasReconciliationAudit } = useQuery({
    queryKey: ["report-reconciliation-audit", existing?.id],
    enabled: !!existing?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_audit_logs")
        .select("id")
        .eq("report_id", existing!.id)
        .eq("action_type", "reconciled")
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  useEffect(() => {
    if (existing) {
      const s = (n: number | null | undefined) => (n == null || Number(n) === 0 ? "" : String(n));
      setForm({
        ads_cost: s(existing.ads_cost),
        mess_count: s(existing.mess_count),
        data_count: s(existing.data_count),
        closed_orders: s(existing.closed_orders),
        daily_data_revenue: s(existing.daily_data_revenue),
        total_orders: s(existing.total_orders),
        total_revenue: s(existing.total_revenue),
        note: existing.note ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [existing]);

  const nums = useMemo(
    () => ({
      ads: parseVndInput(form.ads_cost),
      mess: Number(form.mess_count) || 0,
      data: Number(form.data_count) || 0,
      closed: Number(form.closed_orders) || 0,
      dailyRev: parseVndInput(form.daily_data_revenue),
      totalOrders: Number(form.total_orders) || 0,
      totalRev: parseVndInput(form.total_revenue),
    }),
    [
      form.ads_cost,
      form.mess_count,
      form.data_count,
      form.closed_orders,
      form.daily_data_revenue,
      form.total_orders,
      form.total_revenue,
    ],
  );

  const computed = useMemo(
    () =>
      calculateReportMetrics({
        ads_cost: nums.ads,
        mess_count: nums.mess,
        data_count: nums.data,
        closed_orders: nums.closed,
        daily_data_revenue: nums.dailyRev,
        total_orders: nums.totalOrders,
        total_revenue: nums.totalRev,
      }),
    [nums.ads, nums.mess, nums.data, nums.closed, nums.dailyRev, nums.totalOrders, nums.totalRev],
  );

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (nums.totalRev > 0 && nums.totalRev < nums.dailyRev)
      w.push("Tổng Doanh Số đang nhỏ hơn Doanh Số DATA trong ngày. Vui lòng kiểm tra lại số liệu.");
    if (nums.ads > 0 && nums.mess === 0 && nums.data === 0)
      w.push("Có Chi Phí Ads nhưng MESS và Data đều bằng 0.");
    if (nums.closed > nums.data && nums.data > 0)
      w.push("Đơn chốt DATA trong ngày đang lớn hơn Data.");
    if (nums.totalOrders > 0 && nums.totalOrders < nums.closed)
      w.push("Tổng Đơn Chốt đang nhỏ hơn Đơn chốt DATA trong ngày.");
    return w;
  }, [nums]);

  const editable = canEditReport(entrySlot, now, existing);
  const timingState = slotTimingState(entrySlot, now);
  const isReconciliation = isReconciliationSlot(slotName);
  const wasReconciled = isReconciliation || !!hasReconciliationAudit;

  const save = async (status: "draft" | "submitted") => {
    if (!editable) {
      toast.error(reportReadonlyMessage(timingState, existing));
      return;
    }
    setSaving(true);
    const submittedAt = status === "submitted" ? new Date().toISOString() : null;
    const payload = {
      user_id: profileId,
      report_date: date,
      slot_id: slotId,
      ads_cost: nums.ads,
      mess_count: nums.mess,
      data_count: nums.data,
      closed_orders: nums.closed,
      daily_data_revenue: nums.dailyRev,
      total_orders: nums.totalOrders,
      total_revenue: nums.totalRev,
      note: form.note || null,
      status,
      submitted_at: submittedAt,
    };
    const res = existing
      ? await supabase.from("slot_reports").update(payload).eq("id", existing.id)
      : await supabase.from("slot_reports").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error(`Lỗi: ${res.error.message}`);
      return;
    }
    if (status === "submitted") {
      const nowIso = new Date().toISOString();
      onSubmitted({
        fullName,
        teamName,
        reportDate: date,
        slotName,
        scopeLabel: isReconciliation ? "Chỉnh hôm trước" : "Hôm nay",
        submittedAt: submittedAt!,
        lastUpdatedAt: nowIso,
        wasReconciled,
        ads_cost: nums.ads,
        mess_count: nums.mess,
        data_count: nums.data,
        closed_orders: nums.closed,
        daily_data_revenue: nums.dailyRev,
        total_orders: nums.totalOrders,
        total_revenue: nums.totalRev,
        note: form.note,
      });
      setForm(empty);
    } else {
      toast.success("Đã lưu nháp");
    }
    await refetch();
    onSaved();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const VND_FIELDS = new Set<keyof FormState>(["ads_cost", "daily_data_revenue", "total_revenue"]);
  const numField = (k: keyof Omit<FormState, "note">, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      {VND_FIELDS.has(k) ? (
        <VndInput
          id={k}
          value={form[k]}
          onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
          disabled={!editable}
        />
      ) : (
        <NumberInput
          id={k}
          value={form[k]}
          onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
          disabled={!editable}
        />
      )}
    </div>
  );

  const recoveredNeg = computed.recovered < 0;

  return (
    <div className="grid gap-3 md:h-full md:min-h-0 lg:grid-cols-2">
      <Card className="md:flex md:min-h-0 md:flex-col">
        <CardHeader className="px-3 py-2">
          <CardTitle className="flex items-center justify-between">
            <span>Khung {slotName}</span>
            <span className="flex flex-wrap justify-end gap-1.5">
              <Badge variant={isReconciliation ? "secondary" : "outline"}>
                {isReconciliation ? "Chỉnh hôm trước" : "Hôm nay"}
              </Badge>
              {wasReconciled && <Badge variant="outline">Đã chỉnh sau reconciliation</Badge>}
              {existing && <StatusBadge status={existing.status as string} />}
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            {groupLabel} · Ngày báo cáo {formatDateVN(date)}. Nhập số liệu thô, hệ thống sẽ tự tính
            các chỉ số.
            {existing?.updated_at && (
              <span className="mt-1 block">
                Cập nhật cuối: {formatDateTimeVN(existing.updated_at)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 md:min-h-0 md:flex-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {numField("ads_cost", "Chi Phí Ads")}
            {numField("mess_count", "MESS")}
            {numField("data_count", "Data")}
            {numField("closed_orders", "Đơn chốt DATA trong ngày")}
            {numField("daily_data_revenue", "DOANH SỐ DATA trong ngày")}
            {numField("total_orders", "Tổng Đơn Chốt")}
            {numField("total_revenue", "Tổng Doanh Số")}
          </div>
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              className="min-h-12 text-sm"
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              disabled={!editable}
            />
          </div>

          {!editable && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {reportReadonlyMessage(timingState, existing)}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {existing?.rejected_reason && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Lý do từ chối: {existing.rejected_reason}
            </div>
          )}

          {editable && (
            <div className="flex flex-wrap justify-end gap-2 rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur">
              <Button
                size="icon"
                variant="outline"
                title="Chọn thư mục lưu ảnh báo cáo"
                aria-label="Chọn thư mục lưu ảnh báo cáo"
                onClick={() => void chooseReportImageDirectory()}
                disabled={saving}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => save("draft")} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Lưu nháp
              </Button>
              <Button size="sm" onClick={() => save("submitted")} disabled={saving}>
                <Send className="mr-2 h-4 w-4" />{" "}
                {existing?.status === "submitted" ? "Gửi lại báo cáo" : "Gửi báo cáo"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:flex md:min-h-0 md:flex-col">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-base">Chỉ số tự tính</CardTitle>
          <CardDescription>Cập nhật real-time theo số liệu nhập</CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3 md:min-h-0 md:flex-1">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Metric label="Chi phí ADS/MESS" value={formatVnd(computed.cp_mess)} />
            <Metric label="Chi phí ADS/Data" value={formatVnd(computed.cp_data)} />
            <Metric label="Tỉ lệ chốt DATA trong ngày" value={formatPercent(computed.conv_rate)} />
            <Metric label="Trung bình đơn" value={formatVnd(computed.avg_order)} />
            <Metric
              label="Chi phí ADS/Doanh số ngày"
              value={formatPercent(computed.cp_daily_pct)}
            />
            <Metric
              label="Chi phí ADS/Tổng Doanh Số"
              value={formatPercent(computed.cp_total_pct)}
            />
            <Metric
              label="Doanh số chốt lại"
              value={formatVndSigned(computed.recovered)}
              danger={recoveredNeg}
            />
            <Metric label="Tổng Đơn Chốt" value={fmtInt(nums.totalOrders)} />
          </dl>
          {recoveredNeg && (
            <div className="mt-3 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
              Tổng Doanh Số đang nhỏ hơn Doanh Số DATA trong ngày. Vui lòng kiểm tra lại số liệu.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function reportReadonlyMessage(
  timingState: SlotTimingState,
  existing?: { status: string | null; submitted_at?: string | null } | null,
) {
  const status = String(existing?.status ?? "");
  if (status === "approved" || status === "locked") return "Báo cáo đã được khóa, chỉ xem.";
  if (status === "submitted") return "Báo cáo đã gửi chỉ được sửa trong 20 phút đầu.";
  if (timingState === "not_open")
    return "Khung báo cáo chưa mở. Form sẽ mở trước deadline 1 tiếng.";
  if (timingState === "locked") return "Khung báo cáo đã khoá. Không thể nhập hoặc gửi thêm.";
  return "Không thể chỉnh sửa báo cáo ở thời điểm hiện tại.";
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${danger ? "text-red-600" : ""}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { v: "default" | "secondary" | "destructive" | "outline"; label: string }
  > = {
    draft: { v: "secondary", label: "Nháp" },
    submitted: { v: "default", label: "Đã gửi" },
    approved: { v: "default", label: "Đã duyệt" },
    rejected: { v: "destructive", label: "Từ chối" },
    locked: { v: "outline", label: "Khóa" },
  };
  const it = map[status] ?? { v: "outline" as const, label: status };
  return <Badge variant={it.v}>{it.label}</Badge>;
}
