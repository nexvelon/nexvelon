"use client";

// SNAP-1 — the shared "history" footer for a balance KPI: a period-over-period
// delta (from balance snapshots, via UIDG-6B's ComparisonDelta) when a prior value
// exists, an honest "Building history" note while there isn't enough yet (§2.8 — a
// 2-point line is never dressed up as a trend), and a sparkline once history passes
// the minimum.

import { ComparisonDelta } from "./ComparisonDelta";
import { Sparkline } from "@/components/charts/forms/Sparkline";
import type { KpiComparison } from "./types";

/** A trend needs at least a week of points before it's shown as a line (2e). */
export const MIN_TREND_POINTS = 7;

export function KpiHistoryFooter({
  current,
  comparison,
  buildingHistory,
  series,
  label,
}: {
  current: number;
  comparison?: KpiComparison;
  /** true → history is too short for a delta; show the honest note. */
  buildingHistory?: boolean;
  /** Ascending snapshot amounts; a sparkline draws only at ≥ MIN_TREND_POINTS. */
  series?: number[];
  label: string;
}) {
  const hasDelta = !!comparison && comparison.prior != null;
  const hasTrend = (series?.length ?? 0) >= MIN_TREND_POINTS;

  return (
    <>
      {hasDelta ? (
        <ComparisonDelta
          current={current}
          prior={comparison!.prior}
          basis={comparison!.basis}
          polarity={comparison!.polarity}
        />
      ) : buildingHistory ? (
        <p className="text-muted-foreground text-[11px]" title="Balance history builds from the day snapshots began; a delta appears once there's a prior period to compare.">
          Building history…
        </p>
      ) : null}
      {hasTrend && (
        <div className="mt-auto pt-2">
          <Sparkline summary={`${label} trend`} values={series!} height={32} />
        </div>
      )}
    </>
  );
}
