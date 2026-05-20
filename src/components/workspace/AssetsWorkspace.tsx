import { useMemo, useState, type ThHTMLAttributes } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  BriefcaseBusiness,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Loader2,
  MoreHorizontal,
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
import { cn } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageShell, ScrollArea } from "@/components/layout/PageShell";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";

type Asset = Tables<"assets">;
type AssetGroup = "common" | "fixed" | "flexible" | "personal";
type AssetStatus = "active" | "paused" | "revoked";
type TeamRow = Pick<Tables<"teams">, "id" | "name">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "username">;
type MembershipRow = Pick<Tables<"team_memberships">, "user_id" | "team_id">;

const ALL = "all";
const NONE = "__none__";
const OTHER_TYPE = "__other__";
const ASSET_META_START = "[MKTRE_ASSET_META]";
const ASSET_META_END = "[/MKTRE_ASSET_META]";

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

const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Đang hoạt động",
  paused: "Tạm dừng",
  revoked: "Thu hồi",
};

const STANDARD_TYPES = [
  "hotline",
  "odoo",
  "landing",
  "pancake",
  "flowchat",
  "canva",
  "capcut",
  "media",
  "link",
  "ads_account",
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
  sensitive_note: "",
  status: "active" as AssetStatus,
  owner_profile_id: "",
  owner_team_id: "",
  is_active: true,
};

