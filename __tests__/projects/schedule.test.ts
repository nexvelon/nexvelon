// PROJ2-20 — schedule hooks. Planned-date order + empty-diff; milestone 'met'
// stamps completed_at; and the dependency guards — self / duplicate / cross-
// project / CYCLE (the important one: A→B exists, adding B→A is blocked). Plus
// getProjectSchedule's inferred-date fallback + is_overdue derivation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  edges: [] as Record<string, unknown>[],
  milestones: [] as Record<string, unknown>[],
  updates: [] as { table: string; payload: Record<string, unknown> }[],
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
  project: { actual_completion: null, target_completion: "2026-09-01", start_date: "2026-01-01" } as Record<string, unknown>,
  jobById: {} as Record<string, { id: string; project_id: string }>,
  today: "2026-07-24",
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "project_jobs") {
    if (ctx.op === "update") {
      h.updates.push({ table: "project_jobs", payload: ctx.payload as Record<string, unknown> });
      return { data: null, error: null };
    }
    const rows = filt(h.jobs, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "job_dependencies") {
    if (ctx.op === "insert") {
      h.inserts.push({ table: "job_dependencies", payload: ctx.payload as Record<string, unknown> });
      const row = { id: `e${h.edges.length + 1}`, ...(ctx.payload as object) };
      h.edges = [...h.edges, row];
      return { data: row, error: null };
    }
    return { data: filt(h.edges, ctx.filters), error: null };
  }
  if (ctx.table === "schedule_milestones") {
    if (ctx.op === "update") {
      h.updates.push({ table: "schedule_milestones", payload: ctx.payload as Record<string, unknown> });
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      const row = h.milestones.find((m) => m.id === id) ?? { id };
      return { data: { ...row, ...(ctx.payload as object) }, error: null };
    }
    return { data: filt(h.milestones, ctx.filters), error: null };
  }
  if (ctx.table === "projects") return { data: h.project, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => h.today,
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async (id: string) => h.jobById[id] ?? null,
  listJobsForProject: async () => h.jobs,
}));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: (j: { title: string }) => j.title }));

import {
  setJobPlannedDates,
  setMilestoneStatus,
  addDependency,
  getProjectSchedule,
  ScheduleError,
} from "@/lib/api/schedule";

beforeEach(() => {
  h.jobs = [];
  h.edges = [];
  h.milestones = [];
  h.updates = [];
  h.inserts = [];
  h.jobById = {
    jA: { id: "jA", project_id: "p1" },
    jB: { id: "jB", project_id: "p1" },
    jC: { id: "jC", project_id: "p1" },
    jX: { id: "jX", project_id: "OTHER" },
  };
  h.today = "2026-07-24";
});

describe("setJobPlannedDates", () => {
  it("rejects end before start", async () => {
    h.jobs = [{ id: "jA", planned_start_date: null, planned_end_date: null }];
    await expect(
      setJobPlannedDates({ jobId: "jA", plannedStart: "2026-05-10", plannedEnd: "2026-05-01" })
    ).rejects.toMatchObject({ code: "invalid_dates" });
    expect(h.updates).toHaveLength(0);
  });

  it("empty-diff patch is a no-op", async () => {
    h.jobs = [{ id: "jA", planned_start_date: null, planned_end_date: null }];
    await setJobPlannedDates({ jobId: "jA" });
    expect(h.updates).toHaveLength(0);
  });

  it("writes a valid range", async () => {
    h.jobs = [{ id: "jA", planned_start_date: null, planned_end_date: null }];
    await setJobPlannedDates({ jobId: "jA", plannedStart: "2026-05-01", plannedEnd: "2026-05-10" });
    expect(h.updates.at(-1)!.payload).toMatchObject({ planned_start_date: "2026-05-01", planned_end_date: "2026-05-10" });
  });
});

