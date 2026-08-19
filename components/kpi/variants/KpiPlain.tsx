"use client";

// UIDG-6 — plain metric: label, value, optional delta pill, optional footer.
//
//   <KpiPlain label="Deposits held" value={fin.deposits_held} format={formatCurrency} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { DeltaPill } from "../DeltaPill";
import { KpiHistoryFooter } from "../KpiHistoryFooter";
import type { KpiCommon, DeltaSpec, KpiComparison } from "../types";

export interface KpiPlainProps extends KpiCommon, Partial<DeltaSpec> {
  value: number;
  format: (n: number) => string;
  footer?: React.ReactNode;
  // SNAP-1 — snapshot-driven delta / building-history / trend.
  comparison?: KpiComparison;
  buildingHistory?: boolean;
  series?: number[];
}

export function KpiPlain({
  value,
  format,
  delta,
  deltaFormat,
  polarity,
  footer,
  comparison,
  buildingHistory,
  series,
  ...common
}: KpiPlainProps) {
  return (
    <KpiShell {...common}>
      <KpiValue value={value} format={format} />
      {comparison || buildingHistory || series ? (
        <KpiHistoryFooter current={value} comparison={comparison} buildingHistory={buildingHistory} series={series} label={common.label} />
      ) : (
        delta !== undefined && <DeltaPill delta={delta} deltaFormat={deltaFormat} polarity={polarity} />
      )}
      {footer && <div className="mt-auto">{footer}</div>}
    </KpiShell>
  );
}
