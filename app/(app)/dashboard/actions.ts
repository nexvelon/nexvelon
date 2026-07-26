"use server";

// DASH-1 — the dashboard KPI read action. Gates dashboard:view (base), then
// derives which tiers the caller may see from their permissions and passes them
// to the fan-out. Redaction is server-authoritative: a tier the caller can't see
// is never queried and comes back as a null block (the UI renders "Restricted";
// a real 0 is a number, never blanked).

import {
  getDashboardKpis,
  type DashboardKpis,
} from "@/lib/api/dashboard";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

export async function getDashboardKpisAction(input: {
  from?: string;
  to?: string;
}): Promise<ActionResult<DashboardKpis>> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    const role = adaptRole(me.role);
    if (!hasPermission(role, "dashboard", "view")) {
      return { ok: false, error: "You don't have access to the dashboard." };
    }
    const data = await getDashboardKpis({
      from: input.from,
      to: input.to,
      tiers: {
        financialView: hasPermission(role, "financials", "view"),
        financialEdit: hasPermission(role, "financials", "edit"),
        projects: hasPermission(role, "projects", "view"),
        quotes: hasPermission(role, "quotes", "view"),
      },
    });
    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}
