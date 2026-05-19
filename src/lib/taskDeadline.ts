export type TaskDeadlineState = "none" | "overdue" | "today" | "future";

type DeadlineComparable = {
  deadline?: string | null;
  due_at?: string | null;
  deadline_at?: string | null;
  status?: string | null;
  completed?: boolean | null;
};

function normalizeStatus(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCompletedStatus(value: string | null | undefined) {
  return [
    "approved",
    "archived",
    "complete",
    "completed",
    "done",
    "finished",
    "hoan_thanh",
  ].includes(normalizeStatus(value));
}

export function getEffectiveDeadline(item: DeadlineComparable) {
  return item.deadline ?? item.due_at ?? item.deadline_at ?? null;
}

export function isTaskOverdue(item: DeadlineComparable, now = new Date()) {
  if (item.completed || isCompletedStatus(item.status)) return false;
  const deadline = getEffectiveDeadline(item);
  if (!deadline) return false;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

export function getTaskDeadlineState(
  item: DeadlineComparable,
  now = new Date(),
  today = formatLocalYmd(now),
): TaskDeadlineState {
  if (item.completed || isCompletedStatus(item.status)) return "none";
  const deadline = getEffectiveDeadline(item);
  if (!deadline) return "none";
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return "none";
  if (isTaskOverdue(item, now)) return "overdue";
  if (formatLocalYmd(due) === today) return "today";
  return "future";
}

function formatLocalYmd(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
