// UIDG-8 — the layout model's correctness lives in the pure metadata layer:
// validation (unknown ids dropped, spans clamped), permission filtering + reflow
// (a hidden widget leaves no hole), and canSeeWidget against the real matrix.

import { describe, it, expect } from "vitest";
import {
  BUILT_IN_LAYOUT,
  WIDGET_META,
  WIDGET_IDS,
  validateLayout,
  canSeeWidget,
  filterLayoutForRole,
  type DashboardLayout,
} from "@/lib/dashboard/widgets";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin", "SalesRep", "ProjectManager", "Technician",
  "Subcontractor", "Accountant", "ViewOnly", "Warehouse",
];

describe("built-in default = today's dashboard, exactly", () => {
  it("lists the 8 widgets in the current order with the current spans", () => {
    expect(BUILT_IN_LAYOUT.widgets).toEqual([
      { id: "kpiOverview", colSpan: 12 },
      { id: "alerts", colSpan: 12 },
      { id: "revenueTrend", colSpan: 8 },
      { id: "quotesByStatus", colSpan: 4 },
      { id: "activityFeed", colSpan: 6 },
      { id: "topClients", colSpan: 6 },
      { id: "inventoryHealth", colSpan: 6 },
      { id: "techUtilization", colSpan: 6 },
    ]);
  });
});

describe("validateLayout — unknown ids drop, spans clamp (2f + integrity)", () => {
  it("drops widget ids that no longer exist, keeping the rest", () => {
    const raw = {
      widgets: [
        { id: "revenueTrend", colSpan: 8 },
        { id: "ghostWidgetFromAnOldDeploy", colSpan: 6 },
        { id: "activityFeed", colSpan: 6 },
      ],
    };
    const clean = validateLayout(raw)!;
    expect(clean.widgets.map((w) => w.id)).toEqual(["revenueTrend", "activityFeed"]);
  });

  it("clamps colSpan to [minCols, 12] and de-dupes", () => {
    const clean = validateLayout({
      widgets: [
        { id: "revenueTrend", colSpan: 99 }, // → 12
        { id: "quotesByStatus", colSpan: 1 }, // → minCols (4)
        { id: "revenueTrend", colSpan: 6 }, // dup → dropped
      ],
    })!;
    expect(clean.widgets).toEqual([
      { id: "revenueTrend", colSpan: 12 },
      { id: "quotesByStatus", colSpan: WIDGET_META.quotesByStatus.minCols },
    ]);
  });

  it("returns null for junk or an all-unknown layout (caller falls through)", () => {
    expect(validateLayout(null)).toBeNull();
    expect(validateLayout({ widgets: [{ id: "nope" }] })).toBeNull();
    expect(validateLayout("garbage")).toBeNull();
  });
});

describe("canSeeWidget ⟺ the widget's gate permission (leakage guard)", () => {
  it("always-visible widgets have no gate; gated widgets track their resource", () => {
    for (const role of ROLES) {
      expect(canSeeWidget("kpiOverview", role)).toBe(true); // gate null
      expect(canSeeWidget("activityFeed", role)).toBe(true);
      expect(canSeeWidget("revenueTrend", role)).toBe(hasPermission(role, "financials", "view"));
      expect(canSeeWidget("inventoryHealth", role)).toBe(hasPermission(role, "inventory", "view"));
      expect(canSeeWidget("techUtilization", role)).toBe(hasPermission(role, "scheduling", "view"));
    }
  });
});

describe("filterLayoutForRole — hidden widgets removed, order preserved (reflow, no hole)", () => {
  it("drops the widgets a role can't see and keeps the rest in order", () => {
    // A role that cannot view financials loses revenueTrend + topClients; the
    // survivors keep their relative order with no gap.
    const noFin = ROLES.find((r) => !hasPermission(r, "financials", "view"))!;
    const out = filterLayoutForRole(BUILT_IN_LAYOUT, noFin);
    expect(out.widgets.map((w) => w.id)).not.toContain("revenueTrend");
    expect(out.widgets.map((w) => w.id)).not.toContain("topClients");
    // remaining order is a subsequence of the original (no reordering, no hole)
    const originalOrder = BUILT_IN_LAYOUT.widgets.map((w) => w.id);
    const remaining = out.widgets.map((w) => w.id);
    let i = 0;
    for (const id of originalOrder) if (remaining[i] === id) i++;
    expect(i).toBe(remaining.length);
  });

  it("Admin sees every widget", () => {
    const out = filterLayoutForRole(BUILT_IN_LAYOUT, "Admin");
    expect(out.widgets.length).toBe(WIDGET_IDS.length);
  });

  it("is not vacuous — at least one role loses at least one widget", () => {
    const anyFiltered = ROLES.some(
      (r) => filterLayoutForRole(BUILT_IN_LAYOUT, r).widgets.length < WIDGET_IDS.length
    );
    expect(anyFiltered).toBe(true);
  });
});

describe("a resolved layout only ever contains widgets the role may see", () => {
  it("for every role, the filtered built-in has no gated widget the role lacks", () => {
    for (const role of ROLES) {
      const out: DashboardLayout = filterLayoutForRole(BUILT_IN_LAYOUT, role);
      for (const w of out.widgets) expect(canSeeWidget(w.id, role)).toBe(true);
    }
  });
});
