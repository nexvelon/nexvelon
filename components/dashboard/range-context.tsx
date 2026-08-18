"use client";

// UIDG-9 — the RESOLVED dashboard window, shared from DashboardClient to the
// widgets that follow the global range (KPI overview, Top clients) so they read
// an identical window (and the same custom dates) without prop-threading.

import { createContext, useContext } from "react";
import { resolveWindow, type ResolvedWindow } from "@/lib/dashboard/range";

const DashboardRangeContext = createContext<ResolvedWindow>(resolveWindow("mtd"));

export const DashboardRangeProvider = DashboardRangeContext.Provider;

export function useDashboardRange(): ResolvedWindow {
  return useContext(DashboardRangeContext);
}
