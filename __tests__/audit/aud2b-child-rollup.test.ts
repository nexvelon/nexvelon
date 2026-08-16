// AUD-2B — the project-scoped child entities (tasks, deficiencies, commissioning
// items) write their OWN audit rows, rolled up to the project, with a readable
// entity_label — and the label is captured BEFORE a delete so the row survives.
//
// We let the real logActivity be replaced by a spy (computeChanges stays real)
// and drive the DB through the shared chain mock.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  logActivity: vi.fn(async () => {}),
  resolve: (_ctx: ChainCtx) => ({ data: null as unknown, error: null as unknown }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeSupabaseMock((ctx) => h.resolve(ctx))),
}));
vi.mock("@/lib/api/activity-log", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logActivity: h.logActivity };
});

import { createTask, deleteTask } from "@/lib/api/job-tasks";
import { createDeficiency } from "@/lib/api/job-deficiencies";
import { addItem } from "@/lib/api/commissioning";

beforeEach(() => {
  h.logActivity.mockClear();
});

describe("job task — audit coverage", () => {
  it("createTask logs a job_task create rolled up to the project, labelled by title", async () => {
    h.resolve = (ctx) => {
      if (ctx.table === "job_tasks" && ctx.op === "select") return { data: [], error: null }; // nextSortOrder
      if (ctx.table === "job_tasks" && ctx.op === "insert")
        return { data: { id: "t1", project_id: "p9", title: "Fix drywall" }, error: null };
      return { data: null, error: null };
    };
    await createTask({ projectId: "p9", title: "Fix drywall" });
    expect(h.logActivity).toHaveBeenCalledWith("job_task", "t1", "create", {}, {
      parentType: "project",
      parentId: "p9",
      entityLabel: "Fix drywall",
    });
  });

  it("deleteTask captures the title BEFORE deleting for a readable removed row", async () => {
    h.resolve = (ctx) => {
      if (ctx.table === "job_tasks" && ctx.op === "select" && ctx.terminal === "maybeSingle")
        return { data: { project_id: "p9", title: "Fix drywall" }, error: null };
      if (ctx.table === "job_tasks" && ctx.op === "delete")
        return { data: [{ id: "t1" }], error: null };
      return { data: null, error: null };
    };
    await deleteTask("t1");
    expect(h.logActivity).toHaveBeenCalledWith("job_task", "t1", "delete", {}, {
      parentType: "project",
      parentId: "p9",
      entityLabel: "Fix drywall",
    });
  });
});

describe("deficiency — audit coverage", () => {
  it("createDeficiency logs a deficiency create rolled up to the project", async () => {
    h.resolve = (ctx) => {
      if (ctx.table === "project_jobs" && ctx.terminal === "maybeSingle")
        return { data: { id: "j1", project_id: "p9" }, error: null }; // getJobById
      if (ctx.table === "job_deficiencies" && ctx.op === "select") return { data: [], error: null }; // nextSortOrder
      if (ctx.table === "job_deficiencies" && ctx.op === "insert")
        return { data: { id: "d1", project_id: "p9", title: "Chipped tile" }, error: null };
      return { data: null, error: null };
    };
    await createDeficiency({ projectId: "p9", jobId: "j1", title: "Chipped tile" });
    expect(h.logActivity).toHaveBeenCalledWith("deficiency", "d1", "create", {}, {
      parentType: "project",
      parentId: "p9",
      entityLabel: "Chipped tile",
    });
  });
});

describe("commissioning item — audit coverage", () => {
  it("addItem logs a commissioning_item create rolled up to the run's project", async () => {
    h.resolve = (ctx) => {
      if (ctx.table === "commissioning_items" && ctx.op === "select") return { data: [], error: null }; // sort order
      if (ctx.table === "commissioning_items" && ctx.op === "insert")
        return { data: { id: "ci1" }, error: null };
      if (ctx.table === "commissioning_runs" && ctx.terminal === "maybeSingle")
        return { data: { project_id: "p9" }, error: null };
      return { data: null, error: null };
    };
    await addItem({ runId: "r1", description: "Airflow test" });
    expect(h.logActivity).toHaveBeenCalledWith("commissioning_item", "ci1", "create", {}, {
      parentType: "project",
      parentId: "p9",
      entityLabel: "Airflow test",
    });
  });
});
