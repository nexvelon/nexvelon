"use client";

// UIDG-12 — the Gantt's colours, derived from the SAME source every chart uses
// (useChartTheme → the active, mode-resolved theme). No hardcoded colour: a
// palette change, a custom theme, or light↔dark all land here automatically.

import { useChartTheme } from "@/components/charts/useChartTheme";
import { withAlpha } from "@/lib/charts/theme";

export interface GanttTheme {
  /** Task bar: a translucent track with a solid progress fill. */
  taskTrack: string;
  taskFill: string;
  /** Job summary bar. */
  jobFill: string;
  /** Milestone diamond + due-date-only task marker. */
  marker: string;
  /** Baseline overlay bar (muted, thin). */
  baseline: string;
  /** Overdue / at-risk (a violated dependency, an overdue bar). */
  danger: string;
  /** Today line. */
  today: string;
  /** Grid lines + axis rules. */
  grid: string;
  /** Dependency arrow (normal + violated). */
  arrow: string;
  arrowViolated: string;
  /** Text tones. */
  text: string;
  textMuted: string;
  /** Surfaces. */
  headerBg: string;
  rowAltBg: string;
}

export function useGanttTheme(): GanttTheme {
  const ct = useChartTheme();
  return {
    taskTrack: withAlpha(ct.primary, 0.18),
    taskFill: ct.primary,
    jobFill: ct.accent,
    marker: ct.accent,
    baseline: withAlpha(ct.axisTick, 0.55),
    danger: ct.statusRed,
    today: ct.accent,
    grid: ct.gridStroke,
    arrow: ct.axisTick,
    arrowViolated: ct.statusRed,
    text: ct.tooltipFg,
    textMuted: ct.axisTick,
    headerBg: ct.tooltipBg,
    rowAltBg: withAlpha(ct.axisTick, 0.05),
  };
}
