// PERM-4 — the override/audit/effective actions are Admin-gated (non-admin
// rejected). getUserEffectivePermissionsAction resolves the target user's role
// + overrides via the resolver.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "admin1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  targetProfile: { id: "u1", role: "Technician", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("react", async (o) => {
  const a = await o<typeof import("react")>();
  return { ...a, cache: (<A extends unknown[], R>(fn: (...x: A) => R) => fn) as typeof a.cache };
});
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => h.profile,
  getProfileByIdAdmin: async () => h.targetProfile,
}));
vi.mock("@/lib/permissions/db-matrix", async (o) => {
  const a = await o<typeof import("@/lib/permissions/db-matrix")>();
  return {
    ...a,
    loadRoleMatrix: async () => (await import("@/lib/permissions/seed-matrix")).buildGrantedMatrix(),
    loadUserOverrides: async () => ({ granted: new Set(["financials:edit"]), denied: new Set<string>() }),
  };
});
vi.mock("@/lib/api/permission-overrides", () => ({
  setOverride: vi.fn(async () => ({ id: "o1" })),
  revokeOverride: vi.fn(async () => undefined),
  listOverridesForUser: vi.fn(async () => []),
  listPermissionAudit: vi.fn(async () => []),
}));

import {
  setUserOverrideAction,
  revokeUserOverrideAction,
  listUserOverridesAction,
  listPermissionAuditAction,
  getUserEffectivePermissionsAction,
} from "@/app/(app)/users/permission-override-actions";

beforeEach(() => {
  h.profile = { id: "admin1", role: "Admin", status: "Active" };
  h.targetProfile = { id: "u1", role: "Technician", status: "Active" };
});

describe("all admin-gated", () => {
  it("non-Admin is rejected by every action", async () => {
    h.profile = { id: "u2", role: "Accountant", status: "Active" };
    expect((await setUserOverrideAction({ userId: "u1", resource: "financials", action: "edit", state: "granted" })).ok).toBe(false);
    expect((await revokeUserOverrideAction({ id: "o1" })).ok).toBe(false);
    expect((await listUserOverridesAction("u1")).ok).toBe(false);
    expect((await listPermissionAuditAction({})).ok).toBe(false);
    expect((await getUserEffectivePermissionsAction("u1")).ok).toBe(false);
  });

  it("Admin is allowed", async () => {
    expect((await setUserOverrideAction({ userId: "u1", resource: "financials", action: "edit", state: "granted" })).ok).toBe(true);
    expect((await listPermissionAuditAction({})).ok).toBe(true);
  });
});

describe("getUserEffectivePermissionsAction resolves role + overrides", () => {
  it("returns the target role and an effective set including the granted override", async () => {
    const res = await getUserEffectivePermissionsAction("u1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.role).toBe("Technician");
      // role default (inventory:view) + the granted override (financials:edit)
      expect(res.data.effective).toContain("inventory:view");
      expect(res.data.effective).toContain("financials:edit");
    }
  });
});
