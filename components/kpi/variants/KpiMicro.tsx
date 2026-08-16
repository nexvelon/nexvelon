"use client";

// UIDG-6 — value with a dense bar strip beneath (a compact distribution, e.g.
// last-N buckets). No axes. The bars must be real; an empty series shows the
// empty state, never a flat strip.
//
//   <KpiMicro label="Daily volume" value={total} format={formatNumber} bars={perDay} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import type { KpiCommon } from "../types";

export interface KpiMicroProps extends KpiCommon {
  value: number;
  format: (n: number) => string;
  bars: number[];
  color?: string;
}

export function KpiMicro({ value, format, bars, color, ...common }: KpiMicroProps) {
  const empty = common.empty ?? (bars?.length ?? 0) === 0;
  const max = Math.max(1, ...(bars ?? []));
  return (
    <KpiShell {...common} empty={empty}>
      <KpiValue value={value} format={format} />
      <div className="mt-auto flex h-8 items-end gap-[3px] pt-2" aria-hidden>
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(4, (b / max) * 100)}%`,
              background: color ?? "var(--brand-primary)",
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </KpiShell>
  );
}
