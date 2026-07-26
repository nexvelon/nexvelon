// PERM-3 — override precedence: deny > grant > role default. A granted override
// ADDS a permission the role lacks; a denied override REMOVES one the role has;
// a triple with BOTH resolves to denied. Revoked overrides don't count. The
// existing user_grants (quotes.edit_discount) is unaffected (client feature
// flag, not a matrix override).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasPermission } from "@/lib/permissions";
import { GRANT_EDIT_DISCOUNT, GRANT_CATALOG } from "@/lib/grants";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Technician", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  overrides: { granted: new Set<string>(), denied: new Set<string>() },
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
    loadUserOverrides: async () => h.overrides,
  };
});

import { getCurrentAuth } from "@/lib/permissions/resolve";

beforeEach(() => {
  h.profile = { id: "u1", role: "Technician", status: "Active" };
  h.overrides = { granted: new Set(), denied: new Set() };
});

describe("override precedence", () => {
  it("a GRANTED override adds a permission the role lacks", async () => {
    // Technician cannot edit financials by role…
    expect(hasPermission("Technician", "financials", "edit")).toBe(false);
    h.overrides.granted.add("financials:edit");
    const auth = await getCurrentAuth();
    expect(auth.can("financials", "edit")).toBe(true); // …but the override grants it
  });

  it("a DENIED override removes a permission the role has", async () => {
    // Technician CAN view inventory by role…
    expect(hasPermission("Technician", "inventory", "view")).toBe(true);
    h.overrides.denied.add("inventory:view");
    const auth = await getCurrentAuth();
    expect(auth.can("inventory", "view")).toBe(false); // …but the override denies it
  });

  it("deny > grant: BOTH on the same triple → denied", async () => {
    h.overrides.granted.add("financials:edit");
    h.overrides.denied.add("financials:edit");
    const auth = await getCurrentAuth();
    expect(auth.can("financials", "edit")).toBe(false); // deny applied last, wins
  });

  it("no overrides → identical to the role default (parity preserved per-user)", async () => {
    const auth = await getCurrentAuth();
    for (const [r, a] of [["inventory", "view"], ["financials", "edit"], ["dashboard", "view"]] as const) {
      expect(auth.can(r, a)).toBe(hasPermission("Technician", r, a));
    }
  });
});

describe("user_grants fold-in (unbroken)", () => {
  it("quotes.edit_discount stays a bespoke grant key (not a matrix action)", () => {
    // The one live grant is a feature capability, not a (resource, action); it
    // continues to drive TotalsBar via the client grants set, unchanged.
    expect(GRANT_EDIT_DISCOUNT).toBe("quotes.edit_discount");
    expect(GRANT_CATALOG.some((g) => g.key === GRANT_EDIT_DISCOUNT)).toBe(true);
    // It is NOT a valid matrix action verb, so it never enters the override set.
    const [, verb] = GRANT_EDIT_DISCOUNT.split(".");
    expect(["view", "create", "edit", "delete", "approve", "convert", "viewMargin", "viewInternal", "viewCost", "viewAll", "manage"]).not.toContain(verb);
  });
});
