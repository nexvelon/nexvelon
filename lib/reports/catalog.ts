// REP-5 — the catalog of SAVEABLE reports (2a). Client-safe metadata only.
//
// A saved report is a REFERENCE to one of these existing reports plus saved
// parameter values — not a general query definition. Each entry states the report
// key the existing actions already use, its hub page, the permission it needs
// (the same gate its page/action enforces), which parameters it accepts, and
// whether its rows are per-operating-company (§2.6) so a saved copy may be scoped
// to one opco.
//
// The duplicate-quote-numbers UTILITY is deliberately absent: it is a
// reconciliation page with no dataset, not a report.

import type { Action, Resource } from "@/lib/permissions";

export type SavedReportKey =
  | "wip"
  | "opco-pnl"
  | "margin"
  | "profitability"
  | "ar-aging"
  | "ap-aging"
  | "hst"
  | "t5018"
  | "pipeline"
  | "labour-utilization"
  | "vendor-spend"
  | "inventory-valuation"
  | "business-snapshot";

/** What a report's parameters look like. */
export type ParamShape = "none" | "range" | "year";

export interface CatalogEntry {
  key: SavedReportKey;
  title: string;
  href: string;
  /** The report's own gate (on top of reports:view). */
  gate: { resource: Resource; action: Action };
  params: ParamShape;
  /** vendor-spend takes a top-N limit too. */
  limit?: boolean;
  /** Rows are per operating company → a saved copy may be limited to one. */
  opcoScoped?: boolean;
  /** Point-in-time (balances "as of" the run) rather than a period. */
  pointInTime?: boolean;
}

export const REPORT_CATALOG: Record<SavedReportKey, CatalogEntry> = {
  wip: { key: "wip", title: "Work-in-progress (WIP)", href: "/reports/wip", gate: { resource: "financials", action: "edit" }, params: "none", pointInTime: true },
  "opco-pnl": { key: "opco-pnl", title: "P&L by company", href: "/reports/pnl-by-company", gate: { resource: "financials", action: "edit" }, params: "none", opcoScoped: true, pointInTime: true },
  margin: { key: "margin", title: "Margin analysis", href: "/reports/margin", gate: { resource: "financials", action: "edit" }, params: "none", opcoScoped: true, pointInTime: true },
  profitability: { key: "profitability", title: "Profitability ranking", href: "/reports/profitability", gate: { resource: "financials", action: "edit" }, params: "none", opcoScoped: true, pointInTime: true },
  "ar-aging": { key: "ar-aging", title: "AR aging", href: "/reports/ar-aging", gate: { resource: "financials", action: "view" }, params: "none", pointInTime: true },
  "ap-aging": { key: "ap-aging", title: "AP aging", href: "/reports/ap-aging", gate: { resource: "financials", action: "view" }, params: "none", pointInTime: true },
  hst: { key: "hst", title: "HST net position", href: "/reports/hst", gate: { resource: "financials", action: "edit" }, params: "range", opcoScoped: true },
  t5018: { key: "t5018", title: "T5018 contractor payments", href: "/reports/t5018", gate: { resource: "financials", action: "edit" }, params: "year" },
  pipeline: { key: "pipeline", title: "Sales pipeline", href: "/reports/pipeline", gate: { resource: "quotes", action: "view" }, params: "range" },
  "labour-utilization": { key: "labour-utilization", title: "Technician utilization", href: "/reports/utilization", gate: { resource: "scheduling", action: "view" }, params: "range" },
  "vendor-spend": { key: "vendor-spend", title: "Vendor spend", href: "/reports/vendor-spend", gate: { resource: "financials", action: "view" }, params: "range", limit: true },
  "inventory-valuation": { key: "inventory-valuation", title: "Inventory valuation", href: "/reports/inventory-valuation", gate: { resource: "inventory", action: "view" }, params: "none", pointInTime: true },
  "business-snapshot": { key: "business-snapshot", title: "Business snapshot", href: "/reports/business-snapshot", gate: { resource: "financials", action: "edit" }, params: "none", pointInTime: true },
};

export const SAVED_REPORT_KEYS = Object.keys(REPORT_CATALOG) as SavedReportKey[];

export function isSavedReportKey(k: string): k is SavedReportKey {
  return k in REPORT_CATALOG;
}

export const OPCO_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "integrated_solutions", label: "Integrated Solutions" },
  { value: "guardian", label: "Guardian" },
];
