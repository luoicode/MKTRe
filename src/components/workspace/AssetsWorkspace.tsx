import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  BriefcaseBusiness,
  ExternalLink,
  Info,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth, type AppRole } from "@/lib/auth";
import { getLeaderTeamIds, getManagerTeamIds } from "@/lib/dailyAggregates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Asset = Tables<"assets">;
type AssetGroup = "common" | "fixed" | "flexible" | "personal";
type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "username">;
type MembershipRow = Pick<Tables<"team_memberships">, "user_id" | "team_id">;

const ALL = "all";
const NONE = "__none__";
const OTHER_TYPE = "__other__";

const GROUP_LABELS: Record<AssetGroup, string> = {
  common: "Chung",
  fixed: "Cố định",
  flexible: "Linh động",
  personal: "Cá nhân",
};

const GROUP_STYLES: Record<AssetGroup, string> = {
  common: "bg-sky-50 text-sky-700 border-sky-100",
  fixed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  flexible: "bg-amber-50 text-amber-700 border-amber-100",
  personal: "bg-violet-50 text-violet-700 border-violet-100",
};

const STANDARD_TYPES = [
  "hotline",
  "odoo",
  "landing",
  "media",
  "link",
  "facebook",
  "tiktok",
  "google",
  OTHER_TYPE,
];
const STANDARD_TYPE_KEYS = new Set(STANDARD_TYPES.filter((type) => type !== OTHER_TYPE));

const defaultForm = {
  id: "",
  asset_group: "flexible" as AssetGroup,
  asset_type: "Capcut",
  asset_type_custom: "",
  title: "",
  value: "",
  link_url: "",
  description: "",
  owner_profile_id: "",
  owner_team_id: "",
  is_active: true,
};

