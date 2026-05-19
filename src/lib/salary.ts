import type { Tables } from "@/integrations/supabase/types";

export type SalaryRole = "employee" | "leader" | "manager";

export type SalaryRule = Pick<
  Tables<"salary_rules">,
  "role" | "revenue_min" | "revenue_max" | "base_salary" | "milestone_bonus" | "over_kpi_bonus"
>;

export type SalaryAttendanceRecord = {
  attendance_date: string;
  status: string | null;
};

export type SalaryLeaveRequest = {
  start_date: string;
  end_date: string;
  status: string | null;
  leave_type: string | null;
};

export type SalaryEstimate = {
  rule: SalaryRule | null;
  attendedDays: number;
  expectedWorkdays: number;
  baseSalaryProrated: number;
  milestoneBonus: number;
  overKpiBonus: number;
  totalEstimatedSalary: number;
  hasCheckedInToday: boolean;
  kpiAchieved: boolean;
};

function toLocalDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const next = toLocalDate(date);
  next.setDate(next.getDate() + days);
  return toDateString(next);
}

export function todayLocalDateString() {
  return toDateString(new Date());
}

export function countWorkdays(from: string, to: string) {
  const start = toLocalDate(from);
  const end = toLocalDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function getExpectedWorkdaysForRange(
  from: string,
  to: string,
  today = todayLocalDateString(),
) {
  const effectiveTo = from <= today && today <= to ? today : to;
  return countWorkdays(from, effectiveTo);
}

export function findSalaryRule(rules: SalaryRule[], role: SalaryRole, revenue: number) {
  return (
    rules.find((rule) => {
      if (rule.role !== role) return false;
      const min = Number(rule.revenue_min ?? 0);
      const max = rule.revenue_max == null ? null : Number(rule.revenue_max);
      return revenue >= min && (max == null || revenue < max);
    }) ?? null
  );
}

export function calculateSalaryEstimate({
  rules,
  role,
  revenue,
  kpiTarget,
  attendanceRecords,
  leaveRequests = [],
  from,
  to,
  today = todayLocalDateString(),
}: {
  rules: SalaryRule[];
  role: SalaryRole;
  revenue: number;
  kpiTarget: number;
  attendanceRecords: SalaryAttendanceRecord[];
  leaveRequests?: SalaryLeaveRequest[];
  from: string;
  to: string;
  today?: string;
}): SalaryEstimate {
  const expectedWorkdays = getExpectedWorkdaysForRange(from, to, today);
  const presentDates = new Set(
    attendanceRecords
      .filter((record) => record.status === "present")
      .map((record) => record.attendance_date),
  );
  const approvedLeaves = leaveRequests.filter((request) => request.status === "approved");
  const leaveWeightByDate = new Map<string, number>();
  for (const request of approvedLeaves) {
    let cursor = request.start_date;
    while (cursor <= request.end_date) {
      const weight =
        request.leave_type === "full_day" ? 0 : request.leave_type === "half_day" ? 0.5 : 1;
      leaveWeightByDate.set(cursor, Math.min(leaveWeightByDate.get(cursor) ?? 1, weight));
      cursor = addDays(cursor, 1);
    }
  }
  let attendedDays = 0;
  let cursor = from;
  const effectiveTo = from <= today && today <= to ? today : to;
  while (cursor <= effectiveTo) {
    if (leaveWeightByDate.has(cursor)) {
      attendedDays += leaveWeightByDate.get(cursor) ?? 0;
    } else if (presentDates.has(cursor)) {
      attendedDays += 1;
    }
    cursor = addDays(cursor, 1);
  }
  const hasCheckedInToday = attendanceRecords.some(
    (record) => record.attendance_date === today && record.status === "present",
  );
  const rule = findSalaryRule(rules, role, revenue);

  if (!rule || expectedWorkdays <= 0) {
    return {
      rule,
      attendedDays,
      expectedWorkdays,
      baseSalaryProrated: 0,
      milestoneBonus: 0,
      overKpiBonus: 0,
      totalEstimatedSalary: 0,
      hasCheckedInToday,
      kpiAchieved: false,
    };
  }

  const kpiAchieved = kpiTarget > 0 && revenue >= kpiTarget;
  const baseSalaryProrated =
    (Number(rule.base_salary ?? 0) * Math.min(attendedDays, expectedWorkdays)) / expectedWorkdays;
  const milestoneBonus = Number(rule.milestone_bonus ?? 0);
  const overKpiBonus = kpiAchieved ? Number(rule.over_kpi_bonus ?? 0) : 0;

  return {
    rule,
    attendedDays,
    expectedWorkdays,
    baseSalaryProrated,
    milestoneBonus,
    overKpiBonus,
    totalEstimatedSalary: baseSalaryProrated + milestoneBonus + overKpiBonus,
    hasCheckedInToday,
    kpiAchieved,
  };
}
