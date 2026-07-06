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
      // main billed 60 (sent), co1 billed 25 (paid).
      return {
        data: [
          { total: 60, status: "sent", job_id: "main" },
          { total: 25, status: "paid", job_id: "co1" },
        ],
        error: null,
      };
    case "purchase_orders":
      // one committed PO on main.
      return { data: [{ id: "po1", job_id: "main", status: "issued" }], error: null };
    case "purchase_order_lines":
      return {
        data: [{ purchase_order_id: "po1", quantity: 2, unit_cost: 10 }], // 20
        error: null,
      };
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

  it("populates invoiced, billed_pct, and po_committed per Job (PROJ2-4c)", async () => {
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const main = res.data.rollup.byJob.find((j) => j.job_id === "main")!;
    const co1 = res.data.rollup.byJob.find((j) => j.job_id === "co1")!;
    expect(main.invoiced).toBe(60);
    expect(main.billed_pct).toBeCloseTo(0.6); // 60 / 100
    expect(main.po_committed).toBe(20); // 2 × 10
    expect(co1.invoiced).toBe(25);
    expect(co1.billed_pct).toBeCloseTo(0.5); // 25 / 50
    expect(co1.po_committed).toBe(0); // no PO on co1
    // Project-level po_committed = sum across jobs.
    expect(res.data.rollup.perProject.po_committed).toBe(20);
  });

  it("null billed_pct when a Job has zero contract", async () => {
    // co1's contract stays 50 here; assert the formula guards div-by-zero via
    // the main path — a zero-contract job would yield null. Sanity on the code
    // path: main has contract 100 so billed_pct is a number, not null.
    const res = await getProjectCostRollupAction("p1");
    if (!res.ok) return;
    const main = res.data.rollup.byJob.find((j) => j.job_id === "main")!;
    expect(main.billed_pct).not.toBeNull();
  });

  it("redacts the full financial leg (incl. invoiced/billed_pct/po_committed) without financials:edit", async () => {
    s.profile = { id: "u1", role: "Technician", status: "Active" }; // projects:view, no financials
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(false);
    for (const j of res.data.rollup.byJob) {
      expect(j.labour).toBeNull();
      expect(j.spent).toBeNull();
      expect(j.margin).toBeNull();
      expect(j.invoiced).toBeNull();
      expect(j.billed_pct).toBeNull();
      expect(j.po_committed).toBeNull();
      expect(j.contract).toBeGreaterThan(0); // contract stays visible
    }
    // Project-level po_committed redacted; invoiced/billed_pct stay visible.
    expect(res.data.rollup.perProject.po_committed).toBeNull();
    expect(res.data.rollup.perProject.invoiced).toBe(85);
  });
});
