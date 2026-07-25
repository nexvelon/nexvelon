// INV-9-1 — getVendorMetrics. YTD spend (year-scoped, pre-tax, void excluded);
// on-time / lead time over dated receipts (null when none); fill rate; top parts
// by ordered value; price variance matched by bill→PO link. The honesty rule:
// no dated receipts → null, never a fabricated 0%/100%.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  bills: [] as Record<string, unknown>[],
  pos: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  products: [] as Record<string, unknown>[],
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "neq") out = out.filter((r) => r[col] !== a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "vendor_bills":
      return { data: applyFilters(h.bills, ctx.filters), error: null };
    case "purchase_orders":
      return { data: applyFilters(h.pos, ctx.filters), error: null };
    case "purchase_order_lines":
      return { data: applyFilters(h.lines, ctx.filters), error: null };
    case "inventory_products":
      return { data: applyFilters(h.products, ctx.filters), error: null };
    default:
      return { data: [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));

import { getVendorMetrics } from "@/lib/api/vendor-metrics";

function seed() {
  h.bills = [
    { subtotal: 1000, bill_date: "2026-03-10", status: "paid", purchase_order_id: "P1", vendor_id: "v1" },
    { subtotal: 500, bill_date: "2026-07-01", status: "partially_paid", purchase_order_id: null, vendor_id: "v1" },
    { subtotal: 999, bill_date: "2025-12-20", status: "paid", purchase_order_id: null, vendor_id: "v1" }, // other year
    { subtotal: 100, bill_date: "2026-05-01", status: "void", purchase_order_id: null, vendor_id: "v1" }, // void
  ];
  h.pos = [
    { id: "P1", vendor_id: "v1", status: "received", issued_at: "2026-03-01T00:00:00Z", expected_date: "2026-03-15", fully_received_at: "2026-03-10" }, // on-time, lead 9
    { id: "P2", vendor_id: "v1", status: "received", issued_at: "2026-04-01T00:00:00Z", expected_date: "2026-04-05", fully_received_at: "2026-04-20" }, // late, lead 19
    { id: "P3", vendor_id: "v1", status: "issued", issued_at: "2026-06-01T00:00:00Z", expected_date: "2026-06-10", fully_received_at: null }, // no receipt
    { id: "P4", vendor_id: "v1", status: "draft", issued_at: null, expected_date: null, fully_received_at: null }, // not ordered
  ];
  h.lines = [
    { purchase_order_id: "P1", product_id: "pA", quantity: 10, unit_cost: 50, received_qty: 10, last_received_at: "2026-03-10" },
    { purchase_order_id: "P1", product_id: "pB", quantity: 5, unit_cost: 20, received_qty: 5, last_received_at: "2026-03-10" },
    { purchase_order_id: "P2", product_id: "pA", quantity: 4, unit_cost: 60, received_qty: 4, last_received_at: "2026-04-20" },
    { purchase_order_id: "P3", product_id: "pC", quantity: 8, unit_cost: 10, received_qty: 0, last_received_at: null },
    { purchase_order_id: "P4", product_id: "pA", quantity: 100, unit_cost: 1, received_qty: 0, last_received_at: null }, // draft — excluded
  ];
  h.products = [
    { id: "pA", name: "Widget A" },
    { id: "pB", name: "Widget B" },
    { id: "pC", name: "Widget C" },
  ];
}

beforeEach(seed);

describe("getVendorMetrics", () => {
  it("ytd_spend sums the year's bills, pre-tax, excluding other years + void", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.ytd_spend).toBe(1500); // 1000 + 500; 999 is 2025, 100 is void
    expect(m.bill_count).toBe(2);
    expect(m.spend_by_month.find((x) => x.month === 3)!.amount).toBe(1000);
    expect(m.spend_by_month.find((x) => x.month === 7)!.amount).toBe(500);
    expect(m.spend_by_month.find((x) => x.month === 1)!.amount).toBe(0);
  });

  it("on-time counts POs received by expected_date; late ones don't", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.on_time.received_pos).toBe(2); // P1, P2 (P3 not received)
    expect(m.on_time.on_time_pos).toBe(1); // only P1
    expect(m.on_time.pct).toBe(50);
  });

  it("avg lead time averages issued→received over dated POs", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.avg_lead_time_days).toBe(14); // (9 + 19) / 2
  });

  it("fill_rate = Σreceived / Σordered over receivable ordered lines", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.fill_rate.ordered).toBe(27); // 10+5+4+8 (P4 draft excluded)
    expect(m.fill_rate.received).toBe(19); // 10+5+4+0
    expect(m.fill_rate.pct).toBe(70.37);
  });

  it("top_parts ranked by ordered value (PO-derived, draft excluded)", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.top_parts.map((p) => p.product_id)).toEqual(["pA", "pB", "pC"]);
    expect(m.top_parts[0]).toMatchObject({ name: "Widget A", qty: 14, spend: 740 });
  });

  it("price_variance = billed − expected, matched by bill→PO link", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    // Only P1 has a bill: billed 1000 vs expected (500+100)=600 → +400.
    expect(m.price_variance.amount).toBe(400);
    expect(m.price_variance.pct).toBe(66.67);
    expect(m.price_variance.matched_pos).toBe(1);
  });

  it("metrics_since is the earliest dated receipt; po_count is ordered POs", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.metrics_since).toBe("2026-03-10");
    expect(m.po_count).toBe(3); // P1, P2, P3 ordered; P4 draft excluded
  });
});

describe("honesty — null, never fabricated, when no dated receipts", () => {
  beforeEach(() => {
    seed();
    // Strip every receipt date: a 'received' PO with no receipt date is just an
    // open 'issued' order. Leave the draft (P4) a draft so fill rate is unchanged.
    h.pos = h.pos.map((p) => ({
      ...p,
      status: p.status === "received" ? "issued" : p.status,
      fully_received_at: null,
    }));
    h.lines = h.lines.map((l) => ({ ...l, last_received_at: null }));
  });

  it("returns null on-time / lead-time / metrics_since (no 0% or 100%)", async () => {
    const m = await getVendorMetrics("v1", { year: 2026 });
    expect(m.on_time.pct).toBeNull();
    expect(m.on_time.received_pos).toBe(0);
    expect(m.avg_lead_time_days).toBeNull();
    expect(m.metrics_since).toBeNull();
    // Spend + fill rate are still computable (they don't need a receipt date).
    expect(m.ytd_spend).toBe(1500);
    expect(m.fill_rate.pct).toBe(70.37);
  });
});
