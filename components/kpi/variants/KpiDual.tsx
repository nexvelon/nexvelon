"use client";

// UIDG-6 — two related values in one card, split by a divider (e.g. outstanding /
// overdue, count / value).
//
//   <KpiDual label="Accounts receivable"
//     primary={{ label: "Outstanding", value: ar, format: formatCurrency }}
//     secondary={{ label: "Overdue", value: overdue, format: formatCurrency, tone: "bad" }} />

import { KpiShell } from "../KpiShell";
import { KpiValue } from "../KpiValue";
import { KpiHistoryFooter } from "../KpiHistoryFooter";
import type { KpiCommon, KpiComparison } from "../types";

interface Metric {
  label: string;
  value: number;
  format: (n: number) => string;
  tone?: "default" | "good" | "bad";
}

export interface KpiDualProps extends KpiCommon {
  primary: Metric;
  secondary: Metric;
  // SNAP-1 — snapshot-driven delta on the PRIMARY value / building-history / trend.
  comparison?: KpiComparison;
  buildingHistory?: boolean;
  series?: number[];
}

const TONE: Record<NonNullable<Metric["tone"]>, string | undefined> = {
  default: undefined,
  good: "var(--brand-status-green)",
  bad: "var(--brand-status-red)",
};

export function KpiDual({ primary, secondary, comparison, buildingHistory, series, ...common }: KpiDualProps) {
  return (
    <KpiShell {...common} ariaLabel={`${common.label}. ${primary.label} ${primary.format(primary.value)}, ${secondary.label} ${secondary.format(secondary.value)}`}>
      <div className="mt-1 flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{primary.label}</p>
          <KpiValue value={primary.value} format={primary.format} className="text-2xl" />
        </div>
        <div className="w-px shrink-0" style={{ background: "var(--brand-border)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{secondary.label}</p>
          <div
            className="text-brand-navy mt-0.5 text-2xl font-semibold tracking-tight tabular-nums"
            style={secondary.tone ? { color: TONE[secondary.tone] } : undefined}
          >
            {secondary.format(secondary.value)}
          </div>
        </div>
      </div>
      {(comparison || buildingHistory || series) && (
        <KpiHistoryFooter current={primary.value} comparison={comparison} buildingHistory={buildingHistory} series={series} label={common.label} />
      )}
    </KpiShell>
  );
}
