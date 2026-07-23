"use client";

// JC-2 — project + cost-center cost rollup UI. The project card sits near the
// detail header; the compact chip row sits under each cost-center alongside the
// JC-1 labour subsection. Financial-sensitive figures (labour / spent / margin)
// are gated by `canSeeFinancials` — and arrive already redacted (null) from the
// action for non-financials callers, so this is layout, not the only guard.

import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ProjectRollup,
  CostCenterRollup,
} from "@/lib/api/project-cost-rollup";

function marginTone(margin: number): string {
  return margin < 0 ? "text-destructive" : "text-[var(--brand-status-green)]";
}

function billedLabel(pct: number | null): string {
  return pct === null ? "—" : `${Math.round(pct * 100)}%`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function ProjectRollupCard({
  rollup,
  canSeeFinancials,
}: {
  rollup: ProjectRollup;
  canSeeFinancials: boolean;
}) {
  return (
    <Card
      className="p-4 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <Stat label="Contract value" value={formatCurrency(rollup.contract)} />
        <Stat label="Invoiced" value={formatCurrency(rollup.invoiced)} />
        <Stat label="Materials cost" value={formatCurrency(rollup.materials)} />
        {canSeeFinancials && rollup.labour !== null && (
          <Stat label="Labour cost" value={formatCurrency(rollup.labour)} />
        )}
        {/* SUB-4 — subcontractor labour, shown only when there is any (folded
            into Spent/Margin either way). */}
        {canSeeFinancials && rollup.sub_labour != null && rollup.sub_labour > 0 && (
          <Stat label="Subcontractors" value={formatCurrency(rollup.sub_labour)} />
        )}
        {canSeeFinancials && rollup.spent !== null && (
          <Stat label="Spent" value={formatCurrency(rollup.spent)} />
        )}
        {canSeeFinancials && rollup.margin !== null && (
          <Stat
            label="Margin"
            value={formatCurrency(rollup.margin)}
            tone={marginTone(rollup.margin)}
          />
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-[11px]">
        Billed{" "}
        <span className="text-brand-charcoal font-semibold tabular-nums">
          {billedLabel(rollup.billed_pct)}
        </span>{" "}
        of contract
      </p>
    </Card>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className={cn("text-brand-charcoal font-semibold tabular-nums", tone)}>
        {value}
      </span>
    </span>
  );
}

export function CostCenterRollupChips({
  cc,
  canSeeFinancials,
}: {
  cc: CostCenterRollup;
  canSeeFinancials: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <Chip label="Contract" value={formatCurrency(cc.contract)} />
      <Chip label="Materials" value={formatCurrency(cc.materials)} />
      {canSeeFinancials && cc.labour !== null && (
        <Chip label="Labour" value={formatCurrency(cc.labour)} />
      )}
      {canSeeFinancials && cc.spent !== null && (
        <Chip label="Spent" value={formatCurrency(cc.spent)} />
      )}
      {canSeeFinancials && cc.margin !== null && (
        <Chip
          label="Margin"
          value={formatCurrency(cc.margin)}
          tone={marginTone(cc.margin)}
        />
      )}
    </div>
  );
}
