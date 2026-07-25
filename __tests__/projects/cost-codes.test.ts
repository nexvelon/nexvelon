// PROJ2-17 — cost codes + the estimate-vs-actual breakdown. CRUD (duplicate
// rejected, deactivate vs delete-when-unreferenced), and the mapping (3b): coded
// lines bucket by code, uncoded fall back to category by line_kind (nothing
// lost), actuals map materials→MAT / labour→LAB / sub_labour→SUB, variance =
// actual − estimated.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  codes: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  lineRefCount: 0,
  inserts: [] as Record<string, unknown>[],
  deleted: [] as string[],
  // rollup mock
  rollup: {
    perProject: { materials: 0, labour: 0, sub_labour: 0 },
    byJob: [] as Record<string, unknown>[],
  },
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

function resolve(ctx: ChainCtx): { data: unknown; error: unknown; count?: number } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "cost_codes") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      if (h.codes.some((c) => c.code === p.code)) {
        return { data: null, error: { message: "duplicate key value cost_codes_code_key" } };
      }
      const row = { id: `code-${h.codes.length + 1}`, is_active: true, ...p };
      h.codes = [...h.codes, row];
      h.inserts.push(p);
      return { data: row, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1] as string;
      h.deleted.push(id);
      h.codes = h.codes.filter((c) => c.id !== id);
      return { data: [{ id }], error: null };
    }
    const rows = filt(h.codes, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "job_line_items") {
    if (ctx.terminal === "await" && ctx.op === "select") {
      // head:true count query for the ref check
      const anyHead = ctx.filters.length > 0; // eq cost_code_id
      if (anyHead && h.lineRefCount >= 0) {
        // distinguish the ref-count call (select id head) from the breakdown call
      }
    }
    return { data: filt(h.lines, ctx.filters), error: null, count: h.lineRefCount };
  }
  if (ctx.table === "project_jobs") return { data: [{ id: "job1" }], error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: async () => h.rollup,
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => ({ id: "job1", project_id: "p1" }),
}));

import {
  createCostCode,
  deleteCostCode,
  getCostBreakdownByCode,
  CostCodeError,
} from "@/lib/api/cost-codes";

// The seeded default codes (one primary per category).
const SEED = [
  { id: "LAB", code: "LAB", name: "Labour", category: "labour", sort_order: 1, is_active: true },
  { id: "MAT", code: "MAT", name: "Materials", category: "materials", sort_order: 2, is_active: true },
  { id: "SUB", code: "SUB", name: "Subcontractor", category: "subcontractor", sort_order: 3, is_active: true },
  { id: "EQP", code: "EQP", name: "Equipment", category: "equipment", sort_order: 4, is_active: true },
  { id: "OTH", code: "OTH", name: "Other", category: "other", sort_order: 9, is_active: true },
];

beforeEach(() => {
  h.codes = SEED.map((c) => ({ ...c }));
  h.lines = [];
  h.lineRefCount = 0;
  h.inserts = [];
  h.deleted = [];
  h.rollup = { perProject: { materials: 0, labour: 0, sub_labour: 0 }, byJob: [] };
});

describe("cost code CRUD", () => {
  it("creates a code (uppercased)", async () => {
    const row = await createCostCode({ code: "rent", name: "Rentals", category: "equipment" });
    expect(row.code).toBe("RENT");
  });

  it("rejects a duplicate code", async () => {
    await expect(
      createCostCode({ code: "MAT", name: "dup", category: "materials" })
    ).rejects.toMatchObject({ code: "duplicate_code" });
  });

  it("deletes an UNREFERENCED code but blocks a referenced one (deactivate instead)", async () => {
    h.lineRefCount = 0;
    expect(await deleteCostCode("EQP")).toBe(true);
    h.lineRefCount = 3; // now in use
    await expect(deleteCostCode("MAT")).rejects.toMatchObject({ code: "in_use" });
    await expect(deleteCostCode("MAT")).rejects.toBeInstanceOf(CostCodeError);
  });
});

describe("getCostBreakdownByCode — the 3b mapping", () => {
  it("coded lines bucket by code; uncoded fall back to category by line_kind", async () => {
    h.lines = [
      // uncoded part → MAT (materials); uncoded labour → LAB
      { job_id: "job1", line_kind: "part", quantity: 2, unit_cost: 50, cost_code_id: null },     // 100 → MAT
      { job_id: "job1", line_kind: "labour", quantity: 10, unit_cost: 30, cost_code_id: null },  // 300 → LAB
      // a part line explicitly coded EQP (overrides the materials default)
      { job_id: "job1", line_kind: "part", quantity: 1, unit_cost: 500, cost_code_id: "EQP" },   // 500 → EQP
    ];
    // actuals: materials 120 (→MAT), labour 250 (→LAB), sub 400 (→SUB)
    h.rollup.byJob = [{ job_id: "job1", materials: 120, labour: 250, sub_labour: 400 }];

    const bd = await getCostBreakdownByCode({ jobId: "job1" });
    const by = Object.fromEntries(bd.rows.map((r) => [r.code, r]));

    // estimated
    expect(by.MAT.estimated).toBe(100);
    expect(by.LAB.estimated).toBe(300);
    expect(by.EQP.estimated).toBe(500);
    // actual mapped per 3b
    expect(by.MAT.actual).toBe(120);
    expect(by.LAB.actual).toBe(250);
    expect(by.SUB.actual).toBe(400); // sub_labour, even with no coded lines
    expect(by.EQP.actual).toBe(0);   // no equipment actual source in v1
    // variance = actual − estimated
    expect(by.MAT.variance).toBe(20);   // 120 − 100
    expect(by.LAB.variance).toBe(-50);  // 250 − 300
    expect(by.SUB.variance).toBe(400);  // 400 − 0 (unplanned sub cost)
    expect(by.EQP.variance).toBe(-500); // 0 − 500
  });

  it("nothing is lost — an uncoded labour line still shows under LAB", async () => {
    h.lines = [{ job_id: "job1", line_kind: "labour", quantity: 5, unit_cost: 40, cost_code_id: null }];
    const bd = await getCostBreakdownByCode({ jobId: "job1" });
    expect(bd.rows.find((r) => r.code === "LAB")?.estimated).toBe(200);
  });
});
