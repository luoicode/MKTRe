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

export type SaleReportRow = Tables<"sale_reports">;
export type SaleReportStatus = "draft" | "submitted";
export type SaleSlotStatus = "not_open" | "open" | "submitted" | "locked" | "expired";

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
  oldCustomers: number;
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
  const openAt = new Date(dueAt.getTime() - 60 * 60_000);
  const closeAt = new Date(dueAt.getTime() + 60 * 60_000);
  return { openAt, dueAt, closeAt };
}

export function getSaleSlotStatus({
  report,
  reportDate,
  slotTime,
  now = new Date(),
}: {
  report: SaleReportRow | null | undefined;
  reportDate: string;
  slotTime: string;
  now?: Date;
}): SaleSlotStatus {
  if (report?.status === "submitted") return "submitted";
  const { openAt, closeAt } = getSaleSlotWindow(reportDate, slotTime);
  if (now.getTime() < openAt.getTime()) return "not_open";
  if (now.getTime() <= closeAt.getTime()) return "open";
  return report ? "locked" : "expired";
}

export function findPreferredSaleSlot(
  reportsBySlot: SaleReportsBySlot,
  reportDate: string,
  now = new Date(),
): SaleReportSlotId {
  const openSlot = saleReportSlots.find(
    (slot) =>
      getSaleSlotStatus({
        report: reportsBySlot[slot.id],
        reportDate,
        slotTime: slot.time,
        now,
      }) === "open",
  );
  if (openSlot) return openSlot.id;

  const nextSlot = saleReportSlots.find(
    (slot) =>
      getSaleSlotStatus({
        report: reportsBySlot[slot.id],
        reportDate,
        slotTime: slot.time,
        now,
      }) === "not_open",
  );
  return nextSlot?.id ?? saleReportSlots[saleReportSlots.length - 1].id;
}

export function getNextSaleSlotLabel(
  reportsBySlot: SaleReportsBySlot,
  reportDate: string,
  now = new Date(),
) {
  const nextSlot = saleReportSlots.find(
    (slot) =>
      getSaleSlotStatus({
        report: reportsBySlot[slot.id],
        reportDate,
        slotTime: slot.time,
        now,
      }) === "not_open",
  );
  if (!nextSlot) return null;
  const { openAt } = getSaleSlotWindow(reportDate, nextSlot.time);
  return `${nextSlot.tableLabel} mở lúc ${formatTime(openAt)}`;
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
    floatingDataClosed: String(row.floating_data_closed ?? 0),
    floatingDataReceived: String(row.floating_data_received ?? 0),
    newCustomerRevenue: String(row.new_customer_revenue ?? 0),
    floatingRevenue: String(row.floating_revenue ?? 0),
    oldCustomers: String(row.old_customers ?? 0),
    note: row.note ?? "",
  };
}

export function saleFormToPayload({
  userId,
  reportDate,
  slotId,
  status,
  values,
}: {
  userId: string;
  reportDate: string;
  slotId: SaleReportSlotId;
  status: SaleReportStatus;
  values: SaleReportFormValues;
}): TablesInsert<"sale_reports"> {
  const slot = saleReportSlots.find((item) => item.id === slotId) ?? saleReportSlots[0];
  return {
    user_id: userId,
    report_date: reportDate,
    slot_key: slotId,
    slot_time: slot.time,
    new_data_received: parseSaleNumber(values.newDataReceived),
    new_data_closed: parseSaleNumber(values.newDataClosed),
    floating_data_closed: parseSaleNumber(values.floatingDataClosed),
    floating_data_received: parseSaleNumber(values.floatingDataReceived),
    new_customer_revenue: parseSaleNumber(values.newCustomerRevenue),
    floating_revenue: parseSaleNumber(values.floatingRevenue),
    old_customers: parseSaleNumber(values.oldCustomers),
    note: values.note.trim() || null,
    status,
    submitted_at: status === "submitted" ? new Date().toISOString() : null,
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
    floatingDataClosed: String(sumNumber(submittedRows, "floating_data_closed")),
    floatingDataReceived: String(sumNumber(submittedRows, "floating_data_received")),
    newCustomerRevenue: String(sumNumber(submittedRows, "new_customer_revenue")),
    floatingRevenue: String(sumNumber(submittedRows, "floating_revenue")),
    oldCustomers: String(sumNumber(submittedRows, "old_customers")),
    note: "",
  });
}

export function summarizeSaleFormValues(values: SaleReportFormValues): SaleReportSummary {
  const newDataReceived = parseSaleNumber(values.newDataReceived);
  const floatingDataReceived = parseSaleNumber(values.floatingDataReceived);
  const newDataClosed = parseSaleNumber(values.newDataClosed);
  const floatingDataClosed = parseSaleNumber(values.floatingDataClosed);
  const newCustomerRevenue = parseSaleNumber(values.newCustomerRevenue);
  const floatingRevenue = parseSaleNumber(values.floatingRevenue);
  const oldCustomers = parseSaleNumber(values.oldCustomers);
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
    oldCustomers,
  };
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

function sumNumber(rows: SaleReportRow[], key: keyof SaleReportRow) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
