export const saleReportSlots = [
  { id: "morning", label: "Khung 1", time: "11h50", tableLabel: "Ca ngày" },
  { id: "afternoon", label: "Khung 2", time: "17h20", tableLabel: "Ca chiều" },
  { id: "evening", label: "Khung 3", time: "20h45", tableLabel: "Ca tối" },
] as const;

export type SaleReportSlotId = (typeof saleReportSlots)[number]["id"];

export interface SaleReportFormValues {
  newDataReceived: string;
  newDataClosed: string;
  floatingDataReceived: string;
  floatingDataClosed: string;
  newCustomerRevenue: string;
  videoCallDataCount: string;
  floatingRevenue: string;
  oldCustomerCallCount: string;
  note: string;
}

export interface SaleComputedMetrics {
  totalDataReceived: number;
  totalDataClosed: number;
  totalRevenue: number;
  newCloseRate: number | null;
  floatingCloseRate: number | null;
  totalCloseRate: number | null;
  averageOrder: number | null;
}

export const emptySaleReportForm: SaleReportFormValues = {
  newDataReceived: "",
  newDataClosed: "",
  floatingDataReceived: "",
  floatingDataClosed: "",
  newCustomerRevenue: "",
  videoCallDataCount: "",
  floatingRevenue: "",
  oldCustomerCallCount: "",
  note: "",
};

export const saleReportFieldLabels: Record<keyof Omit<SaleReportFormValues, "note">, string> = {
  newDataReceived: "Tổng data mới nhận",
  newDataClosed: "Tổng data mới chốt",
  floatingDataClosed: "Tổng data thả nổi chốt",
  floatingDataReceived: "Tổng data thả nổi nhận",
  newCustomerRevenue: "Doanh số khách mới",
  videoCallDataCount: "Số DATA khách gọi video",
  floatingRevenue: "Doanh số thả nổi",
  oldCustomerCallCount: "Số DATA khách cũ gọi",
};

export function parseSaleNumber(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

export function formatSaleVnd(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

export function formatSaleInteger(value: number) {
  return Math.round(value).toLocaleString("vi-VN");
}

export function formatSalePercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100).toLocaleString("vi-VN")}%`;
}

export function formatSaleRatioCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return formatSaleVnd(value);
}

function divideOrNull(numerator: number, denominator: number) {
  if (!denominator) return null;
  return numerator / denominator;
}

export function calculateSaleComputedMetrics(values: SaleReportFormValues): SaleComputedMetrics {
  const newDataReceived = parseSaleNumber(values.newDataReceived);
  const newDataClosed = parseSaleNumber(values.newDataClosed);
  const floatingDataClosed = parseSaleNumber(values.floatingDataClosed);
  const floatingDataReceived = parseSaleNumber(values.floatingDataReceived);
  const newCustomerRevenue = parseSaleNumber(values.newCustomerRevenue);
  const floatingRevenue = parseSaleNumber(values.floatingRevenue);

  const totalDataReceived = newDataReceived + floatingDataReceived;
  const totalDataClosed = newDataClosed + floatingDataClosed;
  const totalRevenue = newCustomerRevenue + floatingRevenue;

  return {
    totalDataReceived,
    totalDataClosed,
    totalRevenue,
    newCloseRate: divideOrNull(newDataClosed, newDataReceived),
    floatingCloseRate: divideOrNull(floatingDataClosed, floatingDataReceived),
    totalCloseRate: divideOrNull(totalDataClosed, totalDataReceived),
    averageOrder: divideOrNull(totalRevenue, totalDataClosed),
  };
}

export function formatSaleDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatSaleTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function getSaleSlotDateTime(date: Date, slotTime: string) {
  const [hourPart, minutePart] = slotTime.replace("h", ":").split(":");
  const next = new Date(date);
  next.setHours(Number(hourPart), Number(minutePart), 0, 0);
  return next;
}

export function sumSaleForms(forms: Record<SaleReportSlotId, SaleReportFormValues>) {
  return saleReportSlots.reduce<SaleReportFormValues>((total, slot) => {
    const values = forms[slot.id];
    return {
      newDataReceived: String(
        parseSaleNumber(total.newDataReceived) + parseSaleNumber(values.newDataReceived),
      ),
      newDataClosed: String(
        parseSaleNumber(total.newDataClosed) + parseSaleNumber(values.newDataClosed),
      ),
      floatingDataClosed: String(
        parseSaleNumber(total.floatingDataClosed) + parseSaleNumber(values.floatingDataClosed),
      ),
      floatingDataReceived: String(
        parseSaleNumber(total.floatingDataReceived) + parseSaleNumber(values.floatingDataReceived),
      ),
      newCustomerRevenue: String(
        parseSaleNumber(total.newCustomerRevenue) + parseSaleNumber(values.newCustomerRevenue),
      ),
      videoCallDataCount: String(
        parseSaleNumber(total.videoCallDataCount) + parseSaleNumber(values.videoCallDataCount),
      ),
      floatingRevenue: String(
        parseSaleNumber(total.floatingRevenue) + parseSaleNumber(values.floatingRevenue),
      ),
      oldCustomerCallCount: String(
        parseSaleNumber(total.oldCustomerCallCount) + parseSaleNumber(values.oldCustomerCallCount),
      ),
      note: "",
    };
  }, emptySaleReportForm);
}
