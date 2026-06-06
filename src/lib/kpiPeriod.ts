export type KpiPeriodMode = "year" | "quarter" | "month" | "week";

export type KpiPeriodSelection = {
  mode: KpiPeriodMode;
  year: number;
  quarter: number;
  month: number;
};

export type KpiWeekSegment = {
  index: number;
  label: string;
  from: string;
  to: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatKpiDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getCurrentKpiPeriodSelection(base = new Date()): KpiPeriodSelection {
  return {
    mode: "month",
    year: base.getFullYear(),
    quarter: Math.floor(base.getMonth() / 3) + 1,
    month: base.getMonth() + 1,
  };
}

export function getKpiYearOptions(base = new Date()) {
  const year = base.getFullYear();
  return [year - 1, year, year + 1, year + 2];
}

export function getKpiMonthRange(year: number, month: number) {
  return {
    from: formatKpiDate(new Date(year, month - 1, 1)),
    to: formatKpiDate(new Date(year, month, 0)),
  };
}

export function getKpiQuarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  return {
    from: getKpiMonthRange(year, startMonth).from,
    to: getKpiMonthRange(year, startMonth + 2).to,
  };
}

export function getKpiYearRange(year: number) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export function getKpiWeekSegments(year: number, month: number): KpiWeekSegment[] {
  const lastDay = new Date(year, month, 0).getDate();
  const segments: KpiWeekSegment[] = [];
  for (let start = 1; start <= lastDay; start += 7) {
    const end = Math.min(start + 6, lastDay);
    const index = segments.length + 1;
    segments.push({
      index,
      label: `Tuần ${index}`,
      from: `${year}-${pad(month)}-${pad(start)}`,
      to: `${year}-${pad(month)}-${pad(end)}`,
    });
  }
  return segments;
}

export function getKpiPeriodRange(selection: KpiPeriodSelection) {
  if (selection.mode === "year") return getKpiYearRange(selection.year);
  if (selection.mode === "quarter") return getKpiQuarterRange(selection.year, selection.quarter);
  return getKpiMonthRange(selection.year, selection.month);
}

export function getDbPeriodTypeFromMode(mode: KpiPeriodMode): "month" | "week" {
  return mode === "week" ? "week" : "month";
}

export function inferKpiPeriodSelection(
  periodStart: string,
  periodEnd: string,
  periodType: string,
): KpiPeriodSelection {
  const start = new Date(`${periodStart}T00:00:00`);
  const year = Number.isNaN(start.getTime()) ? new Date().getFullYear() : start.getFullYear();
  const month = Number.isNaN(start.getTime()) ? new Date().getMonth() + 1 : start.getMonth() + 1;
  const quarter = Math.floor((month - 1) / 3) + 1;

  if (periodType === "week") return { mode: "week", year, quarter, month };
  if (periodStart === getKpiYearRange(year).from && periodEnd === getKpiYearRange(year).to) {
    return { mode: "year", year, quarter, month };
  }
  if (
    periodStart === getKpiQuarterRange(year, quarter).from &&
    periodEnd === getKpiQuarterRange(year, quarter).to
  ) {
    return { mode: "quarter", year, quarter, month };
  }
  return { mode: "month", year, quarter, month };
}

export function distributeKpiTarget(total: number, parts: number) {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const values = Array.from({ length: parts }, () => base);
  values[parts - 1] += total - base * parts;
  return values;
}
