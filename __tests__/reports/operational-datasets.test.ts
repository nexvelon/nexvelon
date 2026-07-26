// REP-3 / REP-4 — the operational aggregates + their dataset builders. The
// honesty-critical logic is asserted directly: pipeline conversion denominator +
// no fabricated "Lead" stage; labour utilization excludes unknown-hours techs
// from the overall denominator and carries NO billable field; vendor spend Σ
// desc + top-N; the business snapshot's backlog formula and the ABSENCE of any
// valuation / multiple / recurring-revenue field.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  quotes: [] as { status: string; total: number; createdAt: string; quoteDate?: string }[],
  db: { techs: [] as unknown[], hours: [] as unknown[], absences: [] as unknown[], bookings: [] as unknown[], bills: [] as unknown[] },
  snap: {
    monthly: [] as { month: string; invoiced: number; collected: number }[],
    ar: { total: 0 }, ap: { outstanding: 0 },
    portfolio: [] as { revenue: number; gross_profit: number | null }[],
    wip: { rows: [] as { contract: number; billed: number }[] },
  },
}));

vi.mock("@/lib/api/quotes", () => ({ listQuotes: vi.fn(async () => h.quotes) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () =>
    makeSupabaseMock((ctx: ChainCtx) => {
      switch (ctx.table) {
        case "techs": return { data: h.db.techs, error: null };
        case "tech_working_hours": return { data: h.db.hours, error: null };
        case "tech_absences": return { data: h.db.absences, error: null };
        case "schedule_assignments": return { data: h.db.bookings, error: null };
        case "vendor_bills": return { data: h.db.bills, error: null };
        default: return { data: [], error: null };
      }
    })
  ),
}));
vi.mock("@/lib/api/financials", () => ({ getMonthlyRevenue: vi.fn(async () => h.snap.monthly) }));
vi.mock("@/lib/api/ar-aging", () => ({ getArAgingSummary: vi.fn(async () => h.snap.ar) }));
vi.mock("@/lib/api/vendor-bills", () => ({ getApSummary: vi.fn(async () => h.snap.ap) }));
vi.mock("@/lib/api/project-pnl", () => ({ getPnlPortfolio: vi.fn(async () => h.snap.portfolio) }));
vi.mock("@/lib/api/wip", () => ({ getWipPortfolio: vi.fn(async () => h.snap.wip) }));

import { getSalesPipeline, PIPELINE_STATUS_ORDER } from "@/lib/api/reports/pipeline";
import { getLabourUtilizationReport } from "@/lib/api/reports/labour-utilization";
import { getVendorSpendReport } from "@/lib/api/reports/vendor-spend";
import { getBusinessSnapshot } from "@/lib/api/reports/business-snapshot";
import {
  pipelineDataset,
  labourUtilizationDataset,
  inventoryValuationDataset,
  businessSnapshotDataset,
} from "@/lib/reports/datasets/operational";
import type { InventoryReportData } from "@/lib/api/products";

describe("sales pipeline", () => {
  it("counts + values per status; conversion = converted ÷ non-draft; no fabricated Lead", async () => {
    h.quotes = [
      { status: "Draft", total: 1000, createdAt: "2026-05-01" },
      { status: "Sent", total: 2000, createdAt: "2026-05-02" },
      { status: "Sent", total: 500, createdAt: "2026-05-03" },
      { status: "Converted", total: 4000, createdAt: "2026-05-04" },
      { status: "Closed", total: 300, createdAt: "2026-05-05" },
    ];
    const p = await getSalesPipeline();
    const sent = p.byStatus.find((s) => s.status === "Sent")!;
    expect(sent.count).toBe(2);
    expect(sent.value).toBe(2500);
    // non-draft = 4 (2 Sent + 1 Converted + 1 Closed); converted = 1 → 25%
    expect(p.totals.conversion_rate).toBe(25);
    // never a "Lead" stage
    expect(PIPELINE_STATUS_ORDER).not.toContain("Lead" as never);
    expect(p.byStatus.every((s) => s.status !== ("Lead" as never))).toBe(true);
  });

  it("conversion_rate null when nothing has left Draft", async () => {
    h.quotes = [{ status: "Draft", total: 100, createdAt: "2026-05-01" }];
    expect((await getSalesPipeline()).totals.conversion_rate).toBeNull();
  });

  it("dataset carries conversion rate in meta, not a fabricated column", () => {
    const ds = pipelineDataset({ byStatus: [{ status: "Sent", count: 1, value: 10 }], totals: { total_count: 1, total_value: 10, conversion_rate: 50 } } as never);
    expect(ds.columns.map((c) => c.key)).toEqual(["status", "count", "value"]);
    expect(ds.meta!.some((m) => m.label === "Conversion rate" && m.value === "50.0%")).toBe(true);
  });
});

