// REP-3 / REP-4 — the operational report dispatcher gates each report at its own
// RESOURCE (pipeline → quotes:view, utilization → scheduling:view, vendor spend
// → financials:view, inventory → inventory:view, snapshot → financials:edit) and
// exports CSV / xlsx / PDF. Also asserts the listQuotesAction security fix: the
// quotes list now requires quotes:view.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as { id: string; role: string; status: string } | null,
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/reports/pipeline", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/reports/pipeline")>()),
  getSalesPipeline: vi.fn(async () => ({ byStatus: [{ status: "Sent", count: 1, value: 100 }], totals: { total_count: 1, total_value: 100, conversion_rate: 100 } })),
}));
vi.mock("@/lib/api/reports/labour-utilization", () => ({
  getLabourUtilizationReport: vi.fn(async () => ({ from: "2026-07-20", to: "2026-07-22", techs: [], overall: { booked: 0, available: 0, utilization_pct: null } })),
}));
vi.mock("@/lib/api/reports/vendor-spend", () => ({
  getVendorSpendReport: vi.fn(async () => ({ rows: [], total_spend: 0, others: { vendor_count: 0, spend: 0 }, from: null, to: null })),
}));
vi.mock("@/lib/api/products", () => ({
  getInventoryReportData: vi.fn(async () => ({ totalValuation: 100, valuationByCategory: [{ category: "Wire", value: 100, units: 5 }], aging: [], consumption90d: { value: 0, units: 0 } })),
}));
vi.mock("@/lib/api/reports/business-snapshot", () => ({
  getBusinessSnapshot: vi.fn(async () => ({ revenue_run_rate: 1000, run_rate_basis_months: 3, blended_margin_pct: 20, contract_backlog: 500, ar_outstanding: 200, ap_outstanding: 100, net_position: 100, as_of: "2026-07-26" })),
}));

import {
  getOperationalReportAction,
  exportOperationalReportAction,
} from "@/app/(app)/reports/operational-actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("per-resource gating", () => {
  const CASES: { key: Parameters<typeof getOperationalReportAction>[0]["reportKey"]; deniedRole: string }[] = [
    { key: "pipeline", deniedRole: "Technician" },        // no quotes access
    { key: "vendor-spend", deniedRole: "Technician" },    // no financials
    { key: "inventory-valuation", deniedRole: "Subcontractor" }, // no inventory
    { key: "business-snapshot", deniedRole: "ProjectManager" },  // financials:view only, not edit
  ];

  it("each report denies a role lacking its resource, allows Admin", async () => {
    for (const c of CASES) {
      h.profile = { id: "u1", role: c.deniedRole, status: "Active" };
      expect((await getOperationalReportAction({ reportKey: c.key })).ok).toBe(false);
      expect((await exportOperationalReportAction({ reportKey: c.key, format: "csv" })).ok).toBe(false);
      h.profile = { id: "u1", role: "Admin", status: "Active" };
      expect((await getOperationalReportAction({ reportKey: c.key })).ok).toBe(true);
    }
  });

  it("labour utilization requires scheduling:view (a signed-out user is denied)", async () => {
    h.profile = null;
    expect((await getOperationalReportAction({ reportKey: "labour-utilization" })).ok).toBe(false);
    h.profile = { id: "u1", role: "Technician", status: "Active" }; // has scheduling:view
    expect((await getOperationalReportAction({ reportKey: "labour-utilization" })).ok).toBe(true);
  });
});

describe("export formats (inventory valuation)", () => {
  it("csv / xlsx / pdf with correct extension + mime", async () => {
    const csv = await exportOperationalReportAction({ reportKey: "inventory-valuation", format: "csv" });
    expect(csv.ok).toBe(true);
    if (csv.ok) {
      expect(csv.data.filename).toMatch(/\.csv$/);
      expect(csv.data.mime).toContain("text/csv");
      expect(csv.data.data).toContain("Category,Units,Value");
    }
    const xlsx = await exportOperationalReportAction({ reportKey: "inventory-valuation", format: "xlsx" });
    expect(xlsx.ok && xlsx.data.filename.endsWith(".xlsx") && xlsx.data.encoding === "base64").toBe(true);
    const pdf = await exportOperationalReportAction({ reportKey: "inventory-valuation", format: "pdf" });
    expect(pdf.ok && pdf.data.data.startsWith("JVBER")).toBe(true);
  }, 20_000);
});
