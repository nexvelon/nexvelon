// PROJ2-12 — the deficiency API. Title + at-most-one-assignee validation,
// job-in-project guard, sort_order = max+1 per (job, status) column, and the
// closed_at/closed_by stamp on close/waive (cleared when reopened).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; payload: Record<string, unknown> }[],
  attachments: [] as Record<string, unknown>[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  logActivity: vi.fn(async () => {}),
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
  if (ctx.table === "job_deficiencies") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `d-${h.inserts.length + 1}`, ...p };
      h.inserts.push(p);
      h.rows = [...h.rows, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.updates.push({ id, payload: ctx.payload as Record<string, unknown> });
      h.rows = h.rows.map((r) => (r.id === id ? { ...r, ...(ctx.payload as object) } : r));
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
  if (ctx.table === "attachments") return { data: filt(h.attachments, ctx.filters), error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createDeficiency,
  setDeficiencyStatus,
  listDeficienciesForJob,
  reorderDeficiencies,
  DeficiencyError,
} from "@/lib/api/job-deficiencies";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.updates = [];
  h.attachments = [];
  h.job = { id: "job1", project_id: "p1" };
  h.logActivity.mockClear();
});

describe("createDeficiency — validation", () => {
  it("requires a title", async () => {
    await expect(
      createDeficiency({ projectId: "p1", jobId: "job1", title: "  " })
    ).rejects.toMatchObject({ code: "invalid_title" });
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects both assignee kinds (invalid_assignee)", async () => {
    await expect(
      createDeficiency({
        projectId: "p1", jobId: "job1", title: "t",
        assigneeTechId: "tech1", assigneeSubcontractorId: "sub1",
      })
    ).rejects.toBeInstanceOf(DeficiencyError);
    expect(h.inserts).toHaveLength(0);
  });

  it("accepts zero assignees (unassigned is valid) and defaults status open / minor", async () => {
    await createDeficiency({ projectId: "p1", jobId: "job1", title: "Cracked tile" });
    expect(h.inserts[0]).toMatchObject({
      status: "open",
      severity: "minor",
      assignee_tech_id: null,
      assignee_subcontractor_id: null,
    });
  });

  it("rejects a job not in the project (job_mismatch)", async () => {
    h.job = { id: "job1", project_id: "OTHER" };
    await expect(
      createDeficiency({ projectId: "p1", jobId: "job1", title: "t" })
    ).rejects.toMatchObject({ code: "job_mismatch" });
  });

  it("sort_order is max+1 within the open column", async () => {
    h.rows = [
      { id: "a", job_id: "job1", status: "open", sort_order: 0 },
      { id: "b", job_id: "job1", status: "open", sort_order: 3 },
      { id: "c", job_id: "job1", status: "closed", sort_order: 99 },
    ];
    await createDeficiency({ projectId: "p1", jobId: "job1", title: "New" });
    expect(h.inserts[0].sort_order).toBe(4);
  });
});

describe("setDeficiencyStatus — closed_at boundary", () => {
  it("stamps closed_at + closed_by on close, clears on reopen", async () => {
    h.rows = [{ id: "d1", status: "open", closed_at: null }];

    await setDeficiencyStatus({ id: "d1", status: "closed", actorId: "u9" });
    const closed = h.updates.at(-1)!.payload;
    expect(closed.status).toBe("closed");
    expect(closed.closed_at).toBeTruthy();
    expect(closed.closed_by).toBe("u9");

    await setDeficiencyStatus({ id: "d1", status: "open", actorId: "u9" });
    const reopened = h.updates.at(-1)!.payload;
    expect(reopened.closed_at).toBeNull();
    expect(reopened.closed_by).toBeNull();
  });

  it("waive also stamps closed_at (a decision was made)", async () => {
    h.rows = [{ id: "d1", status: "open" }];
    await setDeficiencyStatus({ id: "d1", status: "waived", actorId: "u1" });
    expect(h.updates.at(-1)!.payload.closed_at).toBeTruthy();
  });
});

describe("reorderDeficiencies", () => {
  it("writes sort_order by index and applies the column status", async () => {
    h.rows = [
      { id: "d1", status: "open", sort_order: 0 },
      { id: "d2", status: "open", sort_order: 1 },
    ];
    const written = await reorderDeficiencies({ orderedIds: ["d2", "d1"], status: "in_progress" });
    expect(written).toBe(2);
    expect(h.updates.map((u) => [u.id, u.payload.sort_order, u.payload.status])).toEqual([
      ["d2", 0, "in_progress"],
      ["d1", 1, "in_progress"],
    ]);
  });
});

describe("listDeficienciesForJob — photo counts", () => {
  it("attaches photo_count from deficiency attachments", async () => {
    h.rows = [{ id: "d1", job_id: "job1", status: "open", severity: "minor" }];
    h.attachments = [
      { entity_id: "d1", entity_type: "deficiency" },
      { entity_id: "d1", entity_type: "deficiency" },
    ];
    const rows = await listDeficienciesForJob("job1");
    expect(rows[0].photo_count).toBe(2);
  });
});
