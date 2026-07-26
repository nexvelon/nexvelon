// REP-2 — the financial dataset builders are pure (source data → ReportDataset).
// Each maps its source's columns/rows/totals correctly, per-opco reports never
// emit a blended cross-opco total, and the profitability ranking sorts by gross
// profit descending.

import { describe, it, expect } from "vitest";
import {
  opcoPnlDataset,
  marginDataset,
  profitabilityDataset,
  arAgingDataset,
  apAgingDataset,
  hstDataset,
  t5018Dataset,
} from "@/lib/reports/datasets/financial";
import { formatCell } from "@/lib/reports/dataset";
import type { OpcoPnl, PnlPortfolioRow } from "@/lib/api/project-pnl";
import type { ArAgingClientRow } from "@/lib/api/ar-aging";
import type { ApAgingVendorRow } from "@/lib/api/ap-aging";
import type { HstNetPosition } from "@/lib/api/financials";
import type { T5018Report } from "@/lib/api/t5018";

const opco = (over: Partial<OpcoPnl>): OpcoPnl => ({
  opco: "integrated_solutions",
  project_count: 2,
  revenue: 100000,
  materials_billed: 30000,
  labour: 20000,
  sub_labour: 10000,
  canonical_direct: 60000,
  gross_profit: 40000,
  gross_margin_pct: 40,
  memo: {
    contract_quoted: 0, po_committed_open: 0, deposits_held: 0,
    holdback_retained: 0, ar_balance: 0, ap_balance: 0,
  },
  ...over,
});

describe("opcoPnlDataset (P&L by company)", () => {
  it("maps OpcoPnl → OPCO_PNL_CSV_HEADER columns, full entity name, 0..100 margin", () => {
    const ds = opcoPnlDataset([opco({})]);
    expect(ds.columns.map((c) => c.label)).toEqual([
      "Entity", "Projects", "Revenue", "Materials (supplier bills)",
      "Labour", "Subcontractors", "Direct cost", "Gross profit", "Gross margin %",
    ]);
    expect(ds.rows[0].entity).toBe("Nexvelon Integrated Solutions");
    expect(ds.rows[0].revenue).toBe(100000);
    expect(formatCell(ds.rows[0].margin_pct, "percent")).toBe("40.0%");
  });

  it("emits NO totals row — the two corporations are never blended", () => {
    const ds = opcoPnlDataset([
      opco({ opco: "integrated_solutions", revenue: 100000 }),
      opco({ opco: "guardian", revenue: 50000 }),
    ]);
    expect(ds.rows).toHaveLength(2);
    expect(ds.totals).toBeUndefined();
  });
});

const proj = (over: Partial<PnlPortfolioRow>): PnlPortfolioRow => ({
  project_id: "p", number: "P-1", title: "Tower", opco: "guardian",
  status: "active", revenue: 100000, canonical_direct: 60000,
  gross_profit: 40000, gross_margin_pct: 40, billed_pct: 0.5,
  ...over,
});

describe("marginDataset", () => {
  it("maps per-project rows and totals; billed_pct ratio → percent scale", () => {
    const ds = marginDataset([proj({}), proj({ project_id: "q", number: "P-2", revenue: 50000, canonical_direct: 40000, gross_profit: 10000 })]);
    expect(ds.rows[0].billed_pct).toBe(50); // 0.5 ratio → 50 for percent kind
    // totals: revenue 150k, cost 100k, gp 50k, margin 33.3%
    expect(ds.totals!.revenue).toBe(150000);
    expect(ds.totals!.gross_profit).toBe(50000);
    expect(formatCell(ds.totals!.margin_pct, "percent")).toBe("33.3%");
  });
});

