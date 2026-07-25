// INV-9-2 (Part A) — consumption reconciliation is a thin derivation over the
// cost rollup: planned = the Estimated materials leg, actual = the INV-9-0
// materials leg, variance = actual − planned. Dollar-level only (honest flag).

import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  rollup: null as unknown,
}));

vi.mock("@/lib/api/projects", () => ({
  getJobById: async (id: string) => ({ id, project_id: "proj1" }),
}));
vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: async () => h.rollup,
}));

import { getJobConsumptionReconciliation } from "@/lib/api/consumption-recon";

function leg(materials: number) {
  return { revenue: 0, materials, labour: 0, sub_labour: 0, cost: materials, margin_pct: null };
}
function varianceBlock(planned: number, actual: number) {
  return {
    has_quoted_baseline: false,
    quoted: leg(planned),
    estimated: leg(planned),
    actual: leg(actual),
    variance: { revenue: 0, materials: actual - planned, labour: 0, sub_labour: 0, cost: actual - planned, margin_pts: null },
  };
}
function rollupWith(jobId: string, planned: number, actual: number) {
  return {
    perProject: {},
    perCostCenter: {},
    byJob: [{ job_id: jobId, variance: varianceBlock(planned, actual) }],
  };
}

describe("getJobConsumptionReconciliation", () => {
  it("planned = estimated leg, actual = materials leg, variance = actual − planned", async () => {
    h.rollup = rollupWith("j1", 1000, 1200);
    const r = await getJobConsumptionReconciliation("j1");
    expect(r.planned_materials).toBe(1000);
    expect(r.actual_materials).toBe(1200);
    expect(r.variance).toBe(200); // over-consumed
    expect(r.variance_pct).toBe(20);
    expect(r.planned_source).toBe("estimated");
    expect(r.sku_level_available).toBe(false);
  });

  it("under-consumption yields a negative variance", async () => {
    h.rollup = rollupWith("j1", 1000, 800);
    const r = await getJobConsumptionReconciliation("j1");
    expect(r.variance).toBe(-200);
    expect(r.variance_pct).toBe(-20);
  });

  it("variance_pct is null when nothing was planned", async () => {
    h.rollup = rollupWith("j1", 0, 150);
    const r = await getJobConsumptionReconciliation("j1");
    expect(r.planned_materials).toBe(0);
    expect(r.actual_materials).toBe(150);
    expect(r.variance).toBe(150);
    expect(r.variance_pct).toBeNull();
  });
});
