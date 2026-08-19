"use client";

// UIDG-8/10 — maps each widget id to its (client) React component. Kept separate
// from the metadata (lib/dashboard/widgets.ts) so the server resolver can validate
// a layout without importing these client components. The panels are self-contained
// (each fetches its own data + renders its own gate/loading/empty state); the ten
// KPI tiles read the shared snapshot from KpiDataProvider so the split costs no
// extra queries.

import type { ComponentType } from "react";
import type { WidgetId } from "@/lib/dashboard/widgets";
import {
  KpiRevenueTile,
  KpiCashTile,
  KpiArTile,
  KpiApTile,
  KpiDepositsTile,
  KpiActiveProjectsTile,
  KpiOpenQuotesTile,
  KpiWipTile,
  KpiHstTile,
  KpiMarginTile,
} from "./KpiTiles";
import { QuickActionsWidget } from "./QuickActionsWidget";
import { AlertsWidget } from "./AlertsWidget";
import { RevenueTrendChart } from "@/components/modules/dashboard/RevenueTrendChart";
import { QuotesByStatusPanel } from "@/components/modules/dashboard/QuotesByStatusPanel";
import { ActivityFeed } from "@/components/modules/dashboard/ActivityFeed";
import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { InventoryHealth } from "@/components/modules/dashboard/InventoryHealth";
import { TechnicianUtilization } from "@/components/modules/dashboard/TechnicianUtilization";

export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  // Metrics (split KPI tiles).
  kpiRevenue: KpiRevenueTile,
  kpiCash: KpiCashTile,
  kpiAr: KpiArTile,
  kpiAp: KpiApTile,
  kpiDeposits: KpiDepositsTile,
  kpiActiveProjects: KpiActiveProjectsTile,
  kpiOpenQuotes: KpiOpenQuotesTile,
  kpiWip: KpiWipTile,
  kpiHst: KpiHstTile,
  kpiMargin: KpiMarginTile,
  // Charts.
  revenueTrend: RevenueTrendChart,
  // Panels.
  alerts: AlertsWidget,
  quotesByStatus: QuotesByStatusPanel,
  activityFeed: ActivityFeed,
  topClients: TopClientsTable,
  inventoryHealth: InventoryHealth,
  techUtilization: TechnicianUtilization,
  // Actions.
  quickActions: QuickActionsWidget,
};
