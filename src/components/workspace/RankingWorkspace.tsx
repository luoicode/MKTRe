import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Flame, Medal, Minus, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { formatYmd } from "@/lib/dateRange";
import { fmtVndDong } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { RefreshButton } from "@/components/RefreshButton";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { toast } from "sonner";

type RankingEntry = Database["public"]["Functions"]["get_ranking_entries"]["Returns"][number];
type RankingPeriod = "today" | "week" | "month";
type RankMovement = "up" | "down" | "same";

interface RankingRow extends RankingEntry {
  rank: number;
  movement: RankMovement;
}

interface TeamRankingRow {
  rank: number;
  team_id: string;
  team_name: string;
  member_count: number;
  total_revenue: number;
  streak_days: number;
  movement: RankMovement;
}

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
};

export function RankingWorkspace() {
  const { profile, role } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>("today");
  const canUsePeriodFilter = role === "admin" || role === "manager";
  const effectivePeriod = canUsePeriodFilter ? period : "today";
  const range = getPeriodRange(effectivePeriod);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["global-ranking", effectivePeriod, range.from, range.to],
    enabled: !!profile && !!role,
    queryFn: async () => {
      const { data: entries, error } = await supabase.rpc("get_ranking_entries", {
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;

      let scopedEntries = entries ?? [];
      if (role !== "admin" && scopedEntries.length) {
        const ids = Array.from(new Set(scopedEntries.map((entry) => entry.id).filter(Boolean)));
        const { data: activeProfiles, error: activeProfilesError } = await supabase
          .from("profiles")
          .select("id")
          .in("id", ids)
          .eq("status", "active");
        if (activeProfilesError) throw activeProfilesError;
        const activeIds = new Set((activeProfiles ?? []).map((entry) => entry.id));
        scopedEntries = scopedEntries.filter((entry) => activeIds.has(entry.id));
      }

      const marketingRows = rankRows(scopedEntries);
      return {
        marketingRows,
        teamRows: rankTeams(marketingRows),
      };
    },
  });

  const marketingRows = data?.marketingRows ?? [];
  const teamRows = data?.teamRows ?? [];
  const topRows = marketingRows.slice(0, 10);
  const topThree = topRows.slice(0, 3);
  const currentUserRank = marketingRows.find((row) => row.id === profile?.id)?.rank ?? null;
  const showCurrentUserRank = !!currentUserRank && currentUserRank > 10;
  const showRankTag = role === "employee" || role === "leader";
  const refreshData = async () => {
    await refetch();
    toast.success("Đã làm mới dữ liệu");
  };

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:gap-4 md:space-y-0 md:overflow-hidden">
      <WorkspacePageHeader
        icon={<Trophy className="h-5 w-5" />}
        title="Xếp hạng"
        badge={
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <Trophy className="h-3.5 w-3.5" />
            {PERIOD_LABELS[effectivePeriod]}
          </div>
        }
        actions={
          <>
            {showRankTag ? (
              <CurrentRankTag rank={currentUserRank} total={marketingRows.length} />
            ) : canUsePeriodFilter ? (
              <div className="inline-flex self-start rounded-2xl border bg-slate-50 p-1 lg:self-auto">
                {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                      period === item
                        ? "bg-white text-primary shadow-sm"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                  >
                    {PERIOD_LABELS[item]}
                  </button>
                ))}
              </div>
            ) : null}
            <RefreshButton isRefreshing={isFetching} onRefresh={refreshData} />
          </>
        }
      />

      <div className="shrink-0 md:max-h-[35%]">
        <Podium rows={topThree} currentUserId={profile?.id} isLoading={isLoading} />
      </div>

      <div
        className={cn(
          "grid gap-4 md:min-h-0 md:flex-1 md:overflow-hidden",
          canUsePeriodFilter && "xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]",
        )}
      >
        <RankingTable
          rows={topRows}
          isLoading={isLoading}
          currentUserId={profile?.id}
          currentUserRank={showCurrentUserRank ? currentUserRank : null}
          showStreak={canUsePeriodFilter}
          period={effectivePeriod}
        />

        {canUsePeriodFilter && <TeamRankingTable rows={teamRows} isLoading={isLoading} />}
      </div>
    </div>
  );
}

function CurrentRankTag({ rank, total }: { rank: number | null; total: number }) {
  const label = rank
    ? rank <= 10
      ? `TOP #${rank}/${Math.max(total, 1)}`
      : `Ngoài TOP 10 (#${rank})`
    : "Chưa có xếp hạng";

  return (
    <div className="inline-flex self-start rounded-full bg-indigo-50 px-4 py-2 text-sm font-extrabold text-indigo-700 ring-1 ring-indigo-100 lg:self-auto">
      {label}
    </div>
  );
}

