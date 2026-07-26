// PERM-1 — THE SAFETY GATE of Sprint 8.
//
// Iterates ALL 7 roles × 11 resources × 11 actions = 847 triples and asserts the
// DB-seeded resolver (dbHasPermission over the matrix built from the SAME seed
// generator migration 0114 uses) returns the IDENTICAL decision as the static
// hasPermission for EVERY cell. This proves the dormant DB copy is byte-faithful
// to lib/permissions.ts.
//
// This test MUST pass now and stay green through PERM-2's cutover (when
// hasPermission's internals swap onto the DB resolver under the same signature).
// If a single cell diverges, the cutover is unsafe — that is the whole point.
//
// ROLES/RESOURCES/ACTIONS are enumerated INDEPENDENTLY here (not imported from
// the module's private arrays) so this doubles as a guard: adding a resource or
// action to the app without re-seeding the matrix breaks this test.

import { describe, it, expect } from "vitest";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import { dbHasPermission } from "@/lib/permissions/db-matrix";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin", "SalesRep", "ProjectManager", "Technician", "Subcontractor", "Accountant", "ViewOnly",
];
const RESOURCES: Resource[] = [
  "dashboard", "quotes", "projects", "clients", "inventory", "subcontractors",
  "scheduling", "financials", "reports", "users", "settings",
];
const ACTIONS: Action[] = [
  "view", "create", "edit", "delete", "approve", "convert",
  "viewMargin", "viewInternal", "viewCost", "viewAll", "manage",
];

// The matrix as PERM-2 will resolve it — built from the same seed generator the
// migration's INSERTs came from (so DB rows === this map by construction).
const matrix = buildGrantedMatrix();

describe("847-triple parity: DB matrix === static matrix", () => {
  it("enumerates exactly 7 × 11 × 11 = 847 triples", () => {
    expect(ROLES).toHaveLength(7);
    expect(RESOURCES).toHaveLength(11);
    expect(ACTIONS).toHaveLength(11);
    expect(ROLES.length * RESOURCES.length * ACTIONS.length).toBe(847);
  });

  it("every (role, resource, action) decision is identical", () => {
    const mismatches: string[] = [];
    let granted = 0;
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const staticDecision = hasPermission(role, resource, action);
          const dbDecision = dbHasPermission(matrix, role, resource, action);
          if (staticDecision !== dbDecision) {
            mismatches.push(`${role}/${resource}/${action}: static=${staticDecision} db=${dbDecision}`);
          }
          if (staticDecision) granted += 1;
        }
      }
    }
    expect(mismatches).toEqual([]);
    // The granted count the seed must reproduce exactly (audit 2a).
    expect(granted).toBe(194);
  });

  it("the seeded matrix's granted count also equals 194", () => {
    let dbGranted = 0;
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          if (dbHasPermission(matrix, role, resource, action)) dbGranted += 1;
        }
      }
    }
    expect(dbGranted).toBe(194);
  });
});
