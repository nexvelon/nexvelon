// FIN-1 — Financials action gates. Real permissions matrix, mocked API + auth:
// every read action must reject a role without financials:view (SalesRep is
// explicitly excluded by the matrix) and pass for Accountant.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  getRevenueSummary: vi.fn(async () => ({ total: 1, byOpco: [], cashCollected: 0, cashBreakdown: { invoicePayments: 0, deposits: 0, total: 0 }, outstandingTotal: 0, holdbackRetained: 0, invoiceCount: 1 })),
  getMonthlyRevenue: vi.fn(async () => [{ month: "2026-07", invoiced: 1, collected: 0 }]),
  listInvoicesReal: vi.fn(async () => [{ id: "i1" }]),
  getProjectFinancialSummaries: vi.fn(async () => [{ project_id: "p1" }]),
  getTaxCollectedSummary: vi.fn(async () => ({ byOpco: [], total: 0 })),
}));

vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: h.getRevenueSummary,
  getMonthlyRevenue: h.getMonthlyRevenue,
  listInvoicesReal: h.listInvoicesReal,
  getProjectFinancialSummaries: h.getProjectFinancialSummaries,
  getTaxCollectedSummary: h.getTaxCollectedSummary,
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import {
  getRevenueSummaryAction,
  getMonthlyRevenueAction,
  listFinancialInvoicesAction,
  getProjectFinancialSummariesAction,
  getTaxCollectedSummaryAction,
} from "@/app/(app)/financials/actions";

const ALL_ACTIONS = [
  () => getRevenueSummaryAction({}),
  () => getMonthlyRevenueAction({}),
  () => listFinancialInvoicesAction({}),
  () => getProjectFinancialSummariesAction(),
  () => getTaxCollectedSummaryAction({}),
];

const LIB_FNS = [
  h.getRevenueSummary,
  h.getMonthlyRevenue,
  h.listInvoicesReal,
  h.getProjectFinancialSummaries,
  h.getTaxCollectedSummary,
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of LIB_FNS) fn.mockClear();
});

describe("financials action gates", () => {
  it("every action rejects without financials:view (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    for (const call of ALL_ACTIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("every action rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of ALL_ACTIONS) {
      expect((await call()).ok).toBe(false);
    }
    for (const fn of LIB_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("every action passes for Accountant (financials:view)", async () => {
    for (const call of ALL_ACTIONS) {
      const res = await call();
      expect(res.ok).toBe(true);
    }
    for (const fn of LIB_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });
});
