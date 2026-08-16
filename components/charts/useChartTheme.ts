"use client";

// UIDG-5 — the hook every chart calls to get its themed tokens. Reads the active
// theme via useThemeColors (JS palette, mode-resolved) and derives the chart
// tokens. Charts read THIS, never CSS vars — one source, correct in light + dark.

import { useThemeColors } from "@/lib/theme-context";
import { chartThemeFrom, type ChartTheme } from "@/lib/charts/theme";

export function useChartTheme(): ChartTheme {
  return chartThemeFrom(useThemeColors());
}

export type { ChartTheme };
