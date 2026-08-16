"use client";

// UIDG-6B — renders a KPI's period-over-period change from (current, prior). It
// dispatches on computeDelta so the young-dataset edge cases never render nonsense:
//   • a normal % change → the DeltaPill
//   • prior was zero      → a directional "up/down from 0" (no fake %/∞)
//   • no change / no prior→ nothing
// Colour follows the caller-declared polarity (up-is-bad for costs); the basis
// label states what the comparison is against.

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { DeltaPill } from "./DeltaPill";
import { computeDelta } from "./comparison";

export interface ComparisonDeltaProps {
  current: number;
  prior: number | null | undefined;
  polarity?: "normal" | "inverted";
  basis?: string;
}

export function ComparisonDelta({
  current,
  prior,
  polarity = "normal",
  basis,
}: ComparisonDeltaProps) {
  const result = computeDelta(current, prior);

  if (result.kind === "none") return null;
  if (result.kind === "pct") {
    return <DeltaPill delta={result.value} polarity={polarity} basis={basis} />;
  }

  // fromZero — a real move from a zero baseline; show direction, never a %.
  const inverted = polarity === "inverted";
  const good = inverted ? result.direction < 0 : result.direction > 0;
  const color = good ? "var(--brand-status-green)" : "var(--brand-status-red)";
  const Arrow = result.direction > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      <span>{result.direction > 0 ? "up from 0" : "down from 0"}</span>
      <span className="text-muted-foreground font-normal">vs {basis ?? "prev period"}</span>
    </div>
  );
}