describe("profitabilityDataset", () => {
  it("ranks by gross profit DESC and numbers the rank column", () => {
    const ds = profitabilityDataset([
      proj({ project_id: "a", number: "A", gross_profit: 10000 }),
      proj({ project_id: "b", number: "B", gross_profit: 90000 }),
      proj({ project_id: "c", number: "C", gross_profit: 50000 }),
    ]);
    expect(ds.rows.map((r) => r.number)).toEqual(["B", "C", "A"]);
    expect(ds.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

const arRow = (over: Partial<ArAgingClientRow>): ArAgingClientRow => ({
  client_id: "c", client_name: "Acme", current: 100, d1_30: 200,
  d31_60: 0, d61_90: 0, d90_plus: 400, total: 700, oldest_days: 95,
  ...over,
});

describe("arAgingDataset / apAgingDataset", () => {
  it("AR: client + 5 buckets + total, with a summed totals row", () => {
    const ds = arAgingDataset([arRow({}), arRow({ client_id: "d", client_name: "Beta", current: 50, d1_30: 0, d90_plus: 0, total: 50 })]);
    expect(ds.columns.map((c) => c.label)).toEqual(["Client", "Current", "1–30", "31–60", "61–90", "90+", "Total"]);
    expect(ds.totals!.total).toBe(750);
    expect(ds.totals!.current).toBe(150);
    expect(ds.totals!.d90_plus).toBe(400);
  });

  it("AP: vendor column + summed totals", () => {
    const apRow: ApAgingVendorRow = {
      vendor_id: "v", vendor_name: "Supplier", current: 0, d1_30: 300,
      d31_60: 0, d61_90: 0, d90_plus: 0, total: 300, oldest_days: 20,
    };
    const ds = apAgingDataset([apRow]);
    expect(ds.columns[0].label).toBe("Vendor");
    expect(ds.totals!.total).toBe(300);
  });
});

describe("hstDataset", () => {
  const position: HstNetPosition = {
    byOpco: [
      { opco: "integrated_solutions", collected: 5000, itc: 2000, net: 3000 },
      { opco: "guardian", collected: 1000, itc: 1500, net: -500 },
    ],
    totals: { collected: 6000, itc: 3500, net: 2500 },
    unassignedItc: 250,
    from: "2026-01-01",
    to: "2026-03-31",
  };

  it("is per-opco with NO blended totals row; surfaces the unassigned ITC line", () => {
    const ds = hstDataset(position);
    expect(ds.totals).toBeUndefined(); // never blend opcos
    // 2 opco rows + 1 unassigned row
    expect(ds.rows).toHaveLength(3);
    expect(ds.rows[0].entity).toBe("Nexvelon Integrated Solutions");
    expect(ds.rows[2].entity).toContain("UNASSIGNED");
    expect(ds.rows[2].itc).toBe(250);
    // period → meta, not a per-row column
    expect(ds.meta![0].label).toBe("Period");
  });

  it("omits the unassigned line when there is none", () => {
    const ds = hstDataset({ ...position, unassignedItc: 0 });
    expect(ds.rows).toHaveLength(2);
  });
});

describe("t5018Dataset", () => {
  const report: T5018Report = {
    year: 2026,
    period: { from: "2026-01-01", to: "2026-12-31" },
    rows: [
      {
        subcontractor_id: "s", name: "Bob's Wiring Ltd.", business_number: "123456789RT0001",
        gst_hst_number: null,
        address: { line1: "1 Main St", line2: null, city: "Toronto", province: "ON", postal_code: "M1M1M1" },
        total_paid: 12000, payment_count: 3, first_payment: "2026-02-01", last_payment: "2026-11-01",
        missing_business_number: false, below_threshold: false,
      },
    ],
    totals: { subcontractor_count: 1, total_paid: 12000, rows_missing_business_number: 0 },
  };

  it("maps SUB-7 columns + year meta + total-paid totals row", () => {
    const ds = t5018Dataset(report);
    expect(ds.columns[0].label).toBe("Legal name");
    expect(ds.columns).toHaveLength(14);
    expect(ds.rows[0].name).toBe("Bob's Wiring Ltd.");
    expect(ds.rows[0].below).toBe("No");
    expect(ds.meta!.some((m) => m.label === "Year" && m.value === "2026")).toBe(true);
    expect(ds.totals!.total_paid).toBe(12000);
  });

  it("empty year → headers + zero total, not an error", () => {
    const ds = t5018Dataset({ ...report, rows: [], totals: { subcontractor_count: 0, total_paid: 0, rows_missing_business_number: 0 } });
    expect(ds.rows).toHaveLength(0);
    expect(ds.totals!.total_paid).toBe(0);
  });
});
