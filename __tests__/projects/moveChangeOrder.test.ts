// PROJ2-8 — moveChangeOrderToProject. Validations (main_job / same project /
// cross-client / cross-opco rejected), the reassign-before-anything-breaks
// write sequence (job → CCs → invoices → POs → quote link → folders), folder
// re-parent with the default-name rename rule, and the double totals re-sync.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type Captured = {
  payload: Record<string, unknown>;
  filters: Array<{ method: string; args: unknown[] }>;
};

const s = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  projects: {} as Record<string, Record<string, unknown>>,
  nextCo: 5,
  srcMain: { id: "mainS" } as Record<string, unknown> | null,
  coFolder: null as Record<string, unknown> | null,
  wrapper: { id: "wrapT" } as Record<string, unknown> | null,
  updates: {} as Record<string, Captured[]>,
  sync: vi.fn(async (input: { jobId: string }) => void input),
  log: vi.fn(async () => {}),
}));

function capture(table: string, ctx: ChainCtx) {
  const list = s.updates[table] ?? [];
  list.push({
    payload: ctx.payload as Record<string, unknown>,
    filters: ctx.filters,
  });
  s.updates[table] = list;
}

function filterArg(ctx: ChainCtx, method: string, col: string): unknown {
  return ctx.filters.find((f) => f.method === method && f.args[0] === col)
    ?.args[1];
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.op === "update") {
    capture(ctx.table, ctx);
    return { data: null, error: null };
  }
  if (ctx.table === "attachment_folders" && ctx.op === "select") {
    const kind = filterArg(ctx, "eq", "kind");
    if (kind === "change_order") return { data: s.coFolder, error: null };
    if (kind === "change_orders") return { data: s.wrapper, error: null };
    if (kind === "project_container") return { data: null, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => s.job,
  getProjectRow: async (id: string) => s.projects[id] ?? null,
  getNextCoNumber: async () => s.nextCo,
  getMainJobForProject: async () => s.srcMain,
}));
vi.mock("@/lib/api/job-line-items", () => ({
  syncCostCenterAndJobTotals: s.sync,
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: s.log }));

import { moveChangeOrderToProject } from "@/lib/api/job-move";

const INPUT = { jobId: "j1", targetProjectId: "pt", actorId: "u1" };

beforeEach(() => {
  s.job = {
    id: "j1",
    project_id: "ps",
    job_type: "change_order",
    co_number: 2,
    source_quote_id: "q1",
  };
  s.projects = {
    ps: { id: "ps", client_id: "c1", opco: "integrated_solutions", site_id: "siteS" },
    pt: { id: "pt", client_id: "c1", opco: "integrated_solutions", site_id: "siteT" },
  };
  s.nextCo = 5;
  s.srcMain = { id: "mainS" };
  s.coFolder = { id: "f1", name: "C.O #2" };
  s.wrapper = { id: "wrapT" };
  s.updates = {};
  s.sync.mockClear();
  s.log.mockClear();
});

describe("validations", () => {
  it("rejects a main_job", async () => {
    s.job = { ...s.job!, job_type: "main_job" };
    const res = await moveChangeOrderToProject(INPUT);
    expect(res).toEqual({ ok: false, error: "cannot_move_main_job" });
    expect(s.updates).toEqual({});
  });

  it("rejects a move to the same project", async () => {
    const res = await moveChangeOrderToProject({
      ...INPUT,
      targetProjectId: "ps",
    });
    expect(res).toEqual({ ok: false, error: "same_project" });
  });

  it("rejects a cross-client move", async () => {
    s.projects.pt.client_id = "c2";
    const res = await moveChangeOrderToProject(INPUT);
    expect(res).toEqual({ ok: false, error: "cross_client" });
    expect(s.updates).toEqual({});
  });

  it("rejects a cross-opco move", async () => {
    s.projects.pt.opco = "guardian";
    const res = await moveChangeOrderToProject(INPUT);
    expect(res).toEqual({ ok: false, error: "cross_opco" });
  });
});

describe("happy path", () => {
  it("moves the job with the target's next co_number and reassigns everything", async () => {
    const res = await moveChangeOrderToProject(INPUT);
    expect(res).toEqual({ ok: true, newCoNumber: 5, sourceProjectId: "ps" });

    // Job row: project + number + sort in one statement.
    const jobU = s.updates.project_jobs![0];
    expect(jobU.payload).toMatchObject({
      project_id: "pt",
      co_number: 5,
      sort_order: 5,
    });
    expect(jobU.filters).toContainEqual({ method: "eq", args: ["id", "j1"] });

    // Financial records follow by job_id.
    for (const table of ["project_cost_centers", "invoices", "purchase_orders"]) {
      const u = s.updates[table]![0];
      expect(u.payload).toEqual({ project_id: "pt" });
      expect(u.filters).toContainEqual({ method: "eq", args: ["job_id", "j1"] });
    }

    // The change_order quote link moves.
    const pq = s.updates.project_quotes![0];
    expect(pq.payload).toEqual({ project_id: "pt" });
    expect(pq.filters).toContainEqual({ method: "eq", args: ["quote_id", "q1"] });
    expect(pq.filters).toContainEqual({ method: "eq", args: ["project_id", "ps"] });
    expect(pq.filters).toContainEqual({
      method: "eq",
      args: ["role", "change_order"],
    });

    // Both spines re-synced: the moved job and the source's main job.
    expect(s.sync).toHaveBeenCalledTimes(2);
    expect(s.sync.mock.calls.map((c) => c[0].jobId)).toEqual(
      ["j1", "mainS"]
    );

    // Both projects logged.
    expect(s.log).toHaveBeenCalledTimes(2);
  });

  it("re-parents the folder subtree under the target wrapper and renames the default-named folder", async () => {
    await moveChangeOrderToProject(INPUT);

    const folderUpdates = s.updates.attachment_folders!;
    // The C.O folder itself: new parent + rename (name matched the default).
    const coU = folderUpdates.find((u) =>
      u.filters.some((f) => f.method === "eq" && f.args[0] === "id" && f.args[1] === "f1")
    )!;
    expect(coU.payload).toMatchObject({
      parent_id: "wrapT",
      project_id: "pt",
      site_id: "siteT",
      sort_order: 5,
      name: "C.O #5",
      slug: "co_5",
    });

    // The flat subtree restamp (every folder of the job).
    const treeU = folderUpdates.find((u) =>
      u.filters.some((f) => f.method === "eq" && f.args[0] === "job_id")
    )!;
    expect(treeU.payload).toEqual({ project_id: "pt", site_id: "siteT" });
  });

  it("keeps a user-renamed folder's name", async () => {
    s.coFolder = { id: "f1", name: "Permit documents" };
    await moveChangeOrderToProject(INPUT);

    const coU = s.updates.attachment_folders!.find((u) =>
      u.filters.some((f) => f.method === "eq" && f.args[0] === "id" && f.args[1] === "f1")
    )!;
    expect(coU.payload.parent_id).toBe("wrapT");
    expect(coU.payload.name).toBeUndefined();
    expect(coU.payload.slug).toBeUndefined();
  });
});
