"use client";

// UIDG-6 — a percentage/ratio as the hero: a large progress ring with the value
// in its centre. For a metric that IS a bounded percentage (margin, completion,
// utilisation). A value below 0 clamps the arc to empty but the centre still
// shows the true figure — never a fabricated positive.
//
//   <KpiProgress label="Blended margin" value={marginPct} caption="gross margin" />

import { KpiShell } from "../KpiShell";
import { RadialGauge } from "@/components/charts";
import type { KpiCommon } from "../types";

export interface KpiProgressProps extends KpiCommon {
  /** The percentage value (e.g. 34.2 for 34.2%). */
  value: number;
  /** Max of the scale (default 100). */
  max?: number;
  caption?: string;
  /** Centre formatter — defaults to `${value.toFixed(1)}%`. */
  format?: (n: number) => string;
}

export function KpiProgress({
  value,
  max = 100,
  caption,
  format,
  ...common
}: KpiProgressProps) {
  return (
    <KpiShell {...common} ariaLabel={`${common.label}: ${(format ?? ((v: number) => `${v.toFixed(1)}%`))(value)}`}>
      <div className="mt-1">
        <RadialGauge
          summary={`${common.label}: ${(format ?? ((v: number) => `${v.toFixed(1)}%`))(value)}`}
          value={value}
          max={max}
          height={150}
          caption={caption}
          valueFormatter={(v) => (format ? format(v) : `${v.toFixed(1)}%`)}
        />
      </div>
    </KpiShell>
  );
}
