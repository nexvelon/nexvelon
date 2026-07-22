// FIN-7 — HST net position. The two things that must not go wrong: ITCs use the
// CLAIMABLE figure (not raw tax), and every dollar lands under the right
// corporation — Integrated Solutions and Guardian file separate returns.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  deposits: [] as Record<string, unknown>[],
}));

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
      case "neq":
        out = out.filter((r) => r[col] !== val);
        break;
      case "gte":
        out = out.filter((r) => r[col] != null && (r[col] as string) >= (val as string));
        break;
      case "lte":
        out = out.filter((r) => r[col] != null && (r[col] as string) <= (val as string));
        break;
      default:
        break;
    }
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "invoices") return { data: applyFilters(s.invoices, ctx.filters), error: null };
  if (ctx.table === "vendor_bills") return { data: applyFilters(s.bills, ctx.filters), error: null };
  if (ctx.table === "invoice_payments") return { data: applyFilters(s.payments, ctx.filters), error: null };
  if (ctx.table === "project_deposits") return { data: applyFilters(s.deposits, ctx.filters), error: null };
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/project-cost-rollup", () => ({ getProjectCostRollup: vi.fn() }));

import {
  getItcSummary,
  getHstNetPosition,
  resolveBillOpco,
  buildHstReturnCsv,
  UNASSIGNED_OPCO,
} from "@/lib/api/financials";

beforeEach(() => {
  s.invoices = [];
  s.bills = [];
  s.payments = [];
  s.deposits = [];
});

describe("resolveBillOpco", () => {
  it("uses the project's opco when the bill is project-linked", () => {
    expect(
      resolveBillOpco({
        project_id: "p1",
        opco: null,
        project: { opco: "guardian" },
      })
    ).toBe("guardian");
  });

  it("uses the bill's own opco when standalone", () => {
    expect(
      resolveBillOpco({ project_id: null, opco: "integrated_solutions", project: null })
    ).toBe("integrated_solutions");
  });

  it("prefers the project over a stale bill-level opco", () => {
    expect(
      resolveBillOpco({
        project_id: "p1",
        opco: "integrated_solutions",
        project: { opco: "guardian" },
      })
    ).toBe("guardian");
  });

  it("is null when neither is available", () => {
    expect(resolveBillOpco({ project_id: null, opco: null, project: null })).toBeNull();
  });
});

describe("getItcSummary", () => {
  it("sums CLAIMABLE tax, not the raw tax charged", () => {
    // a 50%-ITC bill (meals): $13 tax charged, $6.50 claimable
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 13, claimable_tax_amount: 6.5, bill_date: "2026-07-01", status: "received", project: null },
    ];
    return getItcSummary().then((itc) => {
      expect(itc.total).toBe(6.5);
      expect(itc.byOpco).toEqual([{ opco: "guardian", itc: 6.5 }]);
    });
  });

  it("falls back to full tax when claimable is NULL (pre-0093 rows)", async () => {
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 13, claimable_tax_amount: null, bill_date: "2026-07-01", status: "received", project: null },
    ];
    const itc = await getItcSummary();
    expect(itc.total).toBe(13);
  });

  it("excludes void bills and includes received / partially_paid / paid", async () => {
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 10, claimable_tax_amount: 10, bill_date: "2026-07-01", status: "received", project: null },
      { id: "b2", project_id: null, opco: "guardian", tax_amount: 20, claimable_tax_amount: 20, bill_date: "2026-07-02", status: "partially_paid", project: null },
      { id: "b3", project_id: null, opco: "guardian", tax_amount: 30, claimable_tax_amount: 30, bill_date: "2026-07-03", status: "paid", project: null },
      { id: "b4", project_id: null, opco: "guardian", tax_amount: 99, claimable_tax_amount: 99, bill_date: "2026-07-04", status: "void", project: null },
    ];
    const itc = await getItcSummary();
    expect(itc.total).toBe(60);
  });

  it("splits per opco across project-linked and standalone bills", async () => {
    s.bills = [
      { id: "b1", project_id: "p1", opco: null, tax_amount: 13, claimable_tax_amount: 13, bill_date: "2026-07-01", status: "received", project: { opco: "guardian" } },
      { id: "b2", project_id: null, opco: "integrated_solutions", tax_amount: 26, claimable_tax_amount: 26, bill_date: "2026-07-02", status: "received", project: null },
    ];
    const itc = await getItcSummary();
    expect(itc.byOpco).toEqual([
      { opco: "integrated_solutions", itc: 26 },
      { opco: "guardian", itc: 13 },
    ]);
    expect(itc.unassigned).toBe(0);
  });

  it("surfaces unattributable ITCs rather than losing them", async () => {
    s.bills = [
      { id: "b1", project_id: null, opco: null, tax_amount: 13, claimable_tax_amount: 13, bill_date: "2026-07-01", status: "received", project: null },
    ];
    const itc = await getItcSummary();
    expect(itc.unassigned).toBe(13);
    expect(itc.total).toBe(13);
    expect(itc.byOpco).toEqual([{ opco: UNASSIGNED_OPCO, itc: 13 }]);
  });

  it("ranges on bill_date", async () => {
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 10, claimable_tax_amount: 10, bill_date: "2026-06-30", status: "received", project: null },
      { id: "b2", project_id: null, opco: "guardian", tax_amount: 20, claimable_tax_amount: 20, bill_date: "2026-07-15", status: "received", project: null },
    ];
    const itc = await getItcSummary({ from: "2026-07-01", to: "2026-07-31" });
    expect(itc.total).toBe(20);
  });
});

