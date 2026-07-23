// SUB-4 — gates on the subcontractor-bill surfaces. Creating a sub bill is an AP
// mutation (financials:edit); the sub detail page's Bills list + the picker
// options are reads (financials:view). Same tiers FIN-5 established.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  createBill: vi.fn(async () => ({ id: "b1", project_id: null, purchase_order_id: null })),
  listBills: vi.fn(async () => [{ id: "b1" }]),
  getBillSubcontractorOptions: vi.fn(async () => []),
}));

vi.mock("@/lib/api/vendor-bills", () => ({
  listBills: h.listBills,
  getBillById: vi.fn(),
  listBillsForPurchaseOrder: vi.fn(),
  getApSummary: vi.fn(),
  createBill: h.createBill,
  updateBill: vi.fn(),
  voidBill: vi.fn(),
  recordBillPayment: vi.fn(),
  deleteBillPayment: vi.fn(),
}));
vi.mock("@/lib/api/subcontractor-compliance", () => ({
  getBillSubcontractorOptions: h.getBillSubcontractorOptions,
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
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createBillAction,
  listBillsForSubcontractorAction,
  getBillSubcontractorOptionsAction,
} from "@/app/(app)/financials/actions";

const SUB_BILL = {
  vendorId: "v1",
  subcontractorId: "subA",
  billNumber: "SUB-1",
  billDate: "2026-07-01",
  subtotal: 1000,
  taxAmount: 130,
  total: 1130,
};

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  h.createBill.mockClear();
  h.listBills.mockClear();
  h.getBillSubcontractorOptions.mockClear();
});

describe("creating a sub bill requires financials:edit", () => {
  it("rejects a financials:view-only role (ProjectManager) without calling createBill", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await createBillAction(SUB_BILL);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.createBill).not.toHaveBeenCalled();
  });

  it("passes for Accountant (financials:edit) and forwards the subcontractorId", async () => {
    const res = await createBillAction(SUB_BILL);
    expect(res.ok).toBe(true);
    expect(h.createBill).toHaveBeenCalledTimes(1);
    expect((h.createBill.mock.calls[0] as unknown[])[0]).toMatchObject({ subcontractorId: "subA" });
  });
});

describe("sub bills list + picker options require financials:view", () => {
  it("pass at financials:view (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    expect((await listBillsForSubcontractorAction("subA")).ok).toBe(true);
    expect((await getBillSubcontractorOptionsAction()).ok).toBe(true);
    expect(h.listBills).toHaveBeenCalledWith({ subcontractorId: "subA" });
  });

  it("reject a role with no financials access (SalesRep) without hitting the API", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    expect((await listBillsForSubcontractorAction("subA")).ok).toBe(false);
    expect((await getBillSubcontractorOptionsAction()).ok).toBe(false);
    expect(h.listBills).not.toHaveBeenCalled();
    expect(h.getBillSubcontractorOptions).not.toHaveBeenCalled();
  });
});
