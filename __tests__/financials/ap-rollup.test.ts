// FIN-5 — billed_cost on the cost rollup. The whole point of this test file is
// the NO-DOUBLE-COUNT guarantee: receiving a PO already writes its line
// unit_cost onto inventory_stock (which `materials`/`spent` sums), so vendor
// bills must land in their OWN leg and leave the existing legs untouched.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  ccs: [] as Record<string, unknown>[],
  stock: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  labourByCc: {} as Record<string, number>,
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
}));

function filterRows(
  rows: Record<string, unknown>[],
  filters: ChainCtx["filters"]
): Record<string, unknown>[] {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
    if (f.method === "neq") out = out.filter((r) => r[col] !== val);
  }
  return out;
}

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
    case "vendor_bills":
      return { data: filterRows(s.bills, ctx.filters), error: null };
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
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => s.profile }));
vi.mock("@/lib/api/projects", () => ({ getJobById: vi.fn() }));

import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getProjectCostRollupAction } from "@/app/(app)/projects/rollup-actions";

beforeEach(() => {
  // One job, one cost center: 2 units of stock at $50 (received from a PO) and
  // $200 of labour. So materials = 100, labour = 200, spent = 300.
  s.ccs = [{ id: "cc1", contract_value: 1000, job_id: "j1" }];
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
  s.invoices = [];
  s.jobs = [
    {
      id: "j1",
      job_type: "main_job",
      co_number: null,
      title: "Main",
      status: "active",
      contract_value: 1000,
    },
  ];
  s.lines = [];
  s.bills = [];
  s.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("billed_cost leg", () => {
  it("sums bill SUBTOTALS per job — tax excluded", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 13, total: 113, job_id: "j1", status: "received" },
      { project_id: "p1", subtotal: 50, tax_amount: 6.5, total: 56.5, job_id: "j1", status: "paid" },
    ];
    const { byJob, perProject } = await getProjectCostRollup("p1");
    // 150, not 169.50 — tax is a pass-through, out of cost like it's out of margin
    expect(byJob[0].billed_cost).toBe(150);
    expect(perProject.billed_cost).toBe(150);
  });

  it("does NOT change spent / materials / labour — no double count", async () => {
    const before = await getProjectCostRollup("p1");
    expect(before.byJob[0].materials).toBe(100);
    expect(before.byJob[0].labour).toBe(200);
    expect(before.byJob[0].spent).toBe(300);
    expect(before.byJob[0].billed_cost).toBe(0);

    // Bill the very same PO-received materials.
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 13, total: 113, job_id: "j1", status: "received" },
    ];
    const after = await getProjectCostRollup("p1");

    // The cost legs are byte-identical; only the new supplementary leg moved.
    expect(after.byJob[0].materials).toBe(100);
    expect(after.byJob[0].labour).toBe(200);
    expect(after.byJob[0].spent).toBe(300);
    expect(after.byJob[0].margin).toBe(700);
    expect(after.byJob[0].billed_cost).toBe(100);
  });

  it("excludes void bills", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 13, total: 113, job_id: "j1", status: "received" },
      { project_id: "p1", subtotal: 999, tax_amount: 0, total: 999, job_id: "j1", status: "void" },
    ];
    const { byJob } = await getProjectCostRollup("p1");
    expect(byJob[0].billed_cost).toBe(100);
  });

  it("project-level counts unattributed-to-job bills; the job leg doesn't", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 0, total: 100, job_id: "j1", status: "received" },
      // project-attributed but no job (e.g. site-wide freight)
      { project_id: "p1", subtotal: 40, tax_amount: 0, total: 40, job_id: null, status: "received" },
    ];
    const { byJob, perProject } = await getProjectCostRollup("p1");
    expect(byJob[0].billed_cost).toBe(100);
    expect(perProject.billed_cost).toBe(140);
  });
});

describe("billed_cost redaction", () => {
  it("is nulled for callers without financials:edit", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 0, total: 100, job_id: "j1", status: "received" },
    ];
    s.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(false);
    expect(res.data.rollup.perProject.billed_cost).toBeNull();
    expect(res.data.rollup.byJob[0].billed_cost).toBeNull();
  });

  it("is visible to financials:edit holders", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 100, tax_amount: 0, total: 100, job_id: "j1", status: "received" },
    ];
    s.profile = { id: "u1", role: "Accountant", status: "Active" };
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rollup.byJob[0].billed_cost).toBe(100);
  });
});
