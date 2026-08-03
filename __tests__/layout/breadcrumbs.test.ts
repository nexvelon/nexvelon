// CLEAN-1 §4c/§5 — the breadcrumb label used to be looked up in now-empty
// lib/mock-data arrays, so a detail route rendered the raw uuid. The label now
// comes from a live-table lookup, threaded in as `resolvedLabel`. These cover the
// pure logic: which routes trigger a lookup, that the resolved name is used, and
// that the uuid is the honest fallback while unresolved.

import { describe, it, expect } from "vitest";
import { buildCrumbs, detailEntity } from "@/lib/breadcrumbs";

describe("detailEntity — which routes need a real-source label", () => {
  it("a project detail route yields a project lookup", () => {
    expect(detailEntity("/projects/abc-123")).toEqual({ kind: "project", id: "abc-123" });
  });
  it("a quote detail route yields a quote lookup", () => {
    expect(detailEntity("/quotes/q-9")).toEqual({ kind: "quote", id: "q-9" });
  });
  it("the /new create routes need no lookup", () => {
    expect(detailEntity("/projects/new")).toBeNull();
    expect(detailEntity("/quotes/new")).toBeNull();
  });
  it("list roots and unrelated sections need no lookup", () => {
    expect(detailEntity("/projects")).toBeNull();
    expect(detailEntity("/clients/c-1")).toBeNull();
  });
});

describe("buildCrumbs — real label wins, uuid is the fallback", () => {
  it("uses the resolved project name when available (not the uuid)", () => {
    const crumbs = buildCrumbs("/projects/abc-123", null, "P-1042");
    expect(crumbs.map((c) => c.label)).toContain("P-1042");
    expect(crumbs.map((c) => c.label)).not.toContain("ABC-123");
  });

  it("falls back to the uuid segment while the name is unresolved", () => {
    const crumbs = buildCrumbs("/projects/abc-123", null, null);
    expect(crumbs.map((c) => c.label)).toContain("ABC-123");
  });

  it("appends the tab label after the project", () => {
    const crumbs = buildCrumbs("/projects/abc-123", "commissioning", "P-1042");
    expect(crumbs[crumbs.length - 1].label).toBe("COMMISSIONING");
  });

  it("uses the resolved quote number for a quote route", () => {
    const crumbs = buildCrumbs("/quotes/q-9", null, "Q-2025-88");
    expect(crumbs.map((c) => c.label)).toContain("Q-2025-88");
  });

  it("the create routes read as NEW PROJECT / NEW QUOTE, never a uuid", () => {
    expect(buildCrumbs("/projects/new", null, null).map((c) => c.label)).toContain("NEW PROJECT");
    expect(buildCrumbs("/quotes/new", null, null).map((c) => c.label)).toContain("NEW QUOTE");
  });
});
