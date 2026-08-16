"use client";

// UIDG-5 — Bar: grouped or stacked, vertical or horizontal.
//
//   <BarChart summary="Units by category" data={rows} xKey="category"
//     series={[{ key: "units", name: "Units" }]} />
//   <BarChart … series={[{key:"a"},{key:"b"}]} stacked horizontal />

import {
  BarChart as RBarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { gridProps, xAxisProps, yAxisProps, seriesColor } from "@/lib/charts/theme";
import type { BaseChartProps, Series, NumberFormatter, LabelFormatter } from "../types";

export interface BarChartProps<T extends object = Record<string, unknown>>
  extends BaseChartProps {
  data: T[];
  xKey: string;
  series: Series[];
  valueFormatter?: NumberFormatter;
  /** Tooltip value formatter — defaults to valueFormatter. */
  tooltipFormatter?: NumberFormatter;
  categoryFormatter?: LabelFormatter;
  stacked?: boolean;
  /** Bars run horizontally (category on the Y axis). */
  horizontal?: boolean;
  /** For a single series, colour each bar by its category from the palette. */
  colorByPoint?: boolean;
}

export function BarChart<T extends object = Record<string, unknown>>({
  data,
  xKey,
  series,
  valueFormatter = formatNumber,
  tooltipFormatter,
  categoryFormatter,
  stacked = false,
  horizontal = false,
  colorByPoint = false,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: BarChartProps<T>) {
  const ct = useChartTheme();
  const empty = !data || data.length === 0;
  const catAxis = { ...xAxisProps(ct), dataKey: xKey, tickFormatter: categoryFormatter };
  const numAxis = yAxisProps(ct, { tickFormatter: valueFormatter });

  return (
    <ChartFrame
      summary={summary}
      height={height}
      loading={loading}
      error={error}
      empty={empty}
      emptyMessage={emptyMessage}
      className={className}
    >
      <RBarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
      >
        <CartesianGrid {...gridProps(ct)} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...numAxis} />
            <YAxis type="category" {...catAxis} width={96} />
          </>
        ) : (
          <>
            <XAxis {...catAxis} />
            <YAxis type="number" {...numAxis} />
          </>
        )}
        <Tooltip
          cursor={{ fill: ct.cursorFill }}
          content={<ChartTooltipContent formatter={(v) => (tooltipFormatter ?? valueFormatter)(Number(v))} />}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: ct.legendFg }} />}
        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i, ct.palette);
          const radius: [number, number, number, number] = horizontal
            ? [0, 4, 4, 0]
            : [4, 4, 0, 0];
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name ?? s.key}
              fill={color}
              radius={stacked ? undefined : radius}
              stackId={stacked ? "stack" : undefined}
              maxBarSize={48}
            >
              {colorByPoint && series.length === 1
                ? data.map((_, idx) => (
                    <Cell key={idx} fill={seriesColor(idx, ct.palette)} />
                  ))
                : null}
            </Bar>
          );
        })}
      </RBarChart>
    </ChartFrame>
  );
}
