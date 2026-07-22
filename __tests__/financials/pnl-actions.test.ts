// FIN-8 — gates on the P&L actions. The per-project statement is reachable at
// financials:view but redacts cost/GP/margin unless financials:edit; the opco
// P&L, portfolio and CSV exports are edit-only.

import { describe, it, expect, beforeEach, vi } from "vitest";

const FULL_PNL = {
  project: { id: "p1", number: "P-001", title: "Tower A", opco: "guardian", client_name: "Acme", status: "active" },
  revenue: { invoiced_pretax: 1000, earned: 1000, by_status: { sent: 1000, partially_paid: 0, paid: 0 } },
  cost: { materials_billed: 300, labour: 200, canonical_direct: 500 },
  gross_profit: 500,
  gross_margin_pct: 50,
  memo: {
    contract_quoted: 1000, variance_vs_quoted: 10, po_committed_open: 40,
    inventory_drawn_memo: 300, deposits_held: 250, holdback_retained: 100,
    ar_balance: 630, ap_balance: 300, billed_pct: 0.4,
  },
};

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  getProjectPnl: vi.fn(async () => FULL_PNL),
  getOpcoPnl: vi.fn(async () => [{ opco: "guardian", revenue: 600 }]),
  getPnlPortfolio: vi.fn(async () => [{ project_id: "p1" }]),
  buildProjectPnlCsv: vi.fn(() => "Project,P-001"),
  buildOpcoPnlCsv: vi.fn(() => "Entity,Projects\r\nNexvelon Guardian,2"),
}));

vi.mock("@/lib/api/project-pnl", () => ({
  getProjectPnl: h.getProjectPnl,
  getOpcoPnl: h.getOpcoPnl,
  getPnlPortfolio: h.getPnlPortfolio,
  buildProjectPnlCsv: h.buildProjectPnlCsv,
  buildOpcoPnlCsv: h.buildOpcoPnlCsv,
}));
vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(), getMonthlyRevenue: vi.fn(), listInvoicesReal: vi.fn(),
  getProjectFinancialSummaries: vi.fn(), getTaxCollectedSummary: vi.fn(),
  getItcSummary: vi.fn(), getHstNetPosition: vi.fn(), buildHstReturnCsv: vi.fn(),
}));
vi.mock("@/lib/api/ar-aging", () => ({
  getArAgingSummary: vi.fn(), getArAgingByClient: vi.fn(), getClientStatement: vi.fn(), buildArAgingCsv: vi.fn(),
}));
vi.mock("@/lib/api/ap-aging", () => ({
  getApAgingSummary: vi.fn(), getApAgingByVendor: vi.fn(), getVendorStatement: vi.fn(), buildApAgingCsv: vi.fn(),
}));
vi.mock("@/lib/api/deposits", () => ({
  listDepositsForProject: vi.fn(), getProjectDepositBalance: vi.fn(), getDepositsHeldTotal: vi.fn(),
  recordDeposit: vi.fn(), deleteDeposit: vi.fn(), applyDepositToInvoice: vi.fn(), unapplyDeposit: vi.fn(),
}));
vi.mock("@/lib/api/vendor-bills", () => ({
  listBills: vi.fn(), getBillById: vi.fn(), listBillsForPurchaseOrder: vi.fn(), getApSummary: vi.fn(),
  getBillFormOptions: vi.fn(), createBill: vi.fn(), updateBill: vi.fn(), voidBill: vi.fn(),
  recordBillPayment: vi.fn(), deleteBillPayment: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getProjectPnlAction,
  getOpcoPnlAction,
  getPnlPortfolioAction,
  exportProjectPnlCsvAction,
  exportOpcoPnlCsvAction,
} from "@/app/(app)/financials/actions";

const EDIT_ONLY = [
  () => getOpcoPnlAction({}),
  () => getPnlPortfolioAction(),
  () => exportProjectPnlCsvAction("p1"),
  () => exportOpcoPnlCsvAction({}),
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of [h.getProjectPnl, h.getOpcoPnl, h.getPnlPortfolio, h.buildProjectPnlCsv, h.buildOpcoPnlCsv]) fn.mockClear();
});

describe("getProjectPnlAction — redaction", () => {
  it("Accountant (edit) sees full cost + GP + margin", async () => {
    const res = await getProjectPnlAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(res.data.canSeeCost).toBe(true);
    expect(res.data.pnl.cost.canonical_direct).toBe(500);
    expect(res.data.pnl.gross_profit).toBe(500);
    expect(res.data.pnl.gross_margin_pct).toBe(50);
  });

  it("ProjectManager (view-only) gets cost/GP/margin dashed, revenue + AR kept", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await getProjectPnlAction("p1");
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(res.data.canSeeCost).toBe(false);
    // redacted
    expect(res.data.pnl.cost.canonical_direct).toBeNull();
    expect(res.data.pnl.gross_profit).toBeNull();
    expect(res.data.pnl.gross_margin_pct).toBeNull();
    expect(res.data.pnl.memo.ap_balance).toBeNull();
    expect(res.data.pnl.memo.inventory_drawn_memo).toBeNull();
    // kept
    expect(res.data.pnl.revenue.earned).toBe(1000);
    expect(res.data.pnl.memo.ar_balance).toBe(630);
    expect(res.data.pnl.memo.billed_pct).toBe(0.4);
    expect(res.data.pnl.memo.holdback_retained).toBe(100);
  });

  it("SalesRep (no financials) is rejected outright", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await getProjectPnlAction("p1");
    expect(res.ok).toBe(false);
    expect(h.getProjectPnl).not.toHaveBeenCalled();
  });
});

describe("edit-only P&L actions", () => {
  it("reject a view-only role (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of EDIT_ONLY) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    expect(h.getOpcoPnl).not.toHaveBeenCalled();
    expect(h.getPnlPortfolio).not.toHaveBeenCalled();
  });

  it("pass for Accountant", async () => {
    for (const call of EDIT_ONLY) expect((await call()).ok).toBe(true);
  });
});

describe("exportOpcoPnlCsvAction", () => {
  it("returns per-opco CSV with a dated filename", async () => {
    const res = await exportOpcoPnlCsvAction({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.csv.split("\r\n")[0]).toBe("Entity,Projects");
    expect(res.data.filename).toMatch(/^nexvelon-opco-pnl-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