describe("milestone status", () => {
  it("'met' stamps completed_at; leaving it clears it", async () => {
    h.milestones = [{ id: "m1", status: "pending" }];
    await setMilestoneStatus("m1", "met", "u1");
    expect(h.updates.at(-1)!.payload).toMatchObject({ status: "met", completed_at: "2026-07-24" });
    await setMilestoneStatus("m1", "missed", "u1");
    expect(h.updates.at(-1)!.payload).toMatchObject({ status: "missed", completed_at: null });
  });
});

describe("addDependency — guards", () => {
  beforeEach(() => {
    h.jobs = [{ id: "jA" }, { id: "jB" }, { id: "jC" }];
  });

  it("rejects a self-dependency", async () => {
    await expect(addDependency({ jobId: "jA", dependsOnJobId: "jA" })).rejects.toMatchObject({ code: "self_dependency" });
  });

  it("rejects a cross-project pair", async () => {
    await expect(addDependency({ jobId: "jA", dependsOnJobId: "jX" })).rejects.toMatchObject({ code: "cross_project" });
  });

  it("rejects a duplicate edge", async () => {
    h.edges = [{ id: "e1", job_id: "jB", depends_on_job_id: "jA" }];
    await expect(addDependency({ jobId: "jB", dependsOnJobId: "jA" })).rejects.toMatchObject({ code: "duplicate_edge" });
  });

  it("rejects a CYCLE — A→B exists, adding B→A is blocked", async () => {
    // jA depends on jB (edge job_id=jA → depends_on=jB). Now add jB → jA.
    h.edges = [{ id: "e1", job_id: "jA", depends_on_job_id: "jB" }];
    await expect(addDependency({ jobId: "jB", dependsOnJobId: "jA" })).rejects.toMatchObject({ code: "would_create_cycle" });
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a longer cycle A→B→C, adding C→A", async () => {
    h.edges = [
      { id: "e1", job_id: "jA", depends_on_job_id: "jB" },
      { id: "e2", job_id: "jB", depends_on_job_id: "jC" },
    ];
    await expect(addDependency({ jobId: "jC", dependsOnJobId: "jA" })).rejects.toBeInstanceOf(ScheduleError);
  });

  it("allows a valid new edge", async () => {
    h.edges = [{ id: "e1", job_id: "jA", depends_on_job_id: "jB" }];
    const edge = await addDependency({ jobId: "jC", dependsOnJobId: "jA" });
    expect(edge).toBeTruthy();
    expect(h.inserts.at(-1)!.payload).toMatchObject({ job_id: "jC", depends_on_job_id: "jA" });
  });
});

describe("getProjectSchedule", () => {
  it("flags inferred dates, derives is_overdue, and attaches edges + milestones", async () => {
    h.jobs = [
      // planned, overdue (end < today, not closed)
      { id: "jA", title: "A", job_type: "main_job", status: "active", planned_start_date: "2026-06-01", planned_end_date: "2026-07-01", created_at: "2026-05-01T00:00:00Z" },
      // no planned dates → inferred, not overdue
      { id: "jB", title: "B", job_type: "change_order", status: "active", planned_start_date: null, planned_end_date: null, created_at: "2026-06-15T00:00:00Z" },
    ];
    h.edges = [{ id: "e1", job_id: "jB", depends_on_job_id: "jA" }];
    h.milestones = [{ id: "m1", project_id: "p1", job_id: "jA", title: "MS", target_date: "2026-06-20", status: "pending", sort_order: 0 }];

    const s = await getProjectSchedule("p1");
    const jA = s.jobs.find((j) => j.job_id === "jA")!;
    const jB = s.jobs.find((j) => j.job_id === "jB")!;

    expect(jA.inferred).toBe(false);
    expect(jA.is_overdue).toBe(true); // planned_end 2026-07-01 < today 2026-07-24
    expect(jB.inferred).toBe(true); // no planned dates
    expect(jB.has_no_dates).toBe(true);
    expect(jB.is_overdue).toBe(false); // no planned_end → never overdue
    expect(jB.depends_on).toEqual(["jA"]);
    expect(s.milestones).toHaveLength(1);
    expect(s.range).toBeTruthy();
  });
});
