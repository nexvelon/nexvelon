// PERM-2 — the consolidated require helpers behave identically to the 14/34
// copies they replaced. requireAdmin: signed-in + Active + role === "Admin".
// requirePermission: DB-sourced resource gate (== static matrix), fail-safe.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  loadMatrix: vi.fn(),
}));

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, cache: <A extends unknown[], R>(fn: (...a: A) => R) => fn };
});
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/permissions/db-matrix", async (orig) => ({
  ...(await orig<typeof import("@/lib/permissions/db-matrix")>()),
  loadRoleMatrix: h.loadMatrix,
}));

import { requireAdmin, requirePermission } from "@/lib/permissions/resolve";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.loadMatrix.mockResolvedValue(buildGrantedMatrix());
});

describe("requireAdmin (consolidated)", () => {
  it("allows an active Admin and returns the profile", async () => {
    const gate = await requireAdmin();
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.profile.id).toBe("u1");
  });
  it("denies a non-Admin role", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    expect((await requireAdmin()).ok).toBe(false);
  });
  it("denies an inactive Admin", async () => {
    h.profile = { id: "u1", role: "Admin", status: "Suspended" };
    expect((await requireAdmin()).ok).toBe(false);
  });
  it("denies a signed-out caller", async () => {
    h.profile = null;
    expect((await requireAdmin()).ok).toBe(false);
  });
});

describe("requirePermission (DB-sourced resource gate)", () => {
  it("allows when the resolved set grants it (Accountant financials:view)", async () => {
    h.profile = { id: "u1", role: "Accountant", status: "Active" };
    expect((await requirePermission("financials", "view")).ok).toBe(true);
  });
  it("denies when the resolved set lacks it (Technician financials:view)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await requirePermission("financials", "view")).ok).toBe(false);
  });
  it("fail-safe: DB error still yields the static answer (Accountant financials:view granted)", async () => {
    h.profile = { id: "u1", role: "Accountant", status: "Active" };
    h.loadMatrix.mockRejectedValue(new Error("db down"));
    expect((await requirePermission("financials", "view")).ok).toBe(true);
  });
});
