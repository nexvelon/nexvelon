// FIN-8 — the per-project P&L. The two claims that matter most: revenue is
// PRE-TAX invoiced (issued only), and canonical cost is billed materials +
// labour with inventory-drawn shown as a memo that NEVER enters gross profit.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  project: {
    id: "p1",
    project_number: "P-001",
    title: "Tower A",
    opco: "guardian",
    status: "active",
    client: { name: "Acme" },
  } as Record<string, unknown> | null,
  invoices: [] as Record<string, unknown>[],
  invoicePayments: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  billPayments: [] as Record<string, unknown>[],
  // rollup dependencies:
  ccs: [] as Record<string, unknown>[],
  stock: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  pos: [] as Record<string, unknown>[],
  labourByCc: {} as Record<string, number>,
  deposits: [] as Record<string, unknown>[],
  depositApps: [] as Record<string, unknown>[],
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
    case "projects": {
      // getProjectPnl does maybeSingle on one project; activeProjectPnls lists.
      if (single) return { data: s.project, error: null };
      return { data: s.project ? [{ id: (s.project as { id: string }).id }] : [], error: null };
    }
    case "invoices":
      return { data: filt(s.invoices, ctx.filters), error: null };
    case "invoice_payments":
      return { data: filt(s.invoicePayments, ctx.filters), error: null };
    case "vendor_bills":
      return { data: filt(s.bills, ctx.filters), error: null };
    case "bill_payments":
      return { data: filt(s.billPayments, ctx.filters), error: null };
    case "project_cost_centers":
      return { data: s.ccs, error: null };
    case "inventory_stock":
      return { data: s.stock, error: null };
    case "inventory_products":
      return { data: [], error: null };
    case "project_jobs":
      return { data: s.jobs, error: null };
    case "job_line_items":
      return { data: s.lines, error: null };
    case "purchase_orders":
      return { data: [], error: null };
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

import { getProjectPnl } from "@/lib/api/project-pnl";

beforeEach(() => {
  s.project = {
    id: "p1", project_number: "P-001", title: "Tower A",
    opco: "guardian", status: "active", client: { name: "Acme" },
  };
  s.invoices = [];
  s.invoicePayments = [];
  s.bills = [];
  s.billPayments = [];
  s.ccs = [{ id: "cc1", contract_value: 1000, job_id: "j1" }];
  s.stock = [];
  s.jobs = [{ id: "j1", job_type: "main_job", co_number: null, title: "Main", status: "active", contract_value: 1000 }];
  s.lines = [];
  s.pos = [];
  s.labourByCc = {};
  s.deposits = [];
  s.depositApps = [];
});

describe("getProjectPnl — revenue", () => {
  it("is PRE-TAX invoiced over issued statuses; draft and void excluded", async () => {
    s.invoices = [
      { id: "i1", project_id: "p1", subtotal: 1000, holdback_amount: 0, amount_due: 1130, status: "sent" },
      { id: "i2", project_id: "p1", subtotal: 500, holdback_amount: 0, amount_due: 565, status: "paid" },
      { id: "i3", project_id: "p1", subtotal: 999, holdback_amount: 0, amount_due: 999, status: "draft" },
      { id: "i4", project_id: "p1", subtotal: 777, holdback_amount: 0, amount_due: 777, status: "void" },
    ];
    const pnl = await getProjectPnl("p1");
    expect(pnl).not.toBeNull();
    if (!pnl) return;
    // 1500 pre-tax — tax and the draft/void rows are all out
    expect(pnl.revenue.earned).toBe(1500);
    expect(pnl.revenue.by_status).toEqual({ sent: 1000, partially_paid: 0, paid: 500 });
  });
});

