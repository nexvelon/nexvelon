"use client";

// UIDG-6 — a tinted "headline" tile for a number that should stand out. The
// gradient is a subtle brand-accent wash (text stays the dark brand navy, legible
// in both modes); it shares all of KpiShell's chrome + states.
//
//   <KpiGradient label="Revenue" value={fin.revenue} format={formatCurrency} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { DeltaPill } from "../DeltaPill";
import type { KpiCommon, DeltaSpec } from "../types";

export interface KpiGradientProps extends KpiCommon, Partial<DeltaSpec> {
  value: number;
  format: (n: number) => string;
}

export function KpiGradient({
  value,
  format,
  delta,
  deltaFormat,
  polarity,
  ...common
}: KpiGradientProps) {
  return (
    <KpiShell
      {...common}
      surfaceStyle={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--brand-accent) 16%, var(--brand-card)) 0%, var(--brand-card) 70%)",
      }}
    >
      <KpiValue value={value} format={format} className="text-4xl" />
      {delta !== undefined && (
        <DeltaPill delta={delta} deltaFormat={deltaFormat} polarity={polarity} />
      )}
    </KpiShell>
  );
}
