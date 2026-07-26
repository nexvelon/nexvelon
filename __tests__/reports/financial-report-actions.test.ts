// REP-2 — the financial report dispatcher gates each report at its own tier
// (AR/AP aging at financials:view; P&L / margin / profitability / HST / T5018 at
// financials:edit) and exports CSV / xlsx / PDF with the right extension + mime.
// An empty source yields a headers-only file, not an error.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { OpcoPnl, PnlPortfolioRow } from "@/lib/api/project-pnl";
import type { ArAgingClientRow } from "@/lib/api/ar-aging";
import type { ApAgingVendorRow } from "@/lib/api/ap-aging";
import type { HstNetPosition } from "@/lib/api/financials";
import type { T5018Report } from "@/lib/api/t5018";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  opco: [] as OpcoPnl[],
  portfolio: [] as PnlPortfolioRow[],
  ar: [] as ArAgingClientRow[],
  ap: [] as ApAgingVendorRow[],
  hst: {
    byOpco: [{ opco: "guardian", collected: 100, itc: 40, net: 60 }],
    totals: { collected: 100, itc: 40, net: 60 },
    unassignedItc: 0, from: null, to: null,
  } as HstNetPosition,
  t5018: {
    year: 2026, period: { from: "2026-01-01", to: "2026-12-31" },
    rows: [], totals: { subcontractor_count: 0, total_paid: 0, rows_missing_business_number: 0 },
  } as T5018Report,
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/project-pnl", () => ({
  getOpcoPnl: vi.fn(async () => h.opco),
  getPnlPortfolio: vi.fn(async () => h.portfolio),
}));
vi.mock("@/lib/api/ar-aging", () => ({ getArAgingByClient: vi.fn(async () => h.ar) }));
vi.mock("@/lib/api/ap-aging", () => ({ getApAgingByVendor: vi.fn(async () => h.ap) }));
vi.mock("@/lib/api/financials", () => ({ getHstNetPosition: vi.fn(async () => h.hst) }));
vi.mock("@/lib/api/t5018", () => ({ getT5018Report: vi.fn(async () => h.t5018) }));

import {
  getFinancialReportAction,
  exportFinancialReportAction,
  type FinancialReportKey,
} from "@/app/(app)/reports/financial-actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

const EDIT_REPORTS: FinancialReportKey[] = ["opco-pnl", "margin", "profitability", "hst", "t5018"];
const VIEW_REPORTS: FinancialReportKey[] = ["ar-aging", "ap-aging"];

describe("tier gating", () => {
  it("edit-tier reports: denied for a view-only role (ProjectManager), allowed for Admin", async () => {
    for (const reportKey of EDIT_REPORTS) {
      h.profile = { id: "u1", role: "ProjectManager", status: "Active" }; // has financials:view, NOT edit
      expect((await getFinancialReportAction({ reportKey })).ok).toBe(false);
      expect((await exportFinancialReportAction({ reportKey, format: "csv" })).ok).toBe(false);
      h.profile = { id: "u1", role: "Admin", status: "Active" };
      expect((await getFinancialReportAction({ reportKey })).ok).toBe(true);
    }
  });

  it("view-tier reports: allowed for ProjectManager, denied for Technician", async () => {
    for (const reportKey of VIEW_REPORTS) {
      h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
      expect((await getFinancialReportAction({ reportKey })).ok).toBe(true);
      h.profile = { id: "u1", role: "Technician", status: "Active" };
      expect((await getFinancialReportAction({ reportKey })).ok).toBe(false);
      expect((await exportFinancialReportAction({ reportKey, format: "csv" })).ok).toBe(false);
    }
  });

  it("Accountant (edit) can export a cost report", async () => {
    h.profile = { id: "u1", role: "Accountant", status: "Active" };
    expect((await exportFinancialReportAction({ reportKey: "opco-pnl", format: "csv" })).ok).toBe(true);
  });
});

describe("export formats", () => {
  beforeEach(() => {
    h.ar = [{
      client_id: "c", client_name: "Acme", current: 100, d1_30: 0,
      d31_60: 0, d61_90: 0, d90_plus: 0, total: 100, oldest_days: 5,
    }];
  });

  it("csv → text/.csv with header", async () => {
    const r = await exportFinancialReportAction({ reportKey: "ar-aging", format: "csv" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.csv$/);
      expect(r.data.mime).toContain("text/csv");
      expect(r.data.encoding).toBe("text");
      expect(r.data.data).toContain("Client,Current,1"); // header
    }
  });

  it("xlsx → base64/.xlsx with spreadsheet mime", async () => {
    const r = await exportFinancialReportAction({ reportKey: "ar-aging", format: "xlsx" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.xlsx$/);
      expect(r.data.mime).toContain("spreadsheetml");
      expect(r.data.encoding).toBe("base64");
    }
  });

  it("pdf → base64/.pdf (%PDF)", async () => {
    const r = await exportFinancialReportAction({ reportKey: "ar-aging", format: "pdf" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.pdf$/);
      expect(r.data.mime).toBe("application/pdf");
      expect(r.data.data.startsWith("JVBER")).toBe(true);
    }
  }, 20_000);
});

describe("empty source", () => {
  it("T5018 with no rows → headers-only CSV, not an error", async () => {
    h.t5018 = { year: 2026, period: { from: "2026-01-01", to: "2026-12-31" }, rows: [], totals: { subcontractor_count: 0, total_paid: 0, rows_missing_business_number: 0 } };
    const r = await exportFinancialReportAction({ reportKey: "t5018", format: "csv" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const lines = r.data.data.trimEnd().split("\r\n");
      expect(lines[0]).toContain("Legal name"); // header present
    }
  });

  it("empty opco P&L → dataset with zero rows, still ok", async () => {
    h.opco = [];
    const r = await getFinancialReportAction({ reportKey: "opco-pnl" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rows).toHaveLength(0);
  });
});
