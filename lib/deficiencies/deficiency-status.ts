// PROJ2-12 — deficiency status/severity semantics, DERIVED not stored. One
// client-safe module (no server-only import) so the list, the kanban and the
// project summary card agree on "open" and "overdue" — the same extract-a-pure-
// module move as lib/tasks/task-status.ts (PROJ2-11).

import type {
  DbDeficiencySeverity,
  DbDeficiencyStatus,
} from "@/lib/types/database";

/** Statuses that still need action — everything except closed/waived. */
export const OPEN_DEFICIENCY_STATUSES: DbDeficiencyStatus[] = [
  "open",
  "in_progress",
  "ready_for_review",
];

/** Kanban column order (waived is hidden behind a filter, not a column). */
export const DEFICIENCY_KANBAN_STATUSES: DbDeficiencyStatus[] = [
  "open",
  "in_progress",
  "ready_for_review",
  "closed",
];

export const DEFICIENCY_STATUS_LABEL: Record<DbDeficiencyStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  ready_for_review: "Ready for review",
  closed: "Closed",
  waived: "Waived",
};

export const DEFICIENCY_SEVERITY_LABEL: Record<DbDeficiencySeverity, string> = {
  minor: "Minor",
  major: "Major",
  safety: "Safety",
};

/** Sort weight — safety first. */
export const DEFICIENCY_SEVERITY_RANK: Record<DbDeficiencySeverity, number> = {
  safety: 0,
  major: 1,
  minor: 2,
};

/** Still needing action (not closed/waived). */
export function isOpenDeficiency(d: { status: DbDeficiencyStatus }): boolean {
  return OPEN_DEFICIENCY_STATUSES.includes(d.status);
}

/** A closing/waiving status stamps closed_at; both are a resolution decision. */
export function isResolvedStatus(status: DbDeficiencyStatus): boolean {
  return status === "closed" || status === "waived";
}

/**
 * Overdue = due date passed and still open. Due TODAY is not overdue; a closed
 * or waived deficiency is never overdue; no due date is never overdue.
 */
export function isDeficiencyOverdue(
  d: { due_date: string | null; status: DbDeficiencyStatus },
  today: string
): boolean {
  if (!d.due_date) return false;
  if (!isOpenDeficiency(d)) return false;
  return d.due_date < today;
}

export interface DeficiencyCounts {
  open: number;
  closed: number;
  waived: number;
  /** Open items of 'safety' severity — the ones that block substantial completion. */
  open_safety: number;
  overdue: number;
  total: number;
}

export function summarizeDeficiencies(
  items: {
    status: DbDeficiencyStatus;
    severity: DbDeficiencySeverity;
    due_date: string | null;
  }[],
  today: string
): DeficiencyCounts {
  const counts: DeficiencyCounts = {
    open: 0,
    closed: 0,
    waived: 0,
    open_safety: 0,
    overdue: 0,
    total: items.length,
  };
  for (const d of items) {
    if (d.status === "closed") counts.closed += 1;
    else if (d.status === "waived") counts.waived += 1;
    if (isOpenDeficiency(d)) {
      counts.open += 1;
      if (d.severity === "safety") counts.open_safety += 1;
    }
    if (isDeficiencyOverdue(d, today)) counts.overdue += 1;
  }
  return counts;
}
