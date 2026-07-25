"use client";

// PROJ2-18 (5a) — the "Work in progress" card on the Job Financials tab.
// % complete (cost-to-cost) · contract · earned · billed · the over/(under)
// billed position (overbilled = amber liability, underbilled = blue asset) ·
// holdback memo · remaining to bill · remaining cost. Cost legs dash for
// financials:view (the action redacts + returns canSeeCost).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getJobWipAction } from "@/app/(app)/projects/wip-actions";
import type { JobWip } from "@/lib/api/wip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const POSITION_TONE: Record<string, string> = {
  overbilled: "text-[#8a6d1f]", // amber — a liability (billed ahead)
  underbilled: "text-brand-navy", // blue — an asset (work not yet billed)
  even: "text-muted-foreground",
  indeterminate: "text-muted-foreground",
};

export function JobWipCard({ jobId }: { jobId: string }) {
  const [wip, setWip] = useState<JobWip | null>(null);
  const [canSeeCost, setCanSeeCost] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getJobWipAction(jobId).then((res) => {
      setLoaded(true);
      if (res.ok) { setWip(res.data.wip); setCanSeeCost(res.data.canSeeCost); }
    });
  }, [jobId]);

  if (!loaded || !wip) return null;

  const cost = (n: number | null) => (canSeeCost && n != null ? formatCurrency(n) : "—");
  const pctLabel =
    wip.pct_complete == null ? null : `${(wip.pct_complete * 100).toFixed(0)}%`;

  const ou = wip.over_under;
  const ouLabel =
    !canSeeCost || ou == null
      ? "—"
      : ou >= 0
        ? formatCurrency(ou)
        : `(${formatCurrency(Math.abs(ou))})`;
  const positionWord =
    wip.position === "overbilled" ? "Overbilled"
      : wip.position === "underbilled" ? "Underbilled"
        : wip.position === "even" ? "Even" : "—";

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-base">Work in progress</h3>
        <span
          className="text-muted-foreground text-[11px]"
          title={wip.pct_complete == null ? "Add a job estimate to compute % complete." : "Cost-to-cost (actual cost ÷ estimated cost)"}
        >
          {pctLabel != null ? `${pctLabel} complete` : "% complete —"}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <Row label="Contract" value={formatCurrency(wip.contract)} />
        <Row label="Earned to date" value={cost(wip.earned)} />
        <Row label="Billed to date" value={formatCurrency(wip.billed)} />
        <div className="border-t border-[var(--border)] pt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-brand-charcoal font-medium">Over / (under) billed</span>
            <span className={cn("font-semibold tabular-nums", POSITION_TONE[wip.position])}>
              {ouLabel}
              {canSeeCost && wip.position !== "indeterminate" && (
                <span className="ml-2 text-[10px] font-normal uppercase tracking-wide">{positionWord}</span>
              )}
            </span>
          </div>
        </div>
        <Row label="Holdback retained (memo)" value={formatCurrency(wip.holdback_retained)} muted />
        <Row label="Remaining to bill" value={formatCurrency(wip.remaining_to_bill)} muted />
        <Row label="Remaining cost (est − actual)" value={cost(wip.remaining_cost)} muted />
      </div>

      {wip.pct_complete == null && canSeeCost && (
        <p className="text-muted-foreground mt-2 text-[11px]">
          Add a job estimate (line items) to compute % complete and the WIP position.
        </p>
      )}
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : "text-brand-charcoal"}>{label}</span>
      <span className={cn("tabular-nums", muted ? "text-muted-foreground" : "text-brand-charcoal font-medium")}>{value}</span>
    </div>
  );
}
