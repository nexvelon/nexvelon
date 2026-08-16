// UIDG-5 — the themed chart layer. Import forms from here; drop to the escape
// hatch (ChartFrame + useChartTheme + prop builders) for a form not covered.

export { ChartFrame } from "./ChartFrame";
export type { ChartFrameProps } from "./ChartFrame";
export { ChartTooltipContent } from "./ChartTooltip";
export { useChartTheme } from "./useChartTheme";
export type { ChartTheme } from "./useChartTheme";
export type { BaseChartProps, Series, NumberFormatter, LabelFormatter } from "./types";

// Prop builders for the escape hatch (spread onto raw Recharts elements).
export {
  gridProps,
  xAxisProps,
  yAxisProps,
  seriesColor,
  seriesColors,
  withAlpha,
  shiftLightness,
} from "@/lib/charts/theme";

// Forms.
export { LineChart } from "./forms/LineChart";
export type { LineChartProps } from "./forms/LineChart";
export { AreaChart } from "./forms/AreaChart";
export type { AreaChartProps } from "./forms/AreaChart";
export { BarChart } from "./forms/BarChart";
export type { BarChartProps } from "./forms/BarChart";
export { TargetBar } from "./forms/TargetBar";
export type { TargetBarProps, TargetBarDatum } from "./forms/TargetBar";
export { ComboChart } from "./forms/ComboChart";
export type { ComboChartProps } from "./forms/ComboChart";
export { DonutChart } from "./forms/DonutChart";
export type { DonutChartProps, DonutDatum } from "./forms/DonutChart";
export { RadarChart } from "./forms/RadarChart";
export type { RadarChartProps } from "./forms/RadarChart";
export { Sparkline } from "./forms/Sparkline";
export type { SparklineProps } from "./forms/Sparkline";
export { RadialGauge } from "./forms/RadialGauge";
export type { RadialGaugeProps } from "./forms/RadialGauge";
