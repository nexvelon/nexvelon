// SUB-4 — the sub_labour cost leg. The partition (a sub bill leaves billed_cost
// and enters sub_labour; a supplier bill does the reverse), the fold into
// spent/margin, the zero-sub-bill REGRESSION INVARIANT (nothing existing moves),
// and the P&L gross-profit drop. This is the no-double-count guarantee's D2
// counterpart: sub labour IS in margin, materials bills still aren't.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  project: {
    id: "p1", project_number: "P-001", title: "Tower A",
    opco: "guardian", status: "active", client: { name: "Acme" },
  } as Record<string, unknown> | null,
  ccs: [] as Record<string, unknown>[],
  stock: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  invoicePayments: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  billPayments: [] as Record<string, unknown>[],
  deposits: [] as Record<string, unknown>[],
  depositApps: [] as Record<string, unknown>[],
  labourByCc: {} as Record<string, number>,
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

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "projects":
      return single
        ? { data: s.project, error: null }
        : { data: s.project ? [{ id: (s.project as { id: string }).id }] : [], error: null };
    case "project_cost_centers":
      return { data: s.ccs, error: null };
    case "inventory_stock":
      return { data: s.stock, error: null };
    case "inventory_products":
      return { data: [], error: null };
    case "invoices":
      return { data: filt(s.invoices, ctx.filters), error: null };
    case "invoice_payments":
      return { data: filt(s.invoicePayments, ctx.filters), error: null };
    case "project_jobs":
      return { data: s.jobs, error: null };
    case "job_line_items":
      return { data: s.lines, error: null };
    case "purchase_orders":
      return { data: [], error: null };
    case "vendor_bills":
      return { data: filt(s.bills, ctx.filters), error: null };
    case "bill_payments":
      return { data: filt(s.billPayments, ctx.filters), error: null };
    case "project_deposits":
      return { data: filt(s.deposits, ctx.filters), error: null };
    case "deposit_applications":
      return { data: filt(s.depositApps, ctx.filters), error: null };
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

import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getProjectPnl } from "@/lib/api/project-pnl";

beforeEach(() => {
  s.project = {
    id: "p1", project_number: "P-001", title: "Tower A",
    opco: "guardian", status: "active", client: { name: "Acme" },
  };
  // One job / cost center: 2 units @ $50 stock = 100 materials; 200 labour.
  s.ccs = [{ id: "cc1", contract_value: 1000, job_id: "j1" }];
  s.stock = [
    { product_id: "prod1", quantity: 2, unit_cost: 50, custody_status: "on_site", current_cost_center_id: "cc1" },
  ];
  s.labourByCc = { cc1: 200 };
  s.invoices = [];
  s.invoicePayments = [];
  s.jobs = [{ id: "j1", job_type: "main_job", co_number: null, title: "Main", status: "active", contract_value: 1000 }];
  s.lines = [];
  s.bills = [];
  s.billPayments = [];
  s.deposits = [];
  s.depositApps = [];
});

describe("SUB-4 partition — mutually exclusive legs", () => {
  it("a SUB bill lands in sub_labour and NOT billed_cost", async () => {
    s.bills = [
      { project_id: "p1", subcontractor_id: "sub1", subtotal: 500, tax_amount: 65, total: 565, job_id: "j1", status: "received" },
    ];
    const { byJob, perProject } = await getProjectCostRollup("p1");
    expect(byJob[0].sub_labour).toBe(500);
    expect(byJob[0].billed_cost).toBe(0); // NOT double-counted into the memo leg
    expect(perProject.sub_labour).toBe(500);
    expect(perProject.billed_cost).toBe(0);
  });

  it("a SUPPLIER bill lands in billed_cost and NOT sub_labour", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 300, tax_amount: 39, total: 339, job_id: "j1", status: "received" },
    ];
    const { byJob, perProject } = await getProjectCostRollup("p1");
    expect(byJob[0].billed_cost).toBe(300);
    expect(byJob[0].sub_labour).toBe(0);
    expect(perProject.billed_cost).toBe(300);
    expect(perProject.sub_labour).toBe(0);
  });

  it("a mixed set splits each dollar into exactly one leg (partition is total)", async () => {
    s.bills = [
      { project_id: "p1", subtotal: 300, tax_amount: 0, total: 300, job_id: "j1", status: "received" }, // supplier
      { project_id: "p1", subcontractor_id: "sub1", subtotal: 500, tax_amount: 0, total: 500, job_id: "j1", status: "received" },
      { project_id: "p1", subcontractor_id: "sub2", subtotal: 200, tax_amount: 0, total: 200, job_id: "j1", status: "received" },
    ];
    const { perProject } = await getProjectCostRollup("p1");
    expect(perProject.billed_cost).toBe(300);
    expect(perProject.sub_labour).toBe(700);
    // subtotal is tax-excluded on both legs (tax is a pass-through)
  });
});