describe("getHstNetPosition", () => {
  it("nets collected − ITC per opco, never blending the two corporations", async () => {
    s.invoices = [
      { id: "i1", opco: "integrated_solutions", status: "sent", tax_amount: 130, issue_date: "2026-07-05" },
      { id: "i2", opco: "guardian", status: "paid", tax_amount: 65, issue_date: "2026-07-06" },
    ];
    s.bills = [
      { id: "b1", project_id: null, opco: "integrated_solutions", tax_amount: 40, claimable_tax_amount: 40, bill_date: "2026-07-02", status: "received", project: null },
      { id: "b2", project_id: null, opco: "guardian", tax_amount: 90, claimable_tax_amount: 90, bill_date: "2026-07-03", status: "received", project: null },
    ];
    const pos = await getHstNetPosition({ from: "2026-07-01", to: "2026-07-31" });

    const is = pos.byOpco.find((o) => o.opco === "integrated_solutions");
    const gu = pos.byOpco.find((o) => o.opco === "guardian");
    expect(is).toEqual({ opco: "integrated_solutions", collected: 130, itc: 40, net: 90 });
    // Guardian's ITCs exceed its collections → a refund, not an amount owing
    expect(gu).toEqual({ opco: "guardian", collected: 65, itc: 90, net: -25 });

    expect(pos.totals).toEqual({ collected: 195, itc: 130, net: 65 });
  });

  it("gives an opco with ITCs but no sales its own refund row", async () => {
    s.invoices = [];
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 50, claimable_tax_amount: 50, bill_date: "2026-07-03", status: "received", project: null },
    ];
    const pos = await getHstNetPosition();
    expect(pos.byOpco).toEqual([
      { opco: "guardian", collected: 0, itc: 50, net: -50 },
    ]);
  });

  it("keeps unassigned ITCs out of every opco row AND the combined total", async () => {
    s.invoices = [
      { id: "i1", opco: "guardian", status: "sent", tax_amount: 100, issue_date: "2026-07-05" },
    ];
    s.bills = [
      { id: "b1", project_id: null, opco: null, tax_amount: 30, claimable_tax_amount: 30, bill_date: "2026-07-02", status: "received", project: null },
    ];
    const pos = await getHstNetPosition();
    expect(pos.byOpco).toEqual([
      { opco: "guardian", collected: 100, itc: 0, net: 100 },
    ]);
    // the 30 is visible as a to-do, but not claimed anywhere
    expect(pos.unassignedItc).toBe(30);
    expect(pos.totals).toEqual({ collected: 100, itc: 0, net: 100 });
  });
});

describe("buildHstReturnCsv", () => {
  it("emits one line per opco plus an explicit unassigned line", async () => {
    s.invoices = [
      { id: "i1", opco: "guardian", status: "sent", tax_amount: 100, issue_date: "2026-07-05" },
    ];
    s.bills = [
      { id: "b1", project_id: null, opco: "guardian", tax_amount: 30, claimable_tax_amount: 30, bill_date: "2026-07-02", status: "received", project: null },
      { id: "b2", project_id: null, opco: null, tax_amount: 5, claimable_tax_amount: 5, bill_date: "2026-07-02", status: "received", project: null },
    ];
    const csv = await buildHstReturnCsv({ from: "2026-07-01", to: "2026-07-31" });
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "Entity,Period from,Period to,HST collected,Input tax credits,Net owing"
    );
    expect(rows[1]).toBe(
      "Nexvelon Guardian,2026-07-01,2026-07-31,100.00,30.00,70.00"
    );
    expect(rows[2]).toContain("UNASSIGNED (attribute before filing)");
    expect(rows[2]).toContain("5.00");
  });
});
