"use client";

// UIDG-10 — the shared KPI data source. The KPI overview used to be ONE widget so
// its ten tiles could share a single fetch. Now each tile is an independently
// placeable widget — but they must NOT each fire their own query. This provider
// fires the SAME two actions the old block fired (getDashboardKpis + the trend
// series) exactly ONCE, keyed on the resolved window, and every tile reads its
// slice from context. Placing one tile or ten costs the same two round-trips; a
// layout with zero KPI tiles (active=false) fires nothing. Query count is
// therefore independent of how many tiles are on the dashboard — it never
// increased from the pre-split dashboard.

import { createContext, useContext, useEffect, useState } from "react";
import {
  getDashboardKpisAction,
  getRevenueTrendAction,
  getBalanceDeltasAction,
  type BalanceDeltasPayload,
} from "@/app/(app)/dashboard/actions";
import type { DashboardKpis } from "@/lib/api/dashboard";
import type { MonthlyRevenuePoint } from "@/lib/api/financials";
import { useDashboardRange } from "./range-context";

export interface KpiData {
  kpi: DashboardKpis | null;
  trend: MonthlyRevenuePoint[] | null;
  /** SNAP-1 — snapshot-driven deltas + trend series for the balance tiles. */
  balances: BalanceDeltasPayload | null;
  loading: boolean;
  error: string | null;
}

const KpiDataContext = createContext<KpiData | null>(null);

/** Read the shared KPI snapshot. Returns a null-filled, non-loading value when
 *  used outside a provider (e.g. an isolated tile in a test that mounts its own). */
export function useKpiData(): KpiData {
  return useContext(KpiDataContext) ?? { kpi: null, trend: null, balances: null, loading: false, error: null };
}

export function KpiDataProvider({
  active,
  children,
}: {
  /** Whether any KPI tile is actually on the dashboard — false skips the fetch. */
  active: boolean;
  children: React.ReactNode;
}) {
  const win = useDashboardRange();
  const [kpi, setKpi] = useState<DashboardKpis | null>(null);
  const [trend, setTrend] = useState<MonthlyRevenuePoint[] | null>(null);
  const [balances, setBalances] = useState<BalanceDeltasPayload | null>(null);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !win.valid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getDashboardKpisAction({
        from: win.from,
        to: win.to,
        compareFrom: win.compareFrom,
        compareTo: win.compareTo,
      }),
      getRevenueTrendAction(),
      // SNAP-1 — balance deltas anchored at the comparison window's end. Shared by
      // all balance tiles, so one round-trip regardless of how many are placed.
      getBalanceDeltasAction({ compareTo: win.compareTo, basis: win.comparisonBasis }),
    ]).then(([k, t, b]) => {
      if (cancelled) return;
      if (k.ok) setKpi(k.data);
      else setError(k.error);
      // The trend feeds the Revenue/Cash sparklines; its own gate failure just
      // means no sparkline (the tile still shows the value or its restricted state).
      setTrend(t.ok ? t.data : null);
      setBalances(b.ok ? b.data : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, win.valid, win.from, win.to, win.compareFrom, win.compareTo, win.comparisonBasis]);

  return (
    <KpiDataContext.Provider value={{ kpi, trend, balances, loading, error }}>
      {children}
    </KpiDataContext.Provider>
  );
}
