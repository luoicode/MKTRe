import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Edit } from "lucide-react";
import { toast } from "sonner";
import { RefreshButton } from "@/components/RefreshButton";
import { UserAvatar } from "@/components/UserAvatar";

export const Route = createFileRoute("/_authenticated/admin/users")({ component: AdminUsers });

type AppRole = "admin" | "manager" | "leader" | "employee";
type UserStatus = "active" | "inactive";
type FixedAssetType = "hotline" | "odoo";
type FixedAssetForm = Record<FixedAssetType, string>;

interface UserRow {
  id: string;
  full_name: string;
  username: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  status: UserStatus;
  role?: AppRole | null;
  activeTeamId?: string | null;
  activeTeamName?: string | null;
}

interface TeamOption {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Trưởng phòng Marketing",
  leader: "Leader",
  employee: "Nhân viên",
};

const NONE_TEAM = "__none__";
const emptyFixedAssets: FixedAssetForm = { hotline: "", odoo: "" };

async function callFn(name: string, body: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let message = error.message;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const payload = (await context.clone().json()) as { error?: string; message?: string };
          message = payload.error || payload.message || message;
        } catch {
          // Keep the Supabase client error when the function response is not JSON.
        }
      }
      throw new Error(message);
    }
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Failed to fetch" || message.includes("fetch")) {
      throw new Error(
        "Không gọi được hàm tạo user. Kiểm tra Supabase Edge Function admin-create-user hoặc biến môi trường.",
      );
    }
    throw error;
  }
}

function roleLabel(role?: string | null) {
  if (!role) return "—";
  return ROLE_LABELS[role as AppRole] ?? role;
}

function normalizeInternalLoginPreview(value: string) {
  const raw = value.trim().toLowerCase();
  const localPart = raw.includes("@") ? raw.split("@")[0] : raw;
  return localPart.replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "_");
}

function normalizePhone(value: string) {
  return value.trim() || null;
}

