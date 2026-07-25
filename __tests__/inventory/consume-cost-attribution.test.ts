// INV-9-0 — regression guard for the consumed-inventory-drops-off-job-cost bug.
//
// The bug: consumeStock's PARTIAL path split off a 'consumed' row WITHOUT
// carrying current_cost_center_id, so the consumed portion fell out of the
// cost-center and the rollup's materials leg stopped counting it — consuming a
// part silently REMOVED its cost and overstated the job's margin. (The full
// path already kept the row in place with its cost-center, so it was unaffected;
// this suite pins both.)
//
// These tests run consumeStock and getProjectCostRollup against ONE shared
// in-memory stock store, so "consume, then re-read the job's materials cost" is
// exercised end to end. The partial-consume case FAILS on the old code
// (materials drops from 100 → 50) and PASSES on the fix (stays 100).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type StockRow = Record<string, unknown> & {
  id: string;
  status: string;
  custody_status: string;
  rma_status: string | null;
  current_cost_center_id: string | null;
  current_location_id: string | null;
  unit_cost: number | null;
  quantity: number;
};

const h = vi.hoisted(() => ({
  stock: [] as StockRow[],
  movements: [] as Record<string, unknown>[],
  ccs: [] as { id: string; contract_value: number; job_id: string }[],
  seq: 0,
  profile: {
    id: "u1",
    display_name: "Tester",
    first_name: null,
    last_name: null,
    email: "t@x.co",
  } as Record<string, unknown> | null,
}));

// Apply the eq/in/is filters the code actually uses, so the mock behaves like
// the real query (the whole point — the rollup's status/rma predicates must be
// honoured for these assertions to mean anything).
function applyFilters(rows: StockRow[], filters: ChainCtx["filters"]): StockRow[] {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
    else if (f.method === "is" && a[1] === null) out = out.filter((r) => r[col] == null);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "inventory_stock": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        const row: StockRow = {
          custody_status: "in_stock",
          rma_status: null,
          current_cost_center_id: null,
          current_location_id: null,
          ...p,
          id: `sp${++h.seq}`,
        } as StockRow;
        h.stock.push(row);
        return { data: single ? { id: row.id } : [{ id: row.id }], error: null };
      }
      if (ctx.op === "update") {
        const target = applyFilters(h.stock, ctx.filters);
        for (const r of target) Object.assign(r, ctx.payload as object);
        return {
          data: single ? (target[0] ?? null) : target.map((r) => ({ id: r.id })),
          error: null,
        };
      }
      const rows = applyFilters(h.stock, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "stock_movements":
      if (ctx.op === "insert") {
        h.movements.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: [], error: null };
    case "project_cost_centers": {
      if (single) {
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        const cc = h.ccs.find((c) => c.id === id);
        return {
          data: cc
            ? { id: cc.id, cc_number: "CC1", name: "Main", project: { project_number: "P-1" } }
            : null,
          error: null,
        };
      }
      return { data: h.ccs, error: null };
    }
    case "project_jobs":
      return {
        data: h.ccs.map((c) => ({
          id: c.job_id,
          job_type: "main_job",
          co_number: null,
          title: "Main",
          status: "active",
          contract_value: c.contract_value,
        })),
        error: null,
      };
    default:
      return { data: [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/labour", () => ({ sumLabourCostByCostCenter: async () => ({}) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { consumeStock } from "@/lib/api/products";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";

function makeRow(over: Partial<StockRow>): StockRow {
  return {
    id: "u1",
    product_id: "p1",
    quantity: 1,
    unit_cost: 50,
    status: "in_stock",
    custody_status: "in_stock",
    rma_status: null,
    current_cost_center_id: "cc1",
    current_location_id: null,
    serial_number: null,
    location: null,
    supplier: null,
    po_number: null,
    acquired_at: null,
    notes: null,
    ...over,
  };
}

async function materials(cc = "cc1"): Promise<number> {
  const r = await getProjectCostRollup("proj1");
  return r.perCostCenter[cc].materials;
}

beforeEach(() => {
  h.stock = [];
  h.movements = [];
  h.ccs = [{ id: "cc1", contract_value: 1000, job_id: "j1" }];
  h.seq = 0;
  h.profile = {
    id: "u1",
    display_name: "Tester",
    first_name: null,
    last_name: null,
    email: "t@x.co",
  };
});

describe("consumed inventory stays booked as job cost (INV-9-0)", () => {
  it("PARTIAL consume of a job-placed lot keeps the full cost booked (the bug)", async () => {
    // A bulk lot of 2 @ $50 on the job → $100 of material cost.
    h.stock = [makeRow({ id: "u1", quantity: 2, unit_cost: 50 })];
    expect(await materials()).toBe(100);

    // Consume 1 → source shrinks to 1, a consumed row of 1 splits off.
    await consumeStock("u1", 1, { ref: "Q-1" });

    // Old code nulled the split row's cost-center → materials fell to 50.
    // The fix carries the cost-center, so all $100 stays booked.
    expect(await materials()).toBe(100);
  });

  it("FULL consume of a job-placed unit keeps its cost booked", async () => {
    h.stock = [makeRow({ id: "u1", quantity: 1, unit_cost: 70 })];
    expect(await materials()).toBe(70);
    await consumeStock("u1", 1, { ref: "Q-2" });
    expect(await materials()).toBe(70);
    // The row is flagged consumed but still points at the cost-center.
    const row = h.stock.find((r) => r.id === "u1")!;
    expect(row.status).toBe("consumed");
    expect(row.current_cost_center_id).toBe("cc1");
  });

  it("records a consumption movement carrying the job/cost-center linkage", async () => {
    h.stock = [makeRow({ id: "u1", quantity: 1, unit_cost: 50 })];
    await consumeStock("u1", 1, { ref: "Q-3" });
    const mv = h.movements.at(-1)!;
    expect(mv.to_type).toBe("consumed");
    expect(mv.from_type).toBe("job");
    expect(mv.from_id).toBe("cc1");
    expect(mv.note).toBe("Committed to Q-3");
  });

  it("no OTHER rollup leg moves when a unit is consumed", async () => {
    h.stock = [makeRow({ id: "u1", quantity: 2, unit_cost: 50 })];
    const before = await getProjectCostRollup("proj1");
    await consumeStock("u1", 1, { ref: "Q-4" });
    const after = await getProjectCostRollup("proj1");
    // Materials is unchanged (the fix), and so is everything downstream of it.
    expect(after).toEqual(before);
  });
});

describe("genuine non-cost states still drop out", () => {
  it.each([
    ["lost custody", { custody_status: "lost" }],
    ["returned custody", { custody_status: "returned" }],
    ["retired status", { status: "retired" }],
    ["being RMA'd", { rma_status: "rma_pending" }],
  ])("%s is excluded from materials", async (_label, over) => {
    h.stock = [makeRow({ id: "u1", quantity: 1, unit_cost: 999, ...over })];
    expect(await materials()).toBe(0);
  });
});

describe("regression invariant — a job with no consumed inventory is unchanged", () => {
  it("plain in_stock rows sum on the unchanged basis (unit_cost · qty)", async () => {
    h.stock = [
      makeRow({ id: "a", quantity: 3, unit_cost: 10 }),
      makeRow({ id: "b", quantity: 1, unit_cost: 25 }),
    ];
    expect(await materials()).toBe(55);
  });
});
