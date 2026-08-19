// UIDG-11 — the Gantt data layer: the %-complete rollup (2g), the whole-project
// read in a FIXED query count nesting tasks under jobs with the due-date bar
// fallback, and the task-dependency write guards (typed + lagged, cycle rejected
// at depth 1 and depth 3, lag bound, self/cross-project), plus the immutable
// baseline snapshot.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

// ─── Pure: effective %-complete rollup (no DB) ───────────────────────────────
import { computeEffectivePercent } from "@/lib/api/gantt";

function task(id: string, parent: string | null, pct: number) {
  return { id, parent_id: parent, percent_complete: pct } as never;
}

describe("computeEffectivePercent (2g)", () => {
  it("a leaf uses its own manual value", () => {
    const byId = new Map([["L", task("L", null, 40)]]);
    const kids = new Map();
    expect(computeEffectivePercent("L", kids, byId)).toBe(40);
  });

  it("a parent DERIVES from children and ignores its own stored value", () => {
    const l1 = task("L1", "P", 40);
    const l2 = task("L2", "P", 80);
    const p = task("P", null, 100); // manual 100 must be ignored
    const byId = new Map([["P", p], ["L1", l1], ["L2", l2]]);
    const kids = new Map([["P", [l1, l2]]]);
    expect(computeEffectivePercent("P", kids, byId)).toBe(60); // avg(40,80)
  });

  it("nests: a grandparent averages its (derived) children", () => {
    const l1 = task("L1", "P", 40), l2 = task("L2", "P", 80);
    const l3 = task("L3", "G", 0);
    const p = task("P", "G", 999), g = task("G", null, 5);
    const byId = new Map([["G", g], ["P", p], ["L1", l1], ["L2", l2], ["L3", l3]]);
    const kids = new Map([["G", [p, l3]], ["P", [l1, l2]]]);
    // P derives 60; G = avg(60, 0) = 30
    expect(computeEffectivePercent("G", kids, byId)).toBe(30);
  });
});

// ─── DB-backed: getProjectGantt + task dependencies + baseline ────────────────
import {
  getProjectGantt,
  addTaskDependency,
  captureBaseline,
  GanttError,
  MAX_LAG_DAYS,
} from "@/lib/api/gantt";

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  tasks: [] as Record<string, unknown>[],
  taskDeps: [] as Record<string, unknown>[],
  jobDeps: [] as Record<string, unknown>[],
  milestones: [] as Record<string, unknown>[],
  baselines: [] as Record<string, unknown>[],
  project: { start_date: null, target_completion: null, actual_completion: null } as Record<string, unknown>,
  inserts: [] as { table: string; payload: unknown }[],
  queryCount: 0,
}));

function eqVal(ctx: ChainCtx, col: string): unknown {
  return ctx.filters.find((f) => f.method === "eq" && f.args[0] === col)?.args[1];
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  h.queryCount += 1;
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.op === "insert") {
    h.inserts.push({ table: ctx.table, payload: ctx.payload });
    if (Array.isArray(ctx.payload)) return { data: ctx.payload, error: null };
    const row = { id: `${ctx.table}-${h.inserts.length}`, ...(ctx.payload as Record<string, unknown>) };
    return { data: row, error: null };
  }
  switch (ctx.table) {
    case "project_jobs":
      return { data: h.jobs, error: null };
    case "job_tasks": {
      // getProjectGantt selects all for a project; addTaskDependency uses .in(id).
      const inFilter = ctx.filters.find((f) => f.method === "in");
      if (inFilter) {
        const ids = inFilter.args[1] as string[];
        return { data: h.tasks.filter((t) => ids.includes(t.id as string)), error: null };
      }
      return { data: h.tasks, error: null };
    }
    case "task_dependencies":
      return { data: h.taskDeps, error: null };
    case "job_dependencies":
      return { data: h.jobDeps, error: null };
    case "schedule_milestones":
      return { data: h.milestones, error: null };
    case "schedule_baselines":
      return { data: single ? h.baselines[0] ?? null : h.baselines, error: null };
    case "projects":
      return { data: single ? h.project : [h.project], error: null };
    default:
      return { data: single ? null : [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: (j: { title?: string }) => j?.title ?? "Job" }));

beforeEach(() => {
  h.jobs = [];
  h.tasks = [];
  h.taskDeps = [];
  h.jobDeps = [];
  h.milestones = [];
  h.baselines = [];
  h.project = { start_date: null, target_completion: null, actual_completion: null };
  h.inserts = [];
  h.queryCount = 0;
});

