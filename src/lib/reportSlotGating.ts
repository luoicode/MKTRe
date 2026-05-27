export type ReportSlotGateKey = "morning" | "afternoon" | "evening";
export type ReportSlotState = "available" | "submitted" | "not_open" | "locked";

export type ReportSlotLike = {
  id?: string;
  slot_time?: string | null;
  slot_name?: string | null;
  time?: string | null;
};

const SLOT_OPEN_MINUTES: Record<ReportSlotGateKey, number> = {
  morning: 11 * 60 + 55,
  afternoon: 16 * 60 + 35,
  evening: 20 * 60 + 40,
};

export function getActiveReportSlot(now = new Date()): ReportSlotGateKey | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= SLOT_OPEN_MINUTES.evening) return "evening";
  if (minutes >= SLOT_OPEN_MINUTES.afternoon) return "afternoon";
  if (minutes >= SLOT_OPEN_MINUTES.morning) return "morning";
  return null;
}

export function getReportSlotGateKey(slot: ReportSlotLike): ReportSlotGateKey | null {
  const id = String(slot.id ?? "").toLowerCase();
  if (id.includes("morning")) return "morning";
  if (id.includes("afternoon")) return "afternoon";
  if (id.includes("evening")) return "evening";

  const raw = String(slot.slot_time || slot.time || slot.slot_name || "").replace("h", ":");
  const hour = Number(raw.split(":")[0]);
  if (hour === 11 || hour === 13) return "morning";
  if (hour === 16) return "afternoon";
  if (hour === 21) return "evening";
  return null;
}

export function getSlotState({
  slot,
  submitted,
  now = new Date(),
  bypass = false,
}: {
  slot: ReportSlotLike;
  submitted: boolean;
  now?: Date;
  bypass?: boolean;
}): ReportSlotState {
  if (submitted) return "submitted";
  if (bypass) return "available";

  const activeSlot = getActiveReportSlot(now);
  const slotKey = getReportSlotGateKey(slot);
  if (!activeSlot || !slotKey) return "not_open";
  if (activeSlot === slotKey) return "available";

  const activeOpen = SLOT_OPEN_MINUTES[activeSlot];
  const slotOpen = SLOT_OPEN_MINUTES[slotKey];
  return slotOpen > activeOpen ? "not_open" : "locked";
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function getMarketingReportSlotState({
  reportDate,
  slot,
  submitted,
  now = new Date(),
  bypass = false,
}: {
  reportDate: string;
  slot: ReportSlotLike;
  submitted: boolean;
  now?: Date;
  bypass?: boolean;
}): ReportSlotState {
  if (submitted) return "submitted";
  if (bypass) return "available";

  const slotKey = getReportSlotGateKey(slot);
  if (!slotKey) return "locked";

  const today = toLocalDateKey(now);
  const yesterday = toLocalDateKey(addLocalDays(now, -1));
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (reportDate === yesterday) {
    return minutes >= 13 * 60 && minutes <= 15 * 60 ? "available" : "locked";
  }

  if (reportDate !== today) return "locked";

  if (minutes < SLOT_OPEN_MINUTES.afternoon) {
    return slotKey === "morning" ? "available" : "locked";
  }

  if (minutes < SLOT_OPEN_MINUTES.evening) {
    return slotKey === "afternoon" ? "available" : "locked";
  }

  return slotKey === "evening" ? "available" : "locked";
}

export function getPreviousMarketingSlot({
  reportDate,
  slot,
  slotKey,
}: {
  reportDate: string;
  slot?: ReportSlotLike;
  slotKey?: ReportSlotGateKey | null;
}): { reportDate: string; slotKey: ReportSlotGateKey; label: string } | null {
  const key = slotKey ?? (slot ? getReportSlotGateKey(slot) : null);
  const raw = String(slot?.slot_time || slot?.time || slot?.slot_name || "").replace("h", ":");
  const hour = Number(raw.split(":")[0]);

  if (hour === 13) {
    return { reportDate, slotKey: "evening", label: "21h00 hôm trước" };
  }

  if (key === "afternoon") {
    return { reportDate, slotKey: "morning", label: "11h55" };
  }

  if (key === "evening") {
    return { reportDate, slotKey: "afternoon", label: "16h55" };
  }

  return null;
}

export function isSlotEditable(state: ReportSlotState) {
  return state === "available";
}
