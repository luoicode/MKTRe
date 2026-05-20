import type { Tables } from "@/integrations/supabase/types";
import { dateKeyVN } from "@/lib/reports";

export type SalaryRole = "employee" | "leader" | "manager";

export type SalaryRule = Pick<
  Tables<"salary_rules">,
  "role" | "revenue_min" | "revenue_max" | "base_salary" | "milestone_bonus" | "over_kpi_bonus"
>;

export type SalaryAttendanceRecord = {
  user_id?: string | null;
  attendance_date?: string | null;
  checked_in_at?: string | null;
  created_at?: string | null;
  status: string | null;
};

export type SalaryLeaveRequest = {
  user_id?: string | null;
  start_date: string;
  end_date: string;
  status: string | null;
  leave_type: string | null;
};

export type SalaryEstimate = {
  rule: SalaryRule | null;
  attendedDays: number;
  workdayDates: string[];
  expectedWorkdays: number;
  baseSalaryProrated: number;
  milestoneBonus: number;
  overKpiBonus: number;
  totalEstimatedSalary: number;
  hasCheckedInToday: boolean;
  kpiAchieved: boolean;
};

function parseDateParts(date: string) {
  const [year, month, day] = dateKeyVN(date).split("-").map(Number);
  return { year, month, day };
}

function weekday(date: string) {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(date: string, days: number) {
  const { year, month, day } = parseDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function monthEnd(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

function inDateRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function getAttendanceDateKey(record: SalaryAttendanceRecord) {
  if (record.attendance_date) return record.attendance_date;
  const source = record.checked_in_at || record.created_at;
  return source ? dateKeyVN(source) : null;
}

export const normalizeAttendanceDate = getAttendanceDateKey;

export function getAttendanceDateKeys(
  records: SalaryAttendanceRecord[],
  {
    profileId,
    from,
    to,
    status = "present",
  }: {
    profileId?: string;
    from?: string;
    to?: string;
    status?: string;
  } = {},
) {
  const dateKeys = new Set<string>();
  for (const record of records) {
    if (profileId && record.user_id !== profileId) continue;
    if (status && record.status !== status) continue;
    const dateKey = getAttendanceDateKey(record);
    if (!dateKey) continue;
    if (from && dateKey < from) continue;
    if (to && dateKey > to) continue;
    dateKeys.add(dateKey);
  }
  return Array.from(dateKeys).sort();
}

export function todayLocalDateString() {
  return dateKeyVN(new Date());
}

export function countWorkdays(from: string, to: string) {
  const start = dateKeyVN(from);
  const end = dateKeyVN(to);
  if (start > end) return 0;

  let count = 0;
  let cursor = start;
  while (cursor <= end) {
    const day = weekday(cursor);
    if (day !== 0 && day !== 6) count += 1;
    cursor = addDays(cursor, 1);
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

export function calculateMonthlyWorkdays(
  profileId: string,
  month: string,
  attendanceRecords: SalaryAttendanceRecord[],
  approvedLeaveRequests: SalaryLeaveRequest[],
  today = todayLocalDateString(),
) {
  const from = `${month}-01`;
  const to = monthEnd(month);
  const effectiveTo = from <= today && today <= to ? today : to;
  const matchesProfile = (userId: string | null | undefined) =>
    profileId ? userId === profileId : true;
  const attendanceDates = new Set(
    getAttendanceDateKeys(attendanceRecords, {
      profileId,
      from,
      to: effectiveTo,
      status: "present",
    }),
  );

  const leaveWeightByDate = new Map<string, number>();
  for (const request of approvedLeaveRequests) {
    if (!matchesProfile(request.user_id) || request.status !== "approved") continue;
    let cursor = dateKeyVN(request.start_date);
    const leaveEnd = dateKeyVN(request.end_date);
    while (cursor <= leaveEnd) {
      if (inDateRange(cursor, from, effectiveTo)) {
        const weight =
          request.leave_type === "full_day" ? 0 : request.leave_type === "half_day" ? 0.5 : 1;
        leaveWeightByDate.set(cursor, Math.min(leaveWeightByDate.get(cursor) ?? 1, weight));
      }
      cursor = addDays(cursor, 1);
    }
  }

  const payableDates = new Set([...attendanceDates, ...leaveWeightByDate.keys()]);
  let attendedDays = 0;
  for (const date of payableDates) {
    attendedDays += leaveWeightByDate.has(date) ? (leaveWeightByDate.get(date) ?? 0) : 1;
  }

  return {
    attendedDays,
    attendanceDays: attendanceDates.size,
    hasCheckedInToday: attendanceDates.has(today),
    attendanceDates,
    workdayDates: Array.from(payableDates).sort(),
  };
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
  profileId = "",
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
  profileId?: string;
}): SalaryEstimate {
  const month = from.slice(0, 7);
  const salaryMonthFrom = `${month}-01`;
  const salaryMonthTo = monthEnd(month);
  const expectedWorkdays = getExpectedWorkdaysForRange(salaryMonthFrom, salaryMonthTo, today);
  const workdays = calculateMonthlyWorkdays(
    profileId,
    month,
    attendanceRecords,
    leaveRequests,
    today,
  );
  const attendedDays = workdays.attendedDays;
  const hasCheckedInToday = workdays.hasCheckedInToday;
  const workdayDates = workdays.workdayDates;
  const rule = findSalaryRule(rules, role, revenue);

  if (!rule || expectedWorkdays <= 0) {
    return {
      rule,
      attendedDays,
      workdayDates,
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
    workdayDates,
    expectedWorkdays,
    baseSalaryProrated,
    milestoneBonus,
    overKpiBonus,
    totalEstimatedSalary: baseSalaryProrated + milestoneBonus + overKpiBonus,
    hasCheckedInToday,
    kpiAchieved,
  };
}
