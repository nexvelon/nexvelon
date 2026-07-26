// DASH-3 — the final three panel reads: revenue trend (12 months, revenue+cash,
// NO ebitda), top clients by revenue (pre-tax, issued invoices, year, ordered),
// and inventory health (by-category value + low-stock).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  clients: [] as Record<string, unknown>[],
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
    else if (f.method === "gte") out = out.filter((r) => (r[col] as string) >= (a[1] as string));
    else if (f.method === "lte") out = out.filter((r) => (r[col] as string) <= (a[1] as string));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "invoices") return { data: applyFilters(h.invoices, ctx.filters), error: null };
  if (ctx.table === "clients") return { data: applyFilters(h.clients, ctx.filters), error: null };
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/financials", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/financials")>()),
  getMonthlyRevenue: vi.fn(async () =>
    Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, invoiced: (i + 1) * 100, collected: (i + 1) * 80 }))
  ),
}));
vi.mock("@/lib/api/products", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/products")>()),
  getInventoryReportData: vi.fn(async () => ({
    totalValuation: 0,
    valuationByCategory: [
      { category: "Cameras", value: 500, units: 5 },
      { category: "Access", value: 1200, units: 3 },
      { category: "", value: 100, units: 1 }, // uncategorized
    ],
    aging: [],
    consumption90d: { value: 0, units: 0 },
  })),
  listProducts: vi.fn(async () => [
    { id: "p1", name: "Reader", stock: 2, reorderPoint: 5 }, // low
    { id: "p2", name: "Camera", stock: 20, reorderPoint: 4 }, // ok
    { id: "p3", name: "Cable", stock: 0, reorderPoint: 0 }, // low (0 <= 0)
  ]),
}));

import {
  getRevenueTrend,
  getTopClientsByRevenue,
  getInventoryHealth,
} from "@/lib/api/dashboard";

beforeEach(() => {
  h.clients = [
    { id: "c1", name: "Acme" },
    { id: "c2", name: "Globex" },
  ];
});

describe("getRevenueTrend", () => {
  it("returns 12 months of revenue + cash, with NO ebitda field", async () => {
    const trend = await getRevenueTrend();
    expect(trend).toHaveLength(12);
    expect(trend[0]).toHaveProperty("invoiced");
    expect(trend[0]).toHaveProperty("collected");
    for (const p of trend) expect(Object.keys(p)).not.toContain("ebitda");
  });
});

describe("getTopClientsByRevenue", () => {
  it("aggregates pre-tax subtotal of issued invoices in the year, ordered desc", async () => {
    h.invoices = [
      { client_id: "c1", subtotal: 300, status: "sent", issue_date: "2026-03-01" },
      { client_id: "c1", subtotal: 200, status: "paid", issue_date: "2026-06-01" },
      { client_id: "c2", subtotal: 1000, status: "partially_paid", issue_date: "2026-05-01" },
      { client_id: "c2", subtotal: 9999, status: "draft", issue_date: "2026-05-01" }, // draft excluded by .in filter
      { client_id: "c1", subtotal: 9999, status: "paid", issue_date: "2025-12-31" }, // prior year excluded
    ];
    const top = await getTopClientsByRevenue({ year: 2026, limit: 5 });
    expect(top.map((c) => c.client_name)).toEqual(["Globex", "Acme"]); // 1000 > 500
    expect(top[1]).toMatchObject({ client_name: "Acme", revenue: 500, invoice_count: 2 });
  });

  it("respects the limit", async () => {
    h.invoices = [
      { client_id: "c1", subtotal: 300, status: "sent", issue_date: "2026-03-01" },
      { client_id: "c2", subtotal: 200, status: "sent", issue_date: "2026-03-01" },
    ];
    const top = await getTopClientsByRevenue({ year: 2026, limit: 1 });
    expect(top).toHaveLength(1);
    expect(top[0].client_name).toBe("Acme"); // 300 > 200
  });
});

describe("getInventoryHealth", () => {
  it("returns by-category value (sorted) + low-stock (stock <= reorder_point)", async () => {
    const health = await getInventoryHealth();
    expect(health.by_category.map((c) => c.category)).toEqual(["Access", "Cameras", "Uncategorized"]); // by value desc
    expect(health.low_stock_count).toBe(2); // p1 (2<=5) + p3 (0<=0)
    expect(health.low_stock.map((p) => p.product_id).sort()).toEqual(["p1", "p3"]);
    expect(health.low_stock.find((p) => p.product_id === "p1")).toMatchObject({ on_hand: 2, reorder_point: 5 });
  });
});
