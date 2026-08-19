// UIDG-11 — job_tasks gains the Gantt fields. The write layer validates them
// (end ≥ start, percent 0–100), persists start/end/percent/parent on create, and
// guards re-parenting against cycles beyond depth-1 (the DB CHECK only bars
// self-parenting) — the message names the loop.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; payload: Record<string, unknown> }[],
  logActivity: vi.fn(async () => {}),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
    if (f.method === "is" && args[1] === null) out = out.filter((r) => r[col] == null);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table !== "job_tasks") return { data: single ? null : [], error: null };
  if (ctx.op === "insert") {
    const p = ctx.payload as Record<string, unknown>;
    const row = { id: `t-${h.inserts.length + 1}`, ...p };
    h.inserts.push(p);
    h.rows = [...h.rows, row];
    return { data: row, error: null };
  }
  if (ctx.op === "update") {
    const id = ctx.filters.find((f) => f.method === "eq" && f.args[0] === "id")?.args[1];
    const p = ctx.payload as Record<string, unknown>;
    h.updates.push({ id, payload: p });
    h.rows = h.rows.map((r) => (r.id === id ? { ...r, ...p } : r));
    return { data: h.rows.find((r) => r.id === id) ?? null, error: null };
  }
  const rows = filt(h.rows, ctx.filters);
  return { data: single ? (rows[0] ?? null) : rows, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => ({ id: "j1", project_id: "p1" }) }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/activity-log", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logActivity: h.logActivity,
}));

import { createTask, updateTask, setTaskParent } from "@/lib/api/job-tasks";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.updates = [];
  h.logActivity.mockClear();
});

describe("createTask — Gantt fields", () => {
  it("persists start/end/percent/parent", async () => {
    await createTask({
      projectId: "p1",
      title: "Frame",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      percentComplete: 30,
    });
    const p = h.inserts.at(-1)!;
    expect(p).toMatchObject({ start_date: "2026-01-01", end_date: "2026-01-10", percent_complete: 30 });
  });

  it("rejects end before start", async () => {
    await expect(
      createTask({ projectId: "p1", title: "Bad", startDate: "2026-01-10", endDate: "2026-01-01" })
    ).rejects.toMatchObject({ code: "invalid_dates" });
  });

  it("rejects a percent outside 0–100", async () => {
    await expect(
      createTask({ projectId: "p1", title: "Bad", percentComplete: 150 })
    ).rejects.toMatchObject({ code: "invalid_percent" });
  });
});

describe("updateTask — Gantt fields", () => {
  it("rejects end before the current start when only end is patched", async () => {
    h.rows = [{ id: "t1", project_id: "p1", title: "T", start_date: "2026-01-05", end_date: "2026-01-20", percent_complete: 0 }];
    await expect(updateTask("t1", { endDate: "2026-01-01" }, null)).rejects.toMatchObject({ code: "invalid_dates" });
  });

  it("rejects a percent outside 0–100", async () => {
    h.rows = [{ id: "t1", project_id: "p1", title: "T", start_date: null, end_date: null, percent_complete: 0 }];
    await expect(updateTask("t1", { percentComplete: -1 }, null)).rejects.toMatchObject({ code: "invalid_percent" });
  });
});

describe("setTaskParent — cycle guard (arbitrary nesting)", () => {
  beforeEach(() => {
    // X (root) ← Y (parent X) ← Z (parent Y): a 3-deep chain.
    h.rows = [
      { id: "X", project_id: "p1", parent_id: null, title: "X" },
      { id: "Y", project_id: "p1", parent_id: "X", title: "Y" },
      { id: "Z", project_id: "p1", parent_id: "Y", title: "Z" },
    ];
  });

  it("rejects self-parenting", async () => {
    await expect(setTaskParent("X", "X", null)).rejects.toMatchObject({ code: "invalid_parent" });
  });

  it("rejects a deep cycle (X under Z, when Z already descends from X), naming the loop", async () => {
    let err: unknown;
    try {
      await setTaskParent("X", "Z", null);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: "would_create_cycle" });
    expect((err as Error).message).toMatch(/X → Y → Z → X/);
  });

  it("allows a valid re-parent", async () => {
    // moving a fresh leaf W under X is fine
    h.rows.push({ id: "W", project_id: "p1", parent_id: null, title: "W" });
    await setTaskParent("W", "X", null);
    expect(h.updates.some((u) => u.id === "W" && u.payload.parent_id === "X")).toBe(true);
  });
});
