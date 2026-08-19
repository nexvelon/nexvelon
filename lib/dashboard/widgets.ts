// UIDG-8/10 — the dashboard widget REGISTRY (metadata only — no React), the single
// enumerable source the layout engine validates against, the client grid renders
// from, and the UIDG-10 catalog lists. Splitting metadata out of the component map
// (widget-registry.tsx) keeps this file server-safe, so the server resolver can
// validate + filter a stored layout without importing client components.
//
// UIDG-10 — a "widget" is now the FINEST placeable block: each KPI metric is its
// own widget (Revenue can be placed without Cash), plus the panels and a quick-
// actions bar. The old combined `kpiOverview` block is retired; a stored layout
// that still references it is migrated to the individual tiles in `validateLayout`
// (see LEGACY_KPI_OVERVIEW_ID) so nobody logs into a broken dashboard.

import { hasPermission, type Resource, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  Banknote,
  Bell,
  Boxes,
  ClipboardList,
  FolderOpen,
  HandCoins,
  LineChart,
  ListChecks,
  Percent,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

export type WidgetId =
  // Metrics — the split KPI tiles (each individually placeable + gated).
  | "kpiRevenue"
  | "kpiCash"
  | "kpiAr"
  | "kpiAp"
  | "kpiDeposits"
  | "kpiActiveProjects"
  | "kpiOpenQuotes"
  | "kpiWip"
  | "kpiHst"
  | "kpiMargin"
  // Panels.
  | "alerts"
  | "revenueTrend"
  | "quotesByStatus"
  | "activityFeed"
  | "topClients"
  | "inventoryHealth"
  | "techUtilization"
  // Actions.
  | "quickActions";

/** Catalog grouping (UIDG-10). */
export type WidgetCategory = "metrics" | "charts" | "panels" | "actions";

export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  metrics: "Key metrics",
  charts: "Charts & trends",
  panels: "Panels & lists",
  actions: "Quick actions",
};

/** The order categories appear in the catalog. */
export const CATEGORY_ORDER: WidgetCategory[] = ["metrics", "charts", "panels", "actions"];

interface Gate {
  resource: Resource;
  action: Action;
}

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  /** One-line catalog description (UIDG-10). */
  description: string;
  category: WidgetCategory;
  /** A representative icon for the catalog thumbnail. */
  icon: LucideIcon;
  /** The permission the whole widget requires. null = visible to any dashboard
   *  viewer. For a widget that is useful with ANY of several permissions (the
   *  quick-actions bar), use `anyOf` instead — the widget is visible when the
   *  caller holds at least one. Exactly one of gate/anyOf is set (or neither). */
  gate: Gate | null;
  anyOf?: Gate[];
  /** Default width in a 12-column grid, and the narrowest it may be resized to. */
  defaultCols: number;
  minCols: number;
  /** Whether the user may resize this widget's width in edit mode. */
  resizable: boolean;
  /** UIDG-9 — which chrome controls this widget offers (the grid reads this rather
   *  than special-casing widgets). KPI tiles opt out of refresh/expand (their data
   *  is a shared snapshot; a fullscreen stat is pointless) and carry only the ⋯
   *  menu; the panels keep the full chrome. */
  chrome: { refresh: boolean; expand: boolean };
}

const FULL_CHROME = { refresh: true, expand: true } as const;
const TILE_CHROME = { refresh: false, expand: false } as const;