describe("labour utilization — unknown-hours exclusion + no billable field", () => {
  beforeEach(() => {
    h.db.techs = [{ id: "A", name: "Ana" }, { id: "B", name: "Bob" }];
    // Ana has all-week hours; Bob has NONE (unknown capacity).
    h.db.hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tech_id: "A", day_of_week: d, start_time: "00:00", end_time: "23:59" }));
    h.db.absences = [];
    h.db.bookings = [
      { tech_id: "A", starts_at: "2026-07-20T09:00:00.000Z", ends_at: "2026-07-20T13:00:00.000Z", status: "scheduled" },
      { tech_id: "B", starts_at: "2026-07-20T09:00:00.000Z", ends_at: "2026-07-20T11:00:00.000Z", status: "scheduled" },
    ];
  });

  it("Bob (no hours) → null util + null available, excluded from the overall denominator", async () => {
    const rep = await getLabourUtilizationReport({ from: "2026-07-20T00:00:00.000Z", to: "2026-07-22T00:00:00.000Z" });
    const bob = rep.techs.find((t) => t.tech === "Bob")!;
    expect(bob.available_hours).toBeNull();
    expect(bob.utilization_pct).toBeNull();
    expect(bob.booked_hours).toBeGreaterThan(0); // he still has a booking — just no known capacity
    // Overall available comes only from Ana (known hours); Bob's 2h booking is NOT
    // added to the overall available as a fake 0-capacity denominator.
    const ana = rep.techs.find((t) => t.tech === "Ana")!;
    expect(ana.available_hours).toBeGreaterThan(0);
    expect(rep.overall.utilization_pct).not.toBeNull();
  });

  it("the report shape has NO billable field (no source exists)", async () => {
    const rep = await getLabourUtilizationReport({ from: "2026-07-20T00:00:00.000Z", to: "2026-07-22T00:00:00.000Z" });
    const keys = Object.keys(rep.techs[0]);
    expect(keys).not.toContain("billable_hours");
    expect(keys).not.toContain("billable");
    expect(keys).not.toContain("nonbillable_hours");
  });

  it("dataset renders unknown hours as — not 0", () => {
    const ds = labourUtilizationDataset({
      from: "2026-07-20", to: "2026-07-22",
      techs: [{ tech_id: "B", tech: "Bob", booked_hours: 2, available_hours: null, utilization_pct: null }],
      overall: { booked: 0, available: 0, utilization_pct: null },
    });
    expect(ds.rows[0].available).toBe("—");
    expect(ds.rows[0].util).toBe("—");
  });
});

describe("vendor spend", () => {
  it("Σ subtotal by vendor desc, top-N with an others line", async () => {
    h.db.bills = [
      { vendor_id: "v1", subtotal: 100, vendor: { name: "Alpha" } },
      { vendor_id: "v1", subtotal: 50, vendor: { name: "Alpha" } },
      { vendor_id: "v2", subtotal: 300, vendor: { name: "Beta" } },
      { vendor_id: "v3", subtotal: 10, vendor: { name: "Gamma" } },
    ];
    const r = await getVendorSpendReport({ limit: 2 });
    expect(r.rows.map((x) => x.vendor)).toEqual(["Beta", "Alpha"]); // 300, 150
    expect(r.rows[1].bill_count).toBe(2);
    expect(r.total_spend).toBe(460);
    expect(r.others.vendor_count).toBe(1); // Gamma dropped past top-2
    expect(r.others.spend).toBe(10);
  });
});

describe("inventory valuation dataset", () => {
  it("category rows + total (units + value)", () => {
    const data: InventoryReportData = {
      totalValuation: 300,
      valuationByCategory: [
        { category: "Wire", value: 200, units: 40 },
        { category: "Panels", value: 100, units: 5 },
      ],
      aging: [], consumption90d: { value: 0, units: 0 },
    };
    const ds = inventoryValuationDataset(data);
    expect(ds.rows).toHaveLength(2);
    expect(ds.totals!.value).toBe(300);
    expect(ds.totals!.units).toBe(45);
  });
});

describe("business snapshot — real metrics only, NO valuation", () => {
  beforeEach(() => {
    // 4 months (oldest→newest); the last is the current partial month and is dropped.
    h.snap.monthly = [
      { month: "2026-03", invoiced: 30000, collected: 0 },
      { month: "2026-04", invoiced: 30000, collected: 0 },
      { month: "2026-05", invoiced: 30000, collected: 0 },
      { month: "2026-06", invoiced: 999999, collected: 0 }, // current partial — dropped
    ];
    h.snap.ar = { total: 5000 };
    h.snap.ap = { outstanding: 2000 };
    h.snap.portfolio = [
      { revenue: 100000, gross_profit: 40000 },
      { revenue: 50000, gross_profit: 5000 },
    ];
    h.snap.wip = { rows: [{ contract: 80000, billed: 30000 }, { contract: 20000, billed: 5000 }] };
  });

  it("run-rate = avg of trailing 3 complete months × 12; backlog = Σ(contract − billed)", async () => {
    const s = await getBusinessSnapshot();
    // (30000×3 / 3) × 12 = 360000 — the partial June is excluded
    expect(s.revenue_run_rate).toBe(360000);
    expect(s.run_rate_basis_months).toBe(3);
    // backlog = (80000−30000) + (20000−5000) = 65000
    expect(s.contract_backlog).toBe(65000);
    // blended margin = 45000 / 150000 = 30%
    expect(s.blended_margin_pct).toBe(30);
    expect(s.net_position).toBe(3000); // 5000 − 2000
  });

  it("neither the aggregate nor the dataset invents a valuation / multiple / recurring line", async () => {
    const s = await getBusinessSnapshot();
    const keys = Object.keys(s);
    for (const forbidden of ["valuation", "multiple", "enterprise_value", "mrr", "recurring", "cash_on_hand", "cash_balance"]) {
      expect(keys).not.toContain(forbidden);
    }
    const ds = businessSnapshotDataset(s);
    const metrics = ds.rows.map((r) => String(r.metric).toLowerCase());
    expect(metrics.some((m) => m.includes("valuation") || m.includes("multiple") || m.includes("recurring") || m.includes("mrr"))).toBe(false);
    // The honesty label is present.
    expect(ds.subtitle).toContain("not a business valuation");
  });
});
