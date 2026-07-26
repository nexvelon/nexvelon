"use server";

// DASH-1 — the dashboard KPI read action. Gates dashboard:view (base), then
// derives which tiers the caller may see from their permissions and passes them
// to the fan-out. Redaction is server-authoritative: a tier the caller can't see
// is never queried and comes back as a null block (the UI renders "Restricted";
// a real 0 is a number, never blanked).

import {
  getDashboardKpis,
  getDashboardAlerts,
  getRecentActivity,
  getQuotesByStatus,
  type DashboardKpis,
  type DashboardAlerts,
  type RecentActivityItem,
  type QuotesByStatus,
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

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

// DASH-2 — the alerts/worklists fan-out. Each block is gated by its own resource
// (compliance→subcontractors:view; bonds/warranty/tasks/deficiencies/milestones
// →projects:view; dispatch→scheduling:view). A missing permission → null block
// (restricted), never fabricated.
export async function getDashboardAlertsAction(): Promise<ActionResult<DashboardAlerts>> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    const role = adaptRole(me.role);
    if (!hasPermission(role, "dashboard", "view")) {
      return { ok: false, error: "You don't have access to the dashboard." };
    }
    const data = await getDashboardAlerts({
      tiers: {
        subs: hasPermission(role, "subcontractors", "view"),
        projects: hasPermission(role, "projects", "view"),
        scheduling: hasPermission(role, "scheduling", "view"),
      },
    });
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

// Global recent-activity feed — any dashboard viewer (activity is high-level:
// entity type + action + actor, no restricted field values).
export async function getRecentActivityAction(): Promise<
  ActionResult<{ items: RecentActivityItem[] }>
> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    if (!hasPermission(adaptRole(me.role), "dashboard", "view")) {
      return { ok: false, error: "You don't have access to the dashboard." };
    }
    return { ok: true, data: await getRecentActivity({ limit: 15 }) };
  } catch (e) {
    return fail(e);
  }
}

// Real quotes-by-status breakdown — gated quotes:view.
export async function getQuotesByStatusAction(): Promise<ActionResult<QuotesByStatus>> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    if (!hasPermission(adaptRole(me.role), "quotes", "view")) {
      return { ok: false, error: "You don't have permission to view quotes." };
    }
    return { ok: true, data: await getQuotesByStatus() };
  } catch (e) {
    return fail(e);
  }
}
