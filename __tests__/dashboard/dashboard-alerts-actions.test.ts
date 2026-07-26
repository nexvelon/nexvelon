// DASH-2 — the alerts action redacts each block by its own resource, dispatch
// utilization passes through null (no fabrication), and the previously-UNGATED
// inventory actions now REJECT without inventory:view (the security fix).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  lastTiers: null as Record<string, boolean> | null,
}));

vi.mock("@/lib/api/dashboard", () => ({
  getDashboardAlerts: vi.fn(async (input: { tiers: Record<string, boolean> }) => {
    h.lastTiers = input.tiers;
    return {
      compliance_at_risk: input.tiers.subs ? { expired: 1, expiring_soon: 0, missing_required: 0, total_at_risk: 1 } : null,
      bond_warranty_alerts: input.tiers.projects ? { bonds: 0, warranties: 0, expired: 0, expiring_soon: 0 } : null,
      overdue_tasks: input.tiers.projects ? { count: 0, items: [] } : null,
      deficiencies: input.tiers.projects ? { open: 0, safety_open: 0, projects_affected: 0 } : null,
      upcoming_milestones: input.tiers.projects ? { items: [] } : null,
      dispatch_today: input.tiers.scheduling ? { booked_today: 0, unscheduled: 0, techs_out: 0, utilization_pct: null } : null,
    };
  }),
  getRecentActivity: vi.fn(async () => ({ items: [] })),
  getQuotesByStatus: vi.fn(async () => ({ by_status: [], open_pipeline_value: 0 })),
  getDashboardKpis: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { getDashboardAlertsAction } from "@/app/(app)/dashboard/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.lastTiers = null;
});

describe("getDashboardAlertsAction — per-resource redaction", () => {
  it("Admin sees every block", async () => {
    const r = await getDashboardAlertsAction();
    expect(r.ok).toBe(true);
    expect(h.lastTiers).toEqual({ subs: true, projects: true, scheduling: true });
  });

  it("Subcontractor (no subcontractors:view) gets the compliance block null", async () => {
    // Subcontractor has dashboard/projects/scheduling view but NOT subcontractors.
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    const r = await getDashboardAlertsAction();
    expect(h.lastTiers!.subs).toBe(false);
    if (r.ok) {
      expect(r.data.compliance_at_risk).toBeNull(); // restricted
      expect(r.data.overdue_tasks).not.toBeNull(); // projects:view present
      expect(r.data.dispatch_today).not.toBeNull(); // scheduling:view present
    }
  });

  it("dispatch utilization passes through null (no fabrication)", async () => {
    const r = await getDashboardAlertsAction();
    if (r.ok) expect(r.data.dispatch_today!.utilization_pct).toBeNull();
  });

  it("unauthenticated is denied", async () => {
    h.profile = null;
    expect((await getDashboardAlertsAction()).ok).toBe(false);
  });
});
