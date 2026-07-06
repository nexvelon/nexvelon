// PROJ2-4a — getProjectCostRollup gains byJob[]; the action redacts financials
// across byJob identically to project/cost-center rows.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "project_cost_centers":
      return {
        data: [
          { id: "cc1", contract_value: 100, job_id: "main" },
          { id: "cc2", contract_value: 50, job_id: "co1" },
        ],
        error: null,
      };
    case "inventory_stock":
      return { data: [], error: null };
    case "invoices":
      return { data: [], error: null };
    case "project_jobs":
      return {
        data: [
          { id: "main", job_type: "main_job", co_number: null, title: "Main", status: "active", contract_value: 100 },
          { id: "co1", job_type: "change_order", co_number: 1, title: "CO1", status: "active", contract_value: 50 },
        ],
        error: null,
      };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/labour", () => ({
  sumLabourCostByCostCenter: async () => ({}), // no labour
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => s.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getProjectCostRollupAction } from "@/app/(app)/projects/rollup-actions";

beforeEach(() => {
  s.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("rollup byJob", () => {
  it("returns one entry per Job with contract summed from its cost centers", async () => {
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byJob = res.data.rollup.byJob;
    expect(byJob).toHaveLength(2);
    const main = byJob.find((j) => j.job_id === "main")!;
    const co1 = byJob.find((j) => j.job_id === "co1")!;
    expect(main.contract).toBe(100);
    expect(co1.contract).toBe(50);
    // Main Job sorts first.
    expect(byJob[0].job_type).toBe("main_job");
    // Financials visible for Admin.
    expect(main.margin).toBe(100);
    expect(co1.margin).toBe(50);
  });

  it("redacts labour/spent/margin on byJob without financials:edit", async () => {
    s.profile = { id: "u1", role: "Technician", status: "Active" }; // projects:view, no financials
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(false);
    for (const j of res.data.rollup.byJob) {
      expect(j.labour).toBeNull();
      expect(j.spent).toBeNull();
      expect(j.margin).toBeNull();
      expect(j.contract).toBeGreaterThan(0); // contract stays visible
    }
  });
});
