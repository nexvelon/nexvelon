// PROJ2-4a/4c — compact, read-only Jobs table on the project detail page. Proves
// the container model (Main Job + Change Orders) + per-Job P&L without any CRUD
// (full Job detail + editing is PROJ2-4d). Server component. Financial columns
// (Contract / Billed % / PO Committed) show dashes without financials:edit,
// same rule as PROJ2-1/2-2. Rendered from the byJob rollup (single source that
// carries contract + billed_pct + po_committed per Job).

import { Card } from "@/components/ui/card";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { ProjectJobsRows } from "@/components/modules/projects/ProjectJobsRows";

export async function ProjectJobsTable({
  projectId,
  canViewFinancials,
}: {
  projectId: string;
  canViewFinancials: boolean;
}) {
  const { byJob } = await getProjectCostRollup(projectId);
  if (byJob.length === 0) return null;

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
          {/* PROJ2-4d — rows are now client-side links to the Job detail page. */}
          <ProjectJobsRows
            projectId={projectId}
            rows={byJob}
            canViewFinancials={canViewFinancials}
          />
        </Table>
      </div>
    </Card>
  );
}
