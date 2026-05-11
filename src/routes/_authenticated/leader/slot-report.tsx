import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSlots, todayStr, fmtVndDong, fmtInt } from "@/lib/reports";
import { getLeaderTeamIds } from "@/lib/dailyAggregates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leader/slot-report")({
  component: LeaderSlotReport,
});

function LeaderSlotReport() {
  const { profile } = useAuth();
  const { data: slots } = useSlots();
  const [date, setDate] = useState(todayStr());
  const [slotId, setSlotId] = useState<string>("");

  if (slots && slots.length && !slotId) setSlotId(slots[0].id);

  const { data, isLoading } = useQuery({
    queryKey: ["leader-slot", profile?.id, date, slotId],
    enabled: !!profile && !!slotId,
    queryFn: async () => {
      const teamIds = await getLeaderTeamIds(profile!.id);
      if (!teamIds.length) return { rows: [] as any[], missing: [] as any[] };
      const [{ data: members }, { data: reports }] = await Promise.all([
        supabase.from("team_memberships").select("user_id").in("team_id", teamIds).eq("is_active", true),
        supabase.from("slot_reports").select("*").in("team_id", teamIds).eq("report_date", date).eq("slot_id", slotId),
      ]);
      const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name, username").in("id", userIds)
        : { data: [] as { id: string; full_name: string; username: string }[] };
      const reportByUser = new Map((reports ?? []).map((r) => [r.user_id, r]));
      const rows = (profiles ?? []).map((p) => ({ profile: p, report: reportByUser.get(p.id) ?? null }));
      rows.sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name, "vi"));
      return { rows, missing: rows.filter((r) => !r.report) };
    },
  });

  const slotName = useMemo(() => slots?.find((s) => s.id === slotId)?.slot_name ?? "", [slots, slotId]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo theo khung giờ</h1>
        <p className="text-sm text-muted-foreground">
          Xem chính xác báo cáo lũy kế của từng nhân viên tại đúng mốc giờ. Không cộng dồn nhiều khung giờ.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Ngày</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Khung giờ</Label>
          <Select value={slotId} onValueChange={setSlotId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {slots?.map((s) => <SelectItem key={s.id} value={s.id}>{s.slot_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Khung {slotName} — {date}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-slate-100 text-left">
                <tr>
                  {["Nhân viên","Trạng thái","Chi Phí Ads","MESS","Data","Đơn DATA/ngày","DS DATA/ngày","Tổng Đơn","Tổng DS","Ghi chú"]
                    .map((h) => <th key={h} className="border-b px-2 py-2 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map(({ profile: p, report: r }) => (
                  <tr key={p.id} className={!r ? "bg-amber-50" : ""}>
                    <td className="border-b px-2 py-1.5 font-medium">{p.full_name}</td>
                    <td className="border-b px-2 py-1.5">
                      {!r ? <Badge variant="destructive">Chưa báo cáo {slotName}</Badge>
                        : <Badge variant={r.status === "submitted" || r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>}
                    </td>
                    <td className="border-b px-2 py-1.5">{r ? fmtVndDong(Number(r.ads_cost)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtInt(Number(r.mess_count)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtInt(Number(r.data_count)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtInt(Number(r.closed_orders)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtVndDong(Number(r.daily_data_revenue)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtInt(Number(r.total_orders)) : "—"}</td>
                    <td className="border-b px-2 py-1.5">{r ? fmtVndDong(Number(r.total_revenue)) : "—"}</td>
                    <td className="border-b px-2 py-1.5 max-w-[200px] truncate">{r?.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
