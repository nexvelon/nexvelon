// DASH-2 — technician utilization is REAL (from the dispatch board), never
// fabricated. When the board reports utilization_pct = null (no working hours
// set), the dashboard passes null through — no invented percentage.

import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ util: null as number | null }));

vi.mock("@/lib/api/dispatch-board", () => ({
  getDispatchBoard: vi.fn(async () => ({
    techs: [],
    bookings: [],
    unscheduled: [],
    absences: [],
    stats: { techs_out: 2, utilization_pct: h.util },
    range: { from: "", to: "" },
  })),
}));
// DES-2 — the scheduling tier now also fans out to expiring tech certs.
vi.mock("@/lib/api/tech-certifications", () => ({ getExpiringTechCerts: vi.fn(async () => []) }));

import { getDashboardAlerts } from "@/lib/api/dashboard";

// Only the scheduling tier — isolates dispatch (no DB fan-out for the others).
const SCHED_ONLY = { subs: false, projects: false, scheduling: true };

describe("real utilization passthrough", () => {
  it("null utilization (no hours set) passes through as null", async () => {
    h.util = null;
    const a = await getDashboardAlerts({ tiers: SCHED_ONLY });
    expect(a.dispatch_today).not.toBeNull();
    expect(a.dispatch_today!.utilization_pct).toBeNull();
    expect(a.dispatch_today!.techs_out).toBe(2);
  });

  it("a real utilization value passes through unchanged", async () => {
    h.util = 73;
    const a = await getDashboardAlerts({ tiers: SCHED_ONLY });
    expect(a.dispatch_today!.utilization_pct).toBe(73);
  });

  it("the scheduling tier off → dispatch block null (restricted)", async () => {
    h.util = 50;
    const a = await getDashboardAlerts({ tiers: { subs: false, projects: false, scheduling: false } });
    expect(a.dispatch_today).toBeNull();
  });
});
