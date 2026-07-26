// DES-1 — Warehouse is now a first-class matrix role: view-everything (like
// ViewOnly) + manage inventory (create/edit/viewCost), and the server/client
// role mapping agree (the old divergence is fixed).

import { describe, it, expect } from "vitest";
import { hasPermission, roleDefaultKeys, ALL_ROLES } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";
import { normalizeDbRole } from "@/lib/auth/normalize-role";

describe("Warehouse baseline", () => {
  it("grants inventory create/edit/viewCost", () => {
    expect(hasPermission("Warehouse", "inventory", "create")).toBe(true);
    expect(hasPermission("Warehouse", "inventory", "edit")).toBe(true);
    expect(hasPermission("Warehouse", "inventory", "viewCost")).toBe(true);
  });

  it("does NOT grant financials:edit (view-everything, not edit-everything)", () => {
    expect(hasPermission("Warehouse", "financials", "edit")).toBe(false);
    expect(hasPermission("Warehouse", "financials", "view")).toBe(true); // view-all
  });

  it("has the view-everything set (view on all resources except users/settings)", () => {
    const keys = roleDefaultKeys("Warehouse");
    for (const r of ["dashboard", "quotes", "projects", "clients", "scheduling", "financials", "reports"]) {
      expect(keys.has(`${r}:view`)).toBe(true);
    }
    // …but not the admin surfaces.
    expect(keys.has("users:view")).toBe(false);
    expect(keys.has("settings:view")).toBe(false);
  });

  it("is one of the 8 matrix roles", () => {
    expect(ALL_ROLES).toContain("Warehouse");
    expect(ALL_ROLES).toHaveLength(8);
  });
});

describe("server/client mapping now AGREE (divergence fixed)", () => {
  it("DbRole Warehouse → Role Warehouse on BOTH adapters", () => {
    expect(adaptDbRole("Warehouse")).toBe("Warehouse");
    expect(normalizeDbRole("Warehouse")).toBe("Warehouse");
    expect(adaptDbRole("Warehouse")).toBe(normalizeDbRole("Warehouse"));
  });
});
