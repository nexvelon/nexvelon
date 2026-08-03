// PERF-1 — the board ASSEMBLES existing figures (it must MAP, not recompute):
// Budgeted←Estimated leg, Actual←rollup (single spent basis), Earned←WIP,
// Projected←forecast helper. Sub is actual-side only (no fabricated budgeted-
// sub); labour Hours/Cost-Hr come from the labour-hours sum; the Quoted 5th
// baseline appears only with a frozen snapshot; and none of the dropped figures
// (Rev/Hr, GM/Hr, Misc, Defer-Revenue) exist on the shape.

import { describe, it, expect, vi } from "vitest";

function leg(revenue: number, materials: number, labour: number, sub: number, cost: number, margin: number) {
  return { revenue, materials, labour, sub_labour: sub, cost, margin_pct: margin };
}

const h = vi.hoisted(() => ({
  variance: {
    has_quoted_baseline: true,
    quoted: leg(1000, 300, 200, 0, 500, 50),
    estimated: leg(1000, 350, 250, 0, 600, 40),
    actual: leg(900, 400, 300, 100, 800, 11.1),
  },
  wipRollup: {
    estimated_cost: 600 as number | null, actual_cost: 800 as number | null,
    pct_complete: 0.9 as number | null, earned: 900,
    billed: 700, over_under: -200 as number | null, position: "underbilled", holdback_retained: 50,
    remaining_to_bill: 300, indeterminate_jobs: 0, contract: 1000,
  },
  hours: 20,
}));

vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: vi.fn(async () => ({
    perProject: { contract: 1000, variance: h.variance },
    perCostCenter: {},
    byJob: [],
  })),
}));
vi.mock("@/lib/api/wip", () => ({
  getProjectWip: vi.fn(async () => ({ project_id: "p1", jobs: [], rollup: h.wipRollup })),
  getJobWip: vi.fn(),
}));
vi.mock("@/lib/api/labour", () => ({
  sumLabourHoursForProject: vi.fn(async () => h.hours),
  sumLabourHoursForJob: vi.fn(async () => h.hours),
}));

import { getProjectPerformanceBoard } from "@/lib/api/performance-board";

describe("board assembly maps the right source per column", () => {
  it("Budgeted = Estimated leg; Actual = rollup actual; profit derived", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.budgeted).toMatchObject({ revenue: 1000, materials: 350, labour: 250, cost: 600, profit: 400, margin_pct: 40 });
    expect(b.actual).toMatchObject({ revenue: 900, materials: 400, labour: 300, cost: 800, profit: 100 });
  });

  it("Earned = WIP earned + % complete (no fabricated earned cost/profit)", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.earned).toEqual({ revenue: 900, pct_complete: 0.9 });
  });

  it("Projected = forecast helper (overrun → actual; profit = contract − proj cost)", async () => {
    const b = await getProjectPerformanceBoard("p1");
    // actual 800 > estimated 600 → projected cost 800; profit 1000−800=200; margin 20
    expect(b.projected).toEqual({ revenue: 1000, cost: 800, profit: 200, margin_pct: 20 });
  });

  it("Sub is ACTUAL-side only — no fabricated budgeted/quoted sub baseline", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.actual.sub).toBe(100);
    expect(b.budgeted.sub).toBeNull();
    expect(b.quoted?.sub).toBeNull();
  });

  it("labour Hours = Σ hours; Cost/Hr = labour cost ÷ hours", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.labour).toEqual({ hours: 20, cost: 300, cost_per_hour: 15 });
  });

  it("billing: over/under + un-posted (earned − billed) + retention", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.billing).toMatchObject({ billed: 700, over_under: -200, un_posted: 200, retention: 50, remaining_to_bill: 300 });
  });

  it("Quoted 5th baseline present when a snapshot exists; absent otherwise", async () => {
    const b = await getProjectPerformanceBoard("p1");
    expect(b.has_quoted).toBe(true);
    expect(b.quoted).not.toBeNull();
    h.variance = { ...h.variance, has_quoted_baseline: false };
    const b2 = await getProjectPerformanceBoard("p1");
    expect(b2.has_quoted).toBe(false);
    expect(b2.quoted).toBeNull();
    h.variance = { ...h.variance, has_quoted_baseline: true };
  });

  it("NONE of the dropped figures exist on the shape (Rev/Hr, GM/Hr, Misc, Defer)", async () => {
    const b = await getProjectPerformanceBoard("p1");
    const flat = JSON.stringify(b).toLowerCase();
    expect(Object.keys(b.labour)).toEqual(["hours", "cost", "cost_per_hour"]); // no rev_per_hour / gm_per_hour
    expect(flat).not.toContain("rev_per_hour");
    expect(flat).not.toContain("gm_per_hour");
    expect(flat).not.toContain("misc");
    expect(flat).not.toContain("defer");
  });
});

describe("honest empties: no estimate → % complete + Projected null", () => {
  it("has_estimate false ⇒ projected all null", async () => {
    h.wipRollup = { ...h.wipRollup, estimated_cost: 0, pct_complete: null };
    const b = await getProjectPerformanceBoard("p1");
    expect(b.has_estimate).toBe(false);
    expect(b.projected).toEqual({ revenue: null, cost: null, profit: null, margin_pct: null });
    h.wipRollup = { ...h.wipRollup, estimated_cost: 600, pct_complete: 0.9 };
  });
});
