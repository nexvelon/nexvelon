// UIDG-8 — the dashboard widget REGISTRY (metadata only — no React), the single
// enumerable source the layout engine validates against and the client grid
// renders from. Splitting the metadata out of the component map (widget-registry
// .tsx) keeps this file server-safe, so the server resolver can validate + filter
// a stored layout without importing client components.
//
// A "widget" here is one placeable dashboard block. We keep the existing panels
// as the units (the KPI overview is one block; each chart/list/panel is one) —
// finer per-tile widgets are a UIDG-10 catalog concern, not this chunk.

import { hasPermission, type Resource, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export type WidgetId =
  | "kpiOverview"
  | "alerts"
  | "revenueTrend"
  | "quotesByStatus"
  | "activityFeed"
  | "topClients"
  | "inventoryHealth"
  | "techUtilization";

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  /** The permission the whole widget requires. null = visible to any dashboard
   *  viewer (the widget may still gate its own contents internally, e.g. the KPI
   *  overview's per-tier tiles). */
  gate: { resource: Resource; action: Action } | null;
  /** Default width in a 12-column grid, and the narrowest it may be resized to. */
  defaultCols: number;
  minCols: number;
  /** Whether the user may resize this widget's width in edit mode. */
  resizable: boolean;
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  kpiOverview: { id: "kpiOverview", title: "KPI overview", gate: null, defaultCols: 12, minCols: 12, resizable: false },
  alerts: { id: "alerts", title: "Alerts & worklists", gate: null, defaultCols: 12, minCols: 6, resizable: true },
  revenueTrend: { id: "revenueTrend", title: "Revenue & cash trend", gate: { resource: "financials", action: "view" }, defaultCols: 8, minCols: 4, resizable: true },
  quotesByStatus: { id: "quotesByStatus", title: "Quotes by status", gate: { resource: "quotes", action: "view" }, defaultCols: 4, minCols: 4, resizable: true },
  activityFeed: { id: "activityFeed", title: "Recent activity", gate: null, defaultCols: 6, minCols: 4, resizable: true },
  topClients: { id: "topClients", title: "Top clients", gate: { resource: "financials", action: "view" }, defaultCols: 6, minCols: 4, resizable: true },
  inventoryHealth: { id: "inventoryHealth", title: "Inventory health", gate: { resource: "inventory", action: "view" }, defaultCols: 6, minCols: 4, resizable: true },
  techUtilization: { id: "techUtilization", title: "Technician utilization", gate: { resource: "scheduling", action: "view" }, defaultCols: 6, minCols: 4, resizable: true },
};

export const WIDGET_IDS = Object.keys(WIDGET_META) as WidgetId[];

/** The built-in default layout — REPRODUCES today's dashboard exactly, so a user
 *  who never customises sees no regression. Order + spans match the current JSX. */
export const BUILT_IN_LAYOUT: DashboardLayout = {
  widgets: [
    { id: "kpiOverview", colSpan: 12 },
    { id: "alerts", colSpan: 12 },
    { id: "revenueTrend", colSpan: 8 },
    { id: "quotesByStatus", colSpan: 4 },
    { id: "activityFeed", colSpan: 6 },
    { id: "topClients", colSpan: 6 },
    { id: "inventoryHealth", colSpan: 6 },
    { id: "techUtilization", colSpan: 6 },
  ],
};

export interface LayoutEntry {
  id: WidgetId;
  colSpan: number;
}
export interface DashboardLayout {
  widgets: LayoutEntry[];
}

function isWidgetId(x: unknown): x is WidgetId {
  return typeof x === "string" && x in WIDGET_META;
}

/**
 * Coerce arbitrary stored/incoming JSON into a valid DashboardLayout:
 *  - drop entries whose id is not a known widget (2f — a layout from before a
 *    deploy that removed a widget degrades silently, never throws);
 *  - drop duplicate ids (keep first);
 *  - clamp each colSpan to [minCols, 12].
 * Returns null when the shape is unusable (caller falls back to the next level).
 */
export function validateLayout(raw: unknown): DashboardLayout | null {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { widgets?: unknown }).widgets)
      ? (raw as { widgets: unknown[] }).widgets
      : Array.isArray(raw)
        ? (raw as unknown[])
        : null;
  if (!arr) return null;

  const seen = new Set<WidgetId>();
  const widgets: LayoutEntry[] = [];
  for (const e of arr) {
    const id = (e as { id?: unknown })?.id;
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    const meta = WIDGET_META[id];
    const rawSpan = Number((e as { colSpan?: unknown }).colSpan);
    const colSpan = Number.isFinite(rawSpan)
      ? Math.min(12, Math.max(meta.minCols, Math.round(rawSpan)))
      : meta.defaultCols;
    widgets.push({ id, colSpan });
  }
  return widgets.length > 0 ? { widgets } : null;
}

/** Can this role see a widget at all (the leakage guard for the layout)? */
export function canSeeWidget(id: WidgetId, role: Role): boolean {
  const gate = WIDGET_META[id].gate;
  return gate === null || hasPermission(role, gate.resource, gate.action);
}

/** Drop the widgets the role may not see; the remaining ordered list reflows with
 *  no hole (2e). A widget the user cannot see never reaches the client. */
export function filterLayoutForRole(layout: DashboardLayout, role: Role): DashboardLayout {
  return { widgets: layout.widgets.filter((w) => canSeeWidget(w.id, role)) };
}
