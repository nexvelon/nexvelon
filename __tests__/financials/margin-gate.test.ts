// FIN-2 — the margin gate on the Financials Projects tab. FIN-1 shipped the
// project summaries behind financials:view only, which let a PM / ViewOnly see
// cost + margin that the project cost-rollup action redacts for exactly those
// roles. This aligns the two: spent / margin / po_committed require
// financials:edit; contract / invoiced / billed% stay at financials:view.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  // A fresh copy per call — the action mutates the rows it redacts.
  getProjectFinancialSummaries: vi.fn(async () => [
    {
      project_id: "p1",
      project_number: "P-001",
      title: "Tower A",
      status: "active",
      contract: 1000,
      invoiced: 400,
      billed_pct: 0.4,
      spent: 600,
      margin: 400,
      po_committed: 150,
    },
  ]),
}));

vi.mock("@/lib/api/financials", () => ({
  getRevenueSummary: vi.fn(),
  getMonthlyRevenue: vi.fn(),
  listInvoicesReal: vi.fn(),
  getProjectFinancialSummaries: h.getProjectFinancialSummaries,
  getTaxCollectedSummary: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { getProjectFinancialSummariesAction } from "@/app/(app)/financials/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  h.getProjectFinancialSummaries.mockClear();
});

describe("Projects summaries — financials margin gate", () => {
  it("Accountant (financials:edit) sees the full cost legs", async () => {
    const res = await getProjectFinancialSummariesAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(true);
    expect(res.data.summaries[0]).toMatchObject({
      contract: 1000,
      invoiced: 400,
      billed_pct: 0.4,
      spent: 600,
      margin: 400,
      po_committed: 150,
    });
  });

  it("ProjectManager (view only) gets cost legs redacted, billing kept", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await getProjectFinancialSummariesAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(false);
    const row = res.data.summaries[0];
    // redacted
    expect(row.spent).toBeNull();
    expect(row.margin).toBeNull();
    expect(row.po_committed).toBeNull();
    // still visible at financials:view
    expect(row.contract).toBe(1000);
    expect(row.invoiced).toBe(400);
    expect(row.billed_pct).toBe(0.4);
  });

  it("ViewOnly also gets cost legs redacted", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await getProjectFinancialSummariesAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeFinancials).toBe(false);
    expect(res.data.summaries[0].margin).toBeNull();
  });

  it("SalesRep has no financials:view at all — rejected outright", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await getProjectFinancialSummariesAction();
    expect(res.ok).toBe(false);
    expect(h.getProjectFinancialSummaries).not.toHaveBeenCalled();
  });
});
