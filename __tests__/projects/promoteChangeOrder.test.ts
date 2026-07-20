// PROJ2-8 — promoteChangeOrderToProject. The C.O becomes the Main Job of a
// brand-new project on the same site/client/opco: project row copied from the
// source, job flipped (main_job + co_number NULL in one statement), quote link
// role flipped to 'original', and the EXISTING folder subtree reused as the new
// Main Job folder — only a container + change_orders wrapper are created, never
// a duplicate set of the 19 default subfolders.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type Captured = {
  payload: Record<string, unknown>;
  filters: Array<{ method: string; args: unknown[] }>;
};

const s = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  source: null as Record<string, unknown> | null,
  srcMain: { id: "mainS" } as Record<string, unknown> | null,
  coFolder: null as Record<string, unknown> | null,
  updates: {} as Record<string, Captured[]>,
  inserts: {} as Record<string, Record<string, unknown>[]>,
  projectInsert: null as Record<string, unknown> | null,
  sync: vi.fn(async (input: { jobId: string }) => void input),
  log: vi.fn(async () => {}),
}));

function filterArg(ctx: ChainCtx, method: string, col: string): unknown {
  return ctx.filters.find((f) => f.method === method && f.args[0] === col)
    ?.args[1];
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown; count?: number } {
  if (ctx.op === "update") {
    const list = s.updates[ctx.table] ?? [];
    list.push({
      payload: ctx.payload as Record<string, unknown>,
      filters: ctx.filters,
    });
    s.updates[ctx.table] = list;
    return { data: null, error: null };
  }
  if (ctx.op === "insert") {
    const payload = ctx.payload as Record<string, unknown>;
    const list = s.inserts[ctx.table] ?? [];
    list.push(payload);
    s.inserts[ctx.table] = list;
    if (ctx.table === "projects") {
      s.projectInsert = payload;
      return {
        data: { id: "pnew", ...payload },
        error: null,
      };
    }
    if (ctx.table === "attachment_folders") {
      // Deterministic ids by kind so the wrapper/container chain is traceable.
      return { data: { id: `${payload.kind}-id` }, error: null };
    }
    return { data: null, error: null };
  }
  if (ctx.table === "attachment_folders" && ctx.op === "select") {
    const kind = filterArg(ctx, "eq", "kind");
    if (kind === "change_order") return { data: s.coFolder, error: null };
    // New project: no wrapper, no container yet.
    if (kind === "change_orders") return { data: null, error: null };
    if (kind === "project_container") {
      // The head-count probe for the ordinal name vs the maybeSingle lookup.
      if (ctx.terminal === "await") return { data: null, error: null, count: 3 };
      return { data: null, error: null };
    }
    // The wrapper's parent_id lookup (by id) after ensure created it.
    if (filterArg(ctx, "eq", "id") === "change_orders-id") {
      return { data: { parent_id: "project_container-id" }, error: null };
    }
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => s.job,
  getProjectRow: async () => s.source,
  getNextCoNumber: vi.fn(),
  getMainJobForProject: async () => s.srcMain,
}));
vi.mock("@/lib/api/job-line-items", () => ({
  syncCostCenterAndJobTotals: s.sync,
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: s.log }));

import { promoteChangeOrderToProject } from "@/lib/api/job-move";

const INPUT = { jobId: "j1", actorId: "u1" };

beforeEach(() => {
  s.job = {
    id: "j1",
    project_id: "ps",
    job_type: "change_order",
    co_number: 3,
    title: "Extra CCTV wing",
    source_quote_id: "q1",
  };
  s.source = {
    id: "ps",
    client_id: "c1",
    opco: "guardian",
    site_id: "siteS",
  };
  s.srcMain = { id: "mainS" };
  s.coFolder = { id: "f1", name: "C.O #3" };
  s.updates = {};
  s.inserts = {};
  s.projectInsert = null;
  s.sync.mockClear();
  s.log.mockClear();
});

