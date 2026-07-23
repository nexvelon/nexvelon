// PROJ2-11 — the pure task-status module. Overdue is DERIVED from (due_date,
// status, today) so the list, the kanban and the project card can't disagree.

import { describe, it, expect } from "vitest";
import {
  isOpen,
  isOverdue,
  summarizeTasks,
  OPEN_TASK_STATUSES,
  KANBAN_STATUSES,
} from "@/lib/tasks/task-status";
import type { DbTaskStatus } from "@/lib/types/database";

const TODAY = "2026-07-23";
const YESTERDAY = "2026-07-22";
const TOMORROW = "2026-07-24";

function task(status: DbTaskStatus, due_date: string | null) {
  return { status, due_date };
}

describe("isOpen", () => {
  it("todo / in_progress / blocked are open; done / cancelled are not", () => {
    expect(OPEN_TASK_STATUSES).toEqual(["todo", "in_progress", "blocked"]);
    for (const s of ["todo", "in_progress", "blocked"] as DbTaskStatus[]) {
      expect(isOpen({ status: s })).toBe(true);
    }
    for (const s of ["done", "cancelled"] as DbTaskStatus[]) {
      expect(isOpen({ status: s })).toBe(false);
    }
  });
});

describe("isOverdue", () => {
  it("past due + still open → overdue", () => {
    expect(isOverdue(task("todo", YESTERDAY), TODAY)).toBe(true);
    expect(isOverdue(task("in_progress", YESTERDAY), TODAY)).toBe(true);
    expect(isOverdue(task("blocked", YESTERDAY), TODAY)).toBe(true);
  });

  it("past due but DONE (or cancelled) → NOT overdue", () => {
    expect(isOverdue(task("done", YESTERDAY), TODAY)).toBe(false);
    expect(isOverdue(task("cancelled", YESTERDAY), TODAY)).toBe(false);
  });

  it("no due date → never overdue", () => {
    expect(isOverdue(task("todo", null), TODAY)).toBe(false);
    expect(isOverdue(task("blocked", null), TODAY)).toBe(false);
  });

  it("due TODAY → not overdue (you still have the day)", () => {
    expect(isOverdue(task("todo", TODAY), TODAY)).toBe(false);
  });

  it("due in the future → not overdue", () => {
    expect(isOverdue(task("todo", TOMORROW), TODAY)).toBe(false);
  });
});

describe("summarizeTasks", () => {
  it("counts by status plus the open/overdue roll-ups", () => {
    const counts = summarizeTasks(
      [
        task("todo", YESTERDAY), // open + overdue
        task("todo", TOMORROW), // open
        task("in_progress", YESTERDAY), // open + overdue
        task("blocked", null), // open
        task("done", YESTERDAY), // not open, not overdue
        task("cancelled", YESTERDAY), // not open, not overdue
      ],
      TODAY
    );
    expect(counts).toEqual({
      todo: 2,
      in_progress: 1,
      blocked: 1,
      done: 1,
      cancelled: 1,
      open: 4,
      overdue: 2,
      total: 6,
    });
  });

  it("empty set is all zeroes", () => {
    const counts = summarizeTasks([], TODAY);
    expect(counts.total).toBe(0);
    expect(counts.open).toBe(0);
    expect(counts.overdue).toBe(0);
  });
});

describe("KANBAN_STATUSES", () => {
  it("has four columns and deliberately excludes cancelled", () => {
    expect(KANBAN_STATUSES).toEqual(["todo", "in_progress", "blocked", "done"]);
    expect(KANBAN_STATUSES).not.toContain("cancelled");
  });
});
