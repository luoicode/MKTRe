import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Users, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { getManagerTeamIds } from "@/lib/dailyAggregates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";

type DirectoryMode = "teams" | "leaders" | "employees";

type TeamRow = Pick<Tables<"teams">, "id" | "name" | "description" | "status" | "leader_id">;

interface PersonRow {
  id: string;
  full_name: string;
  username: string;
  status: Enums<"user_status">;
  role: Enums<"app_role">;
  team_id: string;
  team_name: string;
}

type RoleRow = Pick<Tables<"user_roles">, "user_id" | "role">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "username" | "status">;

export function ManagerDirectoryWorkspace({ mode }: { mode: DirectoryMode }) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["manager-directory", mode, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const teamIds = await getManagerTeamIds(profile!.id);
      if (!teamIds.length) {
        const teams: TeamRow[] = [];
        const people: PersonRow[] = [];
        return { teams, people };
      }

      const [{ data: teams }, { data: memberships }] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, description, status, leader_id")
          .in("id", teamIds)
          .order("name"),
        supabase
          .from("team_memberships")
          .select("user_id, team_id, teams(name)")
          .in("team_id", teamIds)
          .eq("is_active", true),
      ]);

      const membershipRows = memberships ?? [];
      const teamRows = teams ?? [];
      const memberUserIds = membershipRows.map((m) => m.user_id);
      const leaderIds = teamRows.flatMap((t) => (t.leader_id ? [t.leader_id] : []));
      const userIds = Array.from(new Set([...memberUserIds, ...leaderIds]));
      const [{ data: profiles }, { data: roles }] = userIds.length
        ? await Promise.all([
            supabase.from("profiles").select("id, full_name, username, status").in("id", userIds),
            supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
          ])
        : [{ data: [] }, { data: [] }];

      const roleMap = new Map((roles ?? []).map((r: RoleRow) => [r.user_id, r.role]));
      const profileMap = new Map((profiles ?? []).map((p: ProfileRow) => [p.id, p]));
      const teamMap = new Map(teamRows.map((t) => [t.id, t.name]));

      const people: PersonRow[] = [];
      for (const m of membershipRows) {
        const p = profileMap.get(m.user_id);
        if (!p) continue;
        people.push({
          id: p.id,
          full_name: p.full_name,
          username: p.username,
          status: p.status,
          role: roleMap.get(p.id) ?? "employee",
          team_id: m.team_id,
          team_name: teamMap.get(m.team_id) ?? "—",
        });
      }
      for (const t of teamRows) {
        if (!t.leader_id) continue;
        const p = profileMap.get(t.leader_id);
        if (!p || people.some((x) => x.id === p.id && x.team_id === t.id)) continue;
        people.push({
          id: p.id,
          full_name: p.full_name,
          username: p.username,
          status: p.status,
          role: roleMap.get(p.id) ?? "leader",
          team_id: t.id,
          team_name: t.name,
        });
      }

      return { teams: teamRows, people };
    },
  });

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.teams ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [data, search]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.people ?? [])
      .filter((p) => (mode === "leaders" ? p.role === "leader" : p.role === "employee"))
      .filter(
        (p) =>
          !q ||
          p.full_name.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q) ||
          p.team_name.toLowerCase().includes(q),
      );
  }, [data, mode, search]);

  const title = mode === "teams" ? "Team đang quản lý" : mode === "leaders" ? "Leader" : "Employee";
  const subtitle =
    mode === "teams"
      ? "Danh sách team nằm trong phạm vi TP Marketing được phân công."
      : mode === "leaders"
        ? "Leader thuộc các team bạn quản lý."
        : "Nhân viên thuộc các team bạn quản lý.";

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Tìm kiếm..."
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary icon={UsersRound} label="Team" value={String(data?.teams.length ?? "—")} />
        <Summary
          icon={Users}
          label="Leader"
          value={String((data?.people ?? []).filter((p) => p.role === "leader").length)}
        />
        <Summary
          icon={Users}
          label="Employee"
          value={String((data?.people ?? []).filter((p) => p.role === "employee").length)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : mode === "teams" ? (
            filteredTeams.length ? (
              <TeamsTable rows={filteredTeams} people={data?.people ?? []} />
            ) : (
              <Empty />
            )
          ) : filteredPeople.length ? (
            <PeopleTable rows={filteredPeople} />
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamsTable({ rows, people }: { rows: TeamRow[]; people: PersonRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Mô tả</TableHead>
            <TableHead>Nhân sự</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.description ?? "—"}</TableCell>
              <TableCell>{people.filter((p) => p.team_id === t.id).length}</TableCell>
              <TableCell>
                <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PeopleTable({ rows }: { rows: PersonRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân sự</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={`${p.id}-${p.team_id}`}>
              <TableCell className="font-medium">{p.full_name}</TableCell>
              <TableCell>@{p.username}</TableCell>
              <TableCell>{p.team_name}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      Chưa có dữ liệu.
    </div>
  );
}