describe("getProjectGantt", () => {
  beforeEach(() => {
    h.jobs = [{ id: "j1", project_id: "p1", job_type: "main_job", title: "Main Job", status: "active", planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null, sort_order: 0, co_number: null }];
    h.tasks = [
      { id: "t1", project_id: "p1", job_id: "j1", parent_id: null, title: "Frame", status: "todo", priority: "normal", start_date: "2026-01-01", end_date: "2026-01-10", due_date: null, percent_complete: 50, sort_order: 0 },
      { id: "t2", project_id: "p1", job_id: "j1", parent_id: "t1", title: "Bolt", status: "todo", priority: "normal", start_date: null, end_date: null, due_date: "2026-01-15", percent_complete: 100, sort_order: 1 },
      { id: "t3", project_id: "p1", job_id: null, parent_id: null, title: "Permit", status: "todo", priority: "normal", start_date: null, end_date: null, due_date: null, percent_complete: 0, sort_order: 2 },
    ];
  });

  it("loads the whole project in a FIXED 7 queries (not per-task)", async () => {
    await getProjectGantt("p1");
    expect(h.queryCount).toBe(7);
  });

  it("nests tasks under jobs, applies the due-date bar fallback, and rolls up %", async () => {
    const g = await getProjectGantt("p1");
    expect(g.jobs).toHaveLength(1);
    const job = g.jobs[0];
    expect(job.tasks.map((t) => t.id)).toEqual(["t1"]); // t2 is nested, not top-level
    const t1 = job.tasks[0];
    expect(t1.children.map((c) => c.id)).toEqual(["t2"]);
    // t1 has a child → effective % derives from t2 (100), NOT its own 50
    expect(t1.effective_percent).toBe(100);
    // t2: no start, due 2026-01-15 → point marker at the due date
    const t2 = t1.children[0];
    expect(t2.bar_start).toBeNull();
    expect(t2.bar_end).toBe("2026-01-15");
    expect(t2.is_point).toBe(true);
    // t3: project-level, no dates at all
    expect(g.project_tasks.map((t) => t.id)).toEqual(["t3"]);
    expect(g.project_tasks[0].has_no_dates).toBe(true);
    // axis range spans the earliest start to the latest bar end (the due fallback)
    expect(g.range).toEqual({ from: "2026-01-01", to: "2026-01-15" });
  });
});

describe("addTaskDependency", () => {
  beforeEach(() => {
    h.tasks = ["A", "B", "C", "D"].map((id) => ({ id, project_id: "p1", title: id }));
  });

  it("round-trips all four link types with lag", async () => {
    for (const type of ["FS", "SS", "FF", "SF"] as const) {
      h.inserts = [];
      await addTaskDependency({ taskId: "A", dependsOnTaskId: "B", dependencyType: type, lagDays: 3 });
      const ins = h.inserts.find((i) => i.table === "task_dependencies")!.payload as Record<string, unknown>;
      expect(ins.dependency_type).toBe(type);
      expect(ins.lag_days).toBe(3);
    }
  });

  it("allows a negative lag (lead) but rejects one beyond the bound", async () => {
    await expect(addTaskDependency({ taskId: "A", dependsOnTaskId: "B", lagDays: -5 })).resolves.toBeTruthy();
    await expect(addTaskDependency({ taskId: "A", dependsOnTaskId: "B", lagDays: MAX_LAG_DAYS + 1 })).rejects.toMatchObject({ code: "invalid_lag" });
  });

  it("rejects a self-edge and a cross-project pair", async () => {
    await expect(addTaskDependency({ taskId: "A", dependsOnTaskId: "A" })).rejects.toMatchObject({ code: "self_dependency" });
    h.tasks = [{ id: "A", project_id: "p1", title: "A" }, { id: "B", project_id: "p2", title: "B" }];
    await expect(addTaskDependency({ taskId: "A", dependsOnTaskId: "B" })).rejects.toMatchObject({ code: "cross_project" });
  });

  it("rejects a cycle at depth 1, naming the loop", async () => {
    h.taskDeps = [{ id: "e1", project_id: "p1", task_id: "A", depends_on_task_id: "B", dependency_type: "FS", lag_days: 0 }];
    // A→B exists; adding B→A closes a 1-edge loop
    await expect(addTaskDependency({ taskId: "B", dependsOnTaskId: "A" })).rejects.toMatchObject({
      code: "would_create_cycle",
    });
  });

  it("rejects a cycle at depth 3, naming the loop", async () => {
    h.taskDeps = [
      { id: "e1", project_id: "p1", task_id: "A", depends_on_task_id: "B", dependency_type: "FS", lag_days: 0 },
      { id: "e2", project_id: "p1", task_id: "B", depends_on_task_id: "C", dependency_type: "FS", lag_days: 0 },
    ];
    // A→B→C exists; adding C→A closes a 3-edge loop
    let err: unknown;
    try {
      await addTaskDependency({ taskId: "C", dependsOnTaskId: "A" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GanttError);
    expect((err as GanttError).code).toBe("would_create_cycle");
    expect((err as GanttError).message).toMatch(/C → A → B → C/);
  });
});

describe("captureBaseline", () => {
  it("writes a FROZEN snapshot of the current task dates (a copy, not a live ref)", async () => {
    h.tasks = [
      { id: "t1", project_id: "p1", start_date: "2026-01-01", end_date: "2026-01-10", percent_complete: 25 },
      { id: "t2", project_id: "p1", start_date: null, end_date: null, percent_complete: 0 },
    ];
    await captureBaseline({ projectId: "p1", name: "Kickoff plan" });
    const snap = h.inserts.find((i) => i.table === "schedule_baseline_tasks")!.payload as Record<string, unknown>[];
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ task_id: "t1", start_date: "2026-01-01", end_date: "2026-01-10", percent_complete: 25 });
  });
});
