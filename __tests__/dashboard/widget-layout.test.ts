// UIDG-8/10 — the layout model's correctness lives in the pure metadata layer:
// validation (unknown ids dropped, spans clamped, LEGACY kpiOverview migrated),
// permission filtering + reflow (a hidden widget leaves no hole), canSeeWidget
// against the real matrix (incl. the anyOf quick-actions gate), and the built-in
// default still reproducing today's arrangement after the KPI split.

import { describe, it, expect } from "vitest";
import {
  BUILT_IN_LAYOUT,
  WIDGET_META,
  WIDGET_IDS,
  KPI_TILE_IDS,
  validateLayout,
  canSeeWidget,
  filterLayoutForRole,
  isPublicWidget,
  type DashboardLayout,
} from "@/lib/dashboard/widgets";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin", "SalesRep", "ProjectManager", "Technician",
  "Subcontractor", "Accountant", "ViewOnly", "Warehouse",
];

describe("built-in default = today's dashboard after the KPI split", () => {
  it("leads with the ten KPI tiles (3-up at colSpan 4) then the panels, in order", () => {
    expect(BUILT_IN_LAYOUT.widgets).toEqual([
      ...KPI_TILE_IDS.map((id) => ({ id, colSpan: 4 })),
      { id: "alerts", colSpan: 12 },
      { id: "revenueTrend", colSpan: 8 },
      { id: "quotesByStatus", colSpan: 4 },
      { id: "activityFeed", colSpan: 6 },
      { id: "topClients", colSpan: 6 },
      { id: "inventoryHealth", colSpan: 6 },
      { id: "techUtilization", colSpan: 6 },
    ]);
  });

  it("does not include the opt-in quick-actions bar by default", () => {
    expect(BUILT_IN_LAYOUT.widgets.some((w) => w.id === "quickActions")).toBe(false);
  });
});

describe("validateLayout — legacy migration, unknown drop, span clamp (2f + integrity)", () => {
  it("MIGRATES a legacy kpiOverview entry into the ten tiles, in place", () => {
    const clean = validateLayout({
      widgets: [
        { id: "alerts", colSpan: 12 },
        { id: "kpiOverview", colSpan: 12 }, // pre-split combined block
        { id: "activityFeed", colSpan: 6 },
      ],
    })!;
    expect(clean.widgets.map((w) => w.id)).toEqual([
      "alerts",
      ...KPI_TILE_IDS, // expanded where kpiOverview was
      "activityFeed",
    ]);
    // tiles land at their default width, not the old block's 12
    expect(clean.widgets.find((w) => w.id === "kpiRevenue")!.colSpan).toBe(4);
  });

  it("drops widget ids that no longer exist, keeping the rest", () => {
    const clean = validateLayout({
      widgets: [
        { id: "revenueTrend", colSpan: 8 },
        { id: "ghostWidgetFromAnOldDeploy", colSpan: 6 },
        { id: "activityFeed", colSpan: 6 },
      ],
    })!;
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

describe("canSeeWidget ⟺ the widget's gate (leakage guard)", () => {
  it("public widgets have no gate; gated widgets track their resource", () => {
    for (const role of ROLES) {
      expect(canSeeWidget("alerts", role)).toBe(true); // gate null
      expect(canSeeWidget("activityFeed", role)).toBe(true);
      expect(canSeeWidget("kpiRevenue", role)).toBe(hasPermission(role, "financials", "view"));
      expect(canSeeWidget("kpiWip", role)).toBe(hasPermission(role, "financials", "edit"));
      expect(canSeeWidget("kpiActiveProjects", role)).toBe(hasPermission(role, "projects", "view"));
      expect(canSeeWidget("revenueTrend", role)).toBe(hasPermission(role, "financials", "view"));
      expect(canSeeWidget("inventoryHealth", role)).toBe(hasPermission(role, "inventory", "view"));
      expect(canSeeWidget("techUtilization", role)).toBe(hasPermission(role, "scheduling", "view"));
    }
  });

  it("quick actions use an ANY-OF gate — visible with any create permission", () => {
    for (const role of ROLES) {
      const anyCreate =
        hasPermission(role, "clients", "create") ||
        hasPermission(role, "quotes", "create") ||
        hasPermission(role, "inventory", "create");
      expect(canSeeWidget("quickActions", role)).toBe(anyCreate);
    }
    // it is NOT a public widget (has anyOf) — a roleless resolve must exclude it
    expect(isPublicWidget("quickActions")).toBe(false);
  });
});

describe("filterLayoutForRole — hidden widgets removed, order preserved (reflow, no hole)", () => {
  it("drops the widgets a role can't see and keeps the rest in order", () => {
    const noFin = ROLES.find((r) => !hasPermission(r, "financials", "view"))!;
    const out = filterLayoutForRole(BUILT_IN_LAYOUT, noFin);
    // financial tiles + trend + top clients are gone
    for (const id of ["kpiRevenue", "kpiCash", "kpiAr", "revenueTrend", "topClients"]) {
      expect(out.widgets.map((w) => w.id)).not.toContain(id);
    }
    // remaining order is a subsequence of the original (no reordering, no hole)
    const originalOrder = BUILT_IN_LAYOUT.widgets.map((w) => w.id);
    const remaining = out.widgets.map((w) => w.id);
    let i = 0;
    for (const id of originalOrder) if (remaining[i] === id) i++;
    expect(i).toBe(remaining.length);
  });

  it("Admin sees every widget in the built-in default", () => {
    const out = filterLayoutForRole(BUILT_IN_LAYOUT, "Admin");
    expect(out.widgets.length).toBe(BUILT_IN_LAYOUT.widgets.length);
  });

  it("is not vacuous — at least one role loses at least one widget", () => {
    const anyFiltered = ROLES.some(
      (r) => filterLayoutForRole(BUILT_IN_LAYOUT, r).widgets.length < BUILT_IN_LAYOUT.widgets.length
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

  it("every widget id is catalogued with a category, description and icon", () => {
    for (const id of WIDGET_IDS) {
      const m = WIDGET_META[id];
      expect(m.category).toBeTruthy();
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.icon).toBeTruthy();
    }
  });
});
