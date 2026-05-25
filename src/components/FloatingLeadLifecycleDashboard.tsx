import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Filter, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildFloatingLeadPersonPerformance,
  floatingLeadLifecycleLabels,
  floatingLeadLifecycleOrder,
  formatLifecyclePercent,
  summarizeFloatingLeadLifecycle,
  type FloatingLeadPersonPerformance,
} from "@/lib/floatingLeadAnalytics";
import type { FloatingLeadRow } from "@/lib/floatingLeads";
import { cn } from "@/lib/utils";

export function FloatingLeadLifecycleDashboard({
  leads,
  title = "Lifecycle lead",
  subtitle = "Funnel xử lý lead theo trạng thái lifecycle hiện tại.",
  people = [],
  personRole = "sale",
}: {
  leads: FloatingLeadRow[];
  title?: string;
  subtitle?: string;
  people?: Array<{ id: string; name: string }>;
  personRole?: "sale" | "marketing";
}) {
  const summary = summarizeFloatingLeadLifecycle(leads);
  const funnelRows = floatingLeadLifecycleOrder.map((status) => ({
    status,
    label: floatingLeadLifecycleLabels[status],
    count: summary.counts[status],
  }));
  const performance = buildFloatingLeadPersonPerformance(leads, {
    people,
    role: personRole,
  }).slice(0, 8);

  return (
    <section className="space-y-3">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-primary" />
                {title}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <LifecycleRate label="Conversion" value={summary.conversionRate} tone="green" />
              <LifecycleRate label="Contact" value={summary.contactRate} tone="blue" />
              <LifecycleRate label="Drop" value={summary.dropRate} tone="red" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <LifecycleStat label="Tổng lead" value={summary.total} tone="dark" />
            {floatingLeadLifecycleOrder.map((status) => (
              <LifecycleStat
                key={status}
                label={floatingLeadLifecycleLabels[status]}
                value={summary.counts[status]}
                tone={statusTone(status)}
              />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-2xl border bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-black">
                <Filter className="h-4 w-4 text-primary" />
                Funnel lead
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelRows}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      dy={16}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-black">
                  {personRole === "sale" ? "Hiệu suất Sale" : "Lead theo Marketing"}
                </p>
                <span className="text-xs text-muted-foreground">Top {performance.length}</span>
              </div>
              <div className="space-y-2">
                {performance.length ? (
                  performance.map((row) => <PerformanceRow key={row.id} row={row} />)
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    Chưa có dữ liệu hiệu suất trong khoảng này.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function LifecycleRate({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "green" | "blue" | "red";
}) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-rose-50 text-rose-700",
  };
  const Icon = tone === "red" ? TrendingDown : TrendingUp;
  return (
    <div className={cn("rounded-xl px-3 py-2 text-right", styles[tone])}>
      <div className="flex items-center justify-end gap-1 text-[11px] font-bold uppercase">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-lg font-black">{formatLifecyclePercent(value)}</p>
    </div>
  );
}

function LifecycleStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "dark" | "slate" | "blue" | "cyan" | "amber" | "green" | "rose";
}) {
  const styles = {
    dark: "bg-slate-900 text-white",
    slate: "bg-slate-100 text-slate-800",
    blue: "bg-blue-50 text-blue-700",
    cyan: "bg-cyan-50 text-cyan-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className={cn("rounded-xl px-3 py-2", styles[tone])}>
      <p className="text-[11px] font-bold uppercase opacity-75">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}

function PerformanceRow({ row }: { row: FloatingLeadPersonPerformance }) {
  return (
    <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold">{row.name}</p>
        <p className="text-sm font-black text-emerald-700">
          {formatLifecyclePercent(row.conversionRate)}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        <span>{row.total} lead</span>
        <span>{row.claimed} giữ</span>
        <span>{row.called} gọi</span>
        <span>{row.closed} chốt</span>
      </div>
    </div>
  );
}

function statusTone(
  status: (typeof floatingLeadLifecycleOrder)[number],
): "slate" | "blue" | "cyan" | "amber" | "green" | "rose" {
  if (status === "new") return "slate";
  if (status === "claimed") return "blue";
  if (status === "called_1" || status === "called_2") return "cyan";
  if (status === "called_3") return "amber";
  if (status === "closed") return "green";
  return "rose";
}
