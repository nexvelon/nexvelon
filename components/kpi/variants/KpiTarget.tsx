"use client";

// UIDG-6 — actual vs target in one bar: the actual fills a coloured segment, a
// ghost track shows the distance to target. Only chosen when a real target
// exists.
//
//   <KpiTarget label="Billed vs contract" actual={60000} target={100000}
//     format={formatCurrency} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { TargetBar } from "@/components/charts";
import type { KpiCommon } from "../types";

export interface KpiTargetProps extends KpiCommon {
  actual: number;
  target: number;
  format: (n: number) => string;
}

export function KpiTarget({ actual, target, format, ...common }: KpiTargetProps) {
  const empty = common.empty ?? !(target > 0);
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  return (
    <KpiShell {...common} empty={empty}>
      <div className="flex items-baseline justify-between">
        <KpiValue value={actual} format={format} />
        <span className="text-muted-foreground text-xs tabular-nums">{pct}% of target</span>
      </div>
      <div className="mt-auto pt-1">
        <TargetBar
          summary={`${common.label}: ${format(actual)} of ${format(target)} target`}
          data={[{ label: "", actual, target }]}
          valueFormatter={format}
          height={40}
        />
      </div>
      <p className="text-muted-foreground text-xs">target {format(target)}</p>
    </KpiShell>
  );
}
