// UIDG-6 — the shared KPI card contract (2d). Every variant accepts KpiCommon, so
// UIDG-8's layout model can place any variant in a grid slot without special-
// casing it and UIDG-10 can list them from the registry. Variant-specific data is
// layered on top per component.

import type { LucideIcon } from "lucide-react";

export interface KpiCommon {
  /** The metric name (always shown, always screen-reader accessible). */
  label: string;
  /** Drill-in target — a KPI you cannot open is a dead end. */
  href?: string;
  icon?: LucideIcon;
  /** `danger` = a metric currently in a bad state (red accent). */
  accent?: "default" | "danger";
  /** Stagger index for the entrance animation. */
  index?: number;

  // ── states (handled uniformly by KpiShell) ──────────────────────────────────
  loading?: boolean;
  error?: string | null;
  /** The current role may not see this metric → the Restricted state, never a
   *  redacted-looking blank. */
  restricted?: boolean;
  /** No real data yet → "Not enough data yet" (§2.8), never a fabricated zero. */
  empty?: boolean;
  emptyMessage?: string;

  className?: string;
}

/** A period-over-period change. Direction (arrow) follows the sign; colour
 *  (good/bad) follows the caller-declared polarity — for costs, up is bad. */
export interface DeltaSpec {
  delta: number;
  deltaFormat?: (n: number) => string;
  /** `inverted` = a decrease is the good outcome (costs, overdue, AP…). */
  polarity?: "normal" | "inverted";
}
