"use client";

// PROJ2-17 + PROJ2-21 — the cost-analysis block on the Job Financials tab:
//   • Cost breakdown by code (estimated / actual / variance).
//   • Margin history (point-in-time snapshots + a compact drift sparkline + a
//     "Take snapshot" action with a reason).
//
// Both expose actual cost/margin, so they only render for canViewFinancials
// (financials:edit) callers — the same tier as the rollup's cost legs. The
// server actions gate again.

import { useEffect, useState, useTransition } from "react";
import { Camera, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getCostBreakdownByCodeAction,
  listSnapshotsAction,
  takeSnapshotAction,
  deleteSnapshotAction,
} from "@/app/(app)/projects/cost-analysis-actions";
import type { CostCodeBreakdown } from "@/lib/api/cost-codes";
import type { DbMarginSnapshot } from "@/lib/types/database";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const REASONS = [
  { value: "approval", label: "At approval" },
  { value: "50%", label: "50% complete" },
  { value: "completion", label: "At completion" },
  // PROJ2-18 — a WIP review is a natural moment to freeze the numbers.
  { value: "wip_review", label: "WIP review" },
  { value: "manual", label: "Manual" },
];

export function JobCostAnalysis({ jobId, projectId }: { jobId: string; projectId: string }) {
  const [breakdown, setBreakdown] = useState<CostCodeBreakdown | null>(null);
  const [snaps, setSnaps] = useState<DbMarginSnapshot[]>([]);
  const [takeOpen, setTakeOpen] = useState(false);
  const [reason, setReason] = useState("manual");
  const [pending, start] = useTransition();

  const load = () => {
    getCostBreakdownByCodeAction({ jobId }).then((r) => r.ok && setBreakdown(r.data));
    listSnapshotsAction({ jobId }).then((r) => r.ok && setSnaps(r.data));
  };
  useEffect(load, [jobId]);

  const take = () =>
    start(async () => {
      const res = await takeSnapshotAction({ projectId, jobId, reason });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Snapshot taken");
      setTakeOpen(false);
      load();
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteSnapshotAction(id, projectId);
      if (!res.ok) { toast.error(res.error); return; }
      load();
    });

  return (
    <div className="space-y-4">
      {/* ── Cost breakdown by code ── */}
      <Card className="p-4 shadow-sm">
        <h3 className="text-brand-navy mb-3 font-serif text-base">Cost breakdown by code</h3>
        {!breakdown || breakdown.rows.length === 0 ? (
          <p className="text-muted-foreground text-[11px]">
            No cost activity yet. Code line items and log costs to populate this.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Code</TableHead>
                  <TableHead className="text-[11px] uppercase">Category</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Estimated</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Actual</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.rows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="text-muted-foreground text-xs capitalize">{r.category}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.estimated)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.actual)}</TableCell>
                    <TableCell className={cn("text-right text-xs font-semibold tabular-nums", r.variance > 0 ? "text-red-600" : r.variance < 0 ? "text-[var(--brand-status-green)]" : "text-muted-foreground")}>
                      {r.variance > 0 ? "+" : ""}{formatCurrency(r.variance)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-t-[var(--border)]">
                  <TableCell className="text-xs font-semibold" colSpan={2}>Total</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">{formatCurrency(breakdown.totals.estimated)}</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">{formatCurrency(breakdown.totals.actual)}</TableCell>
                  <TableCell className={cn("text-right text-xs font-semibold tabular-nums", breakdown.totals.variance > 0 ? "text-red-600" : "text-[var(--brand-status-green)]")}>
                    {breakdown.totals.variance > 0 ? "+" : ""}{formatCurrency(breakdown.totals.variance)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-[11px]">
          Actuals attribute by category (materials / labour / subcontractor);
          uncoded lines fall under their line type. Supplier-bill memo cost is
          excluded, matching the margin basis.
        </p>
      </Card>

      {/* ── Margin history ── */}
      <Card className="p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-brand-navy font-serif text-base">Margin history</h3>
          <Button type="button" size="xs" variant="outline" onClick={() => setTakeOpen(true)} disabled={pending}>
            <Camera className="mr-1 h-3.5 w-3.5" /> Take snapshot
          </Button>
        </div>

        {snaps.length === 0 ? (
          <p className="text-muted-foreground text-[11px]">
            No snapshots yet. Take one at approval, 50% and completion to see how
            the forecast margin moves over the job.
          </p>
        ) : (
          <>
            <MarginSparkline snaps={snaps} />
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">When</TableHead>
                    <TableHead className="text-[11px] uppercase">Reason</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Actual cost</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Margin</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Margin %</TableHead>
                    <TableHead className="text-[11px] uppercase" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snaps.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs tabular-nums">{s.snapshot_at.slice(0, 10)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.reason ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(Number(s.actual_cost))}</TableCell>
                      <TableCell className={cn("text-right text-xs font-semibold tabular-nums", Number(s.margin) < 0 && "text-red-600")}>{formatCurrency(Number(s.margin))}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{s.margin_pct != null ? `${Number(s.margin_pct).toFixed(1)}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <button type="button" onClick={() => remove(s.id)} disabled={pending} className="text-muted-foreground hover:text-red-600" aria-label="Delete snapshot">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              Snapshots are frozen — later cost changes never alter a past
              snapshot. That&rsquo;s how you see the forecast drift.
            </p>
          </>
        )}
      </Card>

      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take a margin snapshot</DialogTitle>
            <DialogDescription>
              Freezes this job&rsquo;s current cost + margin numbers. The capture
              is permanent and can&rsquo;t be edited (only deleted).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Reason</span>
            <Select value={reason} onValueChange={(v) => setReason(v ?? "manual")}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTakeOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" onClick={take} disabled={pending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {pending ? "Taking…" : "Take snapshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// A tiny inline SVG sparkline of margin% across snapshots (oldest → newest).
function MarginSparkline({ snaps }: { snaps: DbMarginSnapshot[] }) {
  const series = [...snaps]
    .sort((a, b) => (a.snapshot_at < b.snapshot_at ? -1 : 1))
    .map((s) => (s.margin_pct != null ? Number(s.margin_pct) : 0));
  if (series.length < 2) return null;
  const w = 220, hgt = 40, pad = 4;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (w - 2 * pad);
      const y = hgt - pad - ((v - min) / span) * (hgt - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dropping = series[series.length - 1] < series[0];
  return (
    <div className="flex items-center gap-2">
      <TrendingUp className={cn("h-3.5 w-3.5", dropping ? "text-red-600" : "text-[var(--brand-status-green)]")} />
      <svg width={w} height={hgt} className="overflow-visible">
        <polyline points={pts} fill="none" stroke={dropping ? "#dc2626" : "var(--brand-status-green)"} strokeWidth={1.5} />
      </svg>
      <span className="text-muted-foreground text-[10px]">margin % over time</span>
    </div>
  );
}
