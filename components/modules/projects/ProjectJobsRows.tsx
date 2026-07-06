"use client";

// PROJ2-4d — clickable Jobs-table body. Split out of ProjectJobsTable (a server
// component that fetches the rollup) so the rows can navigate to the Job detail
// page on click. A whole <tr> can't be wrapped in an <a>, so we use router.push
// + a keyboard-accessible role/tabindex. Financial gating is unchanged — the
// server passes canViewFinancials and we dash the money/pct columns without it.

import { useRouter } from "next/navigation";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ProjectLifecycleBadge } from "@/components/modules/projects/ProjectLifecycleBadge";
import type { DbJobRollup } from "@/lib/api/project-cost-rollup";
import type { ProjectStatus } from "@/lib/types/database";

export function ProjectJobsRows({
  projectId,
  rows,
  canViewFinancials,
}: {
  projectId: string;
  rows: DbJobRollup[];
  canViewFinancials: boolean;
}) {
  const router = useRouter();
  const money = (n: number | null) =>
    canViewFinancials && n != null ? formatCurrency(n) : "—";
  const pct = (n: number | null) =>
    canViewFinancials && n != null ? formatPercent(n) : "—";

  return (
    <TableBody>
      {rows.map((j) => {
        const href = `/projects/${projectId}/jobs/${j.job_id}`;
        const go = () => router.push(href);
        return (
          <TableRow
            key={j.job_id}
            role="link"
            tabIndex={0}
            onClick={go}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
              }
            }}
            className="hover:bg-[var(--muted)]/50 cursor-pointer"
          >
            <TableCell className="text-brand-navy font-mono text-xs font-semibold">
              {j.job_type === "main_job" ? "Main" : `C.O #${j.co_number}`}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {j.job_type === "main_job" ? "Main job" : "Change order"}
            </TableCell>
            <TableCell className="text-brand-charcoal max-w-[280px] truncate text-sm">
              {j.title}
            </TableCell>
            <TableCell>
              <ProjectLifecycleBadge status={j.status as ProjectStatus} />
            </TableCell>
            <TableCell className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
              {money(j.contract)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {pct(j.billed_pct)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {money(j.po_committed)}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}
