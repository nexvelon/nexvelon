// FIN-7 — gates on the HST net-position actions. These sit at financials:edit
// (the net position is a CRA liability combining revenue with cost-side ITCs),
// unlike FIN-1's collected-only summary which stays at financials:view.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  getItcSummary: vi.fn(async () => ({ byOpco: [], total: 0, unassigned: 0 })),
  getHstNetPosition: vi.fn(async () => ({
    byOpco: [],
    totals: { collected: 0, itc: 0, net: 0 },
    unassignedItc: 0,
    from: null,
    to: null,
  })),
  buildHstReturnCsv: vi.fn(
    async () =>
      "Entity,Period from,Period to,HST collected,Input tax credits,Net owing\r\n" +
      '"Nexvelon Guardian, Inc.",2026-07-01,2026-07-31,100.00,30.00,70.00'
  ),
  getTaxCollectedSummary: vi.fn(async () => ({ byOpco: [], total: 0 })),
}));

vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(),
  getMonthlyRevenue: vi.fn(),
  listInvoicesReal: vi.fn(),
  getProjectFinancialSummaries: vi.fn(),
  getTaxCollectedSummary: h.getTaxCollectedSummary,
  getItcSummary: h.getItcSummary,
  getHstNetPosition: h.getHstNetPosition,
  buildHstReturnCsv: h.buildHstReturnCsv,
}));
vi.mock("@/lib/api/ar-aging", () => ({
  getArAgingSummary: vi.fn(),
  getArAgingByClient: vi.fn(),
  getClientStatement: vi.fn(),
  buildArAgingCsv: vi.fn(),
}));
vi.mock("@/lib/api/ap-aging", () => ({
  getApAgingSummary: vi.fn(),
  getApAgingByVendor: vi.fn(),
  getVendorStatement: vi.fn(),
  buildApAgingCsv: vi.fn(),
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
  getItcSummaryAction,
  getHstNetPositionAction,
  exportHstReturnCsvAction,
  getTaxCollectedSummaryAction,
} from "@/app/(app)/financials/actions";

const TAX_ACTIONS = [
  () => getItcSummaryAction({}),
  () => getHstNetPositionAction({}),
  () => exportHstReturnCsvAction({}),
];

const LIB_FNS = [h.getItcSummary, h.getHstNetPosition, h.buildHstReturnCsv];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of [...LIB_FNS, h.getTaxCollectedSummary]) fn.mockClear();
});

describe("HST net position gates", () => {
  it("all reject a financials:view-only role (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of TAX_ACTIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all reject an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of TAX_ACTIONS) expect((await call()).ok).toBe(false);
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all pass for Accountant (financials:edit)", async () => {
    for (const call of TAX_ACTIONS) expect((await call()).ok).toBe(true);
    for (const fn of LIB_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });

  it("FIN-1's collected-only summary stays at view tier", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await getTaxCollectedSummaryAction({});
    expect(res.ok).toBe(true);
    expect(h.getTaxCollectedSummary).toHaveBeenCalledTimes(1);
  });
});

describe("exportHstReturnCsvAction", () => {
  it("returns per-opco rows with a period-stamped filename", async () => {
    const res = await exportHstReturnCsvAction({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lines = res.data.csv.split("\r\n");
    expect(lines[0]).toBe(
      "Entity,Period from,Period to,HST collected,Input tax credits,Net owing"
    );
    // an entity name containing a comma stays quoted
    expect(lines[1]).toContain('"Nexvelon Guardian, Inc."');
    expect(res.data.filename).toBe("nexvelon-hst-return-2026-07-01_2026-07-31.csv");
  });
});