const FIN_VIEW: Gate = { resource: "financials", action: "view" };
const FIN_EDIT: Gate = { resource: "financials", action: "edit" };

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  // ── Metrics (split KPI tiles) ──────────────────────────────────────────────
  kpiRevenue: { id: "kpiRevenue", title: "Revenue", description: "Invoiced revenue for the selected range, with trend and comparison.", category: "metrics", icon: Banknote, gate: FIN_VIEW, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiCash: { id: "kpiCash", title: "Cash collected", description: "Payments received in the selected range, with trend and comparison.", category: "metrics", icon: HandCoins, gate: FIN_VIEW, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiAr: { id: "kpiAr", title: "Accounts receivable", description: "Outstanding and overdue receivables, as of today.", category: "metrics", icon: AlertCircle, gate: FIN_VIEW, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiAp: { id: "kpiAp", title: "Accounts payable", description: "Outstanding and overdue payables, as of today.", category: "metrics", icon: Receipt, gate: FIN_VIEW, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiDeposits: { id: "kpiDeposits", title: "Deposits held", description: "Customer deposits currently held, as of today.", category: "metrics", icon: Wallet, gate: FIN_VIEW, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiActiveProjects: { id: "kpiActiveProjects", title: "Active projects", description: "Active project count and contract value, as of today.", category: "metrics", icon: FolderOpen, gate: { resource: "projects", action: "view" }, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiOpenQuotes: { id: "kpiOpenQuotes", title: "Open quotes", description: "Open quote count and pipeline value, as of today.", category: "metrics", icon: ClipboardList, gate: { resource: "quotes", action: "view" }, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiWip: { id: "kpiWip", title: "WIP position", description: "Work-in-progress: net, overbilled and underbilled, as of today.", category: "metrics", icon: TrendingUp, gate: FIN_EDIT, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiHst: { id: "kpiHst", title: "HST net position", description: "Net HST position for the selected range.", category: "metrics", icon: Receipt, gate: FIN_EDIT, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },
  kpiMargin: { id: "kpiMargin", title: "Blended margin", description: "Portfolio gross margin percentage, as of today.", category: "metrics", icon: Percent, gate: FIN_EDIT, defaultCols: 4, minCols: 4, resizable: true, chrome: TILE_CHROME },

  // ── Charts ─────────────────────────────────────────────────────────────────
  revenueTrend: { id: "revenueTrend", title: "Revenue & cash trend", description: "Invoiced revenue and cash collected by month, trailing 12 months.", category: "charts", icon: LineChart, gate: FIN_VIEW, defaultCols: 8, minCols: 4, resizable: true, chrome: FULL_CHROME },

  // ── Panels ─────────────────────────────────────────────────────────────────
  alerts: { id: "alerts", title: "Alerts & worklists", description: "Compliance, bonds, tasks, deficiencies and dispatch that need attention now.", category: "panels", icon: Bell, gate: null, defaultCols: 12, minCols: 6, resizable: true, chrome: FULL_CHROME },
  quotesByStatus: { id: "quotesByStatus", title: "Quotes by status", description: "Open quote funnel by status, count and value.", category: "panels", icon: ListChecks, gate: { resource: "quotes", action: "view" }, defaultCols: 4, minCols: 4, resizable: true, chrome: FULL_CHROME },
  activityFeed: { id: "activityFeed", title: "Recent activity", description: "The latest changes across the system.", category: "panels", icon: Activity, gate: null, defaultCols: 6, minCols: 4, resizable: true, chrome: FULL_CHROME },
  topClients: { id: "topClients", title: "Top clients", description: "Highest-revenue clients for the selected range.", category: "panels", icon: Users, gate: FIN_VIEW, defaultCols: 6, minCols: 4, resizable: true, chrome: FULL_CHROME },
  inventoryHealth: { id: "inventoryHealth", title: "Inventory health", description: "Stock health and low-stock counts, as of today.", category: "panels", icon: Boxes, gate: { resource: "inventory", action: "view" }, defaultCols: 6, minCols: 4, resizable: true, chrome: FULL_CHROME },
  techUtilization: { id: "techUtilization", title: "Technician utilization", description: "This week's technician booking and utilization.", category: "panels", icon: Wrench, gate: { resource: "scheduling", action: "view" }, defaultCols: 6, minCols: 4, resizable: true, chrome: FULL_CHROME },

  // ── Actions ──────────────────────────────────────────────────────────────────
  quickActions: {
    id: "quickActions",
    title: "Quick actions",
    description: "One-click shortcuts to the create flows you can use.",
    category: "actions",
    icon: Zap,
    gate: null,
    // Visible when the caller can perform AT LEAST ONE of the create flows it
    // offers; a user who can create none never sees it (Step 5).
    anyOf: [
      { resource: "clients", action: "create" },
      { resource: "quotes", action: "create" },
      { resource: "inventory", action: "create" },
    ],
    defaultCols: 12,
    minCols: 6,
    resizable: true,
    chrome: TILE_CHROME,
  },
};

export const WIDGET_IDS = Object.keys(WIDGET_META) as WidgetId[];

/** The 10 split KPI tiles, in the order they replace the old combined block. */
export const KPI_TILE_IDS: WidgetId[] = [
  "kpiRevenue",
  "kpiCash",
  "kpiAr",
  "kpiAp",
  "kpiDeposits",
  "kpiActiveProjects",
  "kpiOpenQuotes",
  "kpiWip",
  "kpiHst",
  "kpiMargin",
];

/** The retired combined-KPI widget id. A stored layout that still references it is
 *  expanded to KPI_TILE_IDS in place (see validateLayout) so old layouts survive. */
export const LEGACY_KPI_OVERVIEW_ID = "kpiOverview";

export interface LayoutEntry {
  id: WidgetId;
  colSpan: number;
}
export interface DashboardLayout {
  widgets: LayoutEntry[];
}

/** The built-in default layout — REPRODUCES today's dashboard exactly: the ten KPI
 *  tiles (3-up at colSpan 4) then alerts, the trend chart, and the panels. A user
 *  who never customises sees no change from the pre-split arrangement. */
export const BUILT_IN_LAYOUT: DashboardLayout = {
  widgets: [
    ...KPI_TILE_IDS.map((id) => ({ id, colSpan: 4 })),
    { id: "alerts", colSpan: 12 },
    { id: "revenueTrend", colSpan: 8 },
    { id: "quotesByStatus", colSpan: 4 },
    { id: "activityFeed", colSpan: 6 },
    { id: "topClients", colSpan: 6 },
    { id: "inventoryHealth", colSpan: 6 },
    { id: "techUtilization", colSpan: 6 },
  ],
};

function isWidgetId(x: unknown): x is WidgetId {
  return typeof x === "string" && x in WIDGET_META;
}

/**
 * Coerce arbitrary stored/incoming JSON into a valid DashboardLayout:
 *  - MIGRATE a legacy `kpiOverview` entry into the ten KPI tiles IN PLACE (Step 3),
 *    preserving position — so a pre-split saved layout keeps working;
 *  - drop entries whose id is not a known widget (a layout from before a deploy
 *    that removed a widget degrades silently, never throws);
 *  - drop duplicate ids (keep first — the duplicate rule, 2e);
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

  function pushOnce(id: WidgetId, colSpan: number) {
    if (seen.has(id)) return;
    seen.add(id);
    const meta = WIDGET_META[id];
    const span = Number.isFinite(colSpan)
      ? Math.min(12, Math.max(meta.minCols, Math.round(colSpan)))
      : meta.defaultCols;
    widgets.push({ id, colSpan: span });
  }

  for (const e of arr) {
    const id = (e as { id?: unknown })?.id;
    // Legacy combined KPI block → the ten tiles, at this position.
    if (id === LEGACY_KPI_OVERVIEW_ID) {
      for (const tid of KPI_TILE_IDS) pushOnce(tid, WIDGET_META[tid].defaultCols);
      continue;
    }
    if (!isWidgetId(id)) continue;
    pushOnce(id, Number((e as { colSpan?: unknown }).colSpan));
  }
  return widgets.length > 0 ? { widgets } : null;
}

/** Can this role see a widget at all (the leakage guard for the layout + catalog)? */
export function canSeeWidget(id: WidgetId, role: Role): boolean {
  const meta = WIDGET_META[id];
  if (meta.anyOf) return meta.anyOf.some((g) => hasPermission(role, g.resource, g.action));
  return meta.gate === null || hasPermission(role, meta.gate.resource, meta.gate.action);
}

/** A widget any signed-in dashboard viewer may see (no gate, no anyOf) — the only
 *  widgets shown to a roleless/logged-out resolve. */
export function isPublicWidget(id: WidgetId): boolean {
  const meta = WIDGET_META[id];
  return meta.gate === null && !meta.anyOf;
}

/** Drop the widgets the role may not see; the remaining ordered list reflows with
 *  no hole (2e). A widget the user cannot see never reaches the client. */
export function filterLayoutForRole(layout: DashboardLayout, role: Role): DashboardLayout {
  return { widgets: layout.widgets.filter((w) => canSeeWidget(w.id, role)) };
}
