"use client";

// UIDG-8 — maps each widget id to its (client) React component. Kept separate from
// the metadata (lib/dashboard/widgets.ts) so the server resolver can validate a
// layout without importing these client components. Every component here is
// self-contained: it fetches its own data and renders its own gate/loading/empty
// state (the KPI overview reads the shared range context).

import type { ComponentType } from "react";
import type { WidgetId } from "@/lib/dashboard/widgets";
import { KpiOverviewWidget } from "./KpiOverviewWidget";
import { AlertsWidget } from "./AlertsWidget";
import { RevenueTrendChart } from "@/components/modules/dashboard/RevenueTrendChart";
import { QuotesByStatusPanel } from "@/components/modules/dashboard/QuotesByStatusPanel";
import { ActivityFeed } from "@/components/modules/dashboard/ActivityFeed";
import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { InventoryHealth } from "@/components/modules/dashboard/InventoryHealth";
import { TechnicianUtilization } from "@/components/modules/dashboard/TechnicianUtilization";

export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  kpiOverview: KpiOverviewWidget,
  alerts: AlertsWidget,
  revenueTrend: RevenueTrendChart,
  quotesByStatus: QuotesByStatusPanel,
  activityFeed: ActivityFeed,
  topClients: TopClientsTable,
  inventoryHealth: InventoryHealth,
  techUtilization: TechnicianUtilization,
};
