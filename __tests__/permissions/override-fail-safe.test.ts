// PERM-3 — override fail-safe nuance. If the overrides query fails, the resolver
// falls back to role-default-only: a DENIED user reverts to their role's normal
// access (not an escalation BEYOND the role); a GRANTED-extra user loses the
// extra. Never grant-on-error. The role default itself still comes from the DB
// matrix (or its own static fallback).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasPermission } from "@/lib/permissions";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Technician", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  overridesThrow: false,
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
    loadUserOverrides: async () => {
      if (h.overridesThrow) throw new Error("overrides db down");
      return { granted: new Set<string>(), denied: new Set<string>() };
    },
  };
});

import { getCurrentAuth } from "@/lib/permissions/resolve";

beforeEach(() => {
  h.profile = { id: "u1", role: "Technician", status: "Active" };
  h.overridesThrow = true; // simulate the override load failing
});

describe("override load failure → role default only", () => {
  it("reverts to the role default for every triple (no grant-on-error)", async () => {
    const auth = await getCurrentAuth();
    // A previously-denied permission (the deny can't load) reverts to the role
    // default — the role's NORMAL access, not an escalation beyond the role.
    expect(auth.can("inventory", "view")).toBe(hasPermission("Technician", "inventory", "view")); // true (role default)
    // A previously-granted-extra permission (the grant can't load) is NOT
    // granted — the role still lacks it. No grant-on-error.
    expect(auth.can("financials", "edit")).toBe(false);
    expect(auth.can("financials", "edit")).toBe(hasPermission("Technician", "financials", "edit"));
  });
});
