"use client";

// PERF-1 — the unified performance board (upgrades the PROJ2-6b Quoted/Estimated
// /Actual/Variance table in place). FOUR primary columns — Budgeted · Actual ·
// Earned · Projected — plus Quoted as a 5th toggle baseline (Nexvelon's edge:
// the frozen quote). Cost/margin block + a labour Hours/Cost-Hr block + a WIP/
// billing block. The board arrives already redacted (nulls) from the server for
// non-financials callers; this renders null as "—".
//
// It ASSEMBLES existing figures (rollup variance legs + WIP earned/%complete +
// the forecast helper) — it recomputes nothing.

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PerformanceBoard, PerfLeg } from "@/lib/api/performance-board";

const DASH = "—";

const money = (v: number | null | undefined) => (v == null ? DASH : formatCurrency(v));
const pct = (v: number | null | undefined) => (v == null ? DASH : `${v.toFixed(1)}%`);
const num = (v: number | null | undefined) => (v == null ? DASH : v.toLocaleString());

type LegKey = keyof Pick<PerfLeg, "revenue" | "materials" | "labour" | "sub" | "cost" | "profit">;

export function PerformanceTable({
  board,
  canViewFinancials,
}: {
  board: PerformanceBoard | null;
  canViewFinancials: boolean;
}) {
  const [showQuoted, setShowQuoted] = useState(false);

  if (!board) {
    return (
      <p className="text-muted-foreground px-2 py-3 text-sm">
        {canViewFinancials ? "Performance data unavailable." : "Cost & margin performance is hidden for your role."}
      </p>
    );
  }

  const showQ = showQuoted && board.has_quoted;
  const b = board;

  // Money/margin rows. Each maps a leg key to Budgeted/Actual/Quoted, plus the
  // (sparse, honest) Earned + Projected values.
  const moneyRows: {
    label: string;
    key: LegKey | "margin_pct";
    earned: number | null;
    projected: number | null;
    isPct?: boolean;
  }[] = [
    { label: "Revenue", key: "revenue", earned: b.earned.revenue, projected: b.projected.revenue },
    { label: "Material", key: "materials", earned: null, projected: null },
    { label: "Labour", key: "labour", earned: null, projected: null },
    { label: "Subcontractor", key: "sub", earned: null, projected: null },
    { label: "Total Cost", key: "cost", earned: null, projected: b.projected.cost },
    { label: "Profit", key: "profit", earned: null, projected: b.projected.profit },
    { label: "Margin %", key: "margin_pct", earned: null, projected: b.projected.margin_pct, isPct: true },
  ];

  const legVal = (leg: PerfLeg | null, key: LegKey | "margin_pct"): number | null =>
    leg == null ? null : (leg[key] as number | null);

  const cell = (v: number | null, isPct?: boolean) => (isPct ? pct(v) : money(v));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px]">
          Budgeted vs Actual vs Earned vs a Projected forecast-at-completion.
        </p>
        {b.has_quoted && (
          <button
            type="button"
            onClick={() => setShowQuoted((s) => !s)}
            className="text-muted-foreground hover:text-brand-charcoal text-[11px] font-medium underline-offset-2 hover:underline"
          >
            {showQ ? "Hide quote" : "Show quote"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-[var(--border)] text-right text-[11px] uppercase">
              <th className="px-2 py-1.5 text-left font-medium" />
              {showQ && <th className="px-2 py-1.5 font-medium">Quoted</th>}
              <th className="px-2 py-1.5 font-medium">Budgeted</th>
              <th className="px-2 py-1.5 font-medium">Actual</th>
              <th className="px-2 py-1.5 font-medium">Earned</th>
              <th
                className="px-2 py-1.5 font-medium italic"
                title="Forecast = actual + remaining estimated cost. A manual re-forecast is coming."
              >
                Projected
              </th>
            </tr>
          </thead>
          <tbody>
            {moneyRows.map((row) => (
              <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                <td className="text-brand-charcoal px-2 py-1.5">{row.label}</td>
                {showQ && (
                  <td className="px-2 py-1.5 text-right tabular-nums">{cell(legVal(b.quoted, row.key), row.isPct)}</td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums">{cell(legVal(b.budgeted, row.key), row.isPct)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{cell(legVal(b.actual, row.key), row.isPct)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{row.earned == null ? DASH : cell(row.earned, row.isPct)}</td>
                <td className="text-muted-foreground px-2 py-1.5 text-right italic tabular-nums">
                  {row.projected == null ? DASH : cell(row.projected, row.isPct)}
                </td>
              </tr>
            ))}

            {/* Labour block — actual-side only (no estimated hours exist). */}
            <tr className="border-b border-[var(--border)]">
              <td className="text-brand-charcoal px-2 py-1.5">Labour hours</td>
              {showQ && <td className="px-2 py-1.5 text-right">{DASH}</td>}
              <td className="px-2 py-1.5 text-right">{DASH}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{num(b.labour.hours)}</td>
              <td className="px-2 py-1.5 text-right">{DASH}</td>
              <td className="px-2 py-1.5 text-right">{DASH}</td>
            </tr>
            <tr className="border-b border-[var(--border)] last:border-0">
              <td className="text-brand-charcoal px-2 py-1.5">Cost / hr</td>
              {showQ && <td className="px-2 py-1.5 text-right">{DASH}</td>}
              <td className="px-2 py-1.5 text-right">{DASH}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(b.labour.cost_per_hour)}</td>
              <td className="px-2 py-1.5 text-right">{DASH}</td>
              <td className="px-2 py-1.5 text-right">{DASH}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* WIP / billing position block. */}
      <div className="rounded-md border border-[var(--border)] p-2.5">
        <p className="nx-eyebrow mb-1.5">Billing &amp; WIP position</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
          <Kv label="% complete (cost)" value={pct(b.earned.pct_complete == null ? null : b.earned.pct_complete)} />
          <Kv label="Billed" value={money(b.billing.billed)} />
          <Kv
            label="Over/(under) billed"
            value={b.billing.over_under == null ? DASH : formatCurrency(b.billing.over_under)}
            tone={
              b.billing.over_under == null || Math.abs(b.billing.over_under) < 0.005
                ? undefined
                : b.billing.over_under > 0
                  ? "text-[#8a6d1f]" // overbilled — amber (WIP convention)
                  : "text-brand-navy" // underbilled — blue
            }
          />
          <Kv label="Un-posted (earned − billed)" value={money(b.billing.un_posted)} />
          <Kv label="Retention (memo)" value={money(b.billing.retention)} />
          <Kv label="Remaining to bill" value={money(b.billing.remaining_to_bill)} />
        </dl>
        {!b.has_estimate && (
          <p className="text-muted-foreground mt-2 text-[11px]">
            No cost estimate on this {b.scope}: % complete and Projected can&apos;t be computed — add an estimate to enable them.
          </p>
        )}
      </div>
    </div>
  );
}

function Kv({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
