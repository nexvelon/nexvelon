"use client";

// UIDG-5 — actual vs target in a single bar: the actual fills a coloured segment,
// a ghost "remainder" track shows the distance left to target. Horizontal, one
// row per category.
//
//   <TargetBar summary="Billed vs contract" valueFormatter={formatCurrency}
//     data={[{ label: "Main St", actual: 60000, target: 100000 }]} />

import {
  BarChart as RBarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { gridProps, xAxisProps, yAxisProps } from "@/lib/charts/theme";
import type { BaseChartProps, NumberFormatter } from "../types";

export interface TargetBarDatum {
  label: string;
  actual: number;
  target: number;
}

export interface TargetBarProps extends BaseChartProps {
  data: TargetBarDatum[];
  valueFormatter?: NumberFormatter;
  /** Colour of the actual segment (default theme primary). */
  color?: string;
}

export function TargetBar({
  data,
  valueFormatter = formatNumber,
  color,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: TargetBarProps) {
  const ct = useChartTheme();
  const rows = (data ?? []).map((d) => ({
    ...d,
    remainder: Math.max(0, d.target - d.actual),
  }));
  const fill = color ?? ct.primary;

  return (
    <ChartFrame
      summary={summary}
      height={height}
      loading={loading}
      error={error}
      empty={rows.length === 0}
      emptyMessage={emptyMessage}
      className={className}
    >
      <RBarChart
        data={rows}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
      >
        <CartesianGrid {...gridProps(ct)} vertical horizontal={false} />
        <XAxis type="number" {...yAxisProps(ct, { tickFormatter: valueFormatter, width: undefined })} />
        <YAxis type="category" {...xAxisProps(ct)} dataKey="label" width={96} />
        <Tooltip
          cursor={{ fill: ct.cursorFill }}
          content={
            <ChartTooltipContent
              formatter={(v, name) =>
                name === "Remaining" ? "" : valueFormatter(Number(v))
              }
            />
          }
        />
        <Bar dataKey="actual" name="Actual" stackId="t" fill={fill} radius={[4, 0, 0, 4]} maxBarSize={26} />
        <Bar
          dataKey="remainder"
          name="Remaining"
          stackId="t"
          fill={ct.trackFill}
          radius={[0, 4, 4, 0]}
          maxBarSize={26}
        />
      </RBarChart>
    </ChartFrame>
  );
}
