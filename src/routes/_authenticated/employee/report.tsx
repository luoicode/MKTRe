import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSlots, todayStr, fmtVnd, fmtPct, fmtNum } from "@/lib/reports";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employee/report")({ component: EmployeeReport });

interface FormState {
  ads_cost: string;
  mess_count: string;
  data_count: string;
  closed_orders: string;
  daily_data_revenue: string;
  total_orders: string;
  total_revenue: string;
  note: string;
}
const empty: FormState = {
  ads_cost: "0", mess_count: "0", data_count: "0", closed_orders: "0",
  daily_data_revenue: "0", total_orders: "0", total_revenue: "0", note: "",
};

function EmployeeReport() {
  const { profile } = useAuth();
  const { data: slots } = useSlots();
  const [date] = useState(todayStr());
  const [activeSlot, setActiveSlot] = useState<string | undefined>();
  const qc = useQueryClient();

  useEffect(() => {
    if (slots && slots.length && !activeSlot) setActiveSlot(slots[0].id);
  }, [slots, activeSlot]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo của bạn</h1>
        <p className="text-sm text-muted-foreground">Ngày: {date}</p>
      </div>

      {!slots ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs value={activeSlot} onValueChange={setActiveSlot}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            {slots.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>{s.slot_name}</TabsTrigger>
            ))}
          </TabsList>
          {slots.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-6">
              {profile && activeSlot === s.id && (
                <SlotForm
                  profileId={profile.id}
                  slotId={s.id}
                  slotName={s.slot_name}
                  date={date}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["my-reports"] })}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function SlotForm({ profileId, slotId, slotName, date, onSaved }: {
  profileId: string; slotId: string; slotName: string; date: string; onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const { data: existing, isLoading, refetch } = useQuery({
    queryKey: ["slot_report", profileId, date, slotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_reports")
        .select("*")
        .eq("user_id", profileId)
        .eq("report_date", date)
        .eq("slot_id", slotId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setForm({
        ads_cost: String(existing.ads_cost ?? 0),
        mess_count: String(existing.mess_count ?? 0),
        data_count: String(existing.data_count ?? 0),
        closed_orders: String(existing.closed_orders ?? 0),
        daily_data_revenue: String(existing.daily_data_revenue ?? 0),
        total_orders: String(existing.total_orders ?? 0),
        total_revenue: String(existing.total_revenue ?? 0),
        note: existing.note ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [existing]);

  const computed = useMemo(() => {
    const n = (s: string) => Number(s) || 0;
    const ads = n(form.ads_cost), mess = n(form.mess_count), dat = n(form.data_count);
    const closed = n(form.closed_orders), dailyRev = n(form.daily_data_revenue);
    const totalRev = n(form.total_revenue);
    return {
      cp_mess: mess > 0 ? ads / mess : null,
      cp_data: dat > 0 ? ads / dat : null,
      conversion_rate: dat > 0 ? closed / dat : null,
      avg_order: closed > 0 ? dailyRev / closed : null,
      cp_daily_rev: dailyRev > 0 ? ads / dailyRev : null,
      cp_total_rev: totalRev > 0 ? ads / totalRev : null,
      roas: ads > 0 ? totalRev / ads : null,
      recovered: totalRev - dailyRev,
    };
  }, [form]);

  const locked = existing && !["draft", "rejected"].includes(existing.status as string);

  const save = async (status: "draft" | "submitted") => {
    setSaving(true);
    const payload = {
      user_id: profileId,
      report_date: date,
      slot_id: slotId,
      ads_cost: Number(form.ads_cost) || 0,
      mess_count: Number(form.mess_count) || 0,
      data_count: Number(form.data_count) || 0,
      closed_orders: Number(form.closed_orders) || 0,
      daily_data_revenue: Number(form.daily_data_revenue) || 0,
      total_orders: Number(form.total_orders) || 0,
      total_revenue: Number(form.total_revenue) || 0,
      note: form.note || null,
      status,
      submitted_at: status === "submitted" ? new Date().toISOString() : null,
    };
    let res;
    if (existing) {
      res = await supabase.from("slot_reports").update(payload).eq("id", existing.id);
    } else {
      res = await supabase.from("slot_reports").insert(payload);
    }
    setSaving(false);
    if (res.error) {
      toast.error(`Lỗi: ${res.error.message}`);
      return;
    }
    toast.success(status === "submitted" ? "Đã gửi báo cáo" : "Đã lưu nháp");
    await refetch();
    onSaved();
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const num = (k: keyof FormState, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type="number"
        inputMode="decimal"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        disabled={!!locked}
      />
    </div>
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Khung {slotName}</span>
            {existing && <StatusBadge status={existing.status as string} />}
          </CardTitle>
          <CardDescription>Nhập số liệu thô. Hệ thống sẽ tự tính các chỉ số.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {num("ads_cost", "Chi phí Ads")}
            {num("mess_count", "Số Mess")}
            {num("data_count", "Số Data")}
            {num("closed_orders", "Số đơn chốt")}
            {num("daily_data_revenue", "Doanh số data/ngày")}
            {num("total_orders", "Tổng đơn")}
            {num("total_revenue", "Tổng doanh số")}
          </div>
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={!!locked} />
          </div>
          {existing?.rejected_reason && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Lý do từ chối: {existing.rejected_reason}
            </div>
          )}
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Lưu nháp
              </Button>
              <Button onClick={() => save("submitted")} disabled={saving}>
                <Send className="mr-2 h-4 w-4" /> Gửi báo cáo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chỉ số tự tính</CardTitle>
          <CardDescription>Cập nhật real-time theo số liệu nhập</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="CP/Mess" value={fmtVnd(computed.cp_mess)} />
            <Metric label="CP/Data" value={fmtVnd(computed.cp_data)} />
            <Metric label="Tỉ lệ chốt" value={fmtPct(computed.conversion_rate)} />
            <Metric label="TB/Đơn" value={fmtVnd(computed.avg_order)} />
            <Metric label="CP/DS Ngày" value={fmtNum(computed.cp_daily_rev, 3)} />
            <Metric label="CP/Tổng DS" value={fmtNum(computed.cp_total_rev, 3)} />
            <Metric label="ROAS" value={fmtNum(computed.roas, 2)} />
            <Metric label="DS data chốt lại" value={fmtVnd(computed.recovered)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    draft: { v: "secondary", label: "Nháp" },
    submitted: { v: "default", label: "Đã gửi" },
    approved: { v: "default", label: "Đã duyệt" },
    rejected: { v: "destructive", label: "Từ chối" },
    locked: { v: "outline", label: "Khóa" },
  };
  const it = map[status] ?? { v: "outline" as const, label: status };
  return <Badge variant={it.v}>{it.label}</Badge>;
}
