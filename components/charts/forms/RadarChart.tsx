"use client";

// UIDG-5 — radar (spider) chart, e.g. a subcontractor scored across dimensions.
//
//   <RadarChart summary="Vendor scorecard" data={rows} angleKey="metric"
//     series={[{ key: "score", name: "Score" }]} />

import {
  RadarChart as RRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
} from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { seriesColor, withAlpha } from "@/lib/charts/theme";
import type { BaseChartProps, Series, NumberFormatter } from "../types";

export interface RadarChartProps<T extends object = Record<string, unknown>>
  extends BaseChartProps {
  data: T[];
  angleKey: string;
  series: Series[];
  valueFormatter?: NumberFormatter;
}

export function RadarChart<T extends object = Record<string, unknown>>({
  data,
  angleKey,
  series,
  valueFormatter = formatNumber,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: RadarChartProps<T>) {
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
      <RRadarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke={ct.gridStroke} />
        <PolarAngleAxis dataKey={angleKey} tick={{ fill: ct.axisTick, fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: ct.axisTick, fontSize: 10 }} stroke={ct.gridStroke} />
        <Tooltip content={<ChartTooltipContent formatter={(v) => valueFormatter(Number(v))} />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: ct.legendFg }} />}
        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i, ct.palette);
          return (
            <Radar
              key={s.key}
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={color}
              fill={withAlpha(color, 0.25)}
              fillOpacity={1}
            />
          );
        })}
      </RRadarChart>
    </ChartFrame>
  );
}