describe("promoteChangeOrderToProject", () => {
  it("rejects a main_job", async () => {
    s.job = { ...s.job!, job_type: "main_job" };
    const res = await promoteChangeOrderToProject(INPUT);
    expect(res).toEqual({ ok: false, error: "cannot_move_main_job" });
  });

  it("creates the project with copied client/site/opco and the C.O quote as originating", async () => {
    const res = await promoteChangeOrderToProject(INPUT);
    expect(res).toEqual({
      ok: true,
      newProjectId: "pnew",
      sourceProjectId: "ps",
    });
    expect(s.projectInsert).toMatchObject({
      client_id: "c1",
      site_id: "siteS",
      opco: "guardian",
      title: "Extra CCTV wing",
      status: "active",
      originating_quote_id: "q1",
    });
    expect(typeof s.projectInsert!.project_number).toBe("string");
  });

  it("flips the job to main_job with co_number NULL in one statement", async () => {
    await promoteChangeOrderToProject(INPUT);
    const jobU = s.updates.project_jobs![0];
    expect(jobU.payload).toMatchObject({
      project_id: "pnew",
      job_type: "main_job",
      co_number: null,
      sort_order: 0,
    });
    expect(jobU.filters).toContainEqual({ method: "eq", args: ["id", "j1"] });
  });

  it("reassigns financials and flips the quote link role to original", async () => {
    await promoteChangeOrderToProject(INPUT);
    for (const table of ["project_cost_centers", "invoices", "purchase_orders"]) {
      const u = s.updates[table]![0];
      expect(u.payload).toEqual({ project_id: "pnew" });
      expect(u.filters).toContainEqual({ method: "eq", args: ["job_id", "j1"] });
    }
    const pq = s.updates.project_quotes![0];
    expect(pq.payload).toEqual({ project_id: "pnew", role: "original" });
    expect(pq.filters).toContainEqual({
      method: "eq",
      args: ["role", "change_order"],
    });
  });

  it("reuses the existing folder subtree — container + wrapper only, no 19 subfolders", async () => {
    await promoteChangeOrderToProject(INPUT);

    // Only the container and the change_orders wrapper are created.
    const folderInserts = s.inserts.attachment_folders ?? [];
    expect(folderInserts.map((f) => f.kind).sort()).toEqual([
      "change_orders",
      "project_container",
    ]);
    expect(
      folderInserts.every((f) => f.kind !== "default_subfolder" && f.kind !== "main_job")
    ).toBe(true);
    // Container name continues the site ordinal (3 existing + 1).
    expect(
      folderInserts.find((f) => f.kind === "project_container")!.name
    ).toBe("Project 4");

    // The existing C.O folder BECOMES the Main Job folder.
    const coU = s.updates.attachment_folders!.find((u) =>
      u.filters.some(
        (f) => f.method === "eq" && f.args[0] === "id" && f.args[1] === "f1"
      )
    )!;
    expect(coU.payload).toMatchObject({
      parent_id: "project_container-id",
      project_id: "pnew",
      kind: "main_job",
      slug: "main_job",
      sort_order: 0,
      name: "Main Job", // default 'C.O #3' → renamed
    });

    // Subtree restamped to the new project (same site — no site_id change).
    const treeU = s.updates.attachment_folders!.find((u) =>
      u.filters.some((f) => f.method === "eq" && f.args[0] === "job_id")
    )!;
    expect(treeU.payload).toEqual({ project_id: "pnew" });
  });

  it("keeps a user-renamed folder's name when promoting", async () => {
    s.coFolder = { id: "f1", name: "West wing docs" };
    await promoteChangeOrderToProject(INPUT);
    const coU = s.updates.attachment_folders!.find((u) =>
      u.filters.some(
        (f) => f.method === "eq" && f.args[0] === "id" && f.args[1] === "f1"
      )
    )!;
    expect(coU.payload.kind).toBe("main_job");
    expect(coU.payload.name).toBeUndefined();
  });

  it("re-syncs both spines and logs both projects", async () => {
    await promoteChangeOrderToProject(INPUT);
    expect(s.sync.mock.calls.map((c) => c[0].jobId)).toEqual(
      ["j1", "mainS"]
    );
    expect(s.log).toHaveBeenCalledTimes(2);
  });
});
