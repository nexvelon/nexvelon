// UIDG-5 — shared prop shapes for the chart forms.

export interface BaseChartProps {
  /** Accessible description of the chart (required — see ChartFrame). */
  summary: string;
  height?: number;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
}

/** One plotted series. `color` overrides the palette; omit it to let the wrapper
 *  assign a distinct colour (seriesColor) that never collides at 6+ series. */
export interface Series {
  key: string;
  name?: string;
  color?: string;
}

export type NumberFormatter = (value: number) => string;
export type LabelFormatter = (value: string | number) => string;
