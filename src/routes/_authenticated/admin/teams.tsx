import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Crown, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect, SearchableMultiSelect } from "@/components/SearchableSelect";
import { RefreshButton } from "@/components/RefreshButton";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_ROLES, isSaleRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin/teams")({ component: AdminTeams });

type TeamDepartment = "marketing" | "sale";

interface ProfileWithRole {
  id: string;
  full_name: string;
  username: string;
  role: string;
  activeTeamId: string | null;
  activeTeamName: string | null;
}

interface TeamWithMembershipLeader {
  id: string;
  name: string;
  description: string | null;
  department: string;
  leader_id: string | null;
  status: string;
  created_at: string;
  profiles: { full_name: string; username: string } | null;
  membershipLeader: { full_name: string; username: string } | null;
  memberCount: number;
}

type TeamMemberProfile = { full_name: string; username: string; status?: string | null };

function AdminTeams() {
  const qc = useQueryClient();
  const [department, setDepartment] = useState<TeamDepartment>("marketing");
  const {
    data: teams,
    isLoading,
    isFetching: isTeamsFetching,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ["teams-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, profiles!teams_leader_id_fkey(full_name, username)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const teamIds = (data ?? []).map((team) => team.id);
      const { data: memberships } = teamIds.length
        ? await supabase
            .from("team_memberships")
            .select("team_id, user_id, role_in_team, profiles(full_name, username, status)")
            .in("team_id", teamIds)
            .eq("is_active", true)
        : { data: [] };
      const leaderByTeam = new Map<string, { full_name: string; username: string }>();
      const memberCountByTeam = new Map<string, number>();
      for (const membership of memberships ?? []) {
        const profile = membership.profiles as TeamMemberProfile | null;
        if (!profile || profile.status !== "active") continue;
        memberCountByTeam.set(
          membership.team_id,
          (memberCountByTeam.get(membership.team_id) ?? 0) + 1,
        );
        if (membership.role_in_team !== "leader") continue;
        if (!leaderByTeam.has(membership.team_id)) {
          leaderByTeam.set(membership.team_id, profile);
        }
      }
      return (data ?? []).map((team) => ({
        ...team,
        membershipLeader: leaderByTeam.get(team.id) ?? null,
        memberCount: memberCountByTeam.get(team.id) ?? 0,
      })) as TeamWithMembershipLeader[];
    },
  });

  const {
    data: profiles,
    isFetching: isProfilesFetching,
    refetch: refetchProfiles,
  } = useQuery({
    queryKey: ["all-profiles-with-role"],
    queryFn: async () => {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .eq("status", "active");
      const ids = (ps ?? []).map((p) => p.id);
      const [{ data: roles }, { data: memberships }] = ids.length
        ? await Promise.all([
            supabase.from("user_roles").select("user_id, role").in("user_id", ids),
            supabase
              .from("team_memberships")
              .select("user_id, team_id, teams(name, department)")
              .in("user_id", ids)
              .eq("is_active", true),
          ])
        : [
            { data: [] as { user_id: string; role: string }[] },
            { data: [] as { user_id: string; team_id: string; teams: { name: string } | null }[] },
          ];
      const rmap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      const teamMap = new Map(
        (memberships ?? []).map((m) => [
          m.user_id,
          {
            activeTeamId: m.team_id,
            activeTeamName: (m.teams as { name: string } | null)?.name ?? "Team khác",
          },
        ]),
      );
      return (ps ?? []).map((p) => {
        const activeTeam = teamMap.get(p.id);
        return {
          ...p,
          role: rmap.get(p.id) ?? "employee",
          activeTeamId: activeTeam?.activeTeamId ?? null,
          activeTeamName: activeTeam?.activeTeamName ?? null,
        };
      }) as ProfileWithRole[];
    },
  });

  const [open, setOpen] = useState(false);
  const [teamManager, setTeamManager] = useState<TeamWithMembershipLeader | null>(null);

  const visibleTeams = (teams ?? []).filter((team) => team.department === department);
  const leaders = (profiles ?? []).filter((p) =>
    department === "marketing" ? p.role === APP_ROLES.MARKETING_LEADER : isSaleRole(p.role),
  );
  const employees = (profiles ?? []).filter((p) =>
    department === "marketing" ? p.role === APP_ROLES.MARKETING_EMPLOYEE : isSaleRole(p.role),
  );
  const refreshData = async () => {
    await Promise.all([refetchTeams(), refetchProfiles()]);
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Quản lý team"
        subtitle="Quản lý team Marketing và Sale tách biệt"
        actions={
          <>
            <RefreshButton
              isRefreshing={isTeamsFetching || isProfilesFetching}
              onRefresh={refreshData}
            />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Tạo team
                </Button>
              </DialogTrigger>
              <CreateTeamDialog
                department={department}
                leaders={leaders}
                members={employees}
                onClose={() => {
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["teams-full"] });
                  qc.invalidateQueries({ queryKey: ["all-profiles-with-role"] });
                }}
              />
            </Dialog>
          </>
        }
      />

      <Tabs value={department} onValueChange={(value) => setDepartment(value as TeamDepartment)}>
        <TabsList className="h-10 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="marketing" className="px-4">
            Marketing
          </TabsTrigger>
          <TabsTrigger value="sale" className="px-4">
            Sale
          </TabsTrigger>
        </TabsList>
        <TabsContent value="marketing" className="mt-4 space-y-4">
          <TeamsTable
            teams={visibleTeams}
            isLoading={isLoading}
            emptyText="Chưa có Team Marketing."
            onManageTeam={setTeamManager}
          />
        </TabsContent>
        <TabsContent value="sale" className="mt-4 space-y-4">
          <TeamsTable
            teams={visibleTeams}
            isLoading={isLoading}
            emptyText="Chưa có Team Sale."
            onManageTeam={setTeamManager}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!teamManager} onOpenChange={(open) => !open && setTeamManager(null)}>
        {teamManager && (
          <TeamManagementDialog
            team={teamManager}
            department={department}
            leaders={leaders}
            employees={employees}
            onClose={() => setTeamManager(null)}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["teams-full"] });
              qc.invalidateQueries({ queryKey: ["all-profiles-with-role"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function TeamsTable({
  teams,
  isLoading,
  emptyText,
  onManageTeam,
}: {
  teams: TeamWithMembershipLeader[];
  isLoading: boolean;
  emptyText: string;
  onManageTeam: (team: TeamWithMembershipLeader) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead>Thành viên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => {
                const leader =
                  t.membershipLeader ??
                  (t.profiles as { full_name: string; username: string } | null);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      {leader ? `${leader.full_name} (@${leader.username})` : "—"}
                    </TableCell>
                    <TableCell>{t.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "default" : "secondary"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => onManageTeam(t)}>
                        <Settings2 className="mr-1 h-4 w-4" /> Quản lý
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!teams.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CreateTeamDialog({
  department,
  leaders,
  members,
  onClose,
}: {
  department: TeamDepartment;
  leaders: ProfileWithRole[];
  members: ProfileWithRole[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [leaderId, setLeaderId] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Nhập tên team");
      return;
    }
    const selectedIds = Array.from(new Set([leaderId, ...memberIds].filter(Boolean)));
    const selectableProfiles = [...leaders, ...members];
    const blocked = selectableProfiles.filter(
      (profile) => selectedIds.includes(profile.id) && profile.activeTeamId,
    );
    if (blocked.length) {
      toast.error("User đã thuộc team khác. Cần chuyển team trước khi thêm.");
      return;
    }

    setLoading(true);
    const { data: createdTeam, error } = await supabase
      .from("teams")
      .insert({
        name,
        department,
        description: desc || null,
        leader_id: leaderId || null,
        status: "active",
      })
      .select("id")
      .single();
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    if (createdTeam?.id && selectedIds.length) {
      const rows = selectedIds.map((userId) => ({
        team_id: createdTeam.id,
        user_id: userId,
        role_in_team: userId === leaderId ? ("leader" as const) : ("employee" as const),
        is_active: true,
      }));
      const { error: membershipError } = await supabase.from("team_memberships").insert(rows);
      if (membershipError) {
        setLoading(false);
        toast.error(membershipError.message);
        return;
      }
      if (department === "sale") {
        const saleMemberIds = selectedIds.filter((userId) => userId !== leaderId);
        if (saleMemberIds.length) {
          const { error: memberRoleError } = await supabase
            .from("user_roles")
            .update({ role: APP_ROLES.SALE })
            .in("user_id", saleMemberIds)
            .eq("role", APP_ROLES.SALE_LEADER);
          if (memberRoleError) {
            setLoading(false);
            toast.error(memberRoleError.message);
            return;
          }
        }
        if (leaderId) {
          const { error: roleError } = await supabase
            .from("user_roles")
            .update({ role: APP_ROLES.SALE_LEADER })
            .eq("user_id", leaderId);
          if (roleError) {
            setLoading(false);
            toast.error(roleError.message);
            return;
          }
        }
      }
    }

    setLoading(false);
    toast.success("Tạo team thành công");
    setName("");
    setDesc("");
    setLeaderId("");
    setMemberIds([]);
    onClose();
  };

  const memberOptions = members
    .filter((member) => member.id !== leaderId)
    .map((member) => ({
      value: member.id,
      label: member.full_name,
      sub: `@${member.username}`,
    }));

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Tạo team {department === "marketing" ? "Marketing" : "Sale"} mới</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Tên team</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Mô tả</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div>
          <Label>{department === "marketing" ? "Leader Marketing" : "Leader Sale"}</Label>
          <SearchableSelect
            value={leaderId}
            onChange={(value) => {
              setLeaderId(value);
              setMemberIds((current) => current.filter((id) => id !== value));
            }}
            options={leaders.map((p) => ({
              value: p.id,
              label: p.full_name,
              sub: `@${p.username}`,
            }))}
            placeholder={department === "marketing" ? "Chọn Leader Marketing" : "Chọn Leader Sale"}
            emptyText={
              department === "marketing"
                ? "Không có user role Leader Marketing"
                : "Không có user Sale khả dụng"
            }
          />
          {department === "sale" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Leader Sale được lưu bằng role trong team, không đổi role global.
            </p>
          ) : null}
        </div>
        <div>
          <Label>{department === "marketing" ? "Thành viên Marketing" : "Thành viên Sale"}</Label>
          <SearchableMultiSelect
            values={memberIds}
            onChange={setMemberIds}
            options={memberOptions}
            placeholder={
              department === "marketing" ? "Chọn nhân viên Marketing" : "Chọn nhân viên Sale"
            }
            emptyText="Không có nhân viên khả dụng"
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tạo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TeamManagementDialog({
  team,
  department,
  leaders,
  employees,
  onClose,
  onChanged,
}: {
  team: TeamWithMembershipLeader;
  department: TeamDepartment;
  leaders: ProfileWithRole[];
  employees: ProfileWithRole[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: members, refetch } = useQuery({
    queryKey: ["team-members", team.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("*, profiles(full_name, username, status)")
        .eq("team_id", team.id)
        .eq("is_active", true);
      return (data ?? []).filter((membership) => {
        const profile = membership.profiles as TeamMemberProfile | null;
        return profile?.status === "active";
      });
    },
  });

  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description ?? "");
  const [leaderId, setLeaderId] = useState(team.leader_id ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    team.status === "inactive" ? "inactive" : "active",
  );
  const [loading, setLoading] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Nhập tên team");
      return;
    }
    const selectedLeader = leaders.find((leader) => leader.id === leaderId);
    if (selectedLeader?.activeTeamId && selectedLeader.activeTeamId !== team.id) {
      toast.error("Leader đang thuộc team khác. Cần chuyển team trước khi đặt leader.");
      return;
    }

    setLoading(true);
    let previousLeaderIds: string[] = [];
    try {
      previousLeaderIds = await getCurrentLeaderIds(team.id);
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Không tải được leader hiện tại");
      return;
    }
    const updateTeam = await supabase
      .from("teams")
      .update({
        name: name.trim(),
        description: desc.trim() || null,
        leader_id: leaderId || null,
        status,
      })
      .eq("id", team.id);
    if (updateTeam.error) {
      setLoading(false);
      toast.error(updateTeam.error.message);
      return;
    }

    const demoteLeaders = await supabase
      .from("team_memberships")
      .update({ role_in_team: "employee" })
      .eq("team_id", team.id)
      .eq("is_active", true)
      .eq("role_in_team", "leader");
    if (demoteLeaders.error) {
      setLoading(false);
      toast.error(demoteLeaders.error.message);
      return;
    }

    if (leaderId) {
      const { data: existingLeaderMembership, error: existingError } = await supabase
        .from("team_memberships")
        .select("id")
        .eq("team_id", team.id)
        .eq("user_id", leaderId)
        .eq("is_active", true)
        .maybeSingle();
      if (existingError) {
        setLoading(false);
        toast.error(existingError.message);
        return;
      }
      const leaderResult = existingLeaderMembership
        ? await supabase
            .from("team_memberships")
            .update({ role_in_team: "leader" })
            .eq("id", existingLeaderMembership.id)
        : await supabase.from("team_memberships").insert({
            team_id: team.id,
            user_id: leaderId,
            role_in_team: "leader",
            is_active: true,
          });
      if (leaderResult.error) {
        setLoading(false);
        toast.error(leaderResult.error.message);
        return;
      }
    }

    if (department === "sale") {
      const demotedSaleLeaders = previousLeaderIds.filter((id) => id !== leaderId);
      if (demotedSaleLeaders.length) {
        const demoteRoles = await supabase
          .from("user_roles")
          .update({ role: APP_ROLES.SALE })
          .in("user_id", demotedSaleLeaders)
          .eq("role", APP_ROLES.SALE_LEADER);
        if (demoteRoles.error) {
          setLoading(false);
          toast.error(demoteRoles.error.message);
          return;
        }
      }
      if (leaderId) {
        const promoteRole = await supabase
          .from("user_roles")
          .update({ role: APP_ROLES.SALE_LEADER })
          .eq("user_id", leaderId);
        if (promoteRole.error) {
          setLoading(false);
          toast.error(promoteRole.error.message);
          return;
        }
      }
    }

    setLoading(false);
    toast.success("Đã cập nhật team");
    onChanged();
    await refetch();
  };

  const addMembers = async () => {
    if (userIds.length === 0) return;
    const blocked = employees.filter(
      (p) => userIds.includes(p.id) && p.activeTeamId && p.activeTeamId !== team.id,
    );
    if (blocked.length) {
      toast.error("Nhân viên này đang thuộc team khác. Cần chuyển team trước khi thêm.");
      return;
    }
    setBusy(true);
    const rows = userIds.map((uid) => ({
      team_id: team.id,
      user_id: uid,
      role_in_team: "employee" as const,
    }));
    const { error } = await supabase.from("team_memberships").insert(rows);
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("uniq_team_memberships")
          ? "Nhân viên này đang thuộc team khác. Cần chuyển team trước khi thêm."
          : error.message,
      );
      return;
    }
    if (department === "sale") {
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role: APP_ROLES.SALE })
        .in("user_id", userIds)
        .eq("role", APP_ROLES.SALE_LEADER);
      if (roleError) {
        toast.error(roleError.message);
        return;
      }
    }
    toast.success(`Đã thêm ${userIds.length} thành viên`);
    setUserIds([]);
    await refetch();
    onChanged();
  };

  const removeMember = async (id: string) => {
    const member = (members ?? []).find((item) => item.id === id);
    const { error } = await supabase
      .from("team_memberships")
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (member?.role_in_team === "leader") {
      const { error: leaderError } = await supabase
        .from("teams")
        .update({ leader_id: null })
        .eq("id", team.id)
        .eq("leader_id", member.user_id);
      if (leaderError) {
        toast.error(leaderError.message);
        return;
      }
      if (department === "sale") {
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: APP_ROLES.SALE })
          .eq("user_id", member.user_id)
          .eq("role", APP_ROLES.SALE_LEADER);
        if (roleError) {
          toast.error(roleError.message);
          return;
        }
      }
    }
    await refetch();
    onChanged();
  };

  const setTeamLeader = async (membershipId: string, userId: string) => {
    setBusy(true);
    const previousLeaderIds = (members ?? [])
      .filter((member) => member.role_in_team === "leader" && member.user_id !== userId)
      .map((member) => member.user_id);
    const demote = await supabase
      .from("team_memberships")
      .update({ role_in_team: "employee" })
      .eq("team_id", team.id)
      .eq("is_active", true);
    if (demote.error) {
      setBusy(false);
      toast.error(demote.error.message);
      return;
    }

    const promote = await supabase
      .from("team_memberships")
      .update({ role_in_team: "leader" })
      .eq("id", membershipId);
    if (promote.error) {
      setBusy(false);
      toast.error(promote.error.message);
      return;
    }

    const updateTeam = await supabase.from("teams").update({ leader_id: userId }).eq("id", team.id);
    if (updateTeam.error) {
      setBusy(false);
      toast.error(updateTeam.error.message);
      return;
    }

    if (department === "sale") {
      if (previousLeaderIds.length) {
        const demoteRoles = await supabase
          .from("user_roles")
          .update({ role: APP_ROLES.SALE })
          .in("user_id", previousLeaderIds)
          .eq("role", APP_ROLES.SALE_LEADER);
        if (demoteRoles.error) {
          setBusy(false);
          toast.error(demoteRoles.error.message);
          return;
        }
      }

      const promoteRole = await supabase
        .from("user_roles")
        .update({ role: APP_ROLES.SALE_LEADER })
        .eq("user_id", userId);
      if (promoteRole.error) {
        setBusy(false);
        toast.error(promoteRole.error.message);
        return;
      }
    }

    setBusy(false);
    setLeaderId(userId);
    toast.success(department === "sale" ? "Đã đặt Leader Sale" : "Đã đặt Leader Marketing");
    await refetch();
    onChanged();
  };

  const memberIds = new Set((members ?? []).map((member) => member.user_id));
  const available = employees.filter(
    (employee) => !memberIds.has(employee.id) && !employee.activeTeamId,
  );

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Quản lý team{team?.name ? `: ${team.name}` : ""}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div>
              <Label>Tên team</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label>Trạng thái</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div>
              <Label>{department === "marketing" ? "Leader Marketing" : "Leader Sale"}</Label>
              <SearchableSelect
                value={leaderId}
                onChange={setLeaderId}
                options={leaders
                  .filter((leader) => !leader.activeTeamId || leader.activeTeamId === team.id)
                  .map((leader) => ({
                    value: leader.id,
                    label: leader.full_name,
                    sub: `@${leader.username}`,
                  }))}
                placeholder={
                  department === "marketing" ? "Chọn Leader Marketing" : "Chọn Leader Sale"
                }
                emptyText="Không có leader khả dụng"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu thông tin team
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="mb-3">
            <h3 className="font-semibold">Thành viên</h3>
            <p className="text-xs text-muted-foreground">
              Một nhân viên chỉ được thuộc về 1 team tại một thời điểm.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchableMultiSelect
                values={userIds}
                onChange={setUserIds}
                options={available.map((profile) => ({
                  value: profile.id,
                  label: profile.full_name,
                  sub: `@${profile.username}`,
                }))}
                placeholder="Chọn nhân viên chưa thuộc team"
                emptyText="Không có nhân viên khả dụng"
              />
            </div>
            <Button onClick={addMembers} disabled={!userIds.length || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Thêm{userIds.length ? ` (${userIds.length})` : ""}
            </Button>
          </div>

          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {(members ?? []).map((membership) => {
              const profile = membership.profiles as TeamMemberProfile | null;
              const isLeader = membership.role_in_team === "leader";
              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="min-w-0">
                    <span>
                      {profile?.full_name}{" "}
                      <span className="text-xs text-muted-foreground">@{profile?.username}</span>
                    </span>
                    {isLeader ? (
                      <Badge className="ml-2 bg-amber-50 text-amber-700 hover:bg-amber-50">
                        {department === "sale" ? "Leader Sale" : "Leader Marketing"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isLeader ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setTeamLeader(membership.id, membership.user_id)}
                      >
                        <Crown className="mr-2 h-4 w-4" />
                        Đặt leader
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => removeMember(membership.id)}>
                      Xóa
                    </Button>
                  </div>
                </div>
              );
            })}
            {members && members.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Team chưa có thành viên.
              </div>
            )}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Đóng
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

async function getCurrentLeaderIds(teamId: string) {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .eq("role_in_team", "leader");
  if (error) throw error;
  return (data ?? []).map((row) => row.user_id);
}
