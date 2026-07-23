// SUB-3 — the compliance-risk action is a READ: gated on subcontractors:view.
// A role with no subcontractors access is refused and the API is never hit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  getComplianceRisk: vi.fn(async () => ({
    asOf: "2026-07-22",
    counts: { expired: 0, expiring_soon: 0, missing_required: 0, ok: 0 },
    rows: [],
  })),
}));

vi.mock("@/lib/api/subcontractor-compliance", () => ({
  getComplianceRisk: h.getComplianceRisk,
  // the actions module imports several other symbols from here; stub the rest
  listComplianceDocs: vi.fn(),
  getComplianceSummary: vi.fn(),
  getComplianceSummariesForSubs: vi.fn(),
  createComplianceDoc: vi.fn(),
  updateComplianceDoc: vi.fn(),
  deleteComplianceDoc: vi.fn(),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachment: vi.fn() }));
vi.mock("@/lib/api/subcontractors", () => new Proxy({}, {
  get: (_t, p) => (typeof p === "symbol" || p === "then" || p === "__esModule" ? undefined : vi.fn()),
}));
vi.mock("@/lib/api/vendors", () => ({ getVendors: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getComplianceRiskAction } from "@/app/(app)/subcontractors/actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.getComplianceRisk.mockClear();
});

describe("getComplianceRiskAction (view-gated)", () => {
  it("passes for a view-tier role (Technician) and returns the risk payload", async () => {
    setRole("Technician");
    const res = await getComplianceRiskAction();
    expect(res.ok).toBe(true);
    expect(h.getComplianceRisk).toHaveBeenCalledTimes(1);
  });

  it("passes for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      expect((await getComplianceRiskAction()).ok).toBe(true);
    }
  });

  it("rejects a role with no subcontractors access (Subcontractor login role) without hitting the API", async () => {
    setRole("Subcontractor");
    const res = await getComplianceRiskAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.getComplianceRisk).not.toHaveBeenCalled();
  });
});
