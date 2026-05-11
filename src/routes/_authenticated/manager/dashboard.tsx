import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Briefcase, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager/dashboard")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["manager-teams", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data: mta } = await supabase
        .from("manager_team_assignments")
        .select("team_id")
        .eq("manager_id", profile!.id)
        .eq("is_active", true);
      const teamIds = (mta ?? []).map((m) => m.team_id);
      if (teamIds.length === 0) return { teams: [], memberCount: 0 };
      const { data: teams } = await supabase
        .from("teams").select("id, name, description").in("id", teamIds);
      const { data: members } = await supabase
        .from("team_memberships").select("user_id").in("team_id", teamIds).eq("is_active", true);
      return { teams: teams ?? [], memberCount: new Set((members ?? []).map((m) => m.user_id)).size };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard Trưởng Phòng Marketing</h1>
        <p className="text-sm text-muted-foreground">Tổng quan các team bạn đang quản lý</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Briefcase className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Team đang quản lý</p>
                  <p className="text-2xl font-bold">{data?.teams.length ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Tổng nhân viên</p>
                  <p className="text-2xl font-bold">{data?.memberCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Team được phân công</CardTitle>
              <CardDescription>Các trang phân tích chi tiết sẽ ra mắt ở Phase tiếp theo</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.teams.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Bạn chưa được Admin gán team nào. Liên hệ Admin để được phân công.
                </p>
              ) : (
                <ul className="divide-y">
                  {data?.teams.map((t) => (
                    <li key={t.id} className="py-3">
                      <p className="font-semibold">{t.name}</p>
                      {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
