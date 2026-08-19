// UIDG-10 — templates are built from REAL widgets only and reflow cleanly around a
// role's permissions (Step 6): a template referencing a widget the user can't see
// resolves to their permitted subset with no gap, never leaking a gated widget.

import { describe, it, expect } from "vitest";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard/templates";
import {
  validateLayout,
  filterLayoutForRole,
  canSeeWidget,
  WIDGET_META,
} from "@/lib/dashboard/widgets";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin", "SalesRep", "ProjectManager", "Technician",
  "Subcontractor", "Accountant", "ViewOnly", "Warehouse",
];

describe("dashboard templates", () => {
  it("every template is a non-empty, valid layout of real widgets", () => {
    expect(DASHBOARD_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of DASHBOARD_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.audience).toBeTruthy();
      expect(t.layout.widgets.length).toBeGreaterThan(0);
      for (const w of t.layout.widgets) {
        expect(WIDGET_META[w.id]).toBeTruthy(); // real widget id
      }
      // survives the same coercion as a stored layout
      expect(validateLayout(t.layout)).not.toBeNull();
    }
  });

  it("reflows around permissions — no unpermitted widget survives, no gap", () => {
    for (const t of DASHBOARD_TEMPLATES) {
      for (const role of ROLES) {
        const out = filterLayoutForRole(t.layout, role);
        // never leaks a gated widget the role lacks
        for (const w of out.widgets) expect(canSeeWidget(w.id, role)).toBe(true);
        // the survivors are a subsequence of the template (order kept, no hole)
        const order = t.layout.widgets.map((w) => w.id);
        const remaining = out.widgets.map((w) => w.id);
        let i = 0;
        for (const id of order) if (remaining[i] === id) i++;
        expect(i).toBe(remaining.length);
      }
    }
  });

  it("the Finance template is financial and reflows to nothing for a role with no financials", () => {
    const finance = DASHBOARD_TEMPLATES.find((t) => t.id === "finance")!;
    const noFin = ROLES.find((r) => !hasPermission(r, "financials", "view") && !hasPermission(r, "financials", "edit"))!;
    const out = filterLayoutForRole(finance.layout, noFin);
    expect(out.widgets.length).toBe(0); // every widget was financial → clean empty, no gaps
  });
});
