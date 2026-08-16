// UIDG-5 — the ONE place chart styling is derived from the active theme. Every
// chart (the ten forms + any escape-hatch raw-Recharts chart) reads its colours,
// axis/grid/tooltip styling and series colours from here, so a palette or
// light↔dark change lands in one spot instead of four hand-wired charts.
//
// Pure (no React) so it is unit-testable and the prop builders can be spread onto
// real Recharts elements — Recharts detects axis/grid/tooltip by component TYPE
// among a chart's direct children, so the wrapper cannot hide them behind custom
// components; instead it hands back the themed PROPS to spread. This module reads
// only the resolved theme colours (already correct for the active light/dark
// mode via useThemeColors → colorsFor(key, mode)); it never touches CSS vars.

import type { ResolvedThemeColors } from "@/lib/theme";

export interface ChartTheme {
  /** The five stable palette stops (chrome-matched: primary, accent, tertiary,
   *  quaternary, text). Use seriesColor()/seriesColors() rather than indexing
   *  directly so 6+ series stay distinct. */
  palette: readonly string[];
  primary: string;
  accent: string;
  statusGreen: string;
  statusRed: string;
  /** Axis tick + label colour (mid-tone, legible on card in both modes). */
  axisTick: string;
  /** Grid line colour — the theme border, subtle in light, visible-not-glaring
   *  in dark (both resolved by the theme system). */
  gridStroke: string;
  /** Themed tooltip surface. */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  tooltipMuted: string;
  /** Hover cursor band (primary at low alpha). */
  cursorFill: string;
  legendFg: string;
  /** Neutral fill for a ghost/target remainder track. */
  trackFill: string;
}

export function chartThemeFrom(c: ResolvedThemeColors): ChartTheme {
  return {
    palette: c.charts,
    primary: c.primary,
    accent: c.accent,
    statusGreen: c.statusGreen,
    statusRed: c.statusRed,
    axisTick: c.chartTertiary,
    gridStroke: c.border,
    tooltipBg: c.card,
    tooltipBorder: c.border,
    tooltipFg: c.text,
    tooltipMuted: c.muted,
    cursorFill: withAlpha(c.primary, 0.06),
    legendFg: c.chartTertiary,
    trackFill: withAlpha(c.chartTertiary, 0.15),
  };
}

// ─── Series colours ──────────────────────────────────────────────────────────
// The palette has five stops. Cycling them for 6+ series would make series 1 and
// 6 IDENTICAL — a correctness bug in a chart (two lines the reader cannot tell
// apart), not a cosmetic one. Instead, each time the palette wraps we step the
// lightness of the reused stop (alternating lighter/darker, widening each wrap),
// so every series is visibly distinct while staying in the theme's hue family.
// Distinct comfortably past any realistic series count; extreme counts converge
// only as lightness clamps near black/white (a chart with >~15 series should
// aggregate an "Other" bucket upstream — that is the caller's call, not ours).

export function seriesColor(index: number, palette: readonly string[]): string {
  const n = palette.length;
  const stop = index % n;
  const wrap = Math.floor(index / n);
  const base = palette[stop];
  if (wrap === 0) return base;
  // wrap 1 → +1 step, wrap 2 → -1 step, wrap 3 → +2 steps, wrap 4 → -2 steps…
  const magnitude = Math.ceil(wrap / 2);
  const sign = wrap % 2 === 1 ? 1 : -1;
  return shiftLightness(base, sign * magnitude * 14);
}

export function seriesColors(count: number, palette: readonly string[]): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => seriesColor(i, palette));
}

// ─── Prop builders (the escape hatch spreads these onto real Recharts elements)─

export function gridProps(ct: ChartTheme) {
  return { stroke: ct.gridStroke, strokeDasharray: "3 3", vertical: false } as const;
}

export function xAxisProps(ct: ChartTheme, extra?: Record<string, unknown>) {
  return {
    tick: { fill: ct.axisTick, fontSize: 12 },
    axisLine: false,
    tickLine: false,
    ...extra,
  };
}

export function yAxisProps(ct: ChartTheme, extra?: Record<string, unknown>) {
  return {
    tick: { fill: ct.axisTick, fontSize: 12 },
    axisLine: false,
    tickLine: false,
    width: 56,
    ...extra,
  };
}

// ─── Small, dependency-free hex colour maths ─────────────────────────────────

/** Append an alpha channel to a #rrggbb hex → #rrggbbaa. */
export function withAlpha(hex: string, alpha: number): string {
  const h = normalizeHex(hex);
  if (!h) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h}${a}`;
}

/** Shift a hex colour's HSL lightness by `delta` percentage points, clamped so
 *  it never blows out to pure black/white. */
export function shiftLightness(hex: string, delta: number): string {
  const h = normalizeHex(hex);
  if (!h) return hex;
  const { hue, sat, light } = hexToHsl(h);
  const l = Math.min(92, Math.max(8, light + delta));
  return hslToHex(hue, sat, l);
}

function normalizeHex(hex: string): string | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}

function hexToHsl(h: string): { hue: number; sat: number; light: number } {
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  const d = max - min;
  if (d !== 0) {
    sat = d / (1 - Math.abs(2 * light - 1));
    switch (max) {
      case r:
        hue = ((g - b) / d) % 6;
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, sat: sat * 100, light: light * 100 };
}

function hslToHex(hue: number, sat: number, light: number): string {
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
