"use client";

// UIDG-6 — 3–5 label/value rows in one card, for a group of small related metrics
// (e.g. WIP net / overbilled / underbilled). Tones use the theme status tokens.
//
//   <KpiStatList label="WIP position" rows={[
//     { label: "Net", value: net, format: formatCurrency },
//     { label: "Overbilled", value: over, format: formatCurrency, tone: "bad" },
//     { label: "Underbilled", value: under, format: formatCurrency, tone: "good" },
//   ]} />

import { KpiShell } from "../KpiShell";
import { KpiHistoryFooter } from "../KpiHistoryFooter";
import type { KpiCommon, KpiComparison } from "../types";

export interface KpiStatRow {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  tone?: "default" | "good" | "bad";
}

export interface KpiStatListProps extends KpiCommon {
  rows: KpiStatRow[];
  // SNAP-1 — a delta on a headline value (e.g. WIP net) / building-history / trend.
  comparison?: KpiComparison;
  comparisonCurrent?: number;
  buildingHistory?: boolean;
  series?: number[];
}

const TONE: Record<NonNullable<KpiStatRow["tone"]>, string | undefined> = {
  default: undefined,
  good: "var(--brand-status-green)",
  bad: "var(--brand-status-red)",
};

export function KpiStatList({ rows, comparison, comparisonCurrent, buildingHistory, series, ...common }: KpiStatListProps) {
  const empty = common.empty ?? (rows?.length ?? 0) === 0;
  return (
    <KpiShell {...common} empty={empty}>
      <ul className="mt-1 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span
              className="text-brand-navy font-semibold tabular-nums"
              style={r.tone && r.tone !== "default" ? { color: TONE[r.tone] } : undefined}
            >
              {typeof r.value === "number" && r.format ? r.format(r.value) : String(r.value)}
            </span>
          </li>
        ))}
      </ul>
      {(comparison || buildingHistory || series) && (
        <KpiHistoryFooter current={comparisonCurrent ?? 0} comparison={comparison} buildingHistory={buildingHistory} series={series} label={common.label} />
      )}
    </KpiShell>
  );
}
