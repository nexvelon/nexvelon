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
import { businessDateISO } from "@/lib/format";
import {
  BALANCE_METRICS,
  getBalanceHistory,
  detectSnapshotGaps,
  type MetricPolarity,
} from "@/lib/api/balance-snapshots";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function getDashboardKpisAction(input: {
  from?: string;
  to?: string;
  // UIDG-6B — prior (comparison) window for the flow-metric deltas.
  compareFrom?: string;
  compareTo?: string;
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
      compareFrom: input.compareFrom,
      compareTo: input.compareTo,
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

// SNAP-1 — period-over-period deltas + trend series for the balance KPIs, computed
// from the daily snapshots. Only metrics the caller may READ are included (a user
// who can't see AR never receives AR history — the same gate as the live figure).
export interface BalanceDelta {
  key: string;
  /** The value at the comparison anchor, or null → not enough history (building). */
  prior: number | null;
  /** Ascending snapshot amounts (for a sparkline once ≥ the minimum). */
  series: number[];
  polarity?: MetricPolarity;
  basis: string;
  buildingHistory: boolean;
}
export interface BalanceDeltasPayload {
  deltas: Record<string, BalanceDelta>;
  /** Missing capture days between the first snapshot and yesterday (honest gap). */
  missingDays: number;
  firstDate: string | null;
}

export async function getBalanceDeltasAction(input: {
  /** The comparison window's end date (the balance's prior anchor); null → none. */
  compareTo: string | null;
  basis: string;
}): Promise<ActionResult<BalanceDeltasPayload>> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    const role = adaptRole(me.role);
    if (!hasPermission(role, "dashboard", "view")) {
      return { ok: false, error: "You don't have access to the dashboard." };
    }
    // Gate exactly like the live figures — only readable metrics are queried.
    const readable = BALANCE_METRICS.filter((m) => hasPermission(role, m.gate.resource, m.gate.action));
    const today = businessDateISO();
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
    const history = await getBalanceHistory(readable.map((m) => m.key), from, today, input.compareTo);

    const deltas: Record<string, BalanceDelta> = {};
    for (const m of readable) {
      const h = history.find((x) => x.key === m.key);
      const prior = h?.priorAt ?? null;
      deltas[m.key] = {
        key: m.key,
        prior,
        series: (h?.points ?? []).map((p) => p.amount),
        polarity: m.polarity,
        basis: input.basis,
        buildingHistory: prior == null,
      };
    }
    const gaps = await detectSnapshotGaps();
    return { ok: true, data: { deltas, missingDays: gaps.missing.length, firstDate: gaps.firstDate } };
  } catch (e) {
    return fail(e);
  }
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

export async function getTopClientsByRevenueAction(input?: {
  from?: string;
  to?: string;
}): Promise<ActionResult<TopClientRow[]>> {
  try {
    // UIDG-9 — the gate is re-checked on every call, so a range-driven refetch
    // never bypasses the financials:view check the initial fetch performed.
    const denied = await gateOr("financials", "view");
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getTopClientsByRevenue({ limit: 5, from: input?.from, to: input?.to }) };
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
