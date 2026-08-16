"use client";

// UIDG-6 — a value on a semicircular scale. Built on the UIDG-5 chart layer via
// the escape hatch (raw RadialBarChart inside ChartFrame + useChartTheme), so it
// is themed in both modes. Value + caption sit under the arc.
//
//   <KpiHalfDonut label="Capacity" value={72} max={100} format={(v)=>`${v}%`} />

import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { KpiShell } from "../KpiShell";
import { ChartFrame, useChartTheme } from "@/components/charts";
import type { KpiCommon } from "../types";

export interface KpiHalfDonutProps extends KpiCommon {
  value: number;
  max: number;
  format: (n: number) => string;
  caption?: string;
  color?: string;
}

export function KpiHalfDonut({
  value,
  max,
  format,
  caption,
  color,
  ...common
}: KpiHalfDonutProps) {
  const ct = useChartTheme();
  const empty = common.empty ?? !(max > 0);
  const pct = empty ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const ready = !common.loading && !common.error && !common.restricted && !empty;

  return (
    <KpiShell {...common} empty={empty} ariaLabel={`${common.label}: ${format(value)}`}>
      <div className="relative">
        <ChartFrame summary={`${common.label}: ${format(value)}`} height={110}>
          <RadialBarChart
            data={[{ value: pct }]}
            innerRadius="72%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            cy="75%"
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={999}
              fill={color ?? ct.primary}
              background={{ fill: ct.trackFill }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ChartFrame>
        {ready && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center" aria-hidden>
            <span className="text-brand-navy font-serif text-xl font-semibold tabular-nums">
              {format(value)}
            </span>
            {caption && <span className="text-muted-foreground text-[11px]">{caption}</span>}
          </div>
        )}
      </div>
    </KpiShell>
  );
}
