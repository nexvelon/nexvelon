"use client";

// UIDG-6 — plain metric: label, value, optional delta pill, optional footer.
//
//   <KpiPlain label="Deposits held" value={fin.deposits_held} format={formatCurrency} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { DeltaPill } from "../DeltaPill";
import type { KpiCommon, DeltaSpec } from "../types";

export interface KpiPlainProps extends KpiCommon, Partial<DeltaSpec> {
  value: number;
  format: (n: number) => string;
  footer?: React.ReactNode;
}

export function KpiPlain({
  value,
  format,
  delta,
  deltaFormat,
  polarity,
  footer,
  ...common
}: KpiPlainProps) {
  return (
    <KpiShell {...common}>
      <KpiValue value={value} format={format} />
      {delta !== undefined && (
        <DeltaPill delta={delta} deltaFormat={deltaFormat} polarity={polarity} />
      )}
      {footer && <div className="mt-auto">{footer}</div>}
    </KpiShell>
  );
}
