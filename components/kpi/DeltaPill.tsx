"use client";

// UIDG-6 — the period-over-period delta pill. The ARROW follows the numeric sign
// (up when the value rose); the COLOUR follows the caller-declared polarity, so a
// cost that rose reads red-up and a cost that fell reads green-down. Colours are
// the theme status tokens (mode-aware), never hardcoded green/red.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DeltaSpec } from "./types";

/** The comparison basis label (UIDG-6B) — every delta must say what it compares
 *  against, so "+12%" is never left as "+12% of what?". */
interface DeltaPillProps extends DeltaSpec {
  basis?: string;
}

export function DeltaPill({ delta, deltaFormat, polarity = "normal", basis = "prev period" }: DeltaPillProps) {
  const inverted = polarity === "inverted";
  const good = delta === 0 ? null : inverted ? delta < 0 : delta > 0;

  const color =
    good === null
      ? undefined
      : good
        ? "var(--brand-status-green)"
        : "var(--brand-status-red)";

  const Arrow = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const text = deltaFormat
    ? deltaFormat(delta)
    : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`;

  return (
    <div
      className={`flex items-center gap-1 text-xs font-medium ${
        good === null ? "text-muted-foreground" : ""
      }`}
      style={color ? { color } : undefined}
    >
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      <span>{text}</span>
      <span className="text-muted-foreground font-normal">vs {basis}</span>
    </div>
  );
}
