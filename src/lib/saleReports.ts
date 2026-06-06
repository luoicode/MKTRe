import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  emptySaleReportForm,
  parseSaleNumber,
  saleReportSlots,
  sumSaleForms,
  type SaleReportFormValues,
  type SaleReportSlotId,
} from "@/lib/saleReportUtils";
import { canEditSubmittedReport, type ReportSlotState } from "@/lib/reportSlotGating";

export type SaleReportRow = Tables<"sale_reports">;
export type SaleReportStatus = "draft" | "submitted";
export type SaleSlotStatus = ReportSlotState;

export type SaleReportSummary = {
  totalDataReceived: number;
  totalDataClosed: number;
  totalRevenue: number;
  averageOrder: number | null;
  closeRate: number | null;
  newDataReceived: number;
  floatingDataReceived: number;
  newDataClosed: number;
  floatingDataClosed: number;
  newDataReachCount: number;
  newDataZaloFriendCount: number;
  videoCallDataCount: number;
  oldCustomerCallCount: number;
};

export type SaleReportsBySlot = Record<SaleReportSlotId, SaleReportRow | null>;

export const emptySaleReportsBySlot = saleReportSlots.reduce<SaleReportsBySlot>(
  (acc, slot) => ({ ...acc, [slot.id]: null }),
  {} as SaleReportsBySlot,
);

export function todayYmd() {
  return formatYmd(new Date());
}

export function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSaleSlotWindow(reportDate: string, slotTime: string) {
  const [hourPart = "0", minutePart = "0"] = slotTime.replace("h", ":").split(":");
  const [year, month, day] = reportDate.split("-").map(Number);
  const dueAt = new Date(year, month - 1, day, Number(hourPart), Number(minutePart), 0, 0);
  const slotKey = resolveSaleReportSlotId(undefined, slotTime);
  const slotWindow = slotKey ? SALE_SLOT_WINDOWS[slotKey] : null;
  const openAt = slotWindow
    ? new Date(year, month - 1, day, Math.floor(slotWindow.open / 60), slotWindow.open % 60, 0, 0)
    : new Date(dueAt.getTime() - 60 * 60_000);
  const closeAt = slotWindow
    ? new Date(year, month - 1, day, Math.floor(slotWindow.close / 60), slotWindow.close % 60, 0, 0)
    : new Date(dueAt.getTime() + 60 * 60_000);
  return { openAt, dueAt, closeAt };
}

export function getSaleSlotStatus({
  report,
  slotId,
  slotTime,
  now = new Date(),
  bypass = false,
}: {
  report: SaleReportRow | null | undefined;
  reportDate: string;
  slotTime: string;
  now?: Date;
  slotId?: string;
  bypass?: boolean;
}): SaleSlotStatus {
  if (report?.status === "submitted") return "submitted";
  if (bypass) return "available";

  const slotKey = resolveSaleReportSlotId(slotId, slotTime);
  if (!slotKey) return "not_open";

  const minutes = now.getHours() * 60 + now.getMinutes();
  const window = SALE_SLOT_WINDOWS[slotKey];
  if (minutes >= window.open && minutes <= window.close) return "available";
  return minutes < window.open ? "not_open" : "locked";
}

export function canEditSaleSubmittedReport(
  report: SaleReportRow | null | undefined,
  now = new Date(),
) {
  if (report?.status !== "submitted") return false;

  const slotKey = resolveSaleReportSlotId(report.slot_key, report.slot_time);
  if (slotKey === "morning" && report.report_date === formatYmd(now)) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes <= SALE_SLOT_WINDOWS.morning.close;
  }

  return canEditSubmittedReport(report, now);
}

export function findPreferredSaleSlot(
  reportsBySlot: SaleReportsBySlot,
  reportDate: string,
  now = new Date(),
): SaleReportSlotId {
  const activeSlot = saleReportSlots.find(
    (slot) =>
      getSaleSlotStatus({
        report: reportsBySlot[slot.id],
        reportDate,
        slotId: slot.id,
        slotTime: slot.time,
        now,
      }) === "available",
  );
  return activeSlot?.id ?? saleReportSlots[0].id;
}

