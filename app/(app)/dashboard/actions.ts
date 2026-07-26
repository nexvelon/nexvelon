"use server";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";

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
  getRevenueTrend,
  getTopClientsByRevenue,
  getInventoryHealth,
  type DashboardKpis,
  type DashboardAlerts,
  type RecentActivityItem,
  type QuotesByStatus,
  type TopClientRow,
  type InventoryHealth,
} from "@/lib/api/dashboard";
import type { MonthlyRevenuePoint } from "@/lib/api/financials";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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

// ─── DASH-3 final panels ──────────────────────────────────────────────────────

/** Guard a read behind a resource:action; returns null on OK, else the error. */
async function gateOr(resource: "financials" | "inventory", action: "view"): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me) return "You're not signed in.";
  if (!hasPermission(adaptRole(me.role), resource, action)) return "Restricted.";
  return null;
}

export async function getRevenueTrendAction(): Promise<ActionResult<MonthlyRevenuePoint[]>> {
  try {
    const denied = await gateOr("financials", "view");
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getRevenueTrend() };
  } catch (e) {
    return fail(e);
  }
}

export async function getTopClientsByRevenueAction(): Promise<ActionResult<TopClientRow[]>> {
  try {
    const denied = await gateOr("financials", "view");
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getTopClientsByRevenue({ limit: 5 }) };
  } catch (e) {
    return fail(e);
  }
}

export async function getInventoryHealthAction(): Promise<ActionResult<InventoryHealth>> {
  try {
    const denied = await gateOr("inventory", "view");
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getInventoryHealth() };
  } catch (e) {
    return fail(e);
  }
}
