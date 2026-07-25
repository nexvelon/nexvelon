// PROJ2-21 — margin snapshots. takeSnapshot freezes the live rollup incl.
// by_code; a LATER rollup change does NOT alter an existing snapshot (the whole
// point); getSnapshotTrend is chronological; delete works and there is no edit
// path (asserted by the module's surface).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  snapshots: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  // mutable "live" rollup — changing it between snapshots proves immutability.
  materials: 100,
  labour: 200,
  subLabour: 0,
  contract: 1000,
  invoiced: 900,
  quotedCost: 250,
  estimatedCost: 300,
}));

function rollup() {
  const spent = h.materials + h.labour + h.subLabour;
  return {
    perProject: {
      contract: h.contract,
      spent,
      invoiced: h.invoiced,
      materials: h.materials,
      labour: h.labour,
      sub_labour: h.subLabour,
      variance: { quoted: { cost: h.quotedCost }, estimated: { cost: h.estimatedCost } },
    },
    byJob: [
      {
        job_id: "job1",
        contract: h.contract,
        spent,
        invoiced: h.invoiced,
        materials: h.materials,
        labour: h.labour,
        sub_labour: h.subLabour,
        variance: { quoted: { cost: h.quotedCost }, estimated: { cost: h.estimatedCost } },
      },
    ],
  };
}

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "is" && args[1] === null) out = out.filter((r) => r[col] == null);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "margin_snapshots") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `snap-${h.inserts.length + 1}`, snapshot_at: p.snapshot_at ?? `2026-0${h.inserts.length + 1}-01T00:00:00Z`, ...p };
      h.inserts.push(p);
      h.snapshots = [...h.snapshots, row];
      return { data: row, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      const existed = h.snapshots.some((s) => s.id === id);
      h.snapshots = h.snapshots.filter((s) => s.id !== id);
      return { data: existed ? [{ id }] : [], error: null };
    }
    return { data: filt(h.snapshots, ctx.filters), error: null };
  }
  // cost-code breakdown internals
  if (ctx.table === "cost_codes") return { data: [], error: null };
  if (ctx.table === "job_line_items") return { data: [], error: null };
  if (ctx.table === "project_jobs") return { data: [{ id: "job1" }], error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/project-cost-rollup", () => ({ getProjectCostRollup: async () => rollup() }));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => ({ id: "job1", project_id: "p1" }) }));

import {
  takeSnapshot,
  listSnapshots,
  getSnapshotTrend,
  deleteSnapshot,
} from "@/lib/api/margin-snapshots";
import * as snapshotsModule from "@/lib/api/margin-snapshots";

beforeEach(() => {
  h.snapshots = [];
  h.inserts = [];
  h.materials = 100; h.labour = 200; h.subLabour = 0;
  h.contract = 1000; h.invoiced = 900;
  h.quotedCost = 250; h.estimatedCost = 300;
});

describe("takeSnapshot — freezes the live rollup", () => {
  it("captures contract / actual_cost / margin / by_code for a job", async () => {
    const snap = await takeSnapshot({ projectId: "p1", jobId: "job1", reason: "approval" });
    expect(h.inserts[0]).toMatchObject({
      project_id: "p1",
      job_id: "job1",
      reason: "approval",
      contract: 1000,
      actual_cost: 300, // 100 + 200 + 0
      actual_revenue: 900,
      quoted_cost: 250,
      estimated_cost: 300,
    });
    // margin = contract − actual_cost = 700; pct = 70
    expect(snap.margin).toBe(700);
    expect(snap.margin_pct).toBe(70);
    expect(snap.by_code).toBeTruthy();
  });
});

describe("immutability — a later rollup change does NOT alter an existing snapshot", () => {
  it("keeps the frozen numbers when costs change afterward", async () => {
    const first = await takeSnapshot({ projectId: "p1", jobId: "job1", reason: "50%" });
    expect(first.actual_cost).toBe(300);

    // costs blow out AFTER the snapshot
    h.labour = 900;
    h.subLabour = 500;

    // a NEW snapshot reflects the new reality...
    const second = await takeSnapshot({ projectId: "p1", jobId: "job1", reason: "completion" });
    expect(second.actual_cost).toBe(1500); // 100 + 900 + 500

    // ...but the FIRST snapshot is unchanged — that's the whole feature.
    const stored = h.snapshots.find((s) => s.id === first.id)!;
    expect(stored.actual_cost).toBe(300);
    expect(stored.margin).toBe(700);
  });

  it("exposes NO update/edit function — only take, list, trend, delete", () => {
    const exported = Object.keys(snapshotsModule).sort();
    expect(exported).toEqual(
      ["deleteSnapshot", "getSnapshotTrend", "listSnapshots", "takeSnapshot"].sort()
    );
    // no updateSnapshot / editSnapshot anywhere
    expect(exported.some((k) => /update|edit/i.test(k))).toBe(false);
  });
});

describe("listSnapshots / getSnapshotTrend / deleteSnapshot", () => {
  it("trend is chronological (oldest first)", async () => {
    // two snapshots with explicit times
    h.snapshots = [
      { id: "s2", job_id: "job1", snapshot_at: "2026-05-01T00:00:00Z", margin: 500, margin_pct: 50, actual_cost: 500, contract: 1000, reason: "50%" },
      { id: "s1", job_id: "job1", snapshot_at: "2026-03-01T00:00:00Z", margin: 700, margin_pct: 70, actual_cost: 300, contract: 1000, reason: "approval" },
    ];
    const trend = await getSnapshotTrend({ jobId: "job1" });
    expect(trend.map((t) => t.reason)).toEqual(["approval", "50%"]);
  });

  it("delete removes a mistaken snapshot", async () => {
    h.snapshots = [{ id: "s1", job_id: "job1" }];
    expect(await deleteSnapshot("s1")).toBe(true);
    expect(h.snapshots).toHaveLength(0);
  });

  it("listSnapshots for a job returns its rows", async () => {
    h.snapshots = [{ id: "s1", job_id: "job1" }, { id: "s2", job_id: "job2" }];
    const rows = await listSnapshots({ jobId: "job1" });
    expect(rows.map((r) => r.id)).toEqual(["s1"]);
  });
});