export function getNextSaleSlotLabel(
  _reportsBySlot: SaleReportsBySlot,
  _reportDate: string,
  _now = new Date(),
) {
  return null;
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function fetchSaleReportsForDate(userId: string, reportDate: string) {
  const { data, error } = await supabase
    .from("sale_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("report_date", reportDate)
    .order("slot_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SaleReportRow[];
}

export async function fetchSaleReportsInRange(userId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("sale_reports")
    .select("*")
    .eq("user_id", userId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: true })
    .order("slot_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SaleReportRow[];
}

export function reportsToForms(rows: SaleReportRow[]) {
  const forms = saleReportSlots.reduce<Record<SaleReportSlotId, SaleReportFormValues>>(
    (acc, slot) => ({ ...acc, [slot.id]: { ...emptySaleReportForm } }),
    {} as Record<SaleReportSlotId, SaleReportFormValues>,
  );
  const reportsBySlot = { ...emptySaleReportsBySlot };
  for (const row of rows) {
    if (!isSaleReportSlotId(row.slot_key)) continue;
    forms[row.slot_key] = rowToSaleForm(row);
    reportsBySlot[row.slot_key] = row;
  }
  return { forms, reportsBySlot };
}

export function rowToSaleForm(row: SaleReportRow): SaleReportFormValues {
  return {
    newDataReceived: String(row.new_data_received ?? 0),
    newDataClosed: String(row.new_data_closed ?? 0),
    newDataReachCount: String(row.new_data_reach_count ?? 0),
    newDataZaloFriendCount: String(row.new_data_zalo_friend_count ?? 0),
    floatingDataReceived: String(row.floating_data_received ?? 0),
    floatingDataClosed: String(row.floating_data_closed ?? 0),
    newCustomerRevenue: String(row.new_customer_revenue ?? 0),
    videoCallDataCount: String(row.video_call_data_count ?? 0),
    floatingRevenue: String(row.floating_revenue ?? 0),
    oldCustomerCallCount: String(getSaleReportOldCustomerCallCount(row)),
    note: row.note ?? "",
  };
}

export function saleFormToPayload({
  userId,
  reportDate,
  slotId,
  status,
  values,
  submittedAt,
}: {
  userId: string;
  reportDate: string;
  slotId: SaleReportSlotId;
  status: SaleReportStatus;
  values: SaleReportFormValues;
  submittedAt?: string | null;
}): TablesInsert<"sale_reports"> {
  const slot = saleReportSlots.find((item) => item.id === slotId) ?? saleReportSlots[0];
  return {
    user_id: userId,
    report_date: reportDate,
    slot_key: slotId,
    slot_time: slot.time,
    new_data_received: parseSaleNumber(values.newDataReceived),
    new_data_closed: parseSaleNumber(values.newDataClosed),
    new_data_reach_count: parseSaleNumber(values.newDataReachCount),
    new_data_zalo_friend_count: parseSaleNumber(values.newDataZaloFriendCount),
    floating_data_received: parseSaleNumber(values.floatingDataReceived),
    floating_data_closed: parseSaleNumber(values.floatingDataClosed),
    new_customer_revenue: parseSaleNumber(values.newCustomerRevenue),
    video_call_data_count: parseSaleNumber(values.videoCallDataCount),
    floating_revenue: parseSaleNumber(values.floatingRevenue),
    old_customer_call_count: parseSaleNumber(values.oldCustomerCallCount),
    old_customers: parseSaleNumber(values.oldCustomerCallCount),
    note: values.note.trim() || null,
    status,
    submitted_at: status === "submitted" ? (submittedAt ?? new Date().toISOString()) : null,
  };
}

export function summarizeSaleForms(forms: Record<SaleReportSlotId, SaleReportFormValues>) {
  return summarizeSaleFormValues(sumSaleForms(forms));
}

export function summarizeSaleReports(rows: SaleReportRow[]) {
  const submittedRows = rows.filter((row) => row.status === "submitted");
  return summarizeSaleFormValues({
    newDataReceived: String(sumNumber(submittedRows, "new_data_received")),
    newDataClosed: String(sumNumber(submittedRows, "new_data_closed")),
    newDataReachCount: String(sumNumber(submittedRows, "new_data_reach_count")),
    newDataZaloFriendCount: String(sumNumber(submittedRows, "new_data_zalo_friend_count")),
    floatingDataReceived: String(sumNumber(submittedRows, "floating_data_received")),
    floatingDataClosed: String(sumNumber(submittedRows, "floating_data_closed")),
    newCustomerRevenue: String(sumNumber(submittedRows, "new_customer_revenue")),
    videoCallDataCount: String(sumNumber(submittedRows, "video_call_data_count")),
    floatingRevenue: String(sumNumber(submittedRows, "floating_revenue")),
    oldCustomerCallCount: String(
      submittedRows.reduce((sum, row) => sum + getSaleReportOldCustomerCallCount(row), 0),
    ),
    note: "",
  });
}

export function summarizeSaleFormValues(values: SaleReportFormValues): SaleReportSummary {
  const newDataReceived = parseSaleNumber(values.newDataReceived);
  const floatingDataReceived = parseSaleNumber(values.floatingDataReceived);
  const newDataClosed = parseSaleNumber(values.newDataClosed);
  const newDataReachCount = parseSaleNumber(values.newDataReachCount);
  const newDataZaloFriendCount = parseSaleNumber(values.newDataZaloFriendCount);
  const floatingDataClosed = parseSaleNumber(values.floatingDataClosed);
  const newCustomerRevenue = parseSaleNumber(values.newCustomerRevenue);
  const videoCallDataCount = parseSaleNumber(values.videoCallDataCount);
  const floatingRevenue = parseSaleNumber(values.floatingRevenue);
  const oldCustomerCallCount = parseSaleNumber(values.oldCustomerCallCount);
  const totalDataReceived = newDataReceived + floatingDataReceived;
  const totalDataClosed = newDataClosed + floatingDataClosed;
  const totalRevenue = newCustomerRevenue + floatingRevenue;

  return {
    totalDataReceived,
    totalDataClosed,
    totalRevenue,
    averageOrder: totalDataClosed ? totalRevenue / totalDataClosed : null,
    closeRate: totalDataReceived ? totalDataClosed / totalDataReceived : null,
    newDataReceived,
    floatingDataReceived,
    newDataClosed,
    floatingDataClosed,
    newDataReachCount,
    newDataZaloFriendCount,
    videoCallDataCount,
    oldCustomerCallCount,
  };
}

export function getSaleReportOldCustomerCallCount(row: SaleReportRow) {
  return Number(row.old_customer_call_count ?? row.old_customers ?? 0);
}

export function groupSaleReportsByDate(rows: SaleReportRow[]) {
  const grouped = new Map<string, SaleReportRow[]>();
  for (const row of rows.filter((item) => item.status === "submitted")) {
    grouped.set(row.report_date, [...(grouped.get(row.report_date) ?? []), row]);
  }
  return Array.from(grouped.entries()).map(([date, dateRows]) => {
    const summary = summarizeSaleReports(dateRows);
    return {
      date,
      closeRate: summary.closeRate ? Math.round(summary.closeRate * 100) : 0,
      revenue: summary.totalRevenue,
    };
  });
}

export function summarizeSaleReportsBySlot(rows: SaleReportRow[]) {
  return saleReportSlots.map((slot) => {
    const slotRows = rows.filter((row) => row.slot_key === slot.id && row.status === "submitted");
    const summary = summarizeSaleReports(slotRows);
    return { slot, summary };
  });
}

export function latestSaleActivities(rows: SaleReportRow[]) {
  return [...rows]
    .sort(
      (a, b) =>
        new Date(b.submitted_at ?? b.updated_at ?? b.created_at).getTime() -
        new Date(a.submitted_at ?? a.updated_at ?? a.created_at).getTime(),
    )
    .slice(0, 6);
}

function isSaleReportSlotId(value: string): value is SaleReportSlotId {
  return saleReportSlots.some((slot) => slot.id === value);
}

const SALE_SLOT_WINDOWS: Record<SaleReportSlotId, { open: number; close: number }> = {
  morning: { open: 0, close: 15 * 60 + 50 },
  afternoon: { open: 17 * 60, close: 20 * 60 + 24 },
  evening: { open: 20 * 60 + 25, close: 24 * 60 - 1 },
};

function resolveSaleReportSlotId(
  slotId: string | undefined,
  slotTime: string,
): SaleReportSlotId | null {
  if (slotId && isSaleReportSlotId(slotId)) return slotId;

  const normalized = slotTime.replace("h", ":");
  const [hourPart] = normalized.split(":");
  const hour = Number(hourPart);
  if (hour === 11) return "morning";
  if (hour === 16 || hour === 17) return "afternoon";
  if (hour === 20 || hour === 21) return "evening";
  return null;
}

function sumNumber(rows: SaleReportRow[], key: keyof SaleReportRow) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
