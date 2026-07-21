// FIN-5 — gates on the AP actions. Reads sit at financials:view; every mutation
// requires financials:edit, matching FIN-2 payments and FIN-4 deposits.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  listBills: vi.fn(async () => [{ id: "b1" }]),
  getBillById: vi.fn(async () => ({ bill: { id: "b1" } })),
  listBillsForPurchaseOrder: vi.fn(async () => []),
  getApSummary: vi.fn(async () => ({ outstanding: 100, overdue: 0, billCount: 1 })),
  createBill: vi.fn(async () => ({ id: "b1", project_id: null, purchase_order_id: null })),
  updateBill: vi.fn(async () => ({ id: "b1", project_id: null, purchase_order_id: null })),
  voidBill: vi.fn(async () => ({ id: "b1", project_id: null, purchase_order_id: null })),
  recordBillPayment: vi.fn(async () => ({
    bill: { id: "b1", project_id: null, purchase_order_id: null },
    payments: [],
  })),
  deleteBillPayment: vi.fn(async () => ({
    bill: { id: "b1", project_id: null, purchase_order_id: null },
    payments: [],
  })),
}));

vi.mock("@/lib/api/vendor-bills", () => ({
  listBills: h.listBills,
  getBillById: h.getBillById,
  listBillsForPurchaseOrder: h.listBillsForPurchaseOrder,
  getApSummary: h.getApSummary,
  createBill: h.createBill,
  updateBill: h.updateBill,
  voidBill: h.voidBill,
  recordBillPayment: h.recordBillPayment,
  deleteBillPayment: h.deleteBillPayment,
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
  listBillsAction,
  getBillByIdAction,
  getApSummaryAction,
  createBillAction,
  updateBillAction,
  voidBillAction,
  recordBillPaymentAction,
  deleteBillPaymentAction,
} from "@/app/(app)/financials/actions";

const NEW_BILL = {
  vendorId: "v1",
  billNumber: "VB-1",
  billDate: "2026-07-01",
  subtotal: 100,
  taxAmount: 13,
  total: 113,
};

const MUTATIONS = [
  () => createBillAction(NEW_BILL),
  () => updateBillAction("b1", { notes: "x" }),
  () => voidBillAction("b1"),
  () =>
    recordBillPaymentAction({
      billId: "b1",
      amount: 10,
      method: "eft" as const,
      paidAt: "2026-07-05",
    }),
  () => deleteBillPaymentAction("pay1"),
];

const MUTATION_FNS = [
  h.createBill,
  h.updateBill,
  h.voidBill,
  h.recordBillPayment,
  h.deleteBillPayment,
];

const READS = [
  () => listBillsAction({}),
  () => getBillByIdAction("b1"),
  () => getApSummaryAction(),
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listBills, h.getBillById, h.getApSummary])
    fn.mockClear();
});

describe("AP mutation gates", () => {
  it("every mutation rejects a financials:view-only role (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("every mutation rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of MUTATIONS) expect((await call()).ok).toBe(false);
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("every mutation passes for Accountant (financials:edit)", async () => {
    for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    for (const fn of MUTATION_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("AP read gates", () => {
  it("reads pass at financials:view (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of READS) expect((await call()).ok).toBe(true);
  });

  it("reads reject a role with no financials access (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listBills).not.toHaveBeenCalled();
  });
});
