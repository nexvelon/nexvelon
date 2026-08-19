// UIDG-10 — dashboard TEMPLATES: a handful of ready-made layouts a user can start
// from. A template is exactly a named, ordered widget list (the same shape as a
// saved layout) — nothing richer — so applying one reuses the UIDG-8 layout model
// and the same filter-and-reflow path. Each template is built from REAL widgets
// only and is aimed at a role that actually exists in this ERP (no invented
// personas). Applying replaces the current layout; a template's widgets the caller
// cannot see reflow away via filterLayoutForRole (Step 6).

import type { DashboardLayout, WidgetId } from "./widgets";

export interface DashboardTemplate {
  id: string;
  name: string;
  /** Who this is for — an existing role, stated plainly. */
  audience: string;
  description: string;
  layout: DashboardLayout;
}

const entry = (id: WidgetId, colSpan: number) => ({ id, colSpan });

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "executive",
    name: "Executive overview",
    audience: "Owners & admins",
    description: "The full picture: every metric, alerts, the trend chart and all panels.",
    layout: {
      widgets: [
        entry("kpiRevenue", 4), entry("kpiCash", 4), entry("kpiAr", 4),
        entry("kpiAp", 4), entry("kpiDeposits", 4), entry("kpiActiveProjects", 4),
        entry("kpiOpenQuotes", 4), entry("kpiWip", 4), entry("kpiHst", 4), entry("kpiMargin", 4),
        entry("alerts", 12),
        entry("revenueTrend", 8), entry("quotesByStatus", 4),
        entry("activityFeed", 6), entry("topClients", 6),
        entry("inventoryHealth", 6), entry("techUtilization", 6),
      ],
    },
  },
  {
    id: "sales",
    name: "Sales",
    audience: "Sales reps",
    description: "Pipeline first: open quotes and revenue, the quote funnel, top clients and quick actions.",
    layout: {
      widgets: [
        entry("quickActions", 12),
        entry("kpiOpenQuotes", 4), entry("kpiRevenue", 4), entry("kpiCash", 4),
        entry("quotesByStatus", 4), entry("topClients", 8),
        entry("activityFeed", 12),
      ],
    },
  },
  {
    id: "operations",
    name: "Operations",
    audience: "Project managers & dispatchers",
    description: "Delivery focus: active projects, alerts, technician utilization, the quote funnel and inventory.",
    layout: {
      widgets: [
        entry("kpiActiveProjects", 4), entry("kpiOpenQuotes", 4), entry("quotesByStatus", 4),
        entry("alerts", 12),
        entry("techUtilization", 6), entry("inventoryHealth", 6),
        entry("activityFeed", 12),
      ],
    },
  },
  {
    id: "finance",
    name: "Finance",
    audience: "Accountants",
    description: "The money view: every financial metric, the revenue trend and top clients.",
    layout: {
      widgets: [
        entry("kpiRevenue", 4), entry("kpiCash", 4), entry("kpiAr", 4),
        entry("kpiAp", 4), entry("kpiDeposits", 4), entry("kpiHst", 4),
        entry("kpiWip", 4), entry("kpiMargin", 4),
        entry("revenueTrend", 8), entry("topClients", 4),
      ],
    },
  },
];

export function getTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}
