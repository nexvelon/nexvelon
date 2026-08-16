"use client";

// UIDG-5 — donut with a centre total. Colours come from the palette via
// seriesColor, so 6+ slices never collide.
//
//   <DonutChart summary="Stock value by category" valueFormatter={formatCurrency}
//     data={[{ name: "Cable", value: 4200 }, …]} centerCaption="total" />

import { PieChart, Pie, Cell, Tooltip, Label } from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartFrame } from "../ChartFrame";
import { ChartTooltipContent } from "../ChartTooltip";
import { useChartTheme } from "../useChartTheme";
import { seriesColor } from "@/lib/charts/theme";
import type { BaseChartProps, NumberFormatter } from "../types";

export interface DonutDatum {
  name: string;
  value: number;
}

export interface DonutChartProps extends BaseChartProps {
  data: DonutDatum[];
  valueFormatter?: NumberFormatter;
  /** Caption under the centre total (e.g. "total"). */
  centerCaption?: string;
}

export function DonutChart({
  data,
  valueFormatter = formatNumber,
  centerCaption,
  summary,
  height,
  loading,
  error,
  emptyMessage,
  className,
}: DonutChartProps) {
  const ct = useChartTheme();
  const rows = data ?? [];
  const total = rows.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <ChartFrame
      summary={summary}
      height={height}
      loading={loading}
      error={error}
      empty={rows.length === 0 || total === 0}
      emptyMessage={emptyMessage}
      className={className}
    >
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke={ct.tooltipBg}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={seriesColor(i, ct.palette)} />
          ))}
          <Label
            position="center"
            content={(props) => (
              <CenterLabel
                viewBox={props.viewBox as { cx: number; cy: number }}
                total={valueFormatter(total)}
                caption={centerCaption}
                fg={ct.tooltipFg}
                muted={ct.legendFg}
              />
            )}
          />
        </Pie>
        <Tooltip
          content={<ChartTooltipContent hideLabel formatter={(v) => valueFormatter(Number(v))} />}
        />
      </PieChart>
    </ChartFrame>
  );
}

function CenterLabel({
  viewBox,
  total,
  caption,
  fg,
  muted,
}: {
  viewBox?: { cx: number; cy: number };
  total: string;
  caption?: string;
  fg: string;
  muted: string;
}) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <g>
      <text x={cx} y={caption ? cy - 4 : cy} textAnchor="middle" dominantBaseline="central" fill={fg} fontSize={18} fontWeight={600}>
        {total}
      </text>
      {caption && (
        <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central" fill={muted} fontSize={11}>
          {caption}
        </text>
      )}
    </g>
  );
}
