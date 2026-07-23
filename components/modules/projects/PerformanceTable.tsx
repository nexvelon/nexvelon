"use client";

// PROJ2-6b — the Quoted / Estimated / Actual / Variance table. Shared between
// the Job Financials tab (Performance card) and the project detail's
// "Performance vs Quote" disclosure. The block arrives already redacted (null)
// from the server for non-financials callers, and `canViewFinancials` dashes
// the render as a second, layout-level gate — same double-gate pattern as the
// other rollup surfaces.

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JobVarianceBlock } from "@/lib/api/project-cost-rollup";

const DASH = "—";

// Favorable variance is green, unfavorable red, zero/near-zero muted. Revenue
// and margin are favorable when up; the cost legs are favorable when down.
function varianceTone(
  v: number | null,
  favorableWhenPositive: boolean
): string {
  if (v == null || Math.abs(v) < 0.005) return "text-muted-foreground";
  const favorable = favorableWhenPositive ? v > 0 : v < 0;
  return favorable ? "text-[var(--brand-status-green)]" : "text-destructive";
}

function signedMoney(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(v))}`;
}

function pct(v: number | null): string {
  return v == null ? DASH : `${v.toFixed(1)}%`;
}

function signedPts(v: number | null): string {
  if (v == null) return DASH;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)} pts`;
}

export function PerformanceTable({
  block,
  canViewFinancials,
}: {
  block: JobVarianceBlock | null;
  canViewFinancials: boolean;
}) {
  const redacted = !canViewFinancials || block == null;
  const hasQuoted = !redacted && block.has_quoted_baseline;

  // Row spec: label + per-leg accessor + variance accessor + favorability.
  const moneyRows: Array<{
    label: string;
    key: "revenue" | "materials" | "labour" | "sub_labour" | "cost";
    favorableWhenPositive: boolean;
  }> = [
    { label: "Revenue", key: "revenue", favorableWhenPositive: true },
    { label: "Materials", key: "materials", favorableWhenPositive: false },
    { label: "Labour", key: "labour", favorableWhenPositive: false },
    // SUB-4 — subcontractor labour (actual only; Quoted/Estimated are 0).
    { label: "Subcontractors", key: "sub_labour", favorableWhenPositive: false },
    { label: "Total Cost", key: "cost", favorableWhenPositive: false },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-[var(--border)] text-left text-[11px] uppercase">
            <th className="px-2 py-1.5 font-medium" />
            <th
              className="px-2 py-1.5 text-right font-medium"
              title={
                !redacted && !hasQuoted
                  ? "No quoted snapshot; created without a source quote."
                  : undefined
              }
            >
              {!redacted && !hasQuoted ? "Quoted —" : "Quoted"}
            </th>
            <th className="px-2 py-1.5 text-right font-medium">Estimated</th>
            <th className="px-2 py-1.5 text-right font-medium">Actual</th>
            <th className="px-2 py-1.5 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {moneyRows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="text-brand-charcoal px-2 py-1.5">{row.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {redacted || !hasQuoted
                  ? DASH
                  : formatCurrency(block.quoted[row.key])}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {redacted ? DASH : formatCurrency(block.estimated[row.key])}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {redacted ? DASH : formatCurrency(block.actual[row.key])}
              </td>
              <td
                className={cn(
                  "px-2 py-1.5 text-right font-medium tabular-nums",
                  !redacted &&
                    varianceTone(
                      block.variance[row.key],
                      row.favorableWhenPositive
                    )
                )}
              >
                {redacted ? DASH : signedMoney(block.variance[row.key])}
              </td>
            </tr>
          ))}
          <tr>
            <td className="text-brand-charcoal px-2 py-1.5">Margin</td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              {redacted || !hasQuoted ? DASH : pct(block.quoted.margin_pct)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              {redacted ? DASH : pct(block.estimated.margin_pct)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              {redacted ? DASH : pct(block.actual.margin_pct)}
            </td>
            <td
              className={cn(
                "px-2 py-1.5 text-right font-medium tabular-nums",
                !redacted && varianceTone(block.variance.margin_pts, true)
              )}
            >
              {redacted ? DASH : signedPts(block.variance.margin_pts)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