export function AssetsWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<AssetGroup | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [userFilter, setUserFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [assignerFilter, setAssignerFilter] = useState(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "admin";
  const isLeader = role === "leader";
  const isEmployee = role === "employee";
  const canCreate = !!role && role !== null;

  const { data, isLoading } = useQuery({
    queryKey: ["assets-workspace", profile?.id, role],
    enabled: !!profile && !!role,
    queryFn: async () => {
      let visibleTeamIds: string[] = [];
      if (role === "leader") visibleTeamIds = await getLeaderTeamIds(profile!.id);
      if (role === "manager") visibleTeamIds = await getManagerTeamIds(profile!.id);
      if (role === "employee") {
        const { data: memberships } = await supabase
          .from("team_memberships")
          .select("team_id")
          .eq("user_id", profile!.id)
          .eq("is_active", true);
        visibleTeamIds = (memberships ?? []).map((row) => row.team_id);
      }

      const [assetsResult, teamsResult, membershipsResult] = await Promise.all([
        supabase.from("assets").select("*").order("created_at", { ascending: false }),
        getTeams(role!, visibleTeamIds),
        getMemberships(role!, visibleTeamIds),
      ]);

      if (assetsResult.error) throw assetsResult.error;
      if (teamsResult.error) throw teamsResult.error;
      if (membershipsResult.error) throw membershipsResult.error;

      const assets = assetsResult.data ?? [];
      const memberships = membershipsResult.data ?? [];
      const profileIds = new Set<string>();
      if (isAdmin) {
        const { data: allProfiles, error } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .order("full_name");
        if (error) throw error;
        return {
          assets,
          teams: teamsResult.data ?? [],
          profiles: allProfiles ?? [],
          memberships,
          visibleTeamIds,
        };
      }

      profileIds.add(profile!.id);
      for (const row of memberships) profileIds.add(row.user_id);
      for (const asset of assets) {
        if (asset.owner_profile_id) profileIds.add(asset.owner_profile_id);
        if (asset.assigned_by) profileIds.add(asset.assigned_by);
        profileIds.add(asset.created_by);
      }

      const { data: profiles, error } = profileIds.size
        ? await supabase
            .from("profiles")
            .select("id, full_name, username")
            .in("id", Array.from(profileIds))
            .order("full_name")
        : { data: [], error: null };
      if (error) throw error;

      return {
        assets,
        teams: teamsResult.data ?? [],
        profiles: profiles ?? [],
        memberships,
        visibleTeamIds,
      };
    },
  });

  const teams = useMemo(() => (data?.teams ?? []) as TeamRow[], [data?.teams]);
  const profiles = useMemo(() => (data?.profiles ?? []) as ProfileRow[], [data?.profiles]);
  const visibleTeamIdSet = useMemo(
    () => new Set(data?.visibleTeamIds ?? []),
    [data?.visibleTeamIds],
  );
  const memberships = useMemo(
    () => (data?.memberships ?? []) as MembershipRow[],
    [data?.memberships],
  );
  const assets = useMemo(() => (data?.assets ?? []) as Asset[], [data?.assets]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const profileMap = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);
  const profileTeamMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const membership of memberships) {
      const teamIds = map.get(membership.user_id) ?? new Set<string>();
      teamIds.add(membership.team_id);
      map.set(membership.user_id, teamIds);
    }
    return map;
  }, [memberships]);
  const ownerFilterProfiles = useMemo(() => {
    if (isLeader) return profiles.filter((user) => profileTeamMap.has(user.id));
    return profiles;
  }, [isLeader, profileTeamMap, profiles]);
  const visibleTypes = STANDARD_TYPES;
  const assigners = Array.from(
    new Set(assets.map((asset) => asset.assigned_by).filter(Boolean)),
  ) as string[];

  const filteredAssets = assets.filter((asset) => {
    if (tab !== ALL && asset.asset_group !== tab) return false;
    if (
      !isEmployee &&
      teamFilter !== ALL &&
      !assetBelongsToTeam(asset, teamFilter, profileTeamMap)
    ) {
      return false;
    }
    if (
      isLeader &&
      userFilter === ALL &&
      !assetIsInLeaderScope(asset, profileTeamMap, visibleTeamIdSet)
    ) {
      return false;
    }
    if (
      userFilter !== ALL &&
      asset.asset_group !== "common" &&
      asset.owner_profile_id !== userFilter
    ) {
      return false;
    }
    if (typeFilter !== ALL) {
      if (normalizeAssetType(asset.asset_type) !== typeFilter) {
        return false;
      }
    }
    if (assignerFilter !== ALL && asset.assigned_by !== assignerFilter) return false;
    const haystack = [
      asset.title,
      asset.asset_type,
      asset.value,
      asset.description,
      asset.owner_profile_id ? profileMap.get(asset.owner_profile_id)?.full_name : "",
      asset.owner_team_id ? teamMap.get(asset.owner_team_id) : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const allowedGroups = getAllowedGroups(role);
  const groupOptions = allowedGroups.length ? allowedGroups : ["personal"];

  const openCreate = () => {
    const nextGroup =
      tab !== ALL && groupOptions.includes(tab as AssetGroup)
        ? (tab as AssetGroup)
        : (groupOptions[0] as AssetGroup);
    const nextType = defaultTypeFor(nextGroup);
    setForm({
      ...defaultForm,
      asset_group: nextGroup,
      asset_type: nextType,
      asset_type_custom: "",
      title: nextGroup === "personal" ? assetTypeLabel(nextType) : "",
      owner_profile_id: nextGroup === "personal" ? (profile?.id ?? "") : "",
      owner_team_id: nextGroup === "flexible" ? (teams[0]?.id ?? "") : "",
    });
    setDialogOpen(true);
  };

  const openEdit = (asset: Asset) => {
    const group = asset.asset_group as AssetGroup;
    const isCustom = isCustomTypeForGroup(group, asset.asset_type);
    const normalizedType = normalizeAssetType(asset.asset_type);
    setForm({
      id: asset.id,
      asset_group: group,
      asset_type: isCustom ? OTHER_TYPE : normalizedType,
      asset_type_custom: isCustom ? asset.asset_type : "",
      title: asset.title,
      value: asset.value ?? "",
      link_url: asset.link_url ?? "",
      description: asset.description ?? "",
      owner_profile_id: asset.owner_profile_id ?? "",
      owner_team_id: asset.owner_team_id ?? "",
      is_active: asset.is_active,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!profile || !role) return;
    const title = form.title.trim();
    const value = form.value.trim();
    const description = form.description.trim();
    const linkUrl = normalizeUrl(form.link_url);
    const assetType =
      form.asset_type === OTHER_TYPE ? form.asset_type_custom.trim() : form.asset_type.trim();
    if (!assetType) {
      toast.error("Nhập tên loại tài sản");
      return;
    }
    if (!title) {
      toast.error("Nhập tên tài sản");
      return;
    }
    if (form.link_url.trim() && !linkUrl) {
      toast.error("Link URL không hợp lệ");
      return;
    }

    const ownerTeamId = form.asset_group === "flexible" ? form.owner_team_id || null : null;
    const ownerProfileId =
      form.asset_group === "fixed" || form.asset_group === "personal" || form.owner_profile_id
        ? form.owner_profile_id || profile.id
        : null;

    if (form.asset_group === "common" && role !== "admin") {
      toast.error("Chỉ Admin được tạo tài sản chung");
      return;
    }
    if (form.asset_group === "flexible" && !ownerTeamId) {
      toast.error("Chọn team nhận tài sản");
      return;
    }
    if (form.asset_group === "fixed" && !ownerProfileId) {
      toast.error("Chọn user nhận tài sản cố định");
      return;
    }
    if (
      form.asset_group === "personal" &&
      assets.some(
        (asset) =>
          asset.id !== form.id &&
          asset.asset_group === "personal" &&
          asset.owner_profile_id === profile.id &&
          normalizeAssetType(asset.asset_type) === normalizeAssetType(assetType) &&
          form.asset_type !== OTHER_TYPE,
      )
    ) {
      toast.error("Loại tài sản cá nhân này đã tồn tại");
      return;
    }

    const payload = {
      asset_group: form.asset_group,
      asset_type: assetType,
      title,
      value: value || null,
      link_url: linkUrl,
      description: description || null,
      owner_profile_id: ownerProfileId,
      owner_team_id: ownerTeamId,
      assigned_by: form.asset_group === "personal" ? null : profile.id,
      created_by: profile.id,
      is_active: form.is_active,
    };

    setSaving(true);
    const { error } = form.id
      ? await supabase.from("assets").update(payload).eq("id", form.id)
      : await supabase.from("assets").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Đã cập nhật tài sản" : "Đã thêm tài sản");
    setDialogOpen(false);
    setForm(defaultForm);
    qc.invalidateQueries({ queryKey: ["assets-workspace"] });
  };

  const deleteAsset = async (asset: Asset) => {
    const { error } = await supabase.from("assets").delete().eq("id", asset.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa tài sản");
    qc.invalidateQueries({ queryKey: ["assets-workspace"] });
  };

  return (
    <div className="flex h-auto min-h-0 flex-col md:h-full md:overflow-hidden">
      <div className="shrink-0 space-y-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Tài sản</h1>
              <p className="text-sm text-muted-foreground">
                Quản lý tài sản chung, cố định, linh động và cá nhân
              </p>
            </div>
          </div>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Thêm tài sản
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as AssetGroup | typeof ALL)}>
          <TabsList>
            <TabsTrigger value={ALL}>Tất cả</TabsTrigger>
            <TabsTrigger value="common">Chung</TabsTrigger>
            <TabsTrigger value="fixed">Cố định</TabsTrigger>
            <TabsTrigger value="flexible">Linh động</TabsTrigger>
            <TabsTrigger value="personal">Cá nhân</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent
            className={
              isLeader
                ? "grid gap-3 p-3 lg:grid-cols-[1fr_220px_180px]"
                : isEmployee
                  ? "grid gap-3 p-3 lg:grid-cols-[1fr_180px]"
                  : "grid gap-3 p-3 lg:grid-cols-[1fr_180px_180px_180px_180px]"
            }
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên tài sản..."
              />
            </div>
            {!isLeader && !isEmployee && (
              <FilterSelect value={teamFilter} onChange={setTeamFilter} placeholder="Team">
                <SelectItem value={ALL}>Tất cả team</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </FilterSelect>
            )}
            {!isEmployee && (
              <FilterSelect value={userFilter} onChange={setUserFilter} placeholder="User">
                <SelectItem value={ALL}>
                  {isLeader ? "Tất cả team" : "Tất cả người dùng"}
                </SelectItem>
                {ownerFilterProfiles.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </FilterSelect>
            )}
            <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="Loại">
              <SelectItem value={ALL}>Tất cả loại</SelectItem>
              {visibleTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {assetTypeLabel(type)}
                </SelectItem>
              ))}
            </FilterSelect>
            {isAdmin && (
              <FilterSelect
                value={assignerFilter}
                onChange={setAssignerFilter}
                placeholder="Người cấp"
              >
                <SelectItem value={ALL}>Tất cả người cấp</SelectItem>
                {assigners.map((id) => (
                  <SelectItem key={id} value={id}>
                    {profileMap.get(id)?.full_name ?? "Không rõ"}
                  </SelectItem>
                ))}
              </FilterSelect>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 flex-1 overflow-visible md:overflow-y-auto md:pr-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredAssets.length ? (
          <div className="grid gap-4 pb-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                teamName={asset.owner_team_id ? teamMap.get(asset.owner_team_id) : null}
                ownerName={
                  asset.owner_profile_id ? profileMap.get(asset.owner_profile_id)?.full_name : null
                }
                assignerName={
                  asset.assigned_by ? profileMap.get(asset.assigned_by)?.full_name : null
                }
                canEdit={canEditAsset(asset, role, profile?.id)}
                onDetail={() => setDetailAsset(asset)}
                onEdit={() => openEdit(asset)}
                onDelete={() => deleteAsset(asset)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Chưa có tài sản.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Sửa tài sản" : "Thêm tài sản"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nhóm tài sản">
              <Select
                value={form.asset_group}
                onValueChange={(value) => {
                  const group = value as AssetGroup;
                  setForm({
                    ...form,
                    asset_group: group,
                    asset_type: defaultTypeFor(group),
                    asset_type_custom: "",
                    title: group === "personal" ? assetTypeLabel(defaultTypeFor(group)) : "",
                    owner_profile_id: group === "personal" ? (profile?.id ?? "") : "",
                    owner_team_id: group === "flexible" ? form.owner_team_id : "",
                  });
                }}
                disabled={groupOptions.length === 1 || !!form.id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((group) => (
                    <SelectItem key={group} value={group}>
                      {GROUP_LABELS[group as AssetGroup]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Loại tài sản">
              <Select
                value={form.asset_type}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    asset_type: value,
                    asset_type_custom: value === OTHER_TYPE ? form.asset_type_custom : "",
                    title: nextTitleForTypeChange(form.asset_group, value, form.title),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assetTypesForGroup(form.asset_group).map((type) => (
                    <SelectItem key={type} value={type}>
                      {assetTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.asset_type === OTHER_TYPE && (
                <Input
                  className="mt-2"
                  value={form.asset_type_custom}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      asset_type_custom: event.target.value,
                      title: form.title.trim() ? form.title : event.target.value,
                    })
                  }
                  placeholder="Tên loại tài sản, ví dụ: Zalo OA, Telegram, Google Drive"
                />
              )}
            </Field>

            <Field label="Tên tài sản">
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field label="Giá trị / tài khoản">
              <Input
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
              />
            </Field>
            <Field label="Link">
              <Input
                value={form.link_url}
                onChange={(event) => setForm({ ...form, link_url: event.target.value })}
                placeholder="https://..."
              />
            </Field>

            {(form.asset_group === "fixed" || form.asset_group === "flexible") && (
              <Field label={form.asset_group === "fixed" ? "User nhận" : "Team nhận"}>
                {form.asset_group === "fixed" ? (
                  <Select
                    value={form.owner_profile_id || NONE}
                    onValueChange={(value) =>
                      setForm({ ...form, owner_profile_id: value === NONE ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Chọn user</SelectItem>
                      {profiles.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : isLeader ? (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {teams.find((team) => team.id === form.owner_team_id)?.name ??
                      teams[0]?.name ??
                      "Team của Leader"}
                  </div>
                ) : (
                  <Select
                    value={form.owner_team_id || NONE}
                    onValueChange={(value) =>
                      setForm({ ...form, owner_team_id: value === NONE ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Chọn team</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            )}

            {form.asset_group === "flexible" && (
              <Field label="User nhận cá nhân">
                <Select
                  value={form.owner_profile_id || NONE}
                  onValueChange={(value) =>
                    setForm({ ...form, owner_profile_id: value === NONE ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Cả team</SelectItem>
                    {ownerFilterProfiles.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <div className="md:col-span-2">
              <Field label="Mô tả">
                <Textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={3}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetDetailDialog
        asset={detailAsset}
        teamName={detailAsset?.owner_team_id ? teamMap.get(detailAsset.owner_team_id) : null}
        ownerName={
          detailAsset?.owner_profile_id
            ? profileMap.get(detailAsset.owner_profile_id)?.full_name
            : null
        }
        assignerName={
          detailAsset?.assigned_by ? profileMap.get(detailAsset.assigned_by)?.full_name : null
        }
        onOpenChange={(open) => !open && setDetailAsset(null)}
      />
    </div>
  );
}

async function getTeams(role: AppRole, teamIds: string[]) {
  let query = supabase.from("teams").select("id, name").order("name");
  if (role !== "admin")
    query = query.in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
  return query;
}

async function getMemberships(role: AppRole, teamIds: string[]) {
  let query = supabase.from("team_memberships").select("user_id, team_id").eq("is_active", true);
  if (role !== "admin")
    query = query.in(
      "team_id",
      teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"],
    );
  return query;
}

function AssetCard({
  asset,
  teamName,
  ownerName,
  canEdit,
  onDetail,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  teamName?: string | null;
  ownerName?: string | null;
  assignerName?: string | null;
  canEdit: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const group = asset.asset_group as AssetGroup;
  const owner = group === "common" ? "Toàn công ty" : (ownerName ?? teamName ?? "Cá nhân");
  const link = normalizeUrl(asset.link_url ?? "");
  const value = formatAssetValue(asset);

  return (
    <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <AssetGroupIcon group={group} />
            </span>
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-base font-bold">{asset.title}</h3>
              <p className="text-xs font-medium text-muted-foreground">
                {assetTypeLabel(asset.asset_type)}
              </p>
            </div>
          </div>
          <Badge className={`shrink-0 rounded-full border ${GROUP_STYLES[group]}`}>
            {GROUP_LABELS[group]}
          </Badge>
        </div>

        <div className="rounded-2xl bg-slate-50 px-3 py-2">
          <p className="text-xs text-muted-foreground">Giá trị</p>
          <p className="truncate text-sm font-semibold">{value}</p>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-muted-foreground">Chủ sở hữu</span>
          <span className="truncate font-semibold">{owner}</span>
        </div>

        <div className="flex gap-2 pt-1">
          {link && (
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
            >
              Mở
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button className="flex-1" variant="outline" onClick={onDetail}>
            <Info className="mr-2 h-4 w-4" />
            Chi tiết
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" size="icon" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetDetailDialog({
  asset,
  teamName,
  ownerName,
  assignerName,
  onOpenChange,
}: {
  asset: Asset | null;
  teamName?: string | null;
  ownerName?: string | null;
  assignerName?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const group = (asset?.asset_group ?? "flexible") as AssetGroup;
  const owner = group === "common" ? "Toàn công ty" : (ownerName ?? teamName ?? "Cá nhân");
  const link = normalizeUrl(asset?.link_url ?? "");

  return (
    <Dialog open={!!asset} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {asset && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <AssetGroupIcon group={group} />
                </span>
                {asset.title}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <DetailMeta label="Nhóm tài sản" value={GROUP_LABELS[group]} />
              <DetailMeta label="Loại tài sản" value={assetTypeLabel(asset.asset_type)} />
              <DetailMeta label="Giá trị" value={asset.value || "Chưa có"} />
              <DetailMeta label="Chủ sở hữu" value={owner} />
              <DetailMeta
                label="Người cấp"
                value={assignerName ?? (group === "personal" ? "Self" : "—")}
              />
              <DetailMeta label="Ngày cấp" value={formatDate(asset.created_at)} />
              <DetailMeta label="Ngày cập nhật" value={formatDate(asset.updated_at)} />
              <div className="rounded-2xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Link URL</p>
                {link ? (
                  <Button
                    className="mt-2 w-full justify-center"
                    variant="secondary"
                    onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
                  >
                    Mở liên kết
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <p className="mt-1 font-semibold">Chưa có</p>
                )}
              </div>
              <div className="rounded-2xl border bg-muted/30 p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Mô tả</p>
                <p className="mt-1 whitespace-pre-line font-medium">
                  {asset.description || "Chưa có mô tả."}
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function AssetGroupIcon({ group }: { group: AssetGroup }) {
  if (group === "common") return <Box className="h-5 w-5" />;
  if (group === "fixed") return <Package className="h-5 w-5" />;
  if (group === "flexible") return <BriefcaseBusiness className="h-5 w-5" />;
  return <UserRound className="h-5 w-5" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function getAllowedGroups(role: AppRole | null): AssetGroup[] {
  if (role === "admin") return ["common", "fixed", "flexible", "personal"];
  if (role === "manager" || role === "leader") return ["flexible", "personal"];
  if (role === "employee") return ["personal"];
  return [];
}

function canEditAsset(asset: Asset, role: AppRole | null, profileId?: string) {
  if (role === "admin") return true;
  if (asset.asset_group === "common") return false;
  if (asset.asset_group === "personal") return asset.created_by === profileId;
  if (asset.asset_group === "flexible") return role === "manager" || role === "leader";
  return false;
}

function defaultTypeFor(group: AssetGroup) {
  if (group === "common") return "link";
  if (group === "fixed") return "hotline";
  if (group === "personal") return "facebook";
  return "landing";
}

function assetTypesForGroup(_group: AssetGroup) {
  return STANDARD_TYPES;
}

function assetTypeLabel(type: string) {
  const normalized = normalizeAssetType(type);
  if (normalized === OTHER_TYPE) return type === OTHER_TYPE ? "Khác" : type;
  if (normalized === "hotline") return "Hotline";
  if (normalized === "odoo") return "Tài khoản Odoo";
  if (normalized === "landing") return "Landing";
  if (normalized === "media") return "Media";
  if (normalized === "link") return "Link chung";
  if (normalized === "facebook") return "Facebook";
  if (normalized === "tiktok") return "TikTok";
  if (normalized === "google") return "Google";
  return type;
}

function nextTitleForTypeChange(group: AssetGroup, type: string, currentTitle: string) {
  if (type === OTHER_TYPE) return "";
  if (group === "personal" && !currentTitle.trim()) return assetTypeLabel(type);
  return currentTitle;
}

function compareAssetTypeOptions(a: string, b: string) {
  if (a === OTHER_TYPE) return 1;
  if (b === OTHER_TYPE) return -1;
  return assetTypeLabel(a).localeCompare(assetTypeLabel(b), "vi");
}

function isCustomTypeForGroup(group: AssetGroup, type: string) {
  return normalizeAssetType(type) === OTHER_TYPE && !assetTypesForGroup(group).includes(type);
}

function normalizeAssetType(type: string) {
  const normalized = type.trim().toLowerCase();
  if (!normalized || normalized === OTHER_TYPE || normalized === "other" || normalized === "khác") {
    return OTHER_TYPE;
  }
  if (normalized === "hotline") return "hotline";
  if (normalized === "odoo" || normalized.includes("odoo")) return "odoo";
  if (normalized === "landing" || normalized.includes("landing")) return "landing";
  if (normalized === "media") return "media";
  if (
    normalized === "link" ||
    normalized === "link chung" ||
    normalized.includes("guideline") ||
    normalized.includes("document") ||
    normalized.includes("tài liệu") ||
    normalized.includes("tai lieu") ||
    normalized.includes("process") ||
    normalized.includes("quy trình") ||
    normalized.includes("quy trinh")
  ) {
    return "link";
  }
  if (normalized === "fb" || normalized === "facebook") return "facebook";
  if (normalized === "tiktok" || normalized === "tik tok") return "tiktok";
  if (normalized === "google") return "google";
  return STANDARD_TYPE_KEYS.has(normalized) ? normalized : OTHER_TYPE;
}

function assetBelongsToTeam(
  asset: Asset,
  teamId: string,
  profileTeamMap: Map<string, Set<string>>,
) {
  if (asset.asset_group === "common") return true;
  if (asset.owner_team_id === teamId) return true;
  if (!asset.owner_profile_id) return false;
  return profileTeamMap.get(asset.owner_profile_id)?.has(teamId) ?? false;
}

function assetIsInLeaderScope(
  asset: Asset,
  profileTeamMap: Map<string, Set<string>>,
  visibleTeamIds: Set<string>,
) {
  if (asset.asset_group === "common") return true;
  if (asset.owner_team_id) return visibleTeamIds.has(asset.owner_team_id);
  if (!asset.owner_profile_id) return false;
  return profileTeamMap.has(asset.owner_profile_id);
}

function formatAssetValue(asset: Asset) {
  if (asset.value?.trim()) return asset.value.trim();
  if (asset.link_url?.trim()) return "Có liên kết";
  return "Chưa có";
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
