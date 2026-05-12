import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSlots, todayStr, formatVnd, formatVndSigned, formatPercent, fmtInt, parseVndInput, calculateReportMetrics } from "@/lib/reports";
import { VndInput } from "@/components/VndInput";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Send, AlertTriangle, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { SubmittedReportCard, type SubmittedReportData } from "@/components/SubmittedReportCard";

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
  ads_cost: "", mess_count: "", data_count: "", closed_orders: "",
  daily_data_revenue: "", total_orders: "", total_revenue: "", note: "",
};

function EmployeeReport() {
  const { profile } = useAuth();
  const { data: slots } = useSlots();
  const [date] = useState(todayStr());
  const [activeSlot, setActiveSlot] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState<SubmittedReportData | null>(null);
  const [allDone, setAllDone] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (slots && slots.length && !activeSlot) setActiveSlot(slots[0].id);
  }, [slots, activeSlot]);

  const handleSubmitted = (payload: SubmittedReportData) => {
    setSubmitted(payload);
    if (!slots) return;
    const idx = slots.findIndex((s) => s.id === activeSlot);
    if (idx >= 0 && idx < slots.length - 1) {
      setActiveSlot(slots[idx + 1].id);
      setAllDone(false);
    } else {
      setAllDone(true);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo của bạn</h1>
        <p className="text-sm text-muted-foreground">Ngày: {date}</p>
      </div>

      <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Lưu ý: Số liệu nhập là LŨY KẾ trong ngày, không phải số phát sinh riêng của khung giờ.</p>
        <p className="mt-1 text-xs">
          Ví dụ: nếu bạn đã tắt Ads từ 11h55 và chi phí không tăng thêm, các khung giờ sau vẫn nhập lại cùng mức Chi Phí Ads (không cộng dồn).
        </p>
      </div>

      {!slots ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs value={activeSlot} onValueChange={(v) => { setActiveSlot(v); setSubmitted(null); setAllDone(false); }}>
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
                  fullName={profile.full_name}
                  slotId={s.id}
                  slotName={s.slot_name}
                  date={date}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["my-reports"] })}
                  onSubmitted={handleSubmitted}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {allDone && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="flex items-center gap-3 p-4 text-green-800">
            <PartyPopper className="h-6 w-6" />
            <div className="font-semibold">Bạn đã hoàn thành báo cáo hôm nay</div>
          </CardContent>
        </Card>
      )}

      {submitted && <SubmittedReportCard data={submitted} />}
    </div>
  );
}

function NumberInput({
  id, value, onChange, disabled, placeholder = "0",
}: {
  id: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; placeholder?: string;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits);
      }}
    />
  );
}

