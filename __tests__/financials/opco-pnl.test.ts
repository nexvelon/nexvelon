// FIN-8 — per-opco P&L + portfolio. The load-bearing rule: the two operating
// companies are NEVER blended into one statement (same as FIN-7's remittance).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

// One P&L per project id, keyed for the mock to return.
const s = vi.hoisted(() => ({
  projects: [] as { id: string; opco: string }[],
  // per-project fixtures the rollup + revenue reads pull from, keyed by id
  byProject: {} as Record<string, {
    subtotal: number;
    billed: number;
    labour: number;
    contract: number;
  }>,
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
    if (f.method === "neq") out = out.filter((r) => r[col] !== val);
  }
  return out;
}

function currentProject(filters: ChainCtx["filters"]): string | null {
  const eq = filters.find((f) => f.method === "eq" && f.args[0] === "id" || (f.method === "eq" && f.args[0] === "project_id"));
  return (eq?.args[1] as string) ?? null;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "projects": {
      if (single) {
        const id = filt(
          s.projects.map((p) => ({ ...p, project_number: p.id, title: p.id, status: "active", client: { name: "C" } })),
          ctx.filters
        )[0];
        return { data: id ?? null, error: null };
      }
      return { data: s.projects.map((p) => ({ id: p.id })), error: null };
    }
    case "invoices": {
      const pid = currentProject(ctx.filters);
      const f = pid ? s.byProject[pid] : null;
      return {
        data: f ? [{ id: `${pid}-i1`, project_id: pid, subtotal: f.subtotal, holdback_amount: 0, amount_due: f.subtotal, status: "paid" }] : [],
        error: null,
      };
    }
    case "project_cost_centers": {
      const pid = currentProject(ctx.filters);
      const f = pid ? s.byProject[pid] : null;
      return { data: f ? [{ id: `${pid}-cc`, contract_value: f.contract, job_id: `${pid}-j` }] : [], error: null };
    }
    case "project_jobs": {
      const pid = currentProject(ctx.filters);
      const f = pid ? s.byProject[pid] : null;
      return { data: f ? [{ id: `${pid}-j`, job_type: "main_job", co_number: null, title: "M", status: "active", contract_value: f.contract }] : [], error: null };
    }
    case "vendor_bills": {
      const pid = currentProject(ctx.filters);
      const f = pid ? s.byProject[pid] : null;
      // billed_cost path (status != void) + AP path
      return { data: f ? [{ id: `${pid}-b`, project_id: pid, subtotal: f.billed, tax_amount: 0, total: f.billed, job_id: `${pid}-j`, status: "received" }] : [], error: null };
    }
    case "inventory_stock":
    case "inventory_products":
    case "purchase_orders":
    case "invoice_payments":
    case "bill_payments":
    case "project_deposits":
    case "deposit_applications":
    case "job_line_items":
      return { data: [], error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
// labour is looked up per cost-center id; return the project's labour for its cc
vi.mock("@/lib/api/labour", () => ({
  sumLabourCostByCostCenter: async (projectId: string) => {
    const f = s.byProject[projectId];
    return f ? { [`${projectId}-cc`]: f.labour } : {};
  },
}));

import { getOpcoPnl, getPnlPortfolio } from "@/lib/api/project-pnl";

beforeEach(() => {
  s.projects = [
    { id: "pIS", opco: "integrated_solutions" },
    { id: "pG1", opco: "guardian" },
    { id: "pG2", opco: "guardian" },
  ];
  s.byProject = {
    // IS: rev 1000, cost 600 → GP 400 (40%)
    pIS: { subtotal: 1000, billed: 400, labour: 200, contract: 1000 },
    // G1: rev 500, cost 300 → GP 200 (40%)
    pG1: { subtotal: 500, billed: 200, labour: 100, contract: 500 },
    // G2: rev 100, cost 250 → GP -150 (loss)
    pG2: { subtotal: 100, billed: 250, labour: 0, contract: 400 },
  };
});

describe("getOpcoPnl", () => {
  it("returns BOTH opcos separately, never blended", async () => {
    const rows = await getOpcoPnl();
    expect(rows).toHaveLength(2);
    const is = rows.find((r) => r.opco === "integrated_solutions");
    const gu = rows.find((r) => r.opco === "guardian");

    expect(is).toMatchObject({
      project_count: 1,
      revenue: 1000,
      canonical_direct: 600,
      gross_profit: 400,
      gross_margin_pct: 40,
    });
    // Guardian aggregates its two projects: rev 600, cost 550, GP 50
    expect(gu).toMatchObject({
      project_count: 2,
      revenue: 600,
      canonical_direct: 550,
      gross_profit: 50,
    });
    // and there is no combined row
    expect(rows.some((r) => r.opco === "combined" || r.opco === "unassigned")).toBe(false);
  });

  it("filters to a single opco when asked", async () => {
    const rows = await getOpcoPnl({ opco: "guardian" });
    expect(rows).toHaveLength(1);
    expect(rows[0].opco).toBe("guardian");
  });
});

describe("getPnlPortfolio", () => {
  it("one row per project, sorted by margin desc, loss last", async () => {
    const rows = await getPnlPortfolio();
    expect(rows).toHaveLength(3);
    // pIS and pG1 both 40%; pG2 is the loss and must sort last
    expect(rows[rows.length - 1].project_id).toBe("pG2");
    expect(rows[rows.length - 1].gross_profit).toBeLessThan(0);
  });
});