export function AssetsWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [userFilter, setUserFilter] = useState(ALL);
  const [groupFilter, setGroupFilter] = useState<AssetGroup | typeof ALL>(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [visibleSecretIds, setVisibleSecretIds] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [showSensitiveInput, setShowSensitiveInput] = useState(false);

  const isAdmin = role === "admin";
  const isLeader = role === "leader";
  const isEmployee = role === "employee";
  const canCreate = !!role && role !== null;

  const { data, isLoading, isFetching, refetch } = useQuery({
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
      const membershipProfileTeamMap = buildProfileTeamMap(memberships);
      const scopedAssets = assets.filter((asset) =>
        canViewAssetForRole(
          asset,
          role!,
          profile!.id,
          new Set(visibleTeamIds),
          membershipProfileTeamMap,
        ),
      );
      const profileIds = new Set<string>();
      if (isAdmin) {
        const { data: allProfiles, error } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .order("full_name");
        if (error) throw error;
        return {
          assets: scopedAssets,
          teams: teamsResult.data ?? [],
          profiles: allProfiles ?? [],
          memberships,
          visibleTeamIds,
        };
      }

      profileIds.add(profile!.id);
      if (role !== "employee") {
        for (const row of memberships) profileIds.add(row.user_id);
      }
      for (const asset of scopedAssets) {
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
        assets: scopedAssets,
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
    return buildProfileTeamMap(memberships);
  }, [memberships]);
  const ownerFilterProfiles = useMemo(() => {
    if (isLeader) return profiles.filter((user) => profileTeamMap.has(user.id));
    return profiles;
  }, [isLeader, profileTeamMap, profiles]);
  const visibleTypes = STANDARD_TYPES;

  const filteredAssets = assets.filter((asset) => {
    if (groupFilter !== ALL && asset.asset_group !== groupFilter) return false;
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
    if (statusFilter !== ALL && getAssetStatus(asset) !== statusFilter) return false;
    const haystack = [
      asset.title,
      asset.asset_type,
      asset.value,
      asset.link_url,
      getPublicAssetDescription(asset),
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
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  const openCreate = () => {
    const nextGroup =
      groupFilter !== ALL && groupOptions.includes(groupFilter as AssetGroup)
        ? (groupFilter as AssetGroup)
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
    setShowSensitiveInput(false);
    setDialogOpen(true);
  };

  const openEdit = (asset: Asset) => {
    const group = asset.asset_group as AssetGroup;
    const isCustom = isCustomTypeForGroup(group, asset.asset_type);
    const normalizedType = normalizeAssetType(asset.asset_type);
    const descriptionParts = parseAssetDescription(asset.description);
    const status = descriptionParts.status ?? getAssetStatus(asset);
    setForm({
      id: asset.id,
      asset_group: group,
      asset_type: isCustom ? OTHER_TYPE : normalizedType,
      asset_type_custom: isCustom ? asset.asset_type : "",
      title: asset.title,
      value: asset.value ?? "",
      link_url: asset.link_url ?? "",
      description: descriptionParts.note,
      sensitive_note: descriptionParts.sensitive,
      status,
      owner_profile_id: asset.owner_profile_id ?? "",
      owner_team_id: asset.owner_team_id ?? "",
      is_active: status === "active",
    });
    setShowSensitiveInput(false);
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!profile || !role) return;
    const title = form.title.trim();
    const value = form.value.trim();
    const description = form.description.trim();
    const sensitiveNote = form.sensitive_note.trim();
    const status = form.status;
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
    if (!isAssetStatus(status)) {
      toast.error("Chọn trạng thái tài sản");
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
      description: composeAssetDescription(description, sensitiveNote, status) || null,
      owner_profile_id: ownerProfileId,
      owner_team_id: ownerTeamId,
      assigned_by: form.asset_group === "personal" ? null : profile.id,
      created_by: profile.id,
      is_active: status === "active",
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

  const copyText = async (value: string, label = "Đã copy") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Không thể copy dữ liệu");
    }
  };

  const toggleSecretVisible = (assetId: string) => {
    setVisibleSecretIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  return (
    <PageShell>
      <WorkspacePageHeader
        icon={<Package className="h-5 w-5" />}
        title="Tài sản"
        subtitle="Quản lý tài sản chung, cố định, linh động và cá nhân"
        actions={
          <>
            <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm tài sản
              </Button>
            )}
          </>
        }
      >
        <Card>
          <CardContent className="grid min-w-0 grid-cols-1 gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Field label="Tìm kiếm">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 min-w-0 pl-9 text-sm"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tên tài sản / mô tả"
                />
              </div>
            </Field>
            <Field label="Nhóm">
              <FilterSelect
                value={groupFilter}
                onChange={(value) => setGroupFilter(value as AssetGroup | typeof ALL)}
                placeholder="Nhóm"
              >
                <SelectItem value={ALL}>Tất cả nhóm</SelectItem>
                <SelectItem value="common">Chung</SelectItem>
                <SelectItem value="fixed">Cố định</SelectItem>
                <SelectItem value="flexible">Linh động</SelectItem>
                <SelectItem value="personal">Cá nhân</SelectItem>
              </FilterSelect>
            </Field>
            {!isLeader && !isEmployee && (
              <Field label="Team">
                <FilterSelect value={teamFilter} onChange={setTeamFilter} placeholder="Team">
                  <SelectItem value={ALL}>Tất cả team</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </FilterSelect>
              </Field>
            )}
            {!isEmployee && (
              <Field label="Chủ sở hữu">
                <FilterSelect value={userFilter} onChange={setUserFilter} placeholder="Chủ sở hữu">
                  <SelectItem value={ALL}>
                    {isLeader ? "Tất cả team" : "Tất cả người dùng"}
                  </SelectItem>
                  {ownerFilterProfiles.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </FilterSelect>
              </Field>
            )}
            <Field label="Loại tài sản">
              <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="Loại">
                <SelectItem value={ALL}>Tất cả loại</SelectItem>
                {visibleTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {assetTypeLabel(type)}
                  </SelectItem>
                ))}
              </FilterSelect>
            </Field>
            <Field label="Trạng thái">
              <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="Status">
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                <SelectItem value="active">{ASSET_STATUS_LABELS.active}</SelectItem>
                <SelectItem value="paused">{ASSET_STATUS_LABELS.paused}</SelectItem>
                <SelectItem value="revoked">{ASSET_STATUS_LABELS.revoked}</SelectItem>
              </FilterSelect>
            </Field>
          </CardContent>
        </Card>
      </WorkspacePageHeader>

      <ScrollArea className="md:overflow-hidden md:pr-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredAssets.length ? (
          <AssetTable
            assets={filteredAssets}
            teamMap={teamMap}
            profileMap={profileMap}
            role={role}
            profileId={profile?.id}
            visibleSecretIds={visibleSecretIds}
            onToggleSecret={toggleSecretVisible}
            onCopy={copyText}
            onDetail={setDetailAsset}
            onEdit={openEdit}
            onDelete={deleteAsset}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Chưa có tài sản.
            </CardContent>
          </Card>
        )}
      </ScrollArea>

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

            <Field label="Trạng thái">
              <Select
                value={form.status}
                onValueChange={(value) => {
                  const status = value as AssetStatus;
                  setForm({ ...form, status, is_active: status === "active" });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{ASSET_STATUS_LABELS.active}</SelectItem>
                  <SelectItem value="paused">{ASSET_STATUS_LABELS.paused}</SelectItem>
                  <SelectItem value="revoked">{ASSET_STATUS_LABELS.revoked}</SelectItem>
                </SelectContent>
              </Select>
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
              <Field label="Mật khẩu / Nhạy cảm">
                <div className="flex gap-2">
                  <Input
                    type={showSensitiveInput ? "text" : "password"}
                    value={form.sensitive_note}
                    onChange={(event) => setForm({ ...form, sensitive_note: event.target.value })}
                    placeholder="Mật khẩu, token, ghi chú nhạy cảm..."
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setShowSensitiveInput((current) => !current)}
                    title={showSensitiveInput ? "Ẩn thông tin nhạy cảm" : "Hiện thông tin nhạy cảm"}
                  >
                    {showSensitiveInput ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </Field>
            </div>

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
        assignerName={detailAsset ? assetAssignerLabel(detailAsset, profileMap) : null}
        canViewSensitive={detailAsset ? canEditAsset(detailAsset, role, profile?.id) : false}
        onOpenChange={(open) => !open && setDetailAsset(null)}
      />
    </PageShell>
  );
}

function buildProfileTeamMap(memberships: MembershipRow[]) {
  const map = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const teamIds = map.get(membership.user_id) ?? new Set<string>();
    teamIds.add(membership.team_id);
    map.set(membership.user_id, teamIds);
  }
  return map;
}

