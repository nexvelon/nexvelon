// DASH-1 — the KPI fan-out maps each field from its real source, computes the
// REAL blended margin (ΣGP/Σrevenue; null at zero revenue), redacts a disabled
// tier to a null block, and carries NO fabricated fields (no EBITDA / ratios).

import { describe, it, expect, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  projects: [] as Record<string, unknown>[],
  pnl: [] as Record<string, unknown>[],
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "projects") return { data: h.projects, error: null };
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-25",
}));
vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(async () => ({ total: 5000, cashCollected: 3200, outstandingTotal: 1800, holdbackRetained: 0, invoiceCount: 4, byOpco: [], cashBreakdown: {} })),
  getHstNetPosition: vi.fn(async () => ({ byOpco: [{ opco: "integrated_solutions", collected: 400, itc: 150, net: 250 }], totals: { collected: 400, itc: 150, net: 250 }, unassignedItc: 0, from: null, to: null })),
}));
vi.mock("@/lib/api/ar-aging", () => ({ getArAgingSummary: vi.fn(async () => ({ buckets: {}, total: 1800, overdueTotal: 600, asOf: "2026-07-25" })) }));
vi.mock("@/lib/api/vendor-bills", () => ({ getApSummary: vi.fn(async () => ({ outstanding: 900, overdue: 200, billCount: 3 })) }));
vi.mock("@/lib/api/deposits", () => ({ getDepositsHeldTotal: vi.fn(async () => 750) }));
vi.mock("@/lib/api/wip", () => ({ getWipPortfolio: vi.fn(async () => ({ rows: [], totals: { overbilled: 1200, underbilled: -800, net: 400 } })) }));
vi.mock("@/lib/api/project-pnl", () => ({ getPnlPortfolio: vi.fn(async () => h.pnl ?? []) }));
vi.mock("@/lib/api/quotes", () => ({
  listQuotes: vi.fn(async () => [
    { status: "Draft", total: 1000 },
    { status: "Sent", total: 2500 },
    { status: "Approved", total: 9999 }, // not open
  ]),
}));

import { getDashboardKpis } from "@/lib/api/dashboard";

const ALL = { financialView: true, financialEdit: true, projects: true, quotes: true };

describe("getDashboardKpis fan-out", () => {
  it("maps each field from its source", async () => {
    h.projects = [{ contract_value: 10000 }, { contract_value: 5000 }];
    h.pnl = [
      { revenue: 1000, gross_profit: 300 },
      { revenue: 1000, gross_profit: 100 },
    ];
    const k = await getDashboardKpis({ from: "2026-07-01", to: "2026-07-31", tiers: ALL });

    expect(k.financial).toMatchObject({
      revenue: 5000, cash_collected: 3200,
      ar_outstanding: 1800, ar_overdue: 600,
      ap_outstanding: 900, ap_overdue: 200,
      deposits_held: 750,
    });
    expect(k.financial_edit).toMatchObject({
      wip_net: 400, wip_overbilled: 1200, wip_underbilled: -800,
      hst_net_total: 250,
      blended_margin_pct: 20, // ΣGP 400 / Σrev 2000 = 20%
    });
    expect(k.operational.projects).toEqual({ active_projects: 2, active_contract_value: 15000 });
    expect(k.operational.quotes).toEqual({ open_quotes: 2, open_quotes_value: 3500 }); // Approved excluded
    expect(k.as_of).toBe("2026-07-25");
  });

  it("blended margin is null when there is NO revenue (not 0)", async () => {
    h.projects = [];
    h.pnl = [{ revenue: 0, gross_profit: 0 }];
    const k = await getDashboardKpis({ tiers: ALL });
    expect(k.financial_edit!.blended_margin_pct).toBeNull();
  });

  it("carries NO fabricated fields (no EBITDA / COGS / ratio margin)", async () => {
    h.pnl = [{ revenue: 100, gross_profit: 20 }];
    const k = await getDashboardKpis({ tiers: ALL });
    const finKeys = Object.keys(k.financial!);
    const editKeys = Object.keys(k.financial_edit!);
    for (const bad of ["ebitda", "cogs", "opex", "gross_margin", "grossMargin"]) {
      expect(finKeys).not.toContain(bad);
      expect(editKeys).not.toContain(bad);
    }
  });

  it("redacts disabled tiers to null blocks", async () => {
    const k = await getDashboardKpis({ tiers: { financialView: false, financialEdit: false, projects: false, quotes: false } });
    expect(k.financial).toBeNull();
    expect(k.financial_edit).toBeNull();
    expect(k.operational.projects).toBeNull();
    expect(k.operational.quotes).toBeNull();
  });

  it("financialView without financialEdit: view block present, edit block null", async () => {
    const k = await getDashboardKpis({ tiers: { financialView: true, financialEdit: false, projects: false, quotes: false } });
    expect(k.financial).not.toBeNull();
    expect(k.financial_edit).toBeNull();
  });
});
