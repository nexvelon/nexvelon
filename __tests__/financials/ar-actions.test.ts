// FIN-3 — gates on the AR aging / statement / CSV actions. AR balances are
// revenue-side, so they sit at financials:view (the same tier as FIN-1's
// reads) — unlike the cost/margin legs, which FIN-2 moved to financials:edit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  getArAgingSummary: vi.fn(async () => ({
    buckets: { current: 10, d1_30: 20, d31_60: 0, d61_90: 0, d90_plus: 5 },
    total: 35,
    overdueTotal: 25,
    asOf: "2026-07-20",
  })),
  getArAgingByClient: vi.fn(async () => [{ client_id: "c1", total: 35 }]),
  getClientStatement: vi.fn(async () => ({ client_id: "c1", lines: [] })),
  buildArAgingCsv: vi.fn(
    async () =>
      "Client,Invoice,Issue date,Due date,Total,Paid,Balance,Days past due,Bucket\r\n" +
      '"Acme, Inc.",NIS-1,2026-06-01,2026-06-30,100.00,0.00,100.00,20,1–30'
  ),
}));

vi.mock("@/lib/api/ar-aging", () => ({
  getArAgingSummary: h.getArAgingSummary,
  getArAgingByClient: h.getArAgingByClient,
  getClientStatement: h.getClientStatement,
  buildArAgingCsv: h.buildArAgingCsv,
}));
vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(),
  getMonthlyRevenue: vi.fn(),
  listInvoicesReal: vi.fn(),
  getProjectFinancialSummaries: vi.fn(),
  getTaxCollectedSummary: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import {
  getArAgingSummaryAction,
  getArAgingByClientAction,
  getClientStatementAction,
  exportArAgingCsvAction,
} from "@/app/(app)/financials/actions";

const AR_ACTIONS = [
  () => getArAgingSummaryAction(),
  () => getArAgingByClientAction(),
  () => getClientStatementAction("c1"),
  () => exportArAgingCsvAction(),
];

const LIB_FNS = [
  h.getArAgingSummary,
  h.getArAgingByClient,
  h.getClientStatement,
  h.buildArAgingCsv,
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of LIB_FNS) fn.mockClear();
});

describe("AR action gates", () => {
  it("all reject a role without financials:view (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    for (const call of AR_ACTIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all reject an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of AR_ACTIONS) {
      expect((await call()).ok).toBe(false);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("all pass for Accountant", async () => {
    for (const call of AR_ACTIONS) {
      expect((await call()).ok).toBe(true);
    }
    for (const fn of LIB_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes for a view-tier role (ProjectManager) — AR is revenue-side", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of AR_ACTIONS) {
      expect((await call()).ok).toBe(true);
    }
  });

  it("rejects a statement request with no client id", async () => {
    const res = await getClientStatementAction("");
    expect(res.ok).toBe(false);
    expect(h.getClientStatement).not.toHaveBeenCalled();
  });
});

describe("exportArAgingCsvAction", () => {
  it("returns the CSV plus a dated filename", async () => {
    const res = await exportArAgingCsvAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lines = res.data.csv.split("\r\n");
    expect(lines[0]).toBe(
      "Client,Invoice,Issue date,Due date,Total,Paid,Balance,Days past due,Bucket"
    );
    expect(lines).toHaveLength(2);
    // a client name containing a comma stays quoted through the action
    expect(lines[1]).toContain('"Acme, Inc."');
    expect(res.data.filename).toMatch(/^nexvelon-ar-aging-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
