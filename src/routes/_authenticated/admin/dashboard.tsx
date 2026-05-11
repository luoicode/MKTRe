import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtVnd } from "@/lib/reports";
import { Users, UsersRound, FileText, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({ component: AdminDashboard });

function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [users, teams, reportsToday, sums] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("slot_reports").select("id", { count: "exact", head: true }).eq("report_date", today),
        supabase.from("slot_reports").select("ads_cost, total_revenue").eq("report_date", today),
      ]);
      const totalAds = (sums.data ?? []).reduce((s, r) => s + Number(r.ads_cost || 0), 0);
      const totalRev = (sums.data ?? []).reduce((s, r) => s + Number(r.total_revenue || 0), 0);
      return {
        users: users.count ?? 0,
        teams: teams.count ?? 0,
        reportsToday: reportsToday.count ?? 0,
        totalAds,
        totalRev,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Tổng quan hệ thống hôm nay</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Nhân sự" value={String(stats?.users ?? "—")} />
        <StatCard icon={UsersRound} label="Teams" value={String(stats?.teams ?? "—")} />
        <StatCard icon={FileText} label="Báo cáo hôm nay" value={String(stats?.reportsToday ?? "—")} />
        <StatCard icon={TrendingUp} label="Doanh số hôm nay" value={fmtVnd(stats?.totalRev ?? 0)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Tổng chi phí Ads hôm nay</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{fmtVnd(stats?.totalAds ?? 0)}</p></CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-xl">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
