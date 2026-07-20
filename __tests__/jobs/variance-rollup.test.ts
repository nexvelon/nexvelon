// PROJ2-6b — Quoted/Estimated/Actual/Variance blocks on the cost rollup.
// Quoted reads the §2.2 quoted_* snapshots; Estimated reads live values;
// Actual comes from the existing legs (invoiced / stock cost / labour).
// Variance: revenue + margin vs Quoted (Estimated stands in when no snapshot),
// cost legs vs Estimated. The whole block redacts to null without
// financials:edit, and the project block aggregates all jobs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  ccs: [] as Record<string, unknown>[],
  stock: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  labourByCc: {} as Record<string, number>,
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "project_cost_centers":
      return { data: s.ccs, error: null };
    case "inventory_stock":
      return { data: s.stock, error: null };
    case "inventory_products":
      return { data: [], error: null };
    case "invoices":
      return { data: s.invoices, error: null };
    case "purchase_orders":
      return { data: [], error: null };
    case "project_jobs":
      return { data: s.jobs, error: null };
    case "job_line_items":
      return { data: s.lines, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/labour", () => ({
  sumLabourCostByCostCenter: async () => s.labourByCc,
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => s.profile,
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: vi.fn(),
}));

import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getProjectCostRollupAction } from "@/app/(app)/projects/rollup-actions";

// Mixed fixture — Main Job j1: two quoted lines (part + labour) that drifted,
// plus one manual line without quoted_*; C.O j2: fully manual, no lines, no
// invoices (revenue 0 → margin null-safety).
function seedFixture() {
  s.ccs = [
    { id: "cc1", contract_value: 1000, job_id: "j1" },
    { id: "cc2", contract_value: 500, job_id: "j2" },
  ];
  s.stock = [
    {
      product_id: "prod1",
      quantity: 2,
      unit_cost: 50,
      custody_status: "on_site",
      current_cost_center_id: "cc1",
    },
  ];
  s.labourByCc = { cc1: 200 };
  s.invoices = [{ total: 1200, status: "sent", job_id: "j1" }];
  s.jobs = [
    {
      id: "j1",
      job_type: "main_job",
      co_number: null,
      title: "Main",
      status: "active",
      contract_value: 1000,
    },
    {
      id: "j2",
      job_type: "change_order",
      co_number: 1,
      title: "CO",
      status: "active",
      contract_value: 500,
    },
  ];
  s.lines = [
    {
      job_id: "j1",
      line_kind: "part",
      quantity: 2,
      unit_cost: 110,
      unit_price: 320,
      discount_pct: 0,
      quoted_quantity: 2,
      quoted_unit_cost: 100,
      quoted_unit_price: 300,
      quoted_discount_pct: 0,
    },
    {
      job_id: "j1",
      line_kind: "labour",
      quantity: 10,
      unit_cost: 30,
      unit_price: 50,
      discount_pct: 0,
      quoted_quantity: 10,
      quoted_unit_cost: 30,
      quoted_unit_price: 50,
      quoted_discount_pct: 0,
    },
    {
      job_id: "j1",
      line_kind: "part",
      quantity: 1,
      unit_cost: 40,
      unit_price: 100,
      discount_pct: 0,
      quoted_quantity: null,
      quoted_unit_cost: null,
      quoted_unit_price: null,
      quoted_discount_pct: null,
    },
  ];
}

