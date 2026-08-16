"use client";

// UIDG-5 — a single value against a max, as a progress ring with the value in the
// centre. Good for utilisation, completion, capacity.
//
//   <RadialGauge summary="Tech utilisation" value={72} max={100} caption="utilised" />

import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { ChartFrame } from "../ChartFrame";
import { useChartTheme } from "../useChartTheme";
import type { BaseChartProps } from "../types";

export interface RadialGaugeProps extends BaseChartProps {
  value: number;
  max: number;
  color?: string;
  /** Text under the centre value (e.g. "utilised"). */
  caption?: string;
  /** Format the centre value. Default `${round(value/max*100)}%`. */
  valueFormatter?: (value: number, max: number) => string;
}

export function RadialGauge({
  value,
  max,
  color,
  caption,
  valueFormatter,
  summary,
  height = 180,
  loading,
  error,
  emptyMessage,
  className,
}: RadialGaugeProps) {
  const ct = useChartTheme();
  const empty = !(max > 0);
  const pct = empty ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const fill = color ?? ct.primary;
  const centre = valueFormatter
    ? valueFormatter(value, max)
    : `${Math.round(pct)}%`;
  const ready = !loading && !error && !empty;

  return (
    <div className={`relative ${className ?? ""}`}>
      <ChartFrame
        summary={summary}
        height={height}
        loading={loading}
        error={error}
        empty={empty}
        emptyMessage={emptyMessage}
      >
        <RadialBarChart
          data={[{ name: summary, value: pct }]}
          innerRadius="70%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            fill={fill}
            background={{ fill: ct.trackFill }}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartFrame>
      {ready && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden
        >
          <span className="text-brand-navy font-serif text-xl font-semibold tabular-nums">
            {centre}
          </span>
          {caption && (
            <span className="text-muted-foreground text-[11px]">{caption}</span>
          )}
        </div>
      )}
    </div>
  );
}
