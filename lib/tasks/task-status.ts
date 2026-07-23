// PROJ2-11 — task status/priority semantics, DERIVED not stored. One
// client-safe module (no server-only import) so the list view, the kanban, and
// the project summary card all agree on what "overdue" and "open" mean — the
// same extract-a-pure-module move as lib/invoice-status.ts (FIN-2) and
// lib/subcontractors/compliance-status.ts (SUB-2).
//
// A stored `is_overdue` flag would go stale the moment the clock ticks past
// midnight, so overdue is always a function of (due_date, status, today).
// completed_at, by contrast, IS stored — it records when something happened
// rather than describing the present.

import type { DbTaskPriority, DbTaskStatus } from "@/lib/types/database";

/** Statuses that still need doing — everything except done/cancelled. */
export const OPEN_TASK_STATUSES: DbTaskStatus[] = ["todo", "in_progress", "blocked"];

/** Kanban column order (cancelled is hidden behind a filter, not a column). */
export const KANBAN_STATUSES: DbTaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
];

export const TASK_STATUS_LABEL: Record<DbTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABEL: Record<DbTaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** Sort weight — urgent first. */
export const TASK_PRIORITY_RANK: Record<DbTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** A task still needing work (not done, not cancelled). */
export function isOpen(task: { status: DbTaskStatus }): boolean {
  return OPEN_TASK_STATUSES.includes(task.status);
}

/**
 * Overdue = the due date has PASSED and the task is still open. A task due
 * TODAY is not overdue (you still have the day); a done or cancelled task is
 * never overdue no matter how late it was; no due date is never overdue.
 * `today` is passed in (business date) so the verdict is deterministic.
 */
export function isOverdue(
  task: { due_date: string | null; status: DbTaskStatus },
  today: string
): boolean {
  if (!task.due_date) return false;
  if (!isOpen(task)) return false;
  return task.due_date < today;
}

export interface TaskCounts {
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
  cancelled: number;
  /** todo + in_progress + blocked. */
  open: number;
  /** Open tasks past their due date. */
  overdue: number;
  total: number;
}

/** Counts by status for a set of tasks, plus the open/overdue roll-ups. */
export function summarizeTasks(
  tasks: { status: DbTaskStatus; due_date: string | null }[],
  today: string
): TaskCounts {
  const counts: TaskCounts = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
    open: 0,
    overdue: 0,
    total: tasks.length,
  };
  for (const t of tasks) {
    counts[t.status] += 1;
    if (isOpen(t)) counts.open += 1;
    if (isOverdue(t, today)) counts.overdue += 1;
  }
  return counts;
}