beforeEach(() => {
  seedFixture();
  s.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("per-Job variance block", () => {
  it("computes quoted/estimated/actual/variance from a mixed fixture", async () => {
    const { byJob } = await getProjectCostRollup("p1");
    const j1 = byJob.find((j) => j.job_id === "j1")!;
    const v = j1.variance!;

    expect(v.has_quoted_baseline).toBe(true);

    // Quoted (snapshots only — the manual line is excluded):
    // revenue 2×300 + 10×50 = 1100; materials 2×100 = 200; labour 10×30 = 300.
    expect(v.quoted).toEqual({
      revenue: 1100,
      materials: 200,
      labour: 300,
      cost: 500,
      margin_pct: 54.55,
    });

    // Estimated (live values, ALL lines):
    // revenue 640 + 500 + 100 = 1240; materials 220 + 40 = 260; labour 300.
    expect(v.estimated).toEqual({
      revenue: 1240,
      materials: 260,
      labour: 300,
      cost: 560,
      margin_pct: 54.84,
    });

    // Actual: invoiced 1200; stock 100; labour 200.
    expect(v.actual).toEqual({
      revenue: 1200,
      materials: 100,
      labour: 200,
      cost: 300,
      margin_pct: 75,
    });

    // Variance: revenue vs Quoted; cost legs vs Estimated; margin in points.
    expect(v.variance).toEqual({
      revenue: 100, // 1200 − 1100
      materials: -160, // 100 − 260
      labour: -100, // 200 − 300
      cost: -260, // 300 − 560
      margin_pts: 20.45, // 75 − 54.55
    });

    // Pre-existing rollup fields are untouched.
    expect(j1.contract).toBe(1000);
    expect(j1.materials).toBe(100);
    expect(j1.labour).toBe(200);
    expect(j1.invoiced).toBe(1200);
  });

  it("is null-safe on margin_pts when revenue is 0 (no baseline, no invoices)", async () => {
    const { byJob } = await getProjectCostRollup("p1");
    const j2 = byJob.find((j) => j.job_id === "j2")!;
    const v = j2.variance!;

    expect(v.has_quoted_baseline).toBe(false);
    expect(v.quoted.margin_pct).toBeNull();
    expect(v.estimated.margin_pct).toBeNull();
    expect(v.actual.margin_pct).toBeNull();
    expect(v.variance.margin_pts).toBeNull();
    expect(v.variance.revenue).toBe(0);
  });
});

describe("project-level aggregate", () => {
  it("equals the sum of the jobs' legs", async () => {
    const { perProject, byJob } = await getProjectCostRollup("p1");
    const pv = perProject.variance!;

    const sum = (pick: (j: (typeof byJob)[number]) => number) =>
      byJob.reduce((acc, j) => acc + pick(j), 0);

    expect(pv.quoted.revenue).toBe(sum((j) => j.variance!.quoted.revenue));
    expect(pv.quoted.cost).toBe(sum((j) => j.variance!.quoted.cost));
    expect(pv.estimated.revenue).toBe(sum((j) => j.variance!.estimated.revenue));
    expect(pv.estimated.cost).toBe(sum((j) => j.variance!.estimated.cost));
    expect(pv.actual.revenue).toBe(sum((j) => j.variance!.actual.revenue));
    expect(pv.actual.materials).toBe(sum((j) => j.variance!.actual.materials));
    expect(pv.actual.labour).toBe(sum((j) => j.variance!.actual.labour));
    // Aggregate margin is recomputed from the summed legs, not averaged.
    expect(pv.actual.margin_pct).toBe(75);
    expect(pv.has_quoted_baseline).toBe(true);
  });
});

describe("financials redaction", () => {
  it("dashes the ENTIRE variance block for callers without financials:edit", async () => {
    s.profile = { id: "u2", role: "Technician", status: "Active" };

    const res = await getProjectCostRollupAction("p1");
    if (!res.ok) throw new Error(res.error);

    expect(res.data.canSeeFinancials).toBe(false);
    expect(res.data.rollup.perProject.variance).toBeNull();
    for (const j of res.data.rollup.byJob) {
      expect(j.variance).toBeNull();
    }
  });

  it("keeps the block intact for financials callers", async () => {
    const res = await getProjectCostRollupAction("p1");
    if (!res.ok) throw new Error(res.error);
    expect(res.data.canSeeFinancials).toBe(true);
    expect(res.data.rollup.perProject.variance).not.toBeNull();
  });
});
