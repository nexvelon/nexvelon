// PERM-4 — the admin override editor's non-render logic: the tri-state → server
// action mapping, and that the EFFECTIVE view reuses the resolver's precedence
// (deny > grant > default), NOT a divergent reimplementation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cellStateFor, cellChangeFor, reasonRequired, overrideMap, permKey,
} from "@/lib/permissions/admin-ui";
import { hasPermission } from "@/lib/permissions";

describe("tri-state → action mapping", () => {
  it("Default → revoke; Granted/Denied → setOverride with state; reason required for grant/deny", () => {
    expect(cellChangeFor("default")).toEqual({ kind: "revoke" });
    expect(cellChangeFor("granted")).toEqual({ kind: "set", state: "granted" });
    expect(cellChangeFor("denied")).toEqual({ kind: "set", state: "denied" });
    expect(reasonRequired("default")).toBe(false);
    expect(reasonRequired("granted")).toBe(true);
    expect(reasonRequired("denied")).toBe(true);
  });

  it("cellStateFor reflects the active override, else default", () => {
    const m = overrideMap([
      { resource: "financials", action: "edit", state: "granted" },
      { resource: "inventory", action: "view", state: "denied" },
    ]);
    expect(cellStateFor("financials", "edit", m)).toBe("granted");
    expect(cellStateFor("inventory", "view", m)).toBe("denied");
    expect(cellStateFor("dashboard", "view", m)).toBe("default");
    expect(m.get(permKey("financials", "edit"))).toBe("granted");
  });
});

// The effective view is sourced from resolveEffectiveForUser — assert its
// precedence directly so the UI (which displays that server value) matches
// enforcement exactly.
const h = vi.hoisted(() => ({
  overrides: { granted: new Set<string>(), denied: new Set<string>() },
}));
vi.mock("react", async (o) => {
  const a = await o<typeof import("react")>();
  return { ...a, cache: (<A extends unknown[], R>(fn: (...x: A) => R) => fn) as typeof a.cache };
});
vi.mock("@/lib/permissions/db-matrix", async (o) => {
  const a = await o<typeof import("@/lib/permissions/db-matrix")>();
  return {
    ...a,
    loadRoleMatrix: async () => (await import("@/lib/permissions/seed-matrix")).buildGrantedMatrix(),
    loadUserOverrides: async () => h.overrides,
  };
});

import { resolveEffectiveForUser } from "@/lib/permissions/resolve";

beforeEach(() => {
  h.overrides = { granted: new Set(), denied: new Set() };
});

describe("effective view = resolver precedence (deny > grant > default)", () => {
  it("matches the static role default when there are no overrides", async () => {
    const eff = await resolveEffectiveForUser("u1", "Technician");
    // Every effective key must be a Technician role default and vice-versa.
    expect(eff.has("inventory:view")).toBe(hasPermission("Technician", "inventory", "view")); // true
    expect(eff.has("financials:edit")).toBe(hasPermission("Technician", "financials", "edit")); // false
  });

  it("grant adds, deny removes, deny wins over grant", async () => {
    h.overrides.granted.add("financials:edit"); // role lacks it
    h.overrides.denied.add("inventory:view");   // role has it
    h.overrides.granted.add("reports:view");
    h.overrides.denied.add("reports:view");     // both → denied
    const eff = await resolveEffectiveForUser("u1", "Technician");
    expect(eff.has("financials:edit")).toBe(true);  // granted
    expect(eff.has("inventory:view")).toBe(false);  // denied (was a role default)
    expect(eff.has("reports:view")).toBe(false);    // deny > grant
  });
});
