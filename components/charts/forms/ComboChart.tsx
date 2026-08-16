"use client";

// UIDG-5 — combo bar + line (e.g. revenue bars + cash-collected line). The
// existing dashboard revenue chart's form, now themed by the wrapper.
//
//   <ComboChart summary="Revenue & cash" data={rows} xKey="label"
//     bars={[{ key: "invoiced", name: "Revenue" }]}
//     lines={[{ key: "collected", name: "Cash" }]}
//     valueFormatter={formatCurrency} />

import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { gridProps, xAxisProps, yAxisProps, seriesColor } from "@/lib/charts/theme";
import type { BaseChartProps, Series, NumberFormatter, LabelFormatter } from "../types";

export interface ComboChartProps<T extends object = Record<string, unknown>>
  extends BaseChartProps {
  data: T[];
  xKey: string;
  bars: Series[];
  lines: Series[];
  valueFormatter?: NumberFormatter;
  /** Tooltip value formatter — defaults to valueFormatter (use for a precise
   *  tooltip alongside a compact axis). */
  tooltipFormatter?: NumberFormatter;
  xFormatter?: LabelFormatter;
  stackedBars?: boolean;
}

export function ComboChart<T extends object = Record<string, unknown>>({
  data,
  xKey,
  bars,
  lines,
  valueFormatter = formatNumber,
  tooltipFormatter,
  xFormatter,
  stackedBars = false,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: ComboChartProps<T>) {
  const ct = useChartTheme();
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
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid {...gridProps(ct)} />
        <XAxis {...xAxisProps(ct)} dataKey={xKey} tickFormatter={xFormatter} />
        <YAxis {...yAxisProps(ct, { tickFormatter: valueFormatter })} />
        <Tooltip
          cursor={{ fill: ct.cursorFill }}
          content={<ChartTooltipContent formatter={(v) => (tooltipFormatter ?? valueFormatter)(Number(v))} />}
        />
        {bars.length + lines.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, color: ct.legendFg }} />
        )}
        {bars.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name ?? s.key}
            fill={s.color ?? seriesColor(i, ct.palette)}
            radius={stackedBars ? undefined : [4, 4, 0, 0]}
            stackId={stackedBars ? "bars" : undefined}
            maxBarSize={28}
          />
        ))}
        {lines.map((s, i) => {
          const color = s.color ?? seriesColor(bars.length + i, ct.palette);
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          );
        })}
      </ComposedChart>
    </ChartFrame>
  );
}
