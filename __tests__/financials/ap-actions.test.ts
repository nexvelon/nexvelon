// FIN-6 — gates on the AP aging / vendor statement / CSV actions.
//
// These sit at financials:view rather than the spec's proposed financials:edit.
// FIN-5 already exposes every underlying bill (vendor, total, balance) at view
// via listBillsAction, so gating the summary tighter than its own source rows
// would protect nothing. See the note in the actions file.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  getApAgingSummary: vi.fn(async () => ({
    buckets: { current: 10, d1_30: 20, d31_60: 0, d61_90: 0, d90_plus: 5 },
    total: 35,
    overdueTotal: 25,
    asOf: "2026-07-20",
  })),
  getApAgingByVendor: vi.fn(async () => [{ vendor_id: "v1", total: 35 }]),
  getVendorStatement: vi.fn(async () => ({ vendor_id: "v1", lines: [] })),
  buildApAgingCsv: vi.fn(
    async () =>
      "Vendor,Bill,PO,Bill date,Due date,Total,Paid,Balance,Days past due,Bucket\r\n" +
      '"ADI, Inc.",VB-1,PO-1,2026-06-01,2026-06-30,100.00,0.00,100.00,20,1–30'
  ),
}));

vi.mock("@/lib/api/ap-aging", () => ({
  getApAgingSummary: h.getApAgingSummary,
  getApAgingByVendor: h.getApAgingByVendor,
  getVendorStatement: h.getVendorStatement,
  buildApAgingCsv: h.buildApAgingCsv,
}));
vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(),
  getMonthlyRevenue: vi.fn(),
  listInvoicesReal: vi.fn(),
  getProjectFinancialSummaries: vi.fn(),
  getTaxCollectedSummary: vi.fn(),
}));
vi.mock("@/lib/api/ar-aging", () => ({
  getArAgingSummary: vi.fn(),
  getArAgingByClient: vi.fn(),
  getClientStatement: vi.fn(),
  buildArAgingCsv: vi.fn(),
}));
vi.mock("@/lib/api/deposits", () => ({
  listDepositsForProject: vi.fn(),
  getProjectDepositBalance: vi.fn(),
  getDepositsHeldTotal: vi.fn(),
  recordDeposit: vi.fn(),
  deleteDeposit: vi.fn(),
  applyDepositToInvoice: vi.fn(),
  unapplyDeposit: vi.fn(),
}));
vi.mock("@/lib/api/vendor-bills", () => ({
  listBills: vi.fn(),
  getBillById: vi.fn(),
  listBillsForPurchaseOrder: vi.fn(),
  getApSummary: vi.fn(),
  getBillFormOptions: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  voidBill: vi.fn(),
  recordBillPayment: vi.fn(),
  deleteBillPayment: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getApAgingSummaryAction,
  getApAgingByVendorAction,
  getVendorStatementAction,
  exportApAgingCsvAction,
} from "@/app/(app)/financials/actions";

const AP_ACTIONS = [
  () => getApAgingSummaryAction(),
  () => getApAgingByVendorAction(),
  () => getVendorStatementAction("v1"),
  () => exportApAgingCsvAction(),
];

const LIB_FNS = [
  h.getApAgingSummary,
  h.getApAgingByVendor,
  h.getVendorStatement,
  h.buildApAgingCsv,
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of LIB_FNS) fn.mockClear();
});

describe("AP aging action gates", () => {
  it("all reject a role with no financials access (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    for (const call of AP_ACTIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all reject an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of AP_ACTIONS) expect((await call()).ok).toBe(false);
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all pass for Accountant", async () => {
    for (const call of AP_ACTIONS) expect((await call()).ok).toBe(true);
    for (const fn of LIB_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pass at view tier (ProjectManager) — matching FIN-5's bill reads", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of AP_ACTIONS) expect((await call()).ok).toBe(true);
  });

  it("rejects a statement request with no vendor id", async () => {
    const res = await getVendorStatementAction("");
    expect(res.ok).toBe(false);
    expect(h.getVendorStatement).not.toHaveBeenCalled();
  });
});

describe("exportApAgingCsvAction", () => {
  it("returns the CSV plus a dated filename", async () => {
    const res = await exportApAgingCsvAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lines = res.data.csv.split("\r\n");
    expect(lines[0]).toBe(
      "Vendor,Bill,PO,Bill date,Due date,Total,Paid,Balance,Days past due,Bucket"
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"ADI, Inc."');
    expect(res.data.filename).toMatch(/^nexvelon-ap-aging-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
