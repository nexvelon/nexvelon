// INV-9-0 — the rollup materials-leg inclusion matrix, asserted cell by cell.
//
// A stock row at a cost-center counts as job material cost when ALL of:
//   status ∈ {in_stock, allocated, consumed}   ('retired' out)
//   custody_status ∉ {lost, returned}
//   rma_status IS NULL                          (not returned to vendor)
//
// status/rma are pushed to the query; custody is a JS exclusion. This mock
// honours all three so each cell reflects the real predicate.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type StockRow = Record<string, unknown> & {
  status: string;
  custody_status: string;
  rma_status: string | null;
  current_cost_center_id: string | null;
  unit_cost: number | null;
  quantity: number;
};

const h = vi.hoisted(() => ({ stock: [] as StockRow[] }));

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
  switch (ctx.table) {
    case "inventory_stock":
      return { data: applyFilters(h.stock, ctx.filters), error: null };
    case "project_cost_centers":
      return { data: [{ id: "cc1", contract_value: 1000, job_id: "j1" }], error: null };
    case "project_jobs":
      return {
        data: [
          {
            id: "j1",
            job_type: "main_job",
            co_number: null,
            title: "Main",
            status: "active",
            contract_value: 1000,
          },
        ],
        error: null,
      };
    default:
      return { data: [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/labour", () => ({ sumLabourCostByCostCenter: async () => ({}) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active" }) }));

import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";

function row(over: Partial<StockRow>): StockRow {
  return {
    product_id: "p1",
    quantity: 1,
    unit_cost: 100,
    status: "in_stock",
    custody_status: "in_stock",
    rma_status: null,
    current_cost_center_id: "cc1",
    ...over,
  };
}

async function materials(): Promise<number> {
  const r = await getProjectCostRollup("proj1");
  return r.perCostCenter.cc1.materials;
}

beforeEach(() => {
  h.stock = [];
});

// One row per cell → materials is 100 (included) or 0 (excluded).
const CELLS: Array<[string, Partial<StockRow>, boolean]> = [
  ["status in_stock / custody in_stock / no rma", {}, true],
  ["status allocated", { status: "allocated" }, true],
  ["status consumed", { status: "consumed" }, true],
  ["status consumed + custody delivered", { status: "consumed", custody_status: "delivered" }, true],
  ["status consumed + custody installed", { status: "consumed", custody_status: "installed" }, true],
  ["status retired", { status: "retired" }, false],
  ["custody lost", { custody_status: "lost" }, false],
  ["custody returned", { custody_status: "returned" }, false],
  ["rma_pending", { rma_status: "rma_pending" }, false],
  ["rma_shipped", { rma_status: "rma_shipped" }, false],
  ["rma_credited on a consumed row", { status: "consumed", rma_status: "rma_credited" }, false],
];

describe("materials-leg inclusion matrix (INV-9-0)", () => {
  it.each(CELLS)("%s → %s", async (_label, over, included) => {
    h.stock = [row(over)];
    expect(await materials()).toBe(included ? 100 : 0);
  });

  it("sums only the included rows across a mixed cost-center", async () => {
    h.stock = [
      row({ unit_cost: 10 }), // in_stock ✓
      row({ status: "allocated", unit_cost: 20 }), // ✓
      row({ status: "consumed", unit_cost: 40 }), // ✓
      row({ status: "retired", unit_cost: 1000 }), // ✗
      row({ custody_status: "lost", unit_cost: 2000 }), // ✗
      row({ rma_status: "rma_pending", unit_cost: 4000 }), // ✗
    ];
    expect(await materials()).toBe(70);
  });
});
