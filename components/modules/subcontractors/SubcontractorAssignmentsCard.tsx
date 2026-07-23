"use client";

// SUB-6 — the Assignments card on the sub detail page (replaces the SUB-1
// placeholder). Every job/project this sub is on, with status. The mid-job
// lapse case (§4): if the sub's required compliance is expired/missing AND it
// still has ACTIVE assignments, a red banner surfaces it — assignments are
// flagged, never silently removed when a doc lapses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAssignmentsForSubcontractorAction } from "@/app/(app)/projects/assignment-actions";
import type { AssignmentRow } from "@/lib/api/job-assignments";
import type { WorstState } from "@/lib/subcontractors/compliance-status";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  lead: "Lead", crew: "Crew", supervisor: "Supervisor", specialist: "Specialist", other: "Other",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  completed: "bg-muted text-muted-foreground",
  removed: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

export function SubcontractorAssignmentsCard({
  subcontractorId,
  complianceWorst,
}: {
  subcontractorId: string;
  complianceWorst: WorstState | null;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listAssignmentsForSubcontractorAction(subcontractorId).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [subcontractorId]);

  const activeCount = rows.filter((r) => r.status === "active").length;
  // 'expired' from the SUB-2 summary already folds in missing-required.
  const lapsed = complianceWorst === "expired" && activeCount > 0;

  return (
    <Card className="space-y-3 p-4 shadow-sm">
      <h3 className="text-brand-navy font-serif text-lg">Assignments</h3>

      {lapsed && (
        <div className="border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-destructive rounded-md border px-3 py-2 text-xs">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            This subcontractor has {activeCount} active assignment
            {activeCount === 1 ? "" : "s"} but lapsed compliance.
          </p>
          <p className="text-destructive/80 mt-0.5">
            Existing assignments are not removed automatically — review them, and
            renew the documents above before issuing new work.
          </p>
        </div>
      )}

      {!loaded ? null : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">
          Not assigned to any jobs. Assign this subcontractor from a job&rsquo;s detail page.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Project</TableHead>
                <TableHead className="text-[11px] uppercase">Scope</TableHead>
                <TableHead className="text-[11px] uppercase">Role</TableHead>
                <TableHead className="text-[11px] uppercase">Dates</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {r.project_number ? (
                      <Link href={`/projects/${r.project_id}`} className="text-brand-navy hover:underline">
                        {r.project_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.scope === "job" ? (r.job_label ?? "Job") : "Project-wide"}
                  </TableCell>
                  <TableCell className="text-xs">{ROLE_LABEL[r.role] ?? r.role}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.start_date || r.end_date ? `${r.start_date ?? "…"} → ${r.end_date ?? "…"}` : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status])}>
                      {r.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