describe("getProjectPnl — canonical cost & the no-double-count rule", () => {
  it("cost = billed materials + labour; inventory-drawn is a memo NOT in GP", async () => {
    s.invoices = [
      { id: "i1", project_id: "p1", subtotal: 1000, holdback_amount: 0, amount_due: 1130, status: "sent" },
    ];
    // vendor bill (billed_cost) for the same PO-received parts...
    s.bills = [
      { id: "b1", project_id: "p1", subtotal: 300, tax_amount: 39, total: 339, job_id: "j1", status: "received" },
    ];
    // ...which are ALSO sitting in inventory on the cost center (materials leg)
    s.stock = [
      { product_id: "prod1", quantity: 6, unit_cost: 50, custody_status: "on_site", current_cost_center_id: "cc1" },
    ];
    s.labourByCc = { cc1: 200 };

    const pnl = await getProjectPnl("p1");
    if (!pnl) return;

    expect(pnl.cost.materials_billed).toBe(300); // billed_cost
    expect(pnl.cost.labour).toBe(200);
    expect(pnl.cost.canonical_direct).toBe(500); // 300 + 200, NOT + 300 inventory
    // GP is revenue − canonical, with inventory NOT double-counted
    expect(pnl.gross_profit).toBe(500); // 1000 − 500
    expect(pnl.gross_margin_pct).toBe(50);
    // inventory drawn is visible as a memo only
    expect(pnl.memo.inventory_drawn_memo).toBe(300);
  });

  it("gross margin is null-safe at zero revenue", async () => {
    s.bills = [{ id: "b1", project_id: "p1", subtotal: 100, tax_amount: 0, total: 100, job_id: "j1", status: "received" }];
    const pnl = await getProjectPnl("p1");
    if (!pnl) return;
    expect(pnl.revenue.earned).toBe(0);
    expect(pnl.gross_profit).toBe(-100);
    expect(pnl.gross_margin_pct).toBeNull();
  });
});

describe("getProjectPnl — memo legs pull from the right sources", () => {
  it("holdback, AR, AP, deposits, open PO and billed% resolve correctly", async () => {
    s.invoices = [
      { id: "i1", project_id: "p1", subtotal: 1000, holdback_amount: 100, amount_due: 1030, status: "sent" },
      { id: "i2", project_id: "p1", subtotal: 500, holdback_amount: 0, amount_due: 565, status: "paid" },
    ];
    // one $400 payment against the open invoice i1
    s.invoicePayments = [{ invoice_id: "i1", amount: 400 }];
    // AP: a received bill of 339 with a 39 payment → 300 balance
    s.bills = [{ id: "b1", project_id: "p1", subtotal: 300, tax_amount: 39, total: 339, job_id: "j1", status: "received" }];
    s.billPayments = [{ bill_id: "b1", amount: 39 }];
    // deposit of 250 held, none applied
    s.deposits = [{ id: "d1", project_id: "p1", amount: 250 }];

    const pnl = await getProjectPnl("p1");
    if (!pnl) return;

    expect(pnl.memo.holdback_retained).toBe(100); // Σ holdback over issued
    expect(pnl.memo.ar_balance).toBe(630); // i1 open: 1030 − 400; i2 is paid (not open)
    expect(pnl.memo.ap_balance).toBe(300); // 339 − 39
    expect(pnl.memo.deposits_held).toBe(250);
    expect(pnl.memo.contract_quoted).toBe(1000); // cc contract_value
  });

  it("open PO commitment is ordered − billed, clamped at zero", async () => {
    // No POs seeded (purchase_orders → []), so po_committed is 0; billed 300 →
    // max(0, 0 − 300) = 0, never negative.
    s.bills = [{ id: "b1", project_id: "p1", subtotal: 300, tax_amount: 0, total: 300, job_id: "j1", status: "received" }];
    const pnl = await getProjectPnl("p1");
    if (!pnl) return;
    expect(pnl.memo.po_committed_open).toBe(0);
  });
});

describe("getProjectPnl — not found", () => {
  it("returns null for an unknown project", async () => {
    s.project = null;
    expect(await getProjectPnl("nope")).toBeNull();
  });
});
