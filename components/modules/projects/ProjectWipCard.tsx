"use client";

// PROJ2-18 (5b) — the project WIP summary + per-job breakdown on the project
// detail page. Self-hides when there are no jobs or the caller can't see cost
// (the whole card is cost-side; the per-job WIP card on each Job Financials tab
// still shows the billing side to view-only holders).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getProjectWipAction } from "@/app/(app)/projects/wip-actions";
import type { ProjectWip, WipPosition } from "@/lib/api/wip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const POSITION: Record<WipPosition, { label: string; cls: string }> = {
  overbilled: { label: "Overbilled", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  underbilled: { label: "Underbilled", cls: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy" },
  even: { label: "Even", cls: "bg-muted text-muted-foreground" },
  indeterminate: { label: "—", cls: "bg-muted text-muted-foreground" },
};

function jobLabel(j: ProjectWip["jobs"][number]): string {
  if (j.job_type === "main_job") return "Main Job";
  const co = j.co_number != null ? `CO #${j.co_number}` : "Change Order";
  return j.title ? `${co} — ${j.title}` : co;
}

function ou(n: number): string {
  return n >= 0 ? formatCurrency(n) : `(${formatCurrency(Math.abs(n))})`;
}

export function ProjectWipCard({ projectId }: { projectId: string }) {
  const [wip, setWip] = useState<ProjectWip | null>(null);
  const [canSeeCost, setCanSeeCost] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProjectWipAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) { setWip(res.data.wip); setCanSeeCost(res.data.canSeeCost); }
    });
  }, [projectId]);

  // Cost-side card — hide entirely from non-financials callers and empty projects.
  if (!loaded || !canSeeCost || !wip || wip.jobs.length === 0) return null;

  const r = wip.rollup;
  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Work in progress{" "}
        <span className="text-muted-foreground font-normal normal-case">
          · {r.pct_complete == null ? "—" : `${(r.pct_complete * 100).toFixed(0)}%`} complete
        </span>
      </p>
      <Card className="bg-card p-4 shadow-sm">
        {/* Project rollup strip */}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          <Chip label="Contract" value={formatCurrency(r.contract)} />
          <Chip label="Earned" value={formatCurrency(r.earned)} />
          <Chip label="Billed" value={formatCurrency(r.billed)} />
          <Chip
            label="Over/(under) billed"
            value={ou(r.over_under)}
            tone={r.position === "overbilled" ? "text-[#8a6d1f]" : r.position === "underbilled" ? "text-brand-navy" : "text-muted-foreground"}
          />
          {r.indeterminate_jobs > 0 && (
            <span className="text-muted-foreground text-[10px]">
              {r.indeterminate_jobs} job{r.indeterminate_jobs === 1 ? "" : "s"} without an estimate
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Job</TableHead>
                <TableHead className="text-right text-[11px] uppercase">% compl.</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Earned</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Billed</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Over/(under)</TableHead>
                <TableHead className="text-[11px] uppercase">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wip.jobs.map((j) => {
                const pos = POSITION[j.position];
                return (
                  <TableRow key={j.job_id}>
                    <TableCell className="text-xs">
                      <Link href={`/projects/${projectId}/jobs/${j.job_id}`} className="text-brand-navy hover:underline">
                        {jobLabel(j)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {j.pct_complete == null ? "—" : `${(j.pct_complete * 100).toFixed(0)}%`}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{j.earned == null ? "—" : formatCurrency(j.earned)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(j.billed)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums">{j.over_under == null ? "—" : ou(j.over_under)}</TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", pos.cls)}>{pos.label}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1">
      {label} <span className={cn("font-semibold tabular-nums", tone ?? "text-brand-charcoal")}>{value}</span>
    </span>
  );
}