describe("SUB-4 spent/margin fold", () => {
  it("spent = materials + labour + sub_labour, and margin reflects it", async () => {
    s.bills = [
      { project_id: "p1", subcontractor_id: "sub1", subtotal: 500, tax_amount: 65, total: 565, job_id: "j1", status: "received" },
    ];
    const { byJob, perProject } = await getProjectCostRollup("p1");
    // materials 100 + labour 200 + sub 500 = 800
    expect(byJob[0].spent).toBe(800);
    expect(byJob[0].margin).toBe(200); // 1000 − 800
    expect(perProject.spent).toBe(800);
    expect(perProject.margin).toBe(200);
    // the actual variance leg carries sub_labour and its cost includes it
    expect(byJob[0].variance?.actual.sub_labour).toBe(500);
    expect(byJob[0].variance?.actual.cost).toBe(800);
  });
});

describe("SUB-4 regression invariant (5c)", () => {
  it("a project with ZERO sub bills is byte-identical across every leg", async () => {
    // Baseline: no bills at all.
    const base = await getProjectCostRollup("p1");

    // Add ONLY supplier bills (subcontractor_id absent) — the pre-SUB-4 case.
    s.bills = [
      { project_id: "p1", subtotal: 300, tax_amount: 39, total: 339, job_id: "j1", status: "received" },
    ];
    const after = await getProjectCostRollup("p1");

    // Every existing number is unchanged; only billed_cost (already supplementary) moved.
    expect(after.perProject.materials).toBe(base.perProject.materials);
    expect(after.perProject.labour).toBe(base.perProject.labour);
    expect(after.perProject.spent).toBe(base.perProject.spent);
    expect(after.perProject.margin).toBe(base.perProject.margin);
    expect(after.perProject.po_committed).toBe(base.perProject.po_committed);
    expect(after.perProject.sub_labour).toBe(0);
    expect(base.perProject.sub_labour).toBe(0);
    expect(after.byJob[0].spent).toBe(base.byJob[0].spent);
    expect(after.byJob[0].margin).toBe(base.byJob[0].margin);
    // variance actual cost unchanged (no sub labour to add)
    expect(after.byJob[0].variance?.actual.cost).toBe(base.byJob[0].variance?.actual.cost);
    // the one leg that DID move:
    expect(after.perProject.billed_cost).toBe(300);
  });
});

describe("SUB-4 P&L gross profit", () => {
  it("canonical_direct includes sub_labour; GP drops by exactly the sub subtotal (tax excluded)", async () => {
    s.stock = []; // isolate: no inventory materials
    s.labourByCc = {}; // no labour
    s.invoices = [
      { id: "i1", project_id: "p1", subtotal: 1000, holdback_amount: 0, amount_due: 1130, status: "sent" },
    ];

    // Baseline — no sub bill: GP = revenue − 0 = 1000.
    const baseline = await getProjectPnl("p1");
    expect(baseline?.gross_profit).toBe(1000);

    // Add a $500 (+$65 tax) sub bill.
    s.bills = [
      { id: "b1", project_id: "p1", subcontractor_id: "sub1", subtotal: 500, tax_amount: 65, total: 565, job_id: "j1", status: "received" },
    ];
    const pnl = await getProjectPnl("p1");
    if (!pnl) return;
    expect(pnl.cost.sub_labour).toBe(500);
    expect(pnl.cost.materials_billed).toBe(0); // sub bill is NOT a supplier bill
    expect(pnl.cost.canonical_direct).toBe(500); // 0 + 0 + 500
    // GP fell by exactly the subtotal (500), not the tax-inclusive 565
    expect(pnl.gross_profit).toBe(500);
    expect(pnl.gross_margin_pct).toBe(50);
  });
});