function canViewAssetForRole(
  asset: Asset,
  role: AppRole,
  profileId: string,
  visibleTeamIds: Set<string>,
  profileTeamMap: Map<string, Set<string>>,
) {
  if (role === "admin" || role === "manager") return true;
  if (asset.asset_group === "common") return true;

  if (role === "employee") {
    return asset.owner_profile_id === profileId || asset.created_by === profileId;
  }

  if (role === "leader") {
    if (asset.owner_profile_id === profileId || asset.created_by === profileId) return true;
    if (asset.owner_team_id && visibleTeamIds.has(asset.owner_team_id)) return true;
    if (!asset.owner_profile_id) return false;
    const ownerTeamIds = profileTeamMap.get(asset.owner_profile_id);
    return Boolean(
      ownerTeamIds && Array.from(ownerTeamIds).some((teamId) => visibleTeamIds.has(teamId)),
    );
  }

  return false;
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

function AssetTable({
  assets,
  teamMap,
  profileMap,
  role,
  profileId,
  visibleSecretIds,
  onToggleSecret,
  onCopy,
  onDetail,
  onEdit,
  onDelete,
}: {
  assets: Asset[];
  teamMap: Map<string, string>;
  profileMap: Map<string, ProfileRow>;
  role: AppRole | null;
  profileId?: string;
  visibleSecretIds: Set<string>;
  onToggleSecret: (assetId: string) => void;
  onCopy: (value: string, label?: string) => void;
  onDetail: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}) {
  return (
    <div className="h-full min-h-0 space-y-3 pb-6 lg:pb-0">
      <Card className="hidden h-full min-h-0 rounded-3xl border-slate-200 shadow-sm lg:block">
        <div className="h-full min-h-0 overflow-auto rounded-3xl">
          <table className="min-w-[1040px] w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="hover:bg-transparent">
                <AssetStickyHead className="w-[108px] px-4">Ngày cấp</AssetStickyHead>
                <AssetStickyHead className="w-[240px] px-4">Tên tài sản</AssetStickyHead>
                <AssetStickyHead className="w-[116px]">Loại</AssetStickyHead>
                <AssetStickyHead className="w-[104px]">Nhóm</AssetStickyHead>
                <AssetStickyHead className="w-[180px]">Mô tả</AssetStickyHead>
                <AssetStickyHead className="w-[170px]">Mật khẩu</AssetStickyHead>
                <AssetStickyHead className="w-[72px] text-center">TT</AssetStickyHead>
                <AssetStickyHead className="w-[150px]">Chủ sở hữu</AssetStickyHead>
                <AssetStickyHead className="w-[64px] text-right" aria-label="Thao tác" />
              </tr>
            </thead>
            <TableBody>
              {assets.map((asset) => {
                const canEdit = canEditAsset(asset, role, profileId);
                return (
                  <AssetTableRow
                    key={asset.id}
                    asset={asset}
                    teamMap={teamMap}
                    profileMap={profileMap}
                    canEdit={canEdit}
                    canViewSensitive={canEdit}
                    isSecretVisible={visibleSecretIds.has(asset.id)}
                    onToggleSecret={() => onToggleSecret(asset.id)}
                    onCopy={onCopy}
                    onDetail={() => onDetail(asset)}
                    onEdit={() => onEdit(asset)}
                    onDelete={() => onDelete(asset)}
                  />
                );
              })}
            </TableBody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 lg:hidden">
        {assets.map((asset) => {
          const canEdit = canEditAsset(asset, role, profileId);
          return (
            <AssetMobileCard
              key={asset.id}
              asset={asset}
              teamMap={teamMap}
              profileMap={profileMap}
              canEdit={canEdit}
              canViewSensitive={canEdit}
              isSecretVisible={visibleSecretIds.has(asset.id)}
              onToggleSecret={() => onToggleSecret(asset.id)}
              onCopy={onCopy}
              onDetail={() => onDetail(asset)}
              onEdit={() => onEdit(asset)}
              onDelete={() => onDelete(asset)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AssetTableRow({
  asset,
  teamMap,
  profileMap,
  canEdit,
  canViewSensitive,
  isSecretVisible,
  onToggleSecret,
  onCopy,
  onDetail,
  onEdit,
  onDelete,
}: AssetRowProps) {
  const group = asset.asset_group as AssetGroup;
  const link = normalizeUrl(asset.link_url ?? "");
  const value = formatAssetValue(asset);
  const sensitiveNote = getSensitiveNote(asset);
  const publicDescription = getPublicAssetDescription(asset);
  return (
    <TableRow className="bg-white">
      <TableCell className="whitespace-nowrap px-4 py-2.5 text-slate-400">
        {formatDate(asset.created_at)}
      </TableCell>
      <TableCell className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <AssetGroupIcon group={group} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-950" title={asset.title}>
              {asset.title}
            </p>
            {publicDescription && (
              <p className="truncate text-xs text-muted-foreground" title={publicDescription}>
                {publicDescription}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <Badge className={cn("rounded-full border", assetTypeBadgeClass(asset.asset_type))}>
          {assetTypeLabel(asset.asset_type)}
        </Badge>
      </TableCell>
      <TableCell className="py-2.5">
        <Badge className={`rounded-full border ${GROUP_STYLES[group]}`}>
          {GROUP_LABELS[group]}
        </Badge>
      </TableCell>
      <TableCell className="py-2.5">
        <AssetDescriptionCell
          description={publicDescription}
          asset={asset}
          link={link}
          value={value}
          onCopy={onCopy}
        />
      </TableCell>
      <TableCell className="py-2.5">
        <SensitiveCell
          value={sensitiveNote}
          canView={canViewSensitive}
          visible={isSecretVisible}
          onToggle={onToggleSecret}
          onCopy={onCopy}
        />
      </TableCell>
      <TableCell className="py-2.5 text-center">
        <AssetStatusIndicator asset={asset} />
      </TableCell>
      <TableCell className="py-2.5">
        <span className="block truncate" title={assetOwnerLabel(asset, teamMap, profileMap)}>
          {assetOwnerLabel(asset, teamMap, profileMap)}
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <AssetActions
          asset={asset}
          canEdit={canEdit}
          onDetail={onDetail}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  );
}

type AssetRowProps = {
  asset: Asset;
  teamMap: Map<string, string>;
  profileMap: Map<string, ProfileRow>;
  canEdit: boolean;
  canViewSensitive: boolean;
  isSecretVisible: boolean;
  onToggleSecret: () => void;
  onCopy: (value: string, label?: string) => void;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function AssetStickyHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-30 h-11 border-b border-slate-200 bg-white/95 px-2 text-left align-middle font-semibold text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-white/85",
        className,
      )}
      {...props}
    />
  );
}

function AssetMobileCard(props: AssetRowProps) {
  const {
    asset,
    teamMap,
    profileMap,
    canEdit,
    canViewSensitive,
    isSecretVisible,
    onToggleSecret,
    onCopy,
  } = props;
  const group = asset.asset_group as AssetGroup;
  const link = normalizeUrl(asset.link_url ?? "");
  const value = formatAssetValue(asset);
  const sensitiveNote = getSensitiveNote(asset);

  return (
    <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <AssetGroupIcon group={group} />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 font-bold text-slate-950">{asset.title}</p>
              <p className="text-xs text-muted-foreground">{assetTypeLabel(asset.asset_type)}</p>
            </div>
          </div>
          <AssetStatusIndicator asset={asset} showText />
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <MobileMeta label="Ngày cấp" value={formatDate(asset.created_at)} />
          <MobileMeta label="Nhóm" value={GROUP_LABELS[group]} />
          <MobileMeta label="Chủ sở hữu" value={assetOwnerLabel(asset, teamMap, profileMap)} />
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs text-muted-foreground">Mô tả</p>
            <AssetDescriptionCell
              description={getPublicAssetDescription(asset)}
              asset={asset}
              link={link}
              value={value}
              onCopy={onCopy}
            />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs text-muted-foreground">Mật khẩu</p>
            <SensitiveCell
              value={sensitiveNote}
              canView={canViewSensitive}
              visible={isSecretVisible}
              onToggle={onToggleSecret}
              onCopy={onCopy}
            />
          </div>
        </div>
        <AssetActions
          asset={asset}
          canEdit={canEdit}
          onDetail={props.onDetail}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          align="left"
        />
      </CardContent>
    </Card>
  );
}

function AssetDescriptionCell({
  description,
  asset,
  link,
  value,
  onCopy,
}: {
  description: string;
  asset: Asset;
  link: string | null;
  value: string;
  onCopy: (value: string, label?: string) => void;
}) {
  if (description.trim()) {
    return (
      <p className="truncate text-sm font-medium text-slate-700" title={description}>
        {description}
      </p>
    );
  }

  return <AssetValueCell asset={asset} link={link} value={value} onCopy={onCopy} />;
}

function AssetValueCell({
  asset,
  link,
  value,
  onCopy,
}: {
  asset: Asset;
  link: string | null;
  value: string;
  onCopy: (value: string, label?: string) => void;
}) {
  const hasValue = Boolean(asset.value?.trim());
  if (link && !hasValue) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-700">
        Có liên kết
        <button
          type="button"
          className="rounded-full p-1 transition hover:bg-sky-100"
          onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
          title="Mở liên kết"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-semibold text-slate-900">{value}</span>
      {hasValue && (
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => onCopy(asset.value?.trim() ?? "", "Đã copy giá trị tài sản")}
          title="Copy giá trị"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
      {link && (
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
          title="Mở liên kết"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SensitiveCell({
  value,
  canView,
  visible,
  onToggle,
  onCopy,
}: {
  value: string | null;
  canView: boolean;
  visible: boolean;
  onToggle: () => void;
  onCopy: (value: string, label?: string) => void;
}) {
  if (!value) return <span className="text-muted-foreground">Không có</span>;
  if (!canView) return <span className="text-muted-foreground">Không có quyền</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-semibold text-slate-900">{visible ? value : "••••••••"}</span>
      <button
        type="button"
        className="shrink-0 rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        onClick={onToggle}
        title={visible ? "Ẩn" : "Hiện"}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        className="shrink-0 rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        onClick={() => onCopy(value, "Đã copy thông tin nhạy cảm")}
        title="Copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AssetActions({
  asset,
  canEdit,
  onDetail,
  onEdit,
  onDelete,
  align = "right",
}: {
  asset: Asset;
  canEdit: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  align?: "left" | "right";
}) {
  const link = normalizeUrl(asset.link_url ?? "");
  return (
    <div className={cn("flex items-center", align === "right" && "justify-end")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label="Mở menu thao tác tài sản"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align === "right" ? "end" : "start"} className="w-44">
          <DropdownMenuItem onClick={onDetail}>
            <Info className="mr-2 h-4 w-4" />
            Xem chi tiết
          </DropdownMenuItem>
          {link && (
            <DropdownMenuItem onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Mở link
            </DropdownMenuItem>
          )}
          {canEdit && (
            <>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Chỉnh sửa
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function AssetStatusIndicator({ asset, showText = false }: { asset: Asset; showText?: boolean }) {
  const status = getAssetStatus(asset);
  const label = ASSET_STATUS_LABELS[status];
  const dotClass =
    status === "active" ? "bg-emerald-500" : status === "revoked" ? "bg-red-500" : "bg-amber-400";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full",
        showText && "border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold",
      )}
      title={label}
      aria-label={label}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-white", dotClass)} />
      {showText && <span className="text-slate-700">{label}</span>}
    </span>
  );
}

function AssetDetailDialog({
  asset,
  teamName,
  ownerName,
  assignerName,
  canViewSensitive,
  onOpenChange,
}: {
  asset: Asset | null;
  teamName?: string | null;
  ownerName?: string | null;
  assignerName?: string | null;
  canViewSensitive: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const group = (asset?.asset_group ?? "flexible") as AssetGroup;
  const owner = group === "common" ? "Toàn công ty" : (ownerName ?? teamName ?? "Cá nhân");
  const link = normalizeUrl(asset?.link_url ?? "");
  const sensitiveNote = asset ? getSensitiveNote(asset) : null;
  const publicDescription = asset ? getPublicAssetDescription(asset) : "";
  const [showSensitive, setShowSensitive] = useState(false);
  const copySensitive = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Đã copy thông tin nhạy cảm");
    } catch {
      toast.error("Không thể copy dữ liệu");
    }
  };

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
              <div className="rounded-2xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Trạng thái</p>
                <div className="mt-2">
                  <AssetStatusIndicator asset={asset} showText />
                </div>
              </div>
              <DetailMeta label="Giá trị" value={asset.value || "Chưa có"} />
              <DetailMeta label="Chủ sở hữu" value={owner} />
              <DetailMeta label="Người cấp" value={assignerName ?? "Không rõ"} />
              <DetailMeta label="Ngày cấp" value={formatDate(asset.created_at)} />
              <DetailMeta label="Ngày cập nhật" value={formatDate(asset.updated_at)} />
              <div className="rounded-2xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Mật khẩu / Ghi chú nhạy cảm</p>
                <div className="mt-2">
                  <SensitiveCell
                    value={sensitiveNote}
                    canView={canViewSensitive}
                    visible={showSensitive}
                    onToggle={() => setShowSensitive((current) => !current)}
                    onCopy={(value) => void copySensitive(value)}
                  />
                </div>
              </div>
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
                  {publicDescription || "Chưa có mô tả."}
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

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
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
      <SelectTrigger className="h-10 min-w-0 text-sm [&>span]:truncate">
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
  if (role === "admin" || role === "manager") return true;
  if (asset.asset_group === "common") return false;
  if (asset.asset_group === "personal") return asset.created_by === profileId;
  if (asset.asset_group === "flexible") return role === "leader";
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
  if (normalized === "odoo") return "Odoo";
  if (normalized === "landing") return "Landing";
  if (normalized === "pancake") return "Pancake";
  if (normalized === "flowchat") return "FlowChat";
  if (normalized === "canva") return "Canva";
  if (normalized === "capcut") return "Capcut";
  if (normalized === "media") return "Media";
  if (normalized === "link") return "Link chung";
  if (normalized === "ads_account") return "Tài khoản quảng cáo";
  if (normalized === "facebook") return "Facebook";
  if (normalized === "tiktok") return "TikTok";
  if (normalized === "google") return "Google";
  return type;
}

function assetTypeBadgeClass(type: string) {
  const normalized = normalizeAssetType(type);
  if (normalized === "hotline") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (normalized === "odoo") return "border-blue-100 bg-blue-50 text-blue-700";
  if (["canva", "capcut", "media"].includes(normalized)) {
    return "border-violet-100 bg-violet-50 text-violet-700";
  }
  if (["landing", "link", "pancake", "flowchat"].includes(normalized)) {
    return "border-sky-100 bg-sky-50 text-sky-700";
  }
  if (normalized === "ads_account") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function nextTitleForTypeChange(group: AssetGroup, type: string, currentTitle: string) {
  if (type === OTHER_TYPE) return "";
  if (group === "personal" && !currentTitle.trim()) return assetTypeLabel(type);
  return currentTitle;
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
  if (normalized === "pancake") return "pancake";
  if (normalized === "flowchat" || normalized === "flow chat") return "flowchat";
  if (normalized === "canva") return "canva";
  if (normalized === "capcut" || normalized === "cap cut") return "capcut";
  if (normalized === "media") return "media";
  if (
    normalized === "ads" ||
    normalized === "ads account" ||
    normalized === "tài khoản quảng cáo" ||
    normalized === "tai khoan quang cao" ||
    normalized.includes("quảng cáo") ||
    normalized.includes("quang cao")
  ) {
    return "ads_account";
  }
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

function assetOwnerLabel(
  asset: Asset,
  teamMap: Map<string, string>,
  profileMap: Map<string, ProfileRow>,
) {
  const group = asset.asset_group as AssetGroup;
  if (group === "common") return "Toàn công ty";
  if (asset.owner_profile_id) {
    return profileMap.get(asset.owner_profile_id)?.full_name ?? "Không rõ";
  }
  if (asset.owner_team_id) return teamMap.get(asset.owner_team_id) ?? "Không rõ team";
  return group === "personal" ? "Cá nhân" : "Chưa gán";
}

function assetAssignerLabel(asset: Asset, profileMap: Map<string, ProfileRow>) {
  const assignerId = asset.assigned_by ?? asset.created_by;
  if (assignerId) return profileMap.get(assignerId)?.full_name ?? "Không rõ";
  return "Không rõ";
}

function getAssetStatus(asset: Asset) {
  const parsed = parseAssetDescription(asset.description);
  if (parsed.status) return parsed.status;
  if (!asset.is_active) return "paused";
  const normalized = (asset.description ?? "").toLowerCase();
  if (
    normalized.includes("thu hồi") ||
    normalized.includes("thu hoi") ||
    normalized.includes("revoked")
  ) {
    return "revoked";
  }
  return "active";
}

function getSensitiveNote(asset: Asset) {
  return parseAssetDescription(asset.description).sensitive || null;
}

function getPublicAssetDescription(asset: Asset) {
  return parseAssetDescription(asset.description).note;
}

function parseAssetDescription(description?: string | null) {
  const raw = description?.trim() ?? "";
  if (!raw) return { note: "", sensitive: "", status: null as AssetStatus | null };

  const startIndex = raw.indexOf(ASSET_META_START);
  const endIndex = raw.indexOf(ASSET_META_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    const note = raw.slice(0, startIndex).trim();
    const metaText = raw.slice(startIndex + ASSET_META_START.length, endIndex).trim();
    try {
      const meta = JSON.parse(metaText) as {
        sensitive_note?: unknown;
        status?: unknown;
      };
      return {
        note,
        sensitive: typeof meta.sensitive_note === "string" ? meta.sensitive_note : "",
        status: isAssetStatus(meta.status) ? meta.status : null,
      };
    } catch {
      return { note: raw, sensitive: "", status: null };
    }
  }

  if (/(password|pass|token|secret|mật khẩu|mat khau|nhạy cảm|nhay cam)/i.test(raw)) {
    return { note: "", sensitive: raw, status: null };
  }
  return { note: raw, sensitive: "", status: null };
}

function composeAssetDescription(note: string, sensitive: string, status: AssetStatus) {
  const cleanNote = note.trim();
  const cleanSensitive = sensitive.trim();
  if (!cleanSensitive && status === "active") return cleanNote;

  const meta = {
    status,
    ...(cleanSensitive ? { sensitive_note: cleanSensitive } : {}),
  };
  const metaBlock = `${ASSET_META_START}\n${JSON.stringify(meta)}\n${ASSET_META_END}`;
  return [cleanNote, metaBlock].filter(Boolean).join("\n\n");
}

function isAssetStatus(value: unknown): value is AssetStatus {
  return value === "active" || value === "paused" || value === "revoked";
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
