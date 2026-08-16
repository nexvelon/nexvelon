"use client";

// UIDG-8 — the selected date range, shared from DashboardClient to the one widget
// that needs it (the KPI overview) without threading it through the generic grid.

import { createContext, useContext } from "react";
import type { RangeKey } from "@/lib/date-range";

const DashboardRangeContext = createContext<RangeKey>("mtd");

export const DashboardRangeProvider = DashboardRangeContext.Provider;

export function useDashboardRange(): RangeKey {
  return useContext(DashboardRangeContext);
}
