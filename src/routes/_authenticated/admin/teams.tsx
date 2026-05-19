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
import { Loader2, Plus, UserPlus, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect, SearchableMultiSelect } from "@/components/SearchableSelect";
import { RefreshButton } from "@/components/RefreshButton";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";

export const Route = createFileRoute("/_authenticated/admin/teams")({ component: AdminTeams });

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
  status: string;
  created_at: string;
  profiles: { full_name: string; username: string } | null;
  membershipLeader: { full_name: string; username: string } | null;
}

function AdminTeams() {
  const qc = useQueryClient();
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
            .select("team_id, user_id, profiles(full_name, username)")
            .in("team_id", teamIds)
            .eq("is_active", true)
        : { data: [] };
      const leaderUserIds = Array.from(
        new Set((memberships ?? []).map((membership) => membership.user_id)),
      );
      const { data: roles } = leaderUserIds.length
        ? await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", leaderUserIds)
            .eq("role", "leader")
        : { data: [] };
      const leaderRoleIds = new Set((roles ?? []).map((row) => row.user_id));
      const leaderByTeam = new Map<string, { full_name: string; username: string }>();
      for (const membership of memberships ?? []) {
        if (!leaderRoleIds.has(membership.user_id)) continue;
        const profile = membership.profiles as { full_name: string; username: string } | null;
        if (profile && !leaderByTeam.has(membership.team_id)) {
          leaderByTeam.set(membership.team_id, profile);
        }
      }
      return (data ?? []).map((team) => ({
        ...team,
        membershipLeader: leaderByTeam.get(team.id) ?? null,
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
              .select("user_id, team_id, teams(name)")
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
  const [memberOf, setMemberOf] = useState<string | null>(null);

  const leaders = (profiles ?? []).filter((p) => p.role === "leader");
  const employees = (profiles ?? []).filter((p) => p.role === "employee");
  const refreshData = async () => {
    await Promise.all([refetchTeams(), refetchProfiles()]);
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Quản lý team"
        subtitle="Tạo team, gán Leader & nhân viên"
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
                leaders={leaders}
                onClose={() => {
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["teams-full"] });
                }}
              />
            </Dialog>
          </>
        }
      />

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
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(teams ?? []).map((t) => {
                  const leader =
                    t.membershipLeader ??
                    (t.profiles as { full_name: string; username: string } | null);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        {leader ? `${leader.full_name} (@${leader.username})` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.status === "active" ? "default" : "secondary"}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setMemberOf(t.id)}>
                          <UserPlus className="h-4 w-4 mr-1" /> Thành viên
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!memberOf} onOpenChange={(o) => !o && setMemberOf(null)}>
        {memberOf && (
          <MembersDialog
            teamId={memberOf}
            employees={employees}
            onClose={() => setMemberOf(null)}
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

interface SimpleProfile {
  id: string;
  full_name: string;
  username: string;
}

function CreateTeamDialog({ leaders, onClose }: { leaders: SimpleProfile[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [leaderId, setLeaderId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Nhập tên team");
      return;
    }
    setLoading(true);
    const { data: createdTeam, error } = await supabase
      .from("teams")
      .insert({
        name,
        description: desc || null,
        leader_id: leaderId || null,
        status: "active",
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (leaderId && createdTeam?.id) {
      const { error: membershipError } = await supabase.from("team_memberships").insert({
        team_id: createdTeam.id,
        user_id: leaderId,
        role_in_team: "leader",
        is_active: true,
      });
      if (membershipError) {
        toast.error(membershipError.message);
        return;
      }
    }
    toast.success("Tạo team thành công");
    setName("");
    setDesc("");
    setLeaderId("");
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Tạo team mới</DialogTitle>
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
          <Label>Leader</Label>
          <SearchableSelect
            value={leaderId}
            onChange={setLeaderId}
            options={leaders.map((p) => ({
              value: p.id,
              label: p.full_name,
              sub: `@${p.username}`,
            }))}
            placeholder="Chọn leader"
            emptyText="Không có user role Leader"
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

function MembersDialog({
  teamId,
  employees,
  onClose,
  onChanged,
}: {
  teamId: string;
  employees: ProfileWithRole[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: members, refetch } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("*, profiles(full_name, username)")
        .eq("team_id", teamId)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: team } = useQuery({
    queryKey: ["team-summary", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", teamId)
        .maybeSingle();
      return data;
    },
  });

  const [userIds, setUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const addMembers = async () => {
    if (userIds.length === 0) return;
    const blocked = employees.filter(
      (p) => userIds.includes(p.id) && p.activeTeamId && p.activeTeamId !== teamId,
    );
    if (blocked.length) {
      toast.error("Nhân viên này đang thuộc team khác. Cần chuyển team trước khi thêm.");
      return;
    }
    setBusy(true);
    const rows = userIds.map((uid) => ({
      team_id: teamId,
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
    toast.success(`Đã thêm ${userIds.length} thành viên`);
    setUserIds([]);
    await refetch();
    onChanged();
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase
      .from("team_memberships")
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refetch();
    onChanged();
  };

  const transferMember = async (userId: string) => {
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const closeExisting = await supabase
      .from("team_memberships")
      .update({ is_active: false, end_date: today })
      .eq("user_id", userId)
      .eq("is_active", true);
    if (closeExisting.error) {
      setBusy(false);
      toast.error(closeExisting.error.message);
      return;
    }
    const addNew = await supabase.from("team_memberships").insert({
      team_id: teamId,
      user_id: userId,
      role_in_team: "employee",
      start_date: today,
      is_active: true,
    });
    setBusy(false);
    if (addNew.error) {
      toast.error(addNew.error.message);
      return;
    }
    toast.success("Đã chuyển nhân viên sang team này");
    await refetch();
    onChanged();
  };

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const available = employees.filter((p) => !memberIds.has(p.id) && !p.activeTeamId);
  const assignedElsewhere = employees.filter(
    (p) => !memberIds.has(p.id) && p.activeTeamId && p.activeTeamId !== teamId,
  );

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Thành viên team{team?.name ? `: ${team.name}` : ""}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Một nhân viên chỉ được thuộc về 1 team tại một thời điểm. Nhân viên đang thuộc team
              khác sẽ không xuất hiện trong danh sách thêm mới.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <SearchableMultiSelect
              values={userIds}
              onChange={setUserIds}
              options={available.map((p) => ({
                value: p.id,
                label: p.full_name,
                sub: `@${p.username}`,
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

        {assignedElsewhere.length > 0 && (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Nhân viên đang thuộc team khác</p>
              <p className="text-xs text-muted-foreground">
                Nhân viên này đang thuộc team khác. Cần chuyển team trước khi thêm.
              </p>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {assignedElsewhere.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/70 p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {p.full_name}{" "}
                      <span className="text-xs text-muted-foreground">@{p.username}</span>
                    </p>
                    <p className="text-xs text-amber-800">Đang thuộc: {p.activeTeamName}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transferMember(p.id)}
                    disabled={busy}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Chuyển team
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(members ?? []).map((m) => {
            const p = m.profiles as { full_name: string; username: string } | null;
            return (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2">
                <span>
                  {p?.full_name}{" "}
                  <span className="text-muted-foreground text-xs">@{p?.username}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)}>
                  Xóa
                </Button>
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
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
