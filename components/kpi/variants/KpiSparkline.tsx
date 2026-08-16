"use client";

// UIDG-6 — metric with an inline trend sparkline (no axes). The series must be
// REAL history; an empty/one-point series shows the empty state, never a flat line
// drawn from nothing (§2.8).
//
//   <KpiSparkline label="Revenue" value={fin.revenue} format={formatCurrency}
//     series={monthlyInvoiced} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { DeltaPill } from "../DeltaPill";
import { ComparisonDelta } from "../ComparisonDelta";
import { Sparkline } from "@/components/charts";
import type { KpiCommon, DeltaSpec, KpiComparison } from "../types";

export interface KpiSparklineProps extends KpiCommon, Partial<DeltaSpec> {
  value: number;
  format: (n: number) => string;
  series: number[];
  color?: string;
  /** UIDG-6B — a period-over-period comparison; the card computes the delta and
   *  handles the prior-zero / no-prior edge cases itself. */
  comparison?: KpiComparison;
}

export function KpiSparkline({
  value,
  format,
  series,
  color,
  delta,
  deltaFormat,
  polarity,
  comparison,
  ...common
}: KpiSparklineProps) {
  // The VALUE stands on its own — a missing trend never blanks the card (that
  // would hide a real number). Only when the caller declares the metric itself
  // empty does the card go empty. The sparkline draws only with real history
  // (≥2 points); until then the tile is just the value (§2.8 — no flat line from
  // no data).
  const hasHistory = (series?.length ?? 0) >= 2;
  return (
    <KpiShell {...common}>
      <KpiValue value={value} format={format} />
      {comparison ? (
        <ComparisonDelta
          current={value}
          prior={comparison.prior}
          basis={comparison.basis}
          polarity={comparison.polarity ?? polarity}
        />
      ) : (
        delta !== undefined && (
          <DeltaPill delta={delta} deltaFormat={deltaFormat} polarity={polarity} />
        )
      )}
      {hasHistory && (
        <div className="mt-auto pt-2">
          <Sparkline summary={`${common.label} trend`} values={series} height={36} color={color} />
        </div>
      )}
    </KpiShell>
  );
}
