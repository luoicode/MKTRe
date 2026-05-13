import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect, SearchableMultiSelect } from "@/components/SearchableSelect";

export const Route = createFileRoute("/_authenticated/admin/manager-assignments")({
  component: ManagerAssignments,
});

interface Manager { id: string; full_name: string; username: string }
interface Team { id: string; name: string }
interface Assignment {
  id: string;
  manager_id: string;
  team_id: string;
  is_active: boolean;
  assigned_at: string;
  manager?: Manager | null;
  team?: Team | null;
}

function ManagerAssignments() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [managerId, setManagerId] = useState<string>("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // Allow assignments for both leader and marketing_manager roles
  const { data: managers } = useQuery({
    queryKey: ["managers-leaders"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["marketing_manager", "leader"]);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as (Manager & { role: string })[];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", ids)
        .order("full_name");
      const rmap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      return ((data ?? []) as Manager[]).map((m) => ({ ...m, role: rmap.get(m.id) ?? "" }));
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["teams-list-for-mta"],
    queryFn: async () =>
      ((await supabase.from("teams").select("id, name").order("name")).data ?? []) as Team[],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["mta-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_team_assignments")
        .select("*")
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Assignment[];
      const mIds = Array.from(new Set(list.map((r) => r.manager_id)));
      const tIds = Array.from(new Set(list.map((r) => r.team_id)));
      const [{ data: ms }, { data: ts }] = await Promise.all([
        mIds.length
          ? supabase.from("profiles").select("id, full_name, username").in("id", mIds)
          : Promise.resolve({ data: [] as Manager[] }),
        tIds.length
          ? supabase.from("teams").select("id, name").in("id", tIds)
          : Promise.resolve({ data: [] as Team[] }),
      ]);
      const mMap = new Map((ms ?? []).map((m) => [m.id, m as Manager]));
      const tMap = new Map((ts ?? []).map((t) => [t.id, t as Team]));
      return list.map((r) => ({ ...r, manager: mMap.get(r.manager_id), team: tMap.get(r.team_id) }));
    },
  });

  const assign = async () => {
    if (!managerId || teamIds.length === 0) {
      toast.error("Chọn người phụ trách và ít nhất 1 team"); return;
    }
    setBusy(true);
    const payload = teamIds.map((tid) => ({
      manager_id: managerId,
      team_id: tid,
      assigned_by: profile?.id ?? null,
      is_active: true,
    }));
    const { error } = await supabase
      .from("manager_team_assignments")
      .upsert(payload, { onConflict: "manager_id,team_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id, action: "assign_manager_team",
      entity_type: "manager_team_assignments", entity_id: null,
      new_value: { manager_id: managerId, team_ids: teamIds },
    });
    toast.success(`Đã gán ${teamIds.length} team`);
    setTeamIds([]);
    qc.invalidateQueries({ queryKey: ["mta-list"] });
  };

  const remove = async (a: Assignment) => {
    const { error } = await supabase
      .from("manager_team_assignments")
      .update({ is_active: false })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id, action: "remove_manager_team",
      entity_type: "manager_team_assignments", entity_id: a.id,
      old_value: { manager_id: a.manager_id, team_id: a.team_id },
    });
    toast.success("Đã gỡ phân công");
    qc.invalidateQueries({ queryKey: ["mta-list"] });
  };

  const filteredRows = (rows ?? []).filter((r) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (r.manager?.full_name ?? "").toLowerCase().includes(s)
      || (r.manager?.username ?? "").toLowerCase().includes(s)
      || (r.team?.name ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Phân công Trưởng Phòng / Leader</h1>
        <p className="text-sm text-muted-foreground">Gán Trưởng Phòng Marketing hoặc Leader phụ trách nhiều team</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Phân công mới</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="min-w-0">
            <Label>Người phụ trách (Leader / Trưởng phòng MKT)</Label>
            <SearchableSelect
              value={managerId}
              onChange={setManagerId}
              options={(managers ?? []).map((m) => ({
                value: m.id,
                label: `${m.full_name} (@${m.username})`,
                sub: m.role === "marketing_manager" ? "TP Marketing" : "Leader",
              }))}
              placeholder="Chọn người phụ trách"
              emptyText="Chưa có user role Leader / TP Marketing"
            />
          </div>
          <div className="min-w-0">
            <Label>Team (chọn nhiều)</Label>
            <SearchableMultiSelect
              values={teamIds}
              onChange={setTeamIds}
              options={(teams ?? []).map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Chọn team"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={assign} disabled={busy} className="w-full md:w-auto">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Gán {teamIds.length ? `(${teamIds.length})` : "team"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Danh sách phân công</CardTitle>
          <Input
            placeholder="Tìm theo tên, team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người phụ trách</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.manager?.full_name ?? "—"}
                        <span className="ml-1 text-xs text-muted-foreground">@{r.manager?.username}</span>
                      </TableCell>
                      <TableCell>{r.team?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Đang quản lý" : "Đã gỡ"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.assigned_at).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell>
                        {r.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Chưa có phân công</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