function AdminUsers() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: teams, error: teamsError }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("teams").select("id, name").eq("status", "active").order("name"),
      ]);
      if (error) throw error;
      if (teamsError) throw teamsError;

      const ids = (profiles ?? []).map((p) => p.id);
      const emptyId = "00000000-0000-0000-0000-000000000000";
      const [{ data: roles }, { data: memberships }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids.length ? ids : [emptyId]),
        supabase
          .from("team_memberships")
          .select("user_id, team_id, teams(name)")
          .eq("is_active", true)
          .in("user_id", ids.length ? ids : [emptyId]),
      ]);

      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
      const membershipMap = new Map(
        (memberships ?? []).map((m) => [
          m.user_id,
          {
            teamId: m.team_id,
            teamName: (m.teams as { name: string } | null)?.name ?? null,
          },
        ]),
      );

      return {
        users: (profiles ?? []).map((p) => {
          const membership = membershipMap.get(p.id);
          return {
            ...p,
            role: roleMap.get(p.id) ?? null,
            activeTeamId: membership?.teamId ?? null,
            activeTeamName: membership?.teamName ?? null,
          };
        }) as UserRow[],
        teams: (teams ?? []) as TeamOption[],
      };
    },
  });

  const users = data?.users ?? [];
  const teams = data?.teams ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [search, setSearch] = useState("");
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };
  const filtered = users.filter((u) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      u.full_name.toLowerCase().includes(s) ||
      u.username.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u.phone ?? "").toLowerCase().includes(s) ||
      roleLabel(u.role).toLowerCase().includes(s) ||
      (u.activeTeamName ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý người dùng</h1>
          <p className="text-sm text-muted-foreground">Tạo, cập nhật, vô hiệu hóa tài khoản</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Tạo user
              </Button>
            </DialogTrigger>
            <CreateUserDialog
              teams={teams}
              adminProfileId={profile?.id ?? null}
              onClose={() => {
                setCreateOpen(false);
                qc.invalidateQueries({ queryKey: ["admin-users"] });
              }}
            />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Danh sách</CardTitle>
          <Input
            placeholder="Tìm theo tên, tài khoản đăng nhập, vai trò..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
                  <TableRow className="border-b border-slate-200 hover:bg-transparent">
                    <TableHead className="bg-inherit">Tên</TableHead>
                    <TableHead className="bg-inherit">Số điện thoại</TableHead>
                    <TableHead className="bg-inherit">Vai trò</TableHead>
                    <TableHead className="bg-inherit">Team</TableHead>
                    <TableHead className="bg-inherit">Trạng thái</TableHead>
                    <TableHead className="w-24 bg-inherit" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex min-w-[220px] items-center gap-3">
                          <UserAvatar name={u.full_name} avatarUrl={u.avatar_url} size={40} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{u.phone?.trim() || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel(u.role)}</Badge>
                      </TableCell>
                      <TableCell>{u.activeTeamName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === "active" ? "default" : "secondary"}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Không có user
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditUserDialog
            user={editing}
            teams={teams}
            adminProfileId={profile?.id ?? null}
            onClose={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["admin-users"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function CreateUserDialog({
  teams,
  adminProfileId,
  onClose,
}: {
  teams: TeamOption[];
  adminProfileId: string | null;
  onClose: () => void;
}) {
  const initial = {
    full_name: "",
    username: "",
    phone: "",
    password: "",
    role: "employee",
    status: "active",
    team_id: "",
    fixedAssets: emptyFixedAssets,
  };
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.full_name || !form.username || !form.password) {
      toast.error("Nhập đầy đủ thông tin");
      return;
    }
    if (form.role === "employee" && !form.team_id) {
      toast.error("Chọn team cho employee để tạo checklist onboarding");
      return;
    }
    setLoading(true);
    try {
      const result = (await callFn("admin-create-user", {
        full_name: form.full_name,
        username: form.username,
        password: form.password,
        role: form.role,
        status: form.status,
      })) as { profile?: { id?: string } };
      if (result.profile?.id) {
        const phone = normalizePhone(form.phone);
        if (phone) {
          const { error: phoneError } = await supabase
            .from("profiles")
            .update({ phone })
            .eq("id", result.profile.id);
          if (phoneError) throw phoneError;
        }

        if ((form.role === "employee" || form.role === "leader") && form.team_id) {
          const { error: membershipError } = await supabase.from("team_memberships").insert({
            user_id: result.profile.id,
            team_id: form.team_id,
            role_in_team: form.role === "leader" ? "leader" : "employee",
          });
          if (membershipError) throw membershipError;
        }

        if (form.role === "leader" && form.team_id) {
          const { error: setLeaderError } = await supabase
            .from("teams")
            .update({ leader_id: result.profile.id })
            .eq("id", form.team_id);
          if (setLeaderError) throw setLeaderError;
        }

        if (form.role === "employee") {
          const { error: onboardingError } = await supabase.rpc("clone_onboarding_tasks_for_user", {
            p_user_id: result.profile.id,
            p_team_id: form.team_id,
          });
          if (onboardingError) throw onboardingError;
        }

        await saveFixedAssets(result.profile.id, form.fixedAssets, adminProfileId, false);
      }
      toast.success("Tạo user thành công");
      setForm(initial);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Tạo tài khoản mới</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Họ tên</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Tài khoản đăng nhập</Label>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="vd: test"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {normalizeInternalLoginPreview(form.username)
              ? `Hệ thống sẽ tạo tài khoản đăng nhập: ${normalizeInternalLoginPreview(form.username)}`
              : "Chỉ nhập tài khoản nội bộ, không nhập email thật."}
          </p>
        </div>
        <div>
          <Label>Mật khẩu tạm thời</Label>
          <Input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <Label>Số điện thoại</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="vd: 0987654321"
            inputMode="tel"
          />
        </div>
        <div>
          <Label>Vai trò</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Trưởng phòng Marketing</SelectItem>
              <SelectItem value="leader">Leader Team</SelectItem>
              <SelectItem value="employee">Nhân viên</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(form.role === "employee" || form.role === "leader") && (
          <div>
            <Label>Team</Label>
            <Select
              value={form.team_id || NONE_TEAM}
              onValueChange={(v) => setForm({ ...form, team_id: v === NONE_TEAM ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_TEAM}>
                  {form.role === "employee" ? "Chọn team" : "Không thuộc team"}
                </SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Trạng thái</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FixedAssetsFields
          value={form.fixedAssets}
          onChange={(fixedAssets) => setForm({ ...form, fixedAssets })}
        />
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tạo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditUserDialog({
  user,
  teams,
  adminProfileId,
  onClose,
}: {
  user: UserRow;
  teams: TeamOption[];
  adminProfileId: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    username: user.username,
    phone: user.phone ?? "",
    role: user.role ?? ("employee" as AppRole),
    status: user.status,
    team_id: user.activeTeamId ?? "",
    fixedAssets: emptyFixedAssets,
  });
  const [loading, setLoading] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const canAssignTeam = form.role === "leader" || form.role === "employee";

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      setAssetsLoading(true);
      const { data, error } = await supabase
        .from("fixed_assets")
        .select("asset_type, asset_value")
        .eq("user_id", user.id);
      if (!mounted) return;
      setAssetsLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      const nextAssets = { ...emptyFixedAssets };
      for (const row of data ?? []) {
        if (row.asset_type === "hotline" || row.asset_type === "odoo") {
          nextAssets[row.asset_type] = row.asset_value;
        }
      }
      setForm((current) => ({ ...current, fixedAssets: nextAssets }));
    };
    void loadAssets();
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const submit = async () => {
    const fullName = form.full_name.trim();
    const username = form.username.trim();
    if (!fullName || !username) {
      toast.error("Nhập đầy đủ họ tên và tài khoản đăng nhập");
      return;
    }

    setLoading(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          username,
          phone: normalizePhone(form.phone),
          status: form.status,
        })
        .eq("id", user.id);
      if (profileError) throw profileError;

      if (form.role !== user.role) {
        const { error: deleteRoleError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user.id);
        if (deleteRoleError) throw deleteRoleError;
        const { error: insertRoleError } = await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: form.role });
        if (insertRoleError) throw insertRoleError;
      }

      const nextTeamId = canAssignTeam ? form.team_id : "";
      if ((user.activeTeamId ?? "") !== nextTeamId) {
        const { error: deactivateError } = await supabase
          .from("team_memberships")
          .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
          .eq("user_id", user.id)
          .eq("is_active", true);
        if (deactivateError) throw deactivateError;

        if (nextTeamId) {
          const { error: membershipError } = await supabase.from("team_memberships").insert({
            user_id: user.id,
            team_id: nextTeamId,
            role_in_team: form.role === "leader" ? "leader" : "employee",
          });
          if (membershipError) throw membershipError;
        }
      }

      const { error: clearLeaderError } = await supabase
        .from("teams")
        .update({ leader_id: null })
        .eq("leader_id", user.id);
      if (clearLeaderError) throw clearLeaderError;

      if (form.role === "leader" && nextTeamId) {
        const { error: setLeaderError } = await supabase
          .from("teams")
          .update({ leader_id: user.id })
          .eq("id", nextTeamId);
        if (setLeaderError) throw setLeaderError;
      }

      await saveFixedAssets(user.id, form.fixedAssets, adminProfileId);

      toast.success("Cập nhật thành công");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Chỉnh sửa: {user.username}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Họ tên</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Tài khoản đăng nhập</Label>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="vd: test"
          />
        </div>
        <div>
          <Label>Số điện thoại</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="vd: 0987654321"
            inputMode="tel"
          />
        </div>
        <div>
          <Label>Vai trò</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Trưởng phòng Marketing</SelectItem>
              <SelectItem value="leader">Leader Team</SelectItem>
              <SelectItem value="employee">Nhân viên</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canAssignTeam && (
          <div>
            <Label>Team</Label>
            <Select
              value={form.team_id || NONE_TEAM}
              onValueChange={(v) => setForm({ ...form, team_id: v === NONE_TEAM ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_TEAM}>Không thuộc team</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Trạng thái</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as UserStatus })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FixedAssetsFields
          value={form.fixedAssets}
          disabled={assetsLoading}
          onChange={(fixedAssets) => setForm({ ...form, fixedAssets })}
        />
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function FixedAssetsFields({
  value,
  disabled,
  onChange,
}: {
  value: FixedAssetForm;
  disabled?: boolean;
  onChange: (value: FixedAssetForm) => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="mb-3 text-sm font-semibold">Tài sản cố định</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Hotline</Label>
          <Input
            value={value.hotline}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, hotline: event.target.value })}
            placeholder="Nhập hotline"
          />
        </div>
        <div>
          <Label>Tài khoản Odoo</Label>
          <Input
            value={value.odoo}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, odoo: event.target.value })}
            placeholder="Nhập tài khoản Odoo"
          />
        </div>
      </div>
    </div>
  );
}

