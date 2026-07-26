// THE PARITY GATE — redefined at DES-1.
//
// OLD invariant (PERM-1..4): the DB matrix always equalled the static matrix.
// NEW invariant (DES-1, role baselines are now EDITABLE): a FRESH seed —
// generated from ROLE_PERMISSIONS incl. the 8th Warehouse role — equals the
// static matrix for all 8 × 11 × 11 = 968 triples. This proves the CODE and the
// SEED agree on a fresh install. Admin edits to role_permission_matrix then
// LEGITIMATELY diverge from the static matrix (that's the feature) and are
// audited; role-baseline-edit.test.ts covers that the resolver reflects edits
// while a fresh seed still matches static.
//
// ROLES/RESOURCES/ACTIONS are enumerated INDEPENDENTLY here so this doubles as a
// guard: adding a role/resource/action without re-seeding breaks this test.

import { describe, it, expect } from "vitest";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import { dbHasPermission } from "@/lib/permissions/db-matrix";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin", "SalesRep", "ProjectManager", "Technician", "Subcontractor", "Accountant", "ViewOnly", "Warehouse",
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

describe("968-triple parity: FRESH seed === static matrix (8 roles)", () => {
  it("enumerates exactly 8 × 11 × 11 = 968 triples", () => {
    expect(ROLES).toHaveLength(8);
    expect(RESOURCES).toHaveLength(11);
    expect(ACTIONS).toHaveLength(11);
    expect(ROLES.length * RESOURCES.length * ACTIONS.length).toBe(968);
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
    expect(granted).toBe(206);
  });

  it("the seeded matrix's granted count also equals 206", () => {
    let dbGranted = 0;
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          if (dbHasPermission(matrix, role, resource, action)) dbGranted += 1;
        }
      }
    }
    expect(dbGranted).toBe(206);
  });
});
