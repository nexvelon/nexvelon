"use client";

// UIDG-5 — Line / multi-line. Themed axes+grid+tooltip+legend, all three states.
//
//   <LineChart summary="Revenue by month" data={rows} xKey="label"
//     series={[{ key: "revenue", name: "Revenue" }]}
//     valueFormatter={formatCurrency} />

import {
  LineChart as RLineChart,
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

export interface LineChartProps<T extends object = Record<string, unknown>>
  extends BaseChartProps {
  data: T[];
  xKey: string;
  series: Series[];
  valueFormatter?: NumberFormatter;
  tooltipFormatter?: NumberFormatter;
  xFormatter?: LabelFormatter;
  /** Smooth (monotone) vs straight segments. Default smooth. */
  curved?: boolean;
}

export function LineChart<T extends object = Record<string, unknown>>({
  data,
  xKey,
  series,
  valueFormatter = formatNumber,
  tooltipFormatter,
  xFormatter,
  curved = true,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: LineChartProps<T>) {
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
      <RLineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid {...gridProps(ct)} />
        <XAxis {...xAxisProps(ct)} dataKey={xKey} tickFormatter={xFormatter} />
        <YAxis {...yAxisProps(ct, { tickFormatter: valueFormatter })} />
        <Tooltip
          cursor={{ stroke: ct.gridStroke }}
          content={<ChartTooltipContent formatter={(v) => (tooltipFormatter ?? valueFormatter)(Number(v))} />}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, color: ct.legendFg }} />
        )}
        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i, ct.palette);
          return (
            <Line
              key={s.key}
              type={curved ? "monotone" : "linear"}
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          );
        })}
      </RLineChart>
    </ChartFrame>
  );
}