async function saveFixedAssets(
  userId: string,
  fixedAssets: FixedAssetForm,
  adminProfileId: string | null,
  clearBlank = true,
) {
  const entries: Array<{ type: FixedAssetType; value: string }> = [
    { type: "hotline", value: fixedAssets.hotline.trim() },
    { type: "odoo", value: fixedAssets.odoo.trim() },
  ];

  for (const entry of entries) {
    if (!entry.value) {
      if (!clearBlank) continue;

      const { error } = await supabase
        .from("fixed_assets")
        .delete()
        .eq("user_id", userId)
        .eq("asset_type", entry.type);
      if (error) throw error;

      const { error: assetError } = await supabase
        .from("assets")
        .delete()
        .eq("asset_group", "fixed")
        .eq("owner_profile_id", userId)
        .eq("asset_type", entry.type);
      if (assetError) throw assetError;
      continue;
    }

    const { error } = await supabase.from("fixed_assets").upsert(
      {
        user_id: userId,
        asset_type: entry.type,
        asset_value: entry.value,
        assigned_by: adminProfileId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,asset_type" },
    );
    if (error) throw error;

    const { data: existingAsset, error: findAssetError } = await supabase
      .from("assets")
      .select("id")
      .eq("asset_group", "fixed")
      .eq("owner_profile_id", userId)
      .eq("asset_type", entry.type)
      .maybeSingle();
    if (findAssetError) throw findAssetError;

    const assetPayload = {
      asset_group: "fixed",
      asset_type: entry.type,
      title: entry.type === "hotline" ? "Hotline" : "Tài khoản Odoo",
      value: entry.value,
      owner_profile_id: userId,
      owner_team_id: null,
      assigned_by: adminProfileId,
      created_by: adminProfileId ?? userId,
      is_active: true,
    };

    const { error: assetError } = existingAsset
      ? await supabase.from("assets").update(assetPayload).eq("id", existingAsset.id)
      : await supabase.from("assets").insert(assetPayload);
    if (assetError) throw assetError;
  }
}