function SlotForm({ profileId, fullName, slotId, slotName, date, onSaved, onSubmitted }: {
  profileId: string; fullName: string; slotId: string; slotName: string; date: string;
  onSaved: () => void; onSubmitted: (d: SubmittedReportData) => void;
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
      const s = (n: number | null | undefined) => (n == null || Number(n) === 0 ? "" : String(n));
      setForm({
        ads_cost: s(existing.ads_cost),
        mess_count: s(existing.mess_count),
        data_count: s(existing.data_count),
        closed_orders: s(existing.closed_orders),
        daily_data_revenue: s(existing.daily_data_revenue),
        total_orders: s(existing.total_orders),
        total_revenue: s(existing.total_revenue),
        note: existing.note ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [existing]);

  const nums = {
    ads: parseVndInput(form.ads_cost),
    mess: Number(form.mess_count) || 0,
    data: Number(form.data_count) || 0,
    closed: Number(form.closed_orders) || 0,
    dailyRev: parseVndInput(form.daily_data_revenue),
    totalOrders: Number(form.total_orders) || 0,
    totalRev: parseVndInput(form.total_revenue),
  };

  const computed = useMemo(() => calculateReportMetrics({
    ads_cost: nums.ads,
    mess_count: nums.mess,
    data_count: nums.data,
    closed_orders: nums.closed,
    daily_data_revenue: nums.dailyRev,
    total_orders: nums.totalOrders,
    total_revenue: nums.totalRev,
  }), [nums.ads, nums.mess, nums.data, nums.closed, nums.dailyRev, nums.totalRev]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (nums.totalRev > 0 && nums.totalRev < nums.dailyRev)
      w.push("Tổng Doanh Số đang nhỏ hơn Doanh Số DATA trong ngày. Vui lòng kiểm tra lại số liệu.");
    if (nums.ads > 0 && nums.mess === 0 && nums.data === 0)
      w.push("Có Chi Phí Ads nhưng MESS và Data đều bằng 0.");
    if (nums.closed > nums.data && nums.data > 0)
      w.push("Đơn chốt DATA trong ngày đang lớn hơn Data.");
    if (nums.totalOrders > 0 && nums.totalOrders < nums.closed)
      w.push("Tổng Đơn Chốt đang nhỏ hơn Đơn chốt DATA trong ngày.");
    return w;
  }, [nums]);

  const locked = existing && !["draft", "rejected"].includes(existing.status as string);

  const save = async (status: "draft" | "submitted") => {
    setSaving(true);
    const submittedAt = status === "submitted" ? new Date().toISOString() : null;
    const payload = {
      user_id: profileId,
      report_date: date,
      slot_id: slotId,
      ads_cost: nums.ads,
      mess_count: nums.mess,
      data_count: nums.data,
      closed_orders: nums.closed,
      daily_data_revenue: nums.dailyRev,
      total_orders: nums.totalOrders,
      total_revenue: nums.totalRev,
      note: form.note || null,
      status,
      submitted_at: submittedAt,
    };
    const res = existing
      ? await supabase.from("slot_reports").update(payload).eq("id", existing.id)
      : await supabase.from("slot_reports").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error(`Lỗi: ${res.error.message}`);
      return;
    }
    if (status === "submitted") {
      toast.success("Đã gửi báo cáo thành công");
      onSubmitted({
        fullName,
        reportDate: date,
        slotName,
        submittedAt: submittedAt!,
        ads_cost: nums.ads,
        mess_count: nums.mess,
        data_count: nums.data,
        closed_orders: nums.closed,
        daily_data_revenue: nums.dailyRev,
        total_orders: nums.totalOrders,
        total_revenue: nums.totalRev,
        note: form.note,
      });
      setForm(empty);
    } else {
      toast.success("Đã lưu nháp");
    }
    await refetch();
    onSaved();
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const VND_FIELDS = new Set<keyof FormState>(["ads_cost", "daily_data_revenue", "total_revenue"]);
  const numField = (k: keyof Omit<FormState, "note">, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      {VND_FIELDS.has(k) ? (
        <VndInput
          id={k}
          value={form[k]}
          onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
          disabled={!!locked}
        />
      ) : (
        <NumberInput
          id={k}
          value={form[k]}
          onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
          disabled={!!locked}
        />
      )}
    </div>
  );

  const recoveredNeg = computed.recovered < 0;

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numField("ads_cost", "Chi Phí Ads (VNĐ)")}
            {numField("mess_count", "MESS")}
            {numField("data_count", "Data")}
            {numField("closed_orders", "Đơn chốt DATA trong ngày")}
            {numField("daily_data_revenue", "DOANH SỐ DATA trong ngày (VNĐ)")}
            {numField("total_orders", "Tổng Đơn Chốt")}
            {numField("total_revenue", "Tổng Doanh Số (VNĐ)")}
          </div>
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              disabled={!!locked}
            />
          </div>

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

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
            <Metric label="Chi phí ADS/MESS" value={formatVnd(computed.cp_mess)} />
            <Metric label="Chi phí ADS/Data" value={formatVnd(computed.cp_data)} />
            <Metric label="Tỉ lệ chốt Data trong ngày" value={formatPercent(computed.conv_rate)} />
            <Metric label="TB Đơn" value={formatVnd(computed.avg_order)} />
            <Metric label="Chi phí ADS/Doanh Số Trong Ngày" value={formatPercent(computed.cp_daily_pct)} />
            <Metric label="Chi phí ADS/Tổng Doanh Số" value={formatPercent(computed.cp_total_pct)} />
            <Metric label="Doanh số chốt lại" value={formatVndSigned(computed.recovered)} danger={recoveredNeg} />
            <Metric label="Tổng Đơn Chốt" value={fmtInt(nums.totalOrders)} />
          </dl>
          {recoveredNeg && (
            <div className="mt-3 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
              Tổng Doanh Số đang nhỏ hơn Doanh Số DATA trong ngày. Vui lòng kiểm tra lại số liệu.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-base font-semibold ${danger ? "text-red-600" : ""}`}>{value}</dd>
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
