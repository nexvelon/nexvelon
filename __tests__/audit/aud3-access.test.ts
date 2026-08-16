// AUD-3 — the leakage guard is entirely in the pure access layer: a row is only
// ever shown/queried if the caller can `view` the resource its entity_type maps
// to. These tests pin that invariant against the REAL permission matrix for
// every role, plus the per-user gate and the link builder.

import { describe, it, expect } from "vitest";
import {
  FEED_RESOURCE,
  viewableOwnTypes,
  viewableParentTypes,
  canViewUserActivity,
  feedHref,
} from "@/lib/activity-access";
import { ACTIVITY_ENTITY_TYPES } from "@/lib/types/database";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin",
  "SalesRep",
  "ProjectManager",
  "Technician",
  "Subcontractor",
  "Accountant",
  "ViewOnly",
  "Warehouse",
];

describe("feed visibility ⟺ per-resource view permission (leakage guard)", () => {
  it("viewableOwnTypes contains a type iff the caller can view its resource (all roles)", () => {
    for (const role of ROLES) {
      const own = new Set(viewableOwnTypes(role));
      for (const t of ACTIVITY_ENTITY_TYPES) {
        if (t === "attachment") {
          expect(own.has(t)).toBe(false); // attachment is parent-gated, never own
          continue;
        }
        expect(own.has(t)).toBe(hasPermission(role, FEED_RESOURCE[t], "view"));
      }
    }
  });

  it("is not vacuous — a role without financials cannot see invoice activity", () => {
    // Find any role lacking financials:view and assert 'invoice' is excluded.
    const noFin = ROLES.filter((r) => !hasPermission(r, "financials", "view"));
    expect(noFin.length).toBeGreaterThan(0);
    for (const role of noFin) {
      expect(viewableOwnTypes(role)).not.toContain("invoice");
    }
    // Admin (full access) does see it.
    expect(viewableOwnTypes("Admin")).toContain("invoice");
  });

  it("viewableParentTypes mirrors the same per-resource gate", () => {
    for (const role of ROLES) {
      const parents = new Set(viewableParentTypes(role));
      for (const t of ACTIVITY_ENTITY_TYPES) {
        expect(parents.has(t)).toBe(hasPermission(role, FEED_RESOURCE[t], "view"));
      }
    }
  });
});

describe("canViewUserActivity — self always, others need users:view", () => {
  it("a user may always view their OWN activity, whatever their role", () => {
    for (const role of ROLES) {
      expect(canViewUserActivity(role, "me", "me")).toBe(true);
    }
  });

  it("viewing SOMEONE ELSE is exactly the users:view permission", () => {
    for (const role of ROLES) {
      expect(canViewUserActivity(role, "me", "other")).toBe(
        hasPermission(role, "users", "view")
      );
    }
  });

  it("is not vacuous — at least one role is denied others' activity", () => {
    const denied = ROLES.filter((r) => !canViewUserActivity(r, "me", "other"));
    expect(denied.length).toBeGreaterThan(0);
  });
});

describe("feedHref — only real detail pages link", () => {
  it("builds hrefs for linkable types", () => {
    expect(feedHref("client", "c1", null)).toBe("/clients/c1");
    expect(feedHref("project", "p1", null)).toBe("/projects/p1");
    expect(feedHref("subcontractor", "s1", null)).toBe("/subcontractors/s1");
    expect(feedHref("job", "j1", "p1")).toBe("/projects/p1/jobs/j1"); // needs parent
  });

  it("returns null for a job with no parent, and for types with no detail page", () => {
    expect(feedHref("job", "j1", null)).toBeNull();
    for (const t of ["job_task", "deficiency", "stock_movement", "contact", "attachment", "invoice"] as const) {
      expect(feedHref(t, "x", "y")).toBeNull();
    }
  });
});
