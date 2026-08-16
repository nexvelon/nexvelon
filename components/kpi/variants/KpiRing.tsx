"use client";

// UIDG-6 — value against a MAX: the raw value is the headline, a compact ring
// beside it shows the fill %. Only meaningful when `max` is a real ceiling — a
// ring on a metric with no maximum is decoration, so this variant simply is not
// chosen for those.
//
//   <KpiRing label="Techs booked" value={42} max={60} format={formatNumber} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { RadialGauge } from "@/components/charts";
import type { KpiCommon } from "../types";

export interface KpiRingProps extends KpiCommon {
  value: number;
  max: number;
  format: (n: number) => string;
}

export function KpiRing({ value, max, format, ...common }: KpiRingProps) {
  const empty = common.empty ?? !(max > 0);
  return (
    <KpiShell {...common} empty={empty}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <KpiValue value={value} format={format} />
          <p className="text-muted-foreground text-xs">of {format(max)}</p>
        </div>
        <div className="w-20 shrink-0">
          <RadialGauge summary={`${common.label}: ${format(value)} of ${format(max)}`} value={value} max={max} height={80} />
        </div>
      </div>
    </KpiShell>
  );
}
