// SNAP-1 — snapshot reads are gated exactly like the live figures (acceptance #6):
// getBalanceDeltasAction only ever queries the metrics the caller's role may read,
// so a user who can't see WIP (financials:edit) never receives WIP history, and one
// with no financials access receives none.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  role: "Admin",
  can: { dashboardView: true, finView: true, finEdit: true },
  requestedKeys: [] as string[],
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => ({ id: "u1", role: h.role }) }));
vi.mock("@/lib/permissions/resolve", () => ({ adaptDbRole: (r: string) => r }));
vi.mock("@/lib/permissions", () => ({
  hasPermission: (_role: string, resource: string, action: string) => {
    if (resource === "dashboard" && action === "view") return h.can.dashboardView;
    if (resource === "financials" && action === "view") return h.can.finView;
    if (resource === "financials" && action === "edit") return h.can.finEdit;
    return false;
  },
}));
// keep the real BALANCE_METRICS registry; stub only the reads.
vi.mock("@/lib/api/balance-snapshots", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/balance-snapshots")>()),
  getBalanceHistory: async (keys: string[]) => {
    h.requestedKeys = keys;
    return keys.map((key) => ({ key, points: [], priorAt: null }));
  },
  detectSnapshotGaps: async () => ({ firstDate: null, lastDate: null, missing: [] }),
}));

import { getBalanceDeltasAction } from "@/app/(app)/dashboard/actions";

beforeEach(() => {
  h.role = "Admin";
  h.can = { dashboardView: true, finView: true, finEdit: true };
  h.requestedKeys = [];
});

describe("getBalanceDeltasAction — reads gated like the live figures", () => {
  it("full financial access → all balance metrics (incl. WIP)", async () => {
    const res = await getBalanceDeltasAction({ compareTo: "2026-05-08", basis: "same days last month" });
    expect(res.ok).toBe(true);
    expect(h.requestedKeys).toContain("ar_outstanding");
    expect(h.requestedKeys).toContain("wip_net");
  });

  it("financials:view but NOT edit → AR/AP/deposits, but NEVER WIP (edit-gated)", async () => {
    h.can.finEdit = false;
    await getBalanceDeltasAction({ compareTo: "2026-05-08", basis: "b" });
    expect(h.requestedKeys).toContain("ar_outstanding");
    expect(h.requestedKeys).toContain("deposits_held");
    expect(h.requestedKeys.some((k) => k.startsWith("wip_"))).toBe(false);
  });

  it("no financial access → no balance metrics are ever queried", async () => {
    h.can.finView = false;
    h.can.finEdit = false;
    const res = await getBalanceDeltasAction({ compareTo: "2026-05-08", basis: "b" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.data.deltas)).toHaveLength(0);
    expect(h.requestedKeys).toHaveLength(0);
  });

  it("no dashboard access → denied outright", async () => {
    h.can.dashboardView = false;
    const res = await getBalanceDeltasAction({ compareTo: null, basis: "b" });
    expect(res.ok).toBe(false);
  });
});
