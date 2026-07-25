// PROJ2-18 — WIP accounting. The cost-to-cost method, the pre-tax billed basis,
// the over/(under) SIGN convention (billed − earned; >0 overbilled liability,
// <0 underbilled asset), holdback-as-memo (never moves the position), and the
// COST-WEIGHTED project pct (Σactual/Σestimated, not the mean of job pcts).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  byJob: [] as Record<string, unknown>[],
}));

function job(over: Record<string, unknown>) {
  return {
    job_id: "j1", title: "Main", job_type: "main_job", co_number: null,
    contract: 0, spent: 0, variance: { estimated: { cost: 0 } },
    ...over,
  };
}

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
  if (ctx.table === "invoices") return { data: filt(h.invoices, ctx.filters), error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: async () => ({ perProject: {}, byJob: h.byJob }),
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => ({ id: "j1", project_id: "p1" }),
}));

import { getJobWip, getProjectWip } from "@/lib/api/wip";

beforeEach(() => {
  h.invoices = [];
  h.byJob = [];
});

describe("pct_complete — cost-to-cost, capped, null when no estimate", () => {
  it("= actual / estimated", async () => {
    h.byJob = [job({ contract: 1000, spent: 300, variance: { estimated: { cost: 600 } } })];
    const w = (await getJobWip("j1"))!;
    expect(w.pct_complete).toBe(0.5); // 300 / 600
    expect(w.pct_complete_method).toBe("cost_to_cost");
  });

  it("caps at 100% on an overrun (and remaining_cost goes negative)", async () => {
    h.byJob = [job({ contract: 1000, spent: 800, variance: { estimated: { cost: 500 } } })];
    const w = (await getJobWip("j1"))!;
    expect(w.pct_complete).toBe(1); // min(1, 800/500)
    expect(w.remaining_cost).toBe(-300); // 500 − 800
  });

  it("is NULL (indeterminate) when there is no estimate — not 100%", async () => {
    h.byJob = [job({ contract: 1000, spent: 300, variance: { estimated: { cost: 0 } } })];
    const w = (await getJobWip("j1"))!;
    expect(w.pct_complete).toBeNull();
    expect(w.earned).toBeNull();
    expect(w.over_under).toBeNull();
    expect(w.position).toBe("indeterminate");
    // billing side stays computable
    expect(w.remaining_to_bill).toBe(1000);
  });
});

describe("earned + billed + the over/(under) sign convention", () => {
  it("earned = contract × pct; billed = Σ issued subtotal (PRE-TAX)", async () => {
    h.byJob = [job({ contract: 1000, spent: 300, variance: { estimated: { cost: 600 } } })];
    // two issued invoices; subtotal is pre-tax; total (post-tax) must be ignored
    h.invoices = [
      { project_id: "p1", job_id: "j1", subtotal: 400, holdback_amount: 0, status: "sent", total: 452 },
      { project_id: "p1", job_id: "j1", subtotal: 100, holdback_amount: 0, status: "paid", total: 113 },
    ];
    const w = (await getJobWip("j1"))!;
    expect(w.earned).toBe(500); // 1000 × 0.5
    expect(w.billed).toBe(500); // 400 + 100 pre-tax (not 565 post-tax)
    expect(w.over_under).toBe(0); // even
    expect(w.position).toBe("even");
  });

  it("billed > earned → OVERBILLED (positive over_under, a liability)", async () => {
    h.byJob = [job({ contract: 1000, spent: 300, variance: { estimated: { cost: 600 } } })]; // earned 500
    h.invoices = [{ project_id: "p1", job_id: "j1", subtotal: 700, holdback_amount: 0, status: "sent" }];
    const w = (await getJobWip("j1"))!;
    expect(w.over_under).toBe(200); // 700 − 500
    expect(w.position).toBe("overbilled");
  });

  it("billed < earned → UNDERBILLED (negative over_under, an asset)", async () => {
    h.byJob = [job({ contract: 1000, spent: 300, variance: { estimated: { cost: 600 } } })]; // earned 500
    h.invoices = [{ project_id: "p1", job_id: "j1", subtotal: 300, holdback_amount: 0, status: "sent" }];
    const w = (await getJobWip("j1"))!;
    expect(w.over_under).toBe(-200); // 300 − 500
    expect(w.position).toBe("underbilled");
  });
});

describe("holdback is a MEMO — never moves the position", () => {
  it("retained holdback shows on the memo but not in over_under", async () => {
    h.byJob = [job({ contract: 1000, spent: 500, variance: { estimated: { cost: 500 } } })]; // pct 1, earned 1000
    // billed 1000 pre-tax with 100 held back
    h.invoices = [{ project_id: "p1", job_id: "j1", subtotal: 1000, holdback_amount: 100, status: "sent" }];
    const w = (await getJobWip("j1"))!;
    expect(w.holdback_retained).toBe(100);
    expect(w.over_under).toBe(0); // 1000 billed − 1000 earned; holdback did NOT reduce billed
    expect(w.position).toBe("even");
  });
});

describe("project pct is COST-WEIGHTED, not the mean of job pcts", () => {
  it("Σactual / Σestimated differs from averaging the job percentages", async () => {
    h.byJob = [
      // job A: 90/100 = 90%
      { project_id: "p1", job_id: "jA", title: "A", job_type: "main_job", co_number: null, contract: 200, spent: 90, variance: { estimated: { cost: 100 } } },
      // job B: 10/900 ≈ 1.1%
      { project_id: "p1", job_id: "jB", title: "B", job_type: "change_order", co_number: 1, contract: 2000, spent: 10, variance: { estimated: { cost: 900 } } },
    ];
    const p = await getProjectWip("p1");
    // weighted: (90+10) / (100+900) = 100/1000 = 10%
    expect(p.rollup.pct_complete).toBe(0.1);
    // the naive AVERAGE of job pcts would be (0.9 + 0.011)/2 ≈ 45.5% — very different
    const avg = (p.jobs[0].pct_complete! + p.jobs[1].pct_complete!) / 2;
    expect(avg).toBeGreaterThan(0.4);
    expect(p.rollup.pct_complete).not.toBeCloseTo(avg, 2);
  });

  it("project over_under = Σ per-job (billed − earned)", async () => {
    h.byJob = [
      { project_id: "p1", job_id: "jA", title: "A", job_type: "main_job", co_number: null, contract: 1000, spent: 250, variance: { estimated: { cost: 500 } } }, // pct .5, earned 500
      { project_id: "p1", job_id: "jB", title: "B", job_type: "change_order", co_number: 1, contract: 1000, spent: 500, variance: { estimated: { cost: 500 } } }, // pct 1, earned 1000
    ];
    h.invoices = [
      { project_id: "p1", job_id: "jA", subtotal: 700, holdback_amount: 0, status: "sent" }, // +200 over
      { project_id: "p1", job_id: "jB", subtotal: 600, holdback_amount: 0, status: "sent" }, // −400 under
    ];
    const p = await getProjectWip("p1");
    expect(p.rollup.earned).toBe(1500);
    expect(p.rollup.billed).toBe(1300);
    expect(p.rollup.over_under).toBe(-200); // 1300 − 1500 net underbilled
    expect(p.rollup.position).toBe("underbilled");
  });
});