function Podium({
  rows,
  currentUserId,
  isLoading,
}: {
  rows: RankingRow[];
  currentUserId?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid items-end gap-3 md:grid-cols-3">
        {[2, 1, 3].map((rank) => (
          <TopSkeleton key={rank} rank={rank} />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-slate-500">
          <Trophy className="h-10 w-10" />
          <p className="font-medium">Chưa có dữ liệu xếp hạng.</p>
        </CardContent>
      </Card>
    );
  }

  const podiumRows = [rows[1], rows[0], rows[2]];

  return (
    <div className="grid items-end gap-3 md:grid-cols-3">
      {podiumRows.map((row, index) => {
        const rank = index === 0 ? 2 : index === 1 ? 1 : 3;
        if (!row) return <EmptyPodiumSlot key={rank} rank={rank} />;
        return (
          <TopCard
            key={`${row.team_id ?? "no-team"}-${row.id}`}
            row={row}
            rank={rank}
            active={row.id === currentUserId}
          />
        );
      })}
    </div>
  );
}

function RankingTable({
  rows,
  isLoading,
  currentUserId,
  currentUserRank,
  showStreak,
  period,
}: {
  rows: RankingRow[];
  isLoading: boolean;
  currentUserId?: string;
  currentUserRank: number | null;
  showStreak: boolean;
  period: RankingPeriod;
}) {
  const gridClass = showStreak
    ? "grid-cols-[96px_minmax(260px,1.4fr)_minmax(140px,0.8fr)_minmax(160px,0.8fr)_112px]"
    : "grid-cols-[96px_minmax(260px,1.4fr)_minmax(140px,0.8fr)_minmax(160px,0.8fr)]";

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-3xl shadow-sm">
      <CardHeader className="border-b bg-white px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Medal className="h-5 w-5 text-amber-500" />
          Bảng xếp hạng Marketing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          className={cn(
            "grid shrink-0 border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500",
            gridClass,
          )}
        >
          <div>Rank</div>
          <div>Marketing</div>
          <div>Team</div>
          <div className="text-right">Doanh số</div>
          {showStreak && <div className="text-right">Streak 🔥</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 text-center text-slate-500">Đang tải bảng xếp hạng...</div>
          ) : rows.length ? (
            rows.map((row) => (
              <div
                key={`${row.team_id ?? "no-team"}-${row.id}`}
                className={cn(
                  "grid items-center border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50",
                  gridClass,
                  row.id === currentUserId && "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <RankCell rank={row.rank} movement={row.movement} />
                <Person row={row} />
                <div className="font-medium text-slate-500">{row.team_name}</div>
                <div className="text-right text-base font-extrabold text-slate-950">
                  {fmtVndDong(Number(row.total_revenue || 0))}
                </div>
                {showStreak && (
                  <div className="text-right">
                    <Streak value={period === "today" ? null : row.streak_days} />
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-slate-500">Chưa có dữ liệu xếp hạng.</div>
          )}
        </div>
        {currentUserRank && (
          <div className="shrink-0 border-t bg-primary/5 px-5 py-3 text-sm font-semibold text-primary">
            Hạng của bạn: #{currentUserRank}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamRankingTable({ rows, isLoading }: { rows: TeamRankingRow[]; isLoading: boolean }) {
  const gridClass = "grid-cols-[64px_minmax(0,1fr)_120px]";

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden overflow-x-hidden rounded-3xl shadow-sm">
      <CardHeader className="border-b bg-white px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Bảng xếp hạng Team
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          className={cn(
            "grid shrink-0 border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500",
            gridClass,
          )}
        >
          <div>Rank</div>
          <div className="min-w-0">Team</div>
          <div className="text-right">Doanh số</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 text-center text-slate-500">Đang tải team...</div>
          ) : rows.length ? (
            rows.map((row) => (
              <div
                key={row.team_id}
                className={cn(
                  "grid items-center border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50",
                  gridClass,
                )}
              >
                <RankCell rank={row.rank} movement={row.movement} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{row.team_name}</p>
                  <p className="text-xs text-slate-500">{row.member_count} thành viên</p>
                </div>
                <div className="whitespace-nowrap text-right font-extrabold text-slate-950">
                  {fmtVndDong(row.total_revenue)}
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-slate-500">Chưa có dữ liệu team.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TopCard({ row, rank, active }: { row: RankingRow; rank: number; active: boolean }) {
  const styles: Record<number, string> = {
    1: "z-10 border-amber-200 bg-gradient-to-b from-amber-50 to-white md:min-h-[205px] md:scale-[1.02]",
    2: "border-slate-200 bg-gradient-to-b from-slate-50 to-white md:min-h-[175px] md:scale-[0.96]",
    3: "border-orange-200 bg-gradient-to-b from-orange-50 to-white md:min-h-[175px] md:scale-[0.96]",
  };
  const badgeStyles: Record<number, string> = {
    1: "bg-amber-400 text-amber-950",
    2: "bg-slate-500 text-white",
    3: "bg-orange-400 text-orange-950",
  };

  return (
    <Card className={cn("relative overflow-hidden rounded-3xl border-2 shadow-sm", styles[rank])}>
      <CardContent
        className={cn(
          "flex h-full flex-col items-center text-center",
          rank === 1 ? "p-4" : "p-3.5",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold shadow-sm",
            badgeStyles[rank],
          )}
        >
          <Medal className="h-3 w-3" />
          Top {rank}
        </span>
        <RankingAvatar row={row} className="mt-3 border-4 border-white shadow-md" />
        <div className="mt-3 min-w-0">
          <p
            className={cn(
              "truncate font-extrabold text-slate-950",
              rank === 1 ? "text-base" : "text-sm",
            )}
          >
            {row.full_name}
          </p>
          <p className="truncate text-xs text-slate-500">{row.team_name}</p>
        </div>
        <p className={cn("mt-2 font-extrabold text-slate-950", rank === 1 ? "text-xl" : "text-lg")}>
          {fmtVndDong(Number(row.total_revenue || 0))}
        </p>
        {active && (
          <span className="mt-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            Bạn
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyPodiumSlot({ rank }: { rank: number }) {
  return (
    <Card className="rounded-3xl border-dashed bg-slate-50/70 shadow-none">
      <CardContent className="flex min-h-[165px] flex-col items-center justify-center gap-2 p-4 text-slate-400">
        <Medal className="h-7 w-7" />
        <p className="text-sm font-semibold">Top {rank}</p>
      </CardContent>
    </Card>
  );
}

function TopSkeleton({ rank }: { rank: number }) {
  return (
    <Card
      className={cn(
        "rounded-3xl",
        rank === 1 ? "md:min-h-[205px] md:scale-[1.02]" : "md:min-h-[175px] md:scale-[0.96]",
      )}
    >
      <CardContent className="flex flex-col items-center space-y-3 p-4">
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        <div
          className={cn(
            "animate-pulse rounded-full bg-muted",
            rank === 1 ? "h-[72px] w-[72px]" : "h-[60px] w-[60px]",
          )}
        />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function Person({ row }: { row: RankingRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <RankingAvatar row={row} className="border" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950">{row.full_name}</p>
        <p className="truncate text-xs text-slate-500">@{row.username || "user"}</p>
      </div>
    </div>
  );
}

function RankingAvatar({ row, className }: { row: RankingRow; className?: string }) {
  const avatarUrl = row.avatar_url?.trim();
  return (
    <Avatar
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full align-middle",
        className,
      )}
    >
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt={row.full_name} className="h-full w-full object-cover" />
      )}
      <AvatarFallback className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-extrabold leading-none text-slate-700">
        {getInitials(row.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}

function RankCell({ rank, movement }: { rank: number; movement: RankMovement }) {
  return (
    <div className="flex items-center gap-2">
      <MovementIcon movement={movement} />
      <span className={cn("font-extrabold", rank <= 3 ? "text-slate-950" : "text-slate-600")}>
        {rank}
      </span>
    </div>
  );
}

function MovementIcon({ movement }: { movement: RankMovement }) {
  if (movement === "up") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <ArrowUp className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (movement === "down") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-red-500">
        <ArrowDown className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

function Streak({ value }: { value: number | null }) {
  if (value == null) return <span className="text-sm font-semibold text-slate-400">-</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-extrabold text-orange-700">
      <Flame className="h-3.5 w-3.5" />
      {value}
    </span>
  );
}

function rankRows(entries: RankingEntry[]): RankingRow[] {
  return entries
    .filter((entry) => entry.role === "leader" || entry.role === "employee")
    .sort(
      (a, b) =>
        Number(b.total_revenue || 0) - Number(a.total_revenue || 0) ||
        a.full_name.localeCompare(b.full_name, "vi"),
    )
    .map((entry, index) => ({
      ...entry,
      total_revenue: Number(entry.total_revenue || 0),
      streak_days: Number(entry.streak_days || 0),
      rank: index + 1,
      movement: "same",
    }));
}

function rankTeams(rows: RankingRow[]): TeamRankingRow[] {
  const teams = new Map<string, Omit<TeamRankingRow, "rank" | "movement">>();

  for (const row of rows) {
    if (!row.team_id) continue;

    const current = teams.get(row.team_id) ?? {
      team_id: row.team_id,
      team_name: row.team_name,
      member_count: 0,
      total_revenue: 0,
      streak_days: 0,
    };
    current.member_count += 1;
    current.total_revenue += Number(row.total_revenue || 0);
    current.streak_days += Number(row.streak_days || 0);
    teams.set(row.team_id, current);
  }

  return Array.from(teams.values())
    .sort(
      (a, b) => b.total_revenue - a.total_revenue || a.team_name.localeCompare(b.team_name, "vi"),
    )
    .map((team, index) => ({
      ...team,
      rank: index + 1,
      movement: "same",
    }));
}

function getPeriodRange(period: RankingPeriod) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  }

  if (period === "month") {
    start.setDate(1);
  }

  return {
    from: formatYmd(start),
    to: formatYmd(end),
  };
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(-2)
    .join("")
    .toUpperCase();
  return initials || "U";
}
