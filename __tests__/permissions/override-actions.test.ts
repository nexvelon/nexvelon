// PERM-3 — the override mutations are Admin-gated, and the migrated
// security-critical gates (which now read the resolver's can()) still reject the
// same roles for a no-override user.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "admin1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, cache: <A extends unknown[], R>(fn: (...a: A) => R) => fn };
});
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/permissions/db-matrix", async (orig) => {
  const actual = await orig<typeof import("@/lib/permissions/db-matrix")>();
  return {
    ...actual,
    loadRoleMatrix: async () => (await import("@/lib/permissions/seed-matrix")).buildGrantedMatrix(),
    loadUserOverrides: async () => ({ granted: new Set<string>(), denied: new Set<string>() }),
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
  listPermissionAuditAction,
} from "@/app/(app)/users/permission-override-actions";
import { can } from "@/lib/permissions/resolve";

beforeEach(() => {
  h.profile = { id: "admin1", role: "Admin", status: "Active" };
});

describe("override mutations are Admin-gated", () => {
  it("Admin can set / revoke / list audit", async () => {
    expect((await setUserOverrideAction({ userId: "u1", resource: "financials", action: "edit", state: "granted" })).ok).toBe(true);
    expect((await revokeUserOverrideAction({ id: "o1" })).ok).toBe(true);
    expect((await listPermissionAuditAction({})).ok).toBe(true);
  });

  it("a non-Admin is denied all three", async () => {
    h.profile = { id: "u2", role: "ProjectManager", status: "Active" };
    expect((await setUserOverrideAction({ userId: "u1", resource: "financials", action: "edit", state: "granted" })).ok).toBe(false);
    expect((await revokeUserOverrideAction({ id: "o1" })).ok).toBe(false);
    expect((await listPermissionAuditAction({})).ok).toBe(false);
  });
});

describe("migrated security-critical gates reject the same roles (no-override user)", () => {
  it("financials:edit — Technician denied, Admin allowed (identical to before)", async () => {
    h.profile = { id: "u3", role: "Technician", status: "Active" };
    expect(await can("financials", "edit")).toBe(false);
    h.profile = { id: "admin1", role: "Admin", status: "Active" };
    expect(await can("financials", "edit")).toBe(true);
  });
  it("inventory:delete — Technician denied, Admin allowed", async () => {
    h.profile = { id: "u3", role: "Technician", status: "Active" };
    expect(await can("inventory", "delete")).toBe(false);
    h.profile = { id: "admin1", role: "Admin", status: "Active" };
    expect(await can("inventory", "delete")).toBe(true);
  });
});
