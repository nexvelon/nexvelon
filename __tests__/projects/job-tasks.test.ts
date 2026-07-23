// PROJ2-11 — the task API. Title + at-most-one-assignee validation (an
// UNASSIGNED task is valid — the deliberate difference from SUB-6's
// exactly-one), job-in-project guard, sort_order = max + 1, completed_at
// stamped/cleared on the done boundary, kanban reorder, empty-diff no-op, and
// the job/project scope separation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; payload: Record<string, unknown> }[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  logActivity: vi.fn(async () => {}),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "neq") out = out.filter((r) => r[col] !== args[1]);
    if (f.method === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
    // .is("job_id", null) — project-level only
    if (f.method === "is" && args[1] === null)
      out = out.filter((r) => r[col] === null || r[col] === undefined);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "job_tasks") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `t-${h.inserts.length + 1}`, ...p };
      h.inserts.push(p);
      h.rows = [...h.rows, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      const p = ctx.payload as Record<string, unknown>;
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.updates.push({ id, payload: p });
      h.rows = h.rows.map((r) => (r.id === id ? { ...r, ...p } : r));
      return { data: h.rows.find((r) => r.id === id) ?? null, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      const existed = h.rows.some((r) => r.id === id);
      h.rows = h.rows.filter((r) => r.id !== id);
      return { data: existed ? [{ id }] : [], error: null };
    }
    const rows = filt(h.rows, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createTask,
  updateTask,
  setTaskStatus,
  reorderTasks,
  listTasksForJob,
  listTasksForProject,
  TaskError,
} from "@/lib/api/job-tasks";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.updates = [];
  h.job = { id: "job1", project_id: "p1" };
  h.logActivity.mockClear();
});

