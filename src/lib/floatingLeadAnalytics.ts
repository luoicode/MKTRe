import type { FloatingLeadLifecycleStatus, FloatingLeadRow } from "@/lib/floatingLeads";
import { deriveFloatingLeadLifecycle, isFloatingLeadLifecycleStatus } from "@/lib/floatingLeads";

export type FloatingLeadLifecycleCounts = Record<FloatingLeadLifecycleStatus, number>;

export type FloatingLeadLifecycleSummary = {
  total: number;
  counts: FloatingLeadLifecycleCounts;
  conversionRate: number | null;
  dropRate: number | null;
  contactRate: number | null;
};

export type FloatingLeadPersonPerformance = {
  id: string;
  name: string;
  total: number;
  claimed: number;
  called: number;
  closed: number;
  released: number;
  conversionRate: number | null;
};

export const floatingLeadLifecycleLabels: Record<FloatingLeadLifecycleStatus, string> = {
  new: "Lead mới",
  claimed: "Đang giữ",
  called_1: "Đã gọi 1",
  called_2: "Đã gọi 2",
  called_3: "Đã gọi 3",
  closed: "Đã chốt",
  released: "Released",
  expired: "Expired",
};

export const floatingLeadLifecycleOrder: FloatingLeadLifecycleStatus[] = [
  "new",
  "claimed",
  "called_1",
  "called_2",
  "called_3",
  "closed",
  "released",
  "expired",
];

export function normalizeFloatingLeadLifecycle(lead: FloatingLeadRow): FloatingLeadLifecycleStatus {
  return isFloatingLeadLifecycleStatus(lead.lifecycle_status)
    ? lead.lifecycle_status
    : deriveFloatingLeadLifecycle(lead);
}

export function summarizeFloatingLeadLifecycle(
  leads: FloatingLeadRow[],
): FloatingLeadLifecycleSummary {
  const counts = emptyLifecycleCounts();
  for (const lead of leads) {
    counts[normalizeFloatingLeadLifecycle(lead)] += 1;
  }

  const total = leads.length;
  const touched =
    total -
    counts.new -
    leads.filter((lead) => normalizeFloatingLeadLifecycle(lead) === "released").length;
  const contacted = counts.called_1 + counts.called_2 + counts.called_3 + counts.closed;
  const dropped = counts.released + counts.expired;

  return {
    total,
    counts,
    conversionRate: ratio(counts.closed, total),
    dropRate: ratio(dropped, total),
    contactRate: ratio(contacted, total || touched),
  };
}

export function buildFloatingLeadPersonPerformance(
  leads: FloatingLeadRow[],
  options: {
    people: Array<{ id: string; name: string }>;
    role: "sale" | "marketing";
  },
): FloatingLeadPersonPerformance[] {
  return options.people
    .map((person) => {
      const personLeads = leads.filter((lead) => {
        if (options.role === "marketing") return lead.created_by === person.id;
        return lead.assigned_sale_id === person.id || lead.closed_by === person.id;
      });
      const closed = personLeads.filter(
        (lead) => normalizeFloatingLeadLifecycle(lead) === "closed",
      );
      const released = personLeads.filter((lead) =>
        ["released", "expired"].includes(normalizeFloatingLeadLifecycle(lead)),
      );
      const called = personLeads.filter((lead) =>
        ["called_1", "called_2", "called_3", "closed"].includes(
          normalizeFloatingLeadLifecycle(lead),
        ),
      );
      return {
        id: person.id,
        name: person.name,
        total: personLeads.length,
        claimed: personLeads.filter((lead) => normalizeFloatingLeadLifecycle(lead) === "claimed")
          .length,
        called: called.length,
        closed: closed.length,
        released: released.length,
        conversionRate: ratio(closed.length, personLeads.length),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.closed - a.closed || b.conversionRate! - a.conversionRate!);
}

export function formatLifecyclePercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function emptyLifecycleCounts(): FloatingLeadLifecycleCounts {
  return {
    new: 0,
    claimed: 0,
    called_1: 0,
    called_2: 0,
    called_3: 0,
    closed: 0,
    released: 0,
    expired: 0,
  };
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return null;
  return numerator / denominator;
}
