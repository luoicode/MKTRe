import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect, SearchableMultiSelect } from "@/components/SearchableSelect";

export const Route = createFileRoute("/_authenticated/admin/teams")({ component: AdminTeams });

function AdminTeams() {
  const qc = useQueryClient();
  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, profiles!teams_leader_id_fkey(full_name, username)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles-with-role"],
    queryFn: async () => {
      const { data: ps } = await supabase.from("profiles").select("id, full_name, username").eq("status", "active");
      const ids = (ps ?? []).map((p) => p.id);
      const { data: roles } = ids.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
        : { data: [] as { user_id: string; role: string }[] };
      const rmap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      return (ps ?? []).map((p) => ({ ...p, role: rmap.get(p.id) ?? "employee" }));
    },
  });

  const [open, setOpen] = useState(false);
  const [memberOf, setMemberOf] = useState<string | null>(null);

  const leaders = (profiles ?? []).filter((p) => p.role === "leader");
  const employees = (profiles ?? []).filter((p) => p.role === "employee");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý Team</h1>
          <p className="text-sm text-muted-foreground">Tạo team, gán Leader & nhân viên</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Tạo team</Button></DialogTrigger>
          <CreateTeamDialog leaders={leaders} onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["teams-full"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Teams</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
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
                  const leader = t.profiles as { full_name: string; username: string } | null;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{leader ? `${leader.full_name} (@${leader.username})` : "—"}</TableCell>
                      <TableCell><Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
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
        {memberOf && <MembersDialog teamId={memberOf} employees={employees} onClose={() => setMemberOf(null)} />}
      </Dialog>
    </div>
  );
}

function CreateTeamDialog({ profiles, onClose }: { profiles: { id: string; full_name: string; username: string }[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [leaderId, setLeaderId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Nhập tên team"); return; }
    setLoading(true);
    const { error } = await supabase.from("teams").insert({
      name, description: desc || null,
      leader_id: leaderId || null, status: "active",
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Tạo team thành công");
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Tạo team mới</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Tên team</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Mô tả</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div>
          <Label>Leader</Label>
          <Select value={leaderId} onValueChange={setLeaderId}>
            <SelectTrigger><SelectValue placeholder="Chọn leader" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} (@{p.username})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tạo</Button></DialogFooter>
    </DialogContent>
  );
}

function MembersDialog({ teamId, profiles, onClose }: { teamId: string; profiles: { id: string; full_name: string; username: string }[]; onClose: () => void }) {
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

  const [userId, setUserId] = useState<string>("");

  const addMember = async () => {
    if (!userId) return;
    const { error } = await supabase.from("team_memberships").insert({ team_id: teamId, user_id: userId, role_in_team: "employee" });
    if (error) { toast.error(error.message); return; }
    toast.success("Đã thêm thành viên");
    setUserId("");
    refetch();
    qc.invalidateQueries({ queryKey: ["teams-full"] });
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("team_memberships")
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refetch();
  };

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const available = profiles.filter((p) => !memberIds.has(p.id));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Thành viên team</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn user" /></SelectTrigger>
            <SelectContent>
              {available.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} (@{p.username})</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={addMember} disabled={!userId}>Thêm</Button>
        </div>
        <div className="space-y-2">
          {(members ?? []).map((m) => {
            const p = m.profiles as { full_name: string; username: string } | null;
            return (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2">
                <span>{p?.full_name} <span className="text-muted-foreground text-xs">@{p?.username}</span></span>
                <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)}>Xóa</Button>
              </div>
            );
          })}
          {members && members.length === 0 && <p className="text-sm text-muted-foreground">Chưa có thành viên</p>}
        </div>
      </div>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Đóng</Button></DialogFooter>
    </DialogContent>
  );
}