describe("createTask — validation", () => {
  it("requires a title and caps it at 200 chars", async () => {
    await expect(
      createTask({ projectId: "p1", title: "   " })
    ).rejects.toMatchObject({ code: "invalid_title" });
    await expect(
      createTask({ projectId: "p1", title: "x".repeat(201) })
    ).rejects.toBeInstanceOf(TaskError);
    expect(h.inserts).toHaveLength(0);
    // exactly 200 is fine
    await createTask({ projectId: "p1", title: "x".repeat(200) });
    expect(h.inserts).toHaveLength(1);
  });

  it("rejects BOTH assignee kinds (invalid_assignee)", async () => {
    await expect(
      createTask({
        projectId: "p1",
        title: "t",
        assigneeTechId: "tech1",
        assigneeSubcontractorId: "sub1",
      })
    ).rejects.toMatchObject({ code: "invalid_assignee" });
    expect(h.inserts).toHaveLength(0);
  });

  it("ACCEPTS zero assignees — unassigned is valid (differs from SUB-6)", async () => {
    const row = await createTask({ projectId: "p1", jobId: "job1", title: "Unassigned" });
    expect(row).toBeTruthy();
    expect(h.inserts[0]).toMatchObject({
      assignee_tech_id: null,
      assignee_subcontractor_id: null,
      status: "todo",
      source: "internal",
    });
  });

  it("rejects a job that doesn't belong to the project (job_mismatch)", async () => {
    h.job = { id: "job1", project_id: "OTHER" };
    await expect(
      createTask({ projectId: "p1", jobId: "job1", title: "t" })
    ).rejects.toMatchObject({ code: "job_mismatch" });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("createTask — sort_order", () => {
  it("is MAX + 1 within the target column, scoped to the job", async () => {
    h.rows = [
      { id: "a", project_id: "p1", job_id: "job1", status: "todo", sort_order: 0 },
      { id: "b", project_id: "p1", job_id: "job1", status: "todo", sort_order: 4 },
      // different column + different job — must NOT raise the max
      { id: "c", project_id: "p1", job_id: "job1", status: "done", sort_order: 99 },
      { id: "d", project_id: "p1", job_id: "job2", status: "todo", sort_order: 77 },
    ];
    await createTask({ projectId: "p1", jobId: "job1", title: "New" });
    expect(h.inserts[0].sort_order).toBe(5); // 4 + 1
  });

  it("starts at 0 in an empty column", async () => {
    await createTask({ projectId: "p1", jobId: "job1", title: "First" });
    expect(h.inserts[0].sort_order).toBe(0);
  });
});

describe("setTaskStatus — completed_at boundary", () => {
  it("stamps completed_at entering 'done' and CLEARS it leaving 'done'", async () => {
    h.rows = [{ id: "t1", status: "todo", completed_at: null }];

    await setTaskStatus({ id: "t1", status: "done" });
    const donePatch = h.updates.at(-1)!.payload;
    expect(donePatch.status).toBe("done");
    expect(donePatch.completed_at).toBeTruthy();

    await setTaskStatus({ id: "t1", status: "todo" });
    const reopenPatch = h.updates.at(-1)!.payload;
    expect(reopenPatch.status).toBe("todo");
    expect(reopenPatch.completed_at).toBeNull(); // no stale completion timestamp
  });
});

describe("reorderTasks", () => {
  it("writes sort_order by array index and applies the column's status", async () => {
    h.rows = [
      { id: "t1", status: "todo", sort_order: 0 },
      { id: "t2", status: "todo", sort_order: 1 },
      { id: "t3", status: "blocked", sort_order: 0 },
    ];
    const written = await reorderTasks({
      orderedIds: ["t3", "t1", "t2"],
      status: "in_progress",
    });
    expect(written).toBe(3);
    expect(h.updates.map((u) => [u.id, u.payload.sort_order, u.payload.status])).toEqual([
      ["t3", 0, "in_progress"],
      ["t1", 1, "in_progress"],
      ["t2", 2, "in_progress"],
    ]);
  });

  it("stamps completed_at when the target column is 'done'", async () => {
    h.rows = [{ id: "t1", status: "todo", sort_order: 0 }];
    await reorderTasks({ orderedIds: ["t1"], status: "done" });
    expect(h.updates.at(-1)!.payload.completed_at).toBeTruthy();
  });
});

describe("updateTask", () => {
  it("empty-diff patch is a no-op — no write, no updated_at bump (§2.8)", async () => {
    h.rows = [{ id: "t1", title: "Original" }];
    const row = await updateTask("t1", {}, "u1");
    expect(h.updates).toHaveLength(0);
    expect((row as { title: string }).title).toBe("Original");
  });

  it("writes changed fields and stamps the actor", async () => {
    h.rows = [{ id: "t1", title: "Original" }];
    await updateTask("t1", { title: "Renamed", priority: "urgent" }, "u1");
    expect(h.updates.at(-1)!.payload).toMatchObject({
      title: "Renamed",
      priority: "urgent",
      updated_by: "u1",
    });
  });

  it("switching assignee kind clears the other side", async () => {
    h.rows = [{ id: "t1", assignee_tech_id: "tech1", assignee_subcontractor_id: null }];
    await updateTask("t1", { assigneeSubcontractorId: "sub1" }, "u1");
    expect(h.updates.at(-1)!.payload).toMatchObject({
      assignee_tech_id: null,
      assignee_subcontractor_id: "sub1",
    });
  });
});

describe("scope separation (job vs project-level)", () => {
  it("listTasksForJob returns ONLY that job's tasks — project-level tasks excluded", async () => {
    h.rows = [
      { id: "t1", project_id: "p1", job_id: "job1", title: "Job task" },
      { id: "t2", project_id: "p1", job_id: null, title: "Project-level task" },
      { id: "t3", project_id: "p1", job_id: "job2", title: "Other job's task" },
    ];
    const rows = await listTasksForJob("job1");
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
  });

  it("listTasksForProject defaults to PROJECT-LEVEL only; includeJobTasks widens", async () => {
    h.rows = [
      { id: "t1", project_id: "p1", job_id: "job1", title: "Job task" },
      { id: "t2", project_id: "p1", job_id: null, title: "Project-level task" },
    ];
    expect((await listTasksForProject("p1")).map((r) => r.id)).toEqual(["t2"]);
    expect(
      (await listTasksForProject("p1", { includeJobTasks: true })).map((r) => r.id).sort()
    ).toEqual(["t1", "t2"]);
  });
});
