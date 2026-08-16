"use client";

// UIDG-5 — the frame every chart sits in. It owns the three states (loading /
// empty / error) so no caller re-invents them, wraps the ready chart in a
// ResponsiveContainer (callers never wire their own), fixes the height so a
// state change never jumps the layout, and gives the chart an accessible text
// alternative (role="img" + aria-label) — a chart that conveys meaning only
// visually is not acceptable output.
//
// It carries NO theme logic (charts pull that from useChartTheme), so it works
// identically for the ten forms and for an escape-hatch raw-Recharts chart:
//
//   const ct = useChartTheme();
//   <ChartFrame summary="Revenue by month" empty={data.length === 0} height={320}>
//     <ComposedChart data={data}>
//       <CartesianGrid {...gridProps(ct)} />
//       <XAxis {...xAxisProps(ct)} dataKey="label" />
//       …raw Recharts…
//     </ComposedChart>
//   </ChartFrame>

import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

export interface ChartFrameProps {
  /** A single Recharts chart element (rendered inside ResponsiveContainer). */
  children: ReactElement;
  /** Accessible description of what the chart shows. Required. */
  summary: string;
  /** Fixed height in px (default 280). Kept across every state — no layout jump. */
  height?: number;
  loading?: boolean;
  error?: string | null;
  /** The data is empty → "Not enough data yet" (§2.8), never a blank axis. */
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function ChartFrame({
  children,
  summary,
  height = 280,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = "Not enough data yet",
  className,
}: ChartFrameProps) {
  const style = { height };

  if (loading) {
    return (
      <div className={className} style={style} aria-busy="true" aria-label={`${summary} — loading`}>
        <div
          className="h-full w-full animate-pulse rounded-md"
          style={{ background: "color-mix(in oklab, var(--brand-border) 40%, transparent)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center text-center ${className ?? ""}`}
        style={style}
        role="img"
        aria-label={`${summary} — ${error}`}
      >
        <p className="text-muted-foreground max-w-xs text-sm">{error}</p>
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={`flex items-center justify-center text-center ${className ?? ""}`}
        style={style}
        role="img"
        aria-label={`${summary} — ${emptyMessage}`}
      >
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className} style={style} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
