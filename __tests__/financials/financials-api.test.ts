// FIN-1 — the real Financials data layer. The chain mock applies eq/in/gte/lte
// filters to the seeded rows (via ctx.filters), so these tests exercise both
// the query construction (status scoping, date bounds) and the JS aggregation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  // FIN-2 — the payment ledger balances now net against amount_due.
  payments: [] as Record<string, unknown>[],
}));

// Apply the recorded eq/in/gte/lte filters against the seeded rows so the
// resolve behaves like PostgREST for the subset of operators FIN-1 uses.
function applyFilters(
  rows: Record<string, unknown>[],
  filters: ChainCtx["filters"]
): Record<string, unknown>[] {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    switch (f.method) {
      case "eq":
        out = out.filter((r) => r[col] === val);
        break;
      case "in":
        out = out.filter((r) => (val as unknown[]).includes(r[col]));
        break;
      case "gte":
        out = out.filter((r) => r[col] != null && (r[col] as string) >= (val as string));
        break;
      case "lte":
        out = out.filter((r) => r[col] != null && (r[col] as string) <= (val as string));
        break;
      default:
        break; // order/select/etc — no row effect
    }
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "invoices") {
    return { data: applyFilters(s.invoices, ctx.filters), error: null };
  }
  if (ctx.table === "invoice_payments") {
    return { data: applyFilters(s.payments, ctx.filters), error: null };
  }
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
// getProjectFinancialSummaries pulls the 6b rollup; not under test here.
vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: vi.fn(),
}));

import {
  getRevenueSummary,
  getMonthlyRevenue,
  getReceivablesByClient,
  getTaxCollectedSummary,
} from "@/lib/api/financials";

