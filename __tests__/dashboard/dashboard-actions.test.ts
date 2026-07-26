// DASH-1 — the action gates dashboard:view and derives the tiers from the
// caller's permissions (financials view vs edit; projects; quotes). A real 0
// passes through as 0 (distinct from a restricted null block).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  lastTiers: null as Record<string, boolean> | null,
}));

vi.mock("@/lib/api/dashboard", () => ({
  getDashboardKpis: vi.fn(async (input: { tiers: Record<string, boolean> }) => {
    h.lastTiers = input.tiers;
    return {
      range: { from: null, to: null },
      as_of: "2026-07-25",
      // a REAL ZERO financial block (not restricted) — must pass through as 0
      financial: input.tiers.financialView
        ? { revenue: 0, cash_collected: 0, ar_outstanding: 0, ar_overdue: 0, ap_outstanding: 0, ap_overdue: 0, deposits_held: 0 }
        : null,
      financial_edit: input.tiers.financialEdit ? { wip_net: 0, wip_overbilled: 0, wip_underbilled: 0, hst_net_total: 0, hst_by_opco: [], blended_margin_pct: null } : null,
      operational: {
        projects: input.tiers.projects ? { active_projects: 0, active_contract_value: 0 } : null,
        quotes: input.tiers.quotes ? { open_quotes: 0, open_quotes_value: 0 } : null,
      },
    };
  }),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { getDashboardKpisAction } from "@/app/(app)/dashboard/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.lastTiers = null;
});

describe("getDashboardKpisAction gating", () => {
  it("denies an unauthenticated caller", async () => {
    h.profile = null;
    expect((await getDashboardKpisAction({})).ok).toBe(false);
  });

  it("Admin gets every tier", async () => {
    h.profile = { id: "u1", role: "Admin", status: "Active" };
    await getDashboardKpisAction({});
    expect(h.lastTiers).toEqual({ financialView: true, financialEdit: true, projects: true, quotes: true });
  });

  it("Accountant: financial view + edit", async () => {
    h.profile = { id: "u1", role: "Accountant", status: "Active" };
    await getDashboardKpisAction({});
    expect(h.lastTiers).toMatchObject({ financialView: true, financialEdit: true });
  });

  it("Technician: no financials at all (view + edit false)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    await getDashboardKpisAction({});
    expect(h.lastTiers).toMatchObject({ financialView: false, financialEdit: false, projects: true });
  });

  it("ProjectManager: financials VIEW but not EDIT", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    await getDashboardKpisAction({});
    expect(h.lastTiers).toMatchObject({ financialView: true, financialEdit: false, projects: true, quotes: true });
  });

  it("a real ZERO passes through as 0, not a restricted null", async () => {
    h.profile = { id: "u1", role: "Admin", status: "Active" };
    const res = await getDashboardKpisAction({});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.financial).not.toBeNull();
      expect(res.data.financial!.revenue).toBe(0); // real zero, not blanked
    }
  });
});
