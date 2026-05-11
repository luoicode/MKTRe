import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtVnd } from "@/lib/reports";
import { Users, FileText, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leader/dashboard")({ component: LeaderDashboard });

function LeaderDashboard() {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ["leader-stats", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: teams } = await supabase.from("teams").select("id").eq("leader_id", profile!.id);
      const teamIds = (teams ?? []).map((t) => t.id);
      if (!teamIds.length) return { members: 0, reports: 0, ads: 0, rev: 0 };

      const { data: members } = await supabase
        .from("team_memberships")
        .select("user_id", { count: "exact" })
        .in("team_id", teamIds)
        .eq("is_active", true);

      const { data: reports } = await supabase
        .from("slot_reports")
        .select("ads_cost, total_revenue")
        .in("team_id", teamIds)
        .eq("report_date", today);

      const ads = (reports ?? []).reduce((s, r) => s + Number(r.ads_cost || 0), 0);
      const rev = (reports ?? []).reduce((s, r) => s + Number(r.total_revenue || 0), 0);
      return { members: members?.length ?? 0, reports: reports?.length ?? 0, ads, rev };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leader Dashboard</h1>
        <p className="text-sm text-muted-foreground">Tổng quan team hôm nay</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Thành viên" value={String(data?.members ?? "—")} />
        <Stat icon={FileText} label="Báo cáo hôm nay" value={String(data?.reports ?? "—")} />
        <Stat icon={TrendingUp} label="Doanh số" value={fmtVnd(data?.rev ?? 0)} />
        <Stat icon={TrendingUp} label="Chi phí Ads" value={fmtVnd(data?.ads ?? 0)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Tip</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Vào "Báo cáo team" để xem bảng tổng hợp theo từng khung giờ và chụp màn hình gửi sếp.
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
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
