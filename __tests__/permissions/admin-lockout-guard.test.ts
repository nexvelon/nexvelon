// DES-1 — the admin self-lockout guardrail, on BOTH paths:
//   1. role-baseline editor — can't revoke a protected Admin cell.
//   2. per-user override editor — can't DENY a protected cell to an Admin.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ADMIN_LOCKOUT_ERROR, PROTECTED_ADMIN_CELLS } from "@/lib/permissions/guard";

// ── Path 1: role baseline ────────────────────────────────────────────────────
function noopClient() {
  return { from: () => ({ upsert: async () => ({ error: null }), insert: async () => ({ error: null }), delete() { return this; }, eq() { return this; } }) };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => noopClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => noopClient() }));

import { setRoleBaseline } from "@/lib/api/role-permissions";

describe("guard 1 — role baseline can't strip Admin management", () => {
  it("revoking (Admin, users, manage) throws admin_lockout_blocked", async () => {
    await expect(
      setRoleBaseline({ role: "Admin", resource: "users", action: "manage", granted: false, actorId: "a1" })
    ).rejects.toThrow(ADMIN_LOCKOUT_ERROR);
  });

  it("every protected cell is blocked for Admin revoke", async () => {
    for (const cell of PROTECTED_ADMIN_CELLS) {
      await expect(
        setRoleBaseline({ role: "Admin", resource: cell.resource, action: cell.action, granted: false, actorId: "a1" })
      ).rejects.toThrow(ADMIN_LOCKOUT_ERROR);
    }
  });

  it("but GRANTING a protected cell to Admin is fine (no lockout)", async () => {
    await expect(
      setRoleBaseline({ role: "Admin", resource: "users", action: "manage", granted: true, actorId: "a1" })
    ).resolves.toBeUndefined();
  });

  it("revoking a protected cell from a NON-Admin role is allowed", async () => {
    await expect(
      setRoleBaseline({ role: "ViewOnly", resource: "users", action: "manage", granted: false, actorId: "a1" })
    ).resolves.toBeUndefined();
  });
});

// ── Path 2: per-user override ────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  actor: { id: "admin1", role: "Admin", status: "Active" } as { id: string; role: string; status: string } | null,
  target: { id: "u2", role: "Admin", status: "Active" } as { id: string; role: string; status: string } | null,
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => h.actor,
  getProfileByIdAdmin: async () => h.target,
}));
vi.mock("@/lib/api/permission-overrides", () => ({
  setOverride: vi.fn(async () => ({ id: "o1" })),
  revokeOverride: vi.fn(async () => undefined),
  listOverridesForUser: vi.fn(async () => []),
  listPermissionAudit: vi.fn(async () => []),
}));

import { setUserOverrideAction } from "@/app/(app)/users/permission-override-actions";

beforeEach(() => {
  h.actor = { id: "admin1", role: "Admin", status: "Active" };
  h.target = { id: "u2", role: "Admin", status: "Active" };
});

describe("guard 2 — can't DENY a protected cell to an Admin account", () => {
  it("denying (users, manage) to an Admin target is blocked", async () => {
    const res = await setUserOverrideAction({ userId: "u2", resource: "users", action: "manage", state: "denied", reason: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(ADMIN_LOCKOUT_ERROR);
  });

  it("denying it to a NON-Admin target is allowed", async () => {
    h.target = { id: "u3", role: "Technician", status: "Active" };
    const res = await setUserOverrideAction({ userId: "u3", resource: "users", action: "manage", state: "denied", reason: "x" });
    expect(res.ok).toBe(true);
  });

  it("GRANTING a protected cell to an Admin is fine", async () => {
    const res = await setUserOverrideAction({ userId: "u2", resource: "users", action: "manage", state: "granted", reason: "x" });
    expect(res.ok).toBe(true);
  });
});
