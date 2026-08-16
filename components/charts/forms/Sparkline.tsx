"use client";

// UIDG-5 — a tiny, axis-less, grid-less trend for embedding in a KPI card. No
// tooltip by default; just the shape of the series.
//
//   <Sparkline summary="7-day revenue trend" values={[3, 5, 4, 8, 7, 9, 11]} />

import { AreaChart, Area } from "recharts";
import { ChartFrame } from "../ChartFrame";
import { useChartTheme } from "../useChartTheme";
import { useId } from "react";
import type { BaseChartProps } from "../types";

export interface SparklineProps extends Omit<BaseChartProps, "emptyMessage"> {
  /** The series, oldest→newest. */
  values: number[];
  color?: string;
  /** Fill under the line with a soft gradient (default true). */
  fill?: boolean;
}

export function Sparkline({
  values,
  color,
  fill = true,
  summary,
  height = 40,
  loading,
  error,
  className,
}: SparklineProps) {
  const ct = useChartTheme();
  const gid = useId().replace(/:/g, "");
  const stroke = color ?? ct.accent;
  const data = (values ?? []).map((v, i) => ({ i, v }));

  return (
    <ChartFrame
      summary={summary}
      height={height}
      loading={loading}
      error={error}
      empty={data.length < 2}
      emptyMessage="—"
      className={className}
    >
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {fill && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.75}
          fill={fill ? `url(#${gid})` : "none"}
          fillOpacity={1}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartFrame>
  );
}
