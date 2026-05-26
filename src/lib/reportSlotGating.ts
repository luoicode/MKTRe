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

export function isSlotEditable(state: ReportSlotState) {
  return state === "available";
}
