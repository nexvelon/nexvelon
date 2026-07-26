// PERM-1 — the seed generator expands the ROLE_PERMISSIONS composition helpers
// (full/viewAll/crud) deterministically into the flat granted-triple list the
// migration seeds. Spot-checks a couple of roles' expected granted sets so the
// generator can't silently mis-expand.

import { describe, it, expect } from "vitest";
import { grantedMatrixRows, buildGrantedMatrix, matrixHasPermission } from "@/lib/permissions/seed-matrix";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

describe("grantedMatrixRows", () => {
  it("produces exactly 206 unique granted triples (8 roles) (deduped)", () => {
    const rows = grantedMatrixRows();
    expect(rows).toHaveLength(206);
    // No duplicate (role,resource,action) — the DB PK requires uniqueness.
    const keys = new Set(rows.map((r) => `${r.role}:${r.resource}:${r.action}`));
    expect(keys.size).toBe(206);
  });

  it("Admin = full() = every resource × every action (121 rows)", () => {
    const admin = grantedMatrixRows().filter((r) => r.role === "Admin");
    expect(admin).toHaveLength(11 * 11); // 11 resources × 11 actions
  });

  it("expands viewAll()/crud() correctly for SalesRep", () => {
    const m = buildGrantedMatrix();
    // viewAll minus users/settings/financials → has projects:view, NOT financials:view
    expect(matrixHasPermission(m, "SalesRep", "projects", "view")).toBe(true);
    expect(matrixHasPermission(m, "SalesRep", "financials", "view")).toBe(false);
    expect(matrixHasPermission(m, "SalesRep", "users", "view")).toBe(false);
    // crud(quotes) → quotes:create + quotes:edit
    expect(matrixHasPermission(m, "SalesRep", "quotes", "create")).toBe(true);
    expect(matrixHasPermission(m, "SalesRep", "quotes", "edit")).toBe(true);
    // but NOT quotes:delete (crud excludes delete)
    expect(matrixHasPermission(m, "SalesRep", "quotes", "delete")).toBe(false);
  });

  it("every generated row corresponds to a real ROLE_PERMISSIONS entry", () => {
    for (const row of grantedMatrixRows()) {
      const granted = ROLE_PERMISSIONS[row.role].some(
        (p) => p.resource === row.resource && p.action === row.action
      );
      expect(granted).toBe(true);
    }
  });
});
