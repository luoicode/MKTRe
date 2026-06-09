import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Copy, Database, Eye, Plus, Power, PowerOff, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  buildLeadIngestUrl,
  createLeadSource,
  fetchEmployeeLeadSources,
  leadChannelOptions,
  updateLeadSourceStatus,
  type LeadChannel,
  type LeadSourceStatus,
  type MarketingLeadSource,
} from "@/lib/marketingLeadSources";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employee/lead-sources")({
  component: EmployeeLeadSourcesPage,
});

interface LeadSourceForm {
  name: string;
  product: string;
  channel: LeadChannel;
  team: string;
}

const ALL_FILTER = "all";
const UNKNOWN_TEAM = "Chưa xác định team";

const productOptions = ["NOTRIGOLD", "NOTRIZYM", "NOTRIBIO", "NOTRI MAMA"];

const emptyForm: LeadSourceForm = {
  name: "",
  product: "NOTRIGOLD",
  channel: "Facebook mess",
  team: "",
};

function EmployeeLeadSourcesPage() {
  const { profile } = useAuth();
  const [sources, setSources] = useState<MarketingLeadSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [channelFilter, setChannelFilter] = useState(ALL_FILTER);
  const [productFilter, setProductFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSource, setDetailSource] = useState<MarketingLeadSource | null>(null);
  const [successSource, setSuccessSource] = useState<MarketingLeadSource | null>(null);
  const [form, setForm] = useState<LeadSourceForm>(emptyForm);
  const [currentTeamName, setCurrentTeamName] = useState("");
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);

  const displayTeamName = currentTeamName || UNKNOWN_TEAM;

  useEffect(() => {
    let active = true;

    async function loadCurrentMarketingTeam() {
      if (!profile?.id) {
        if (active) {
          setCurrentTeamName("");
          setCurrentTeamId(null);
          setLoadingTeam(false);
        }
        return;
      }

      setLoadingTeam(true);

      try {
        const { data: memberships, error: membershipError } = await supabase
          .from("team_memberships")
          .select("team_id")
          .eq("user_id", profile.id)
          .eq("is_active", true);

        if (membershipError) throw membershipError;

        const teamIds = Array.from(
          new Set((memberships ?? []).map((item) => item.team_id).filter(Boolean)),
        );

        if (!teamIds.length) {
          if (active) {
            setCurrentTeamName("");
            setCurrentTeamId(null);
          }
          return;
        }

        const { data: teams, error: teamError } = await supabase
          .from("teams")
          .select("id, name, department")
          .in("id", teamIds);

        if (teamError) throw teamError;

        const marketingTeam =
          (teams ?? []).find((team) => team.department === "marketing") ?? teams?.[0];

        if (active) {
          setCurrentTeamName(marketingTeam?.name ?? "");
          setCurrentTeamId(marketingTeam?.id ?? null);
        }
      } catch (error) {
        console.error("[lead-sources][load-team]", error);
        if (active) {
          setCurrentTeamName("");
          setCurrentTeamId(null);
        }
      } finally {
        if (active) setLoadingTeam(false);
      }
    }

    void loadCurrentMarketingTeam();

    return () => {
      active = false;
    };
  }, [profile?.id]);

  useEffect(() => {
    setForm((current) => ({ ...current, team: displayTeamName }));
  }, [displayTeamName]);

  useEffect(() => {
    let active = true;

    async function loadSources() {
      if (!profile?.id) {
        if (active) {
          setSources([]);
          setLoadingSources(false);
        }
        return;
      }

      setLoadingSources(true);
      try {
        const rows = await fetchEmployeeLeadSources();
        if (active) setSources(rows);
      } catch (error) {
        console.error("[lead-sources][load-sources]", error);
        toast.error("Không tải được danh sách nguồn Marketing");
        if (active) setSources([]);
      } finally {
        if (active) setLoadingSources(false);
      }
    }

    void loadSources();

    return () => {
      active = false;
    };
  }, [profile?.id]);

  const filteredSources = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return sources.filter((source) => {
      const matchesSearch =
        !normalizedSearch || source.name.toLowerCase().includes(normalizedSearch);
      const matchesChannel = channelFilter === ALL_FILTER || source.channel === channelFilter;
      const matchesProduct = productFilter === ALL_FILTER || source.product === productFilter;
      const matchesStatus = statusFilter === ALL_FILTER || source.status === statusFilter;
      return matchesSearch && matchesChannel && matchesProduct && matchesStatus;
    });
  }, [channelFilter, productFilter, searchTerm, sources, statusFilter]);

  const resetForm = () => {
    setForm({ ...emptyForm, team: displayTeamName });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) resetForm();
  };

  const handleCreateSource = async () => {
    if (!form.name.trim()) {
      toast.error("Nhập tên nguồn Marketing");
      return;
    }
    if (!profile?.id) {
      toast.error("Không xác định được tài khoản hiện tại");
      return;
    }

    try {
      const newSource = await createLeadSource({
        name: form.name.trim(),
        product: form.product,
        channel: form.channel,
        ownerUserId: profile.id,
        teamId: currentTeamId,
      });

      setSources((current) => [newSource, ...current]);
      setSuccessSource(newSource);
      setCreateOpen(false);
      resetForm();
      toast.success("Tạo nguồn thành công");
    } catch (error) {
      console.error("[lead-sources][create]", error);
      toast.error("Không tạo được nguồn Marketing");
    }
  };

  const copyApiUrl = async (apiUrl: string) => {
    try {
      await navigator.clipboard.writeText(apiUrl);
      toast.success("Đã copy API URL");
    } catch {
      toast.error("Không thể copy API URL");
    }
  };

  const toggleSourceStatus = async (source: MarketingLeadSource) => {
    const nextStatus: LeadSourceStatus = source.status === "active" ? "inactive" : "active";
    try {
      await updateLeadSourceStatus(source.id, nextStatus === "active");
      setSources((current) =>
        current.map((item) => (item.id === source.id ? { ...item, status: nextStatus } : item)),
      );
      setDetailSource((current) =>
        current?.id === source.id ? { ...current, status: nextStatus } : current,
      );
      toast.success(nextStatus === "active" ? "Đã bật nguồn Marketing" : "Đã tắt nguồn Marketing");
    } catch (error) {
      console.error("[lead-sources][toggle]", error);
      toast.error("Không cập nhật được trạng thái nguồn");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 md:px-8">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Database className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Nguồn Marketing</h1>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-12 rounded-2xl bg-blue-600 px-5 text-base font-semibold shadow-lg shadow-blue-600/20 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-5 w-5" />
            Tạo nguồn
          </Button>
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_160px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên nguồn..."
              className="h-11 rounded-2xl border-slate-200 pl-11"
            />
          </div>

          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-slate-200">
              <SelectValue placeholder="Kênh chạy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Tất cả kênh</SelectItem>
              {leadChannelOptions.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-slate-200">
              <SelectValue placeholder="Sản phẩm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Tất cả sản phẩm</SelectItem>
              {productOptions.map((product) => (
                <SelectItem key={product} value={product}>
                  {product}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-slate-200">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Tất cả trạng thái</SelectItem>
              <SelectItem value="active">Đang bật</SelectItem>
              <SelectItem value="inactive">Đã tắt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Danh sách nguồn Marketing</h2>
            <p className="text-sm text-slate-500">Mỗi nguồn có một API URL riêng.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] table-fixed text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[240px] px-5 py-3">Tên nguồn</th>
                <th className="w-[120px] px-4 py-3">Sản phẩm</th>
                <th className="w-[160px] px-4 py-3">Kênh</th>
                <th className="w-[110px] px-4 py-3">Team</th>
                <th className="w-[300px] px-4 py-3">API URL</th>
                <th className="w-[110px] px-4 py-3 text-center">Trạng thái</th>
                <th className="w-[120px] px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loadingSources ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    Đang tải nguồn Marketing...
                  </td>
                </tr>
              ) : filteredSources.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    Chưa có nguồn Marketing phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredSources.map((source) => (
                  <tr key={source.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <p className="truncate font-semibold text-slate-950" title={source.name}>
                        {source.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{source.token}</p>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-700">{source.product}</td>
                    <td className="px-4 py-4 text-slate-600">{source.channel}</td>
                    <td className="px-4 py-4 text-slate-600">{source.team || displayTeamName}</td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-0 items-center rounded-xl bg-slate-50 px-3 py-2">
                        <code className="min-w-0 flex-1 truncate text-xs text-slate-600">
                          {buildLeadIngestUrl(source.token)}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={source.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          label="Copy API URL"
                          onClick={() => copyApiUrl(buildLeadIngestUrl(source.token))}
                          icon={<Copy className="h-4 w-4" />}
                        />
                        <IconButton
                          label="Xem chi tiết"
                          onClick={() => setDetailSource(source)}
                          icon={<Eye className="h-4 w-4" />}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Tạo nguồn</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tên nguồn</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="VD: Huy - NOTRIGOLD - Facebook mess"
                className="h-11 rounded-2xl"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sản phẩm</Label>
                <Select
                  value={form.product}
                  onValueChange={(value) => setForm((current) => ({ ...current, product: value }))}
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((product) => (
                      <SelectItem key={product} value={product}>
                        {product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Kênh</Label>
                <Select
                  value={form.channel}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, channel: value as LeadChannel }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadChannelOptions.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Team</Label>
              <Input
                value={loadingTeam ? "Đang tải team..." : form.team || displayTeamName}
                disabled
                className="h-11 rounded-2xl bg-slate-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateOpenChange(false)}>
              Huỷ
            </Button>
            <Button onClick={handleCreateSource}>
              <Plus className="mr-2 h-4 w-4" />
              Tạo nguồn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(successSource)}
        onOpenChange={(open) => !open && setSuccessSource(null)}
      >
        <DialogContent className="rounded-3xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Tạo nguồn Marketing thành công
            </DialogTitle>
          </DialogHeader>
          {successSource ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                API URL bên dưới đã sẵn sàng để gắn vào form hoặc landing page.
              </p>
              <ApiUrlBox
                apiUrl={buildLeadIngestUrl(successSource.token)}
                onCopy={() => copyApiUrl(buildLeadIngestUrl(successSource.token))}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuccessSource(null)}>
              Đóng
            </Button>
            {successSource ? (
              <Button onClick={() => copyApiUrl(buildLeadIngestUrl(successSource.token))}>
                <Copy className="mr-2 h-4 w-4" />
                Copy API URL
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailSource)} onOpenChange={(open) => !open && setDetailSource(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Chi tiết nguồn Marketing</DialogTitle>
          </DialogHeader>
          {detailSource ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="Tên nguồn" value={detailSource.name} />
                <InfoItem label="Sản phẩm" value={detailSource.product} />
                <InfoItem label="Kênh" value={detailSource.channel} />
                <InfoItem label="Team" value={detailSource.team || displayTeamName} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>API URL</Label>
                  <StatusBadge status={detailSource.status} />
                </div>
                <ApiUrlBox
                  apiUrl={buildLeadIngestUrl(detailSource.token)}
                  onCopy={() => copyApiUrl(buildLeadIngestUrl(detailSource.token))}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => detailSource && toggleSourceStatus(detailSource)}
            >
              {detailSource?.status === "active" ? (
                <PowerOff className="mr-2 h-4 w-4" />
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              {detailSource?.status === "active" ? "Tắt nguồn" : "Bật nguồn"}
            </Button>
            <Button
              onClick={() => detailSource && copyApiUrl(buildLeadIngestUrl(detailSource.token))}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy API URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: LeadSourceStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold",
        isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
      )}
    >
      {isActive ? "Đang bật" : "Đã tắt"}
    </span>
  );
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-9 w-9 rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600"
    >
      {icon}
    </Button>
  );
}

function ApiUrlBox({ apiUrl, onCopy }: { apiUrl: string; onCopy: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <code className="min-w-0 flex-1 truncate text-sm text-slate-700">{apiUrl}</code>
      <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={onCopy}>
        <Copy className="mr-2 h-4 w-4" />
        Copy
      </Button>
    </div>
  );
}

function InfoItem({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white", compact ? "p-3" : "p-4")}>
      <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
