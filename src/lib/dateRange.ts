export type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";

export interface DateRangeValue {
  preset: DatePreset;
  from: string;
  to: string;
}

export function initialDateRange(preset: DatePreset = "today"): DateRangeValue {
  return { preset, ...getPresetRange(preset) };
}

export function normalizeDateRange(range: DateRangeValue): DateRangeValue {
  if (range.from <= range.to) return range;
  return { ...range, from: range.to, to: range.from };
}

export function getPresetRange(preset: DatePreset) {
  const today = new Date();
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: formatYmd(yesterday), to: formatYmd(yesterday) };
  }
  if (preset === "today" || preset === "custom") {
    return { from: formatYmd(today), to: formatYmd(today) };
  }
  if (preset === "week") {
    const day = today.getDay() || 7;
    return { from: formatYmd(addDays(today, 1 - day)), to: formatYmd(today) };
  }
  return {
    from: formatYmd(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: formatYmd(today),
  };
}

export function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
