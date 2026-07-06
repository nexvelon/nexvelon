// PROJ2-4a/4c — compact, read-only Jobs table on the project detail page. Proves
// the container model (Main Job + Change Orders) + per-Job P&L without any CRUD
// (full Job detail + editing is PROJ2-4d). Server component. Financial columns
// (Contract / Billed % / PO Committed) show dashes without financials:edit,
// same rule as PROJ2-1/2-2. Rendered from the byJob rollup (single source that
// carries contract + billed_pct + po_committed per Job).

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { ProjectLifecycleBadge } from "@/components/modules/projects/ProjectLifecycleBadge";
import type { ProjectStatus } from "@/lib/types/database";

export async function ProjectJobsTable({
  projectId,
  canViewFinancials,
}: {
  projectId: string;
  canViewFinancials: boolean;
}) {
  const { byJob } = await getProjectCostRollup(projectId);
  if (byJob.length === 0) return null;

  const money = (n: number | null) =>
    canViewFinancials && n != null ? formatCurrency(n) : "—";
  const pct = (n: number | null) =>
    canViewFinancials && n != null ? formatPercent(n) : "—";

  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-brand-navy font-serif text-sm font-semibold">Jobs</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">#</TableHead>
              <TableHead className="text-[11px] uppercase">Type</TableHead>
              <TableHead className="text-[11px] uppercase">Title</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Contract</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Billed %</TableHead>
              <TableHead className="text-right text-[11px] uppercase">PO Committed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byJob.map((j) => (
              <TableRow key={j.job_id}>
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
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