function monthKey(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

beforeEach(() => {
  s.invoices = [];
  s.payments = [];
});

describe("getRevenueSummary", () => {
  it("sums issued only, splits by opco, outstanding = open amount_due", async () => {
    s.invoices = [
      { id: "i1", opco: "integrated_solutions", status: "sent", total: 100, amount_due: 90, holdback_amount: 10, issue_date: "2026-07-01", tax_amount: 11.5 },
      { id: "i2", opco: "guardian", status: "paid", total: 200, amount_due: 200, holdback_amount: 0, issue_date: "2026-07-02", tax_amount: 23 },
      { id: "i3", opco: "integrated_solutions", status: "draft", total: 999, amount_due: 999, holdback_amount: 0, issue_date: null, tax_amount: 0 },
      { id: "i4", opco: "guardian", status: "void", total: 500, amount_due: 500, holdback_amount: 50, issue_date: "2026-07-03", tax_amount: 65 },
    ];
    const sum = await getRevenueSummary();
    expect(sum.total).toBe(300);
    expect(sum.invoiceCount).toBe(2);
    expect(sum.paidTotal).toBe(200);
    expect(sum.outstandingTotal).toBe(90);
    expect(sum.holdbackRetained).toBe(10);
    expect(sum.byOpco).toEqual([
      { opco: "guardian", total: 200, count: 1 },
      { opco: "integrated_solutions", total: 100, count: 1 },
    ]);
  });

  // FIN-2 — partially_paid counts as issued revenue, and outstanding is net of
  // the payments recorded against it.
  it("counts partially_paid as issued and nets outstanding against payments", async () => {
    s.invoices = [
      { id: "i1", opco: "guardian", status: "partially_paid", total: 500, amount_due: 500, holdback_amount: 0, issue_date: "2026-07-01", tax_amount: 0 },
      { id: "i2", opco: "guardian", status: "sent", total: 100, amount_due: 100, holdback_amount: 0, issue_date: "2026-07-02", tax_amount: 0 },
    ];
    s.payments = [
      { invoice_id: "i1", amount: 200 },
      { invoice_id: "i1", amount: 50 },
      { invoice_id: "i2", amount: 25 },
    ];
    const sum = await getRevenueSummary();
    // invoiced revenue counts both in full
    expect(sum.total).toBe(600);
    expect(sum.invoiceCount).toBe(2);
    // outstanding = (500 − 250) + (100 − 25)
    expect(sum.outstandingTotal).toBe(325);
  });

  it("applies issue_date range bounds", async () => {
    s.invoices = [
      { opco: "guardian", status: "paid", total: 100, amount_due: 100, holdback_amount: 0, issue_date: "2026-01-15" },
      { opco: "guardian", status: "paid", total: 50, amount_due: 50, holdback_amount: 0, issue_date: "2026-06-15" },
    ];
    const sum = await getRevenueSummary({ from: "2026-06-01", to: "2026-06-30" });
    expect(sum.total).toBe(50);
    expect(sum.invoiceCount).toBe(1);
  });
});

describe("getMonthlyRevenue", () => {
  it("buckets sent+paid by issue_date month; paid subset tracked", async () => {
    const thisMonth = monthKey(0);
    const lastMonth = monthKey(-1);
    s.invoices = [
      { opco: "guardian", status: "paid", total: 300, issue_date: `${thisMonth}-15` },
      { opco: "guardian", status: "sent", total: 100, issue_date: `${thisMonth}-20` },
      { opco: "integrated_solutions", status: "sent", total: 40, issue_date: `${lastMonth}-10` },
      { opco: "guardian", status: "draft", total: 999, issue_date: null },
    ];
    const points = await getMonthlyRevenue({ months: 12 });
    expect(points).toHaveLength(12);
    const cur = points.find((p) => p.month === thisMonth);
    const prev = points.find((p) => p.month === lastMonth);
    expect(cur).toEqual({ month: thisMonth, invoiced: 400, paid: 300 });
    expect(prev).toEqual({ month: lastMonth, invoiced: 40, paid: 0 });
    // Untouched months stay zero.
    expect(points.filter((p) => p.invoiced === 0)).toHaveLength(10);
  });
});

describe("getReceivablesByClient", () => {
  it("groups open invoices by client with oldest issue date, sorted by balance", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "sent", amount_due: 100, issue_date: "2026-05-01", client: { name: "Acme" } },
      { id: "i2", client_id: "c1", status: "sent", amount_due: 50, issue_date: "2026-07-01", client: { name: "Acme" } },
      { id: "i3", client_id: "c2", status: "sent", amount_due: 60, issue_date: "2026-06-15", client: { name: "Beta" } },
      { id: "i4", client_id: "c1", status: "paid", amount_due: 0, issue_date: "2026-04-01", client: { name: "Acme" } },
      { id: "i5", client_id: "c3", status: "draft", amount_due: 999, issue_date: null, client: { name: "Gamma" } },
    ];
    const rows = await getReceivablesByClient();
    expect(rows).toEqual([
      { client_id: "c1", client_name: "Acme", open_total: 150, invoice_count: 2, oldest_issue_date: "2026-05-01" },
      { client_id: "c2", client_name: "Beta", open_total: 60, invoice_count: 1, oldest_issue_date: "2026-06-15" },
    ]);
  });

  // FIN-2 — balances, not raw amount_due: partially-paid invoices contribute
  // only what's left, and a fully-covered invoice drops out entirely.
  it("nets balances against payments and drops fully-covered invoices", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "partially_paid", amount_due: 100, issue_date: "2026-05-01", client: { name: "Acme" } },
      { id: "i2", client_id: "c1", status: "sent", amount_due: 50, issue_date: "2026-06-01", client: { name: "Acme" } },
      { id: "i3", client_id: "c2", status: "sent", amount_due: 80, issue_date: "2026-06-15", client: { name: "Beta" } },
    ];
    s.payments = [
      { invoice_id: "i1", amount: 70 }, // 30 left
      { invoice_id: "i3", amount: 80 }, // fully covered → excluded
    ];
    const rows = await getReceivablesByClient();
    expect(rows).toEqual([
      {
        client_id: "c1",
        client_name: "Acme",
        open_total: 80, // 30 + 50
        invoice_count: 2,
        oldest_issue_date: "2026-05-01",
      },
    ]);
  });
});

describe("getTaxCollectedSummary", () => {
  it("sums tax_amount by opco for sent+paid in range", async () => {
    s.invoices = [
      { opco: "integrated_solutions", status: "sent", tax_amount: 13, issue_date: "2026-07-01" },
      { opco: "integrated_solutions", status: "paid", tax_amount: 26, issue_date: "2026-07-05" },
      { opco: "guardian", status: "paid", tax_amount: 6.5, issue_date: "2026-07-08" },
      { opco: "guardian", status: "void", tax_amount: 99, issue_date: "2026-07-09" },
      { opco: "guardian", status: "paid", tax_amount: 99, issue_date: "2026-01-01" },
    ];
    const sum = await getTaxCollectedSummary({ from: "2026-07-01", to: "2026-07-31" });
    expect(sum.total).toBe(45.5);
    expect(sum.byOpco).toEqual([
      { opco: "integrated_solutions", taxCollected: 39 },
      { opco: "guardian", taxCollected: 6.5 },
    ]);
  });
});
