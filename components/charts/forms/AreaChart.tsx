"use client";

// UIDG-5 — Area / gradient-fill area / stacked area (one component, props switch).
//
//   <AreaChart summary="Cash on hand" data={rows} xKey="label"
//     series={[{ key: "cash", name: "Cash" }]} gradient valueFormatter={formatCurrency} />
//   <AreaChart … series={[{key:"a"},{key:"b"}]} stacked />   // stacked area

import {
  AreaChart as RAreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useId } from "react";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { gridProps, xAxisProps, yAxisProps, seriesColor } from "@/lib/charts/theme";
import type { BaseChartProps, Series, NumberFormatter, LabelFormatter } from "../types";

export interface AreaChartProps<T extends object = Record<string, unknown>>
  extends BaseChartProps {
  data: T[];
  xKey: string;
  series: Series[];
  valueFormatter?: NumberFormatter;
  xFormatter?: LabelFormatter;
  /** Fill each area with a vertical gradient of its colour. */
  gradient?: boolean;
  /** Stack the series (share a stackId). */
  stacked?: boolean;
}

export function AreaChart<T extends object = Record<string, unknown>>({
  data,
  xKey,
  series,
  valueFormatter = formatNumber,
  xFormatter,
  gradient = false,
  stacked = false,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: AreaChartProps<T>) {
  const ct = useChartTheme();
  const gid = useId().replace(/:/g, "");
  return (
    <ChartFrame
      summary={summary}
      height={height}
      loading={loading}
      error={error}
      empty={!data || data.length === 0}
      emptyMessage={emptyMessage}
      className={className}
    >
      <RAreaChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        {gradient && (
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? seriesColor(i, ct.palette);
              return (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
        )}
        <CartesianGrid {...gridProps(ct)} />
        <XAxis {...xAxisProps(ct)} dataKey={xKey} tickFormatter={xFormatter} />
        <YAxis {...yAxisProps(ct, { tickFormatter: valueFormatter })} />
        <Tooltip
          cursor={{ stroke: ct.gridStroke }}
          content={<ChartTooltipContent formatter={(v) => valueFormatter(Number(v))} />}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: ct.legendFg }} />}
        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i, ct.palette);
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={color}
              strokeWidth={2}
              fill={gradient ? `url(#${gid}-${s.key})` : color}
              fillOpacity={gradient ? 1 : 0.15}
              stackId={stacked ? "stack" : undefined}
            />
          );
        })}
      </RAreaChart>
    </ChartFrame>
  );
}
