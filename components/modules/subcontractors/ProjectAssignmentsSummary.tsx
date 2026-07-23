"use client";

// SUB-6 — a read-only "who's on this project" roll-up on the project detail
// page: everyone assigned across the project's jobs, with a link into each job.
// Self-hides when nobody is assigned. Managing assignments happens on the job.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listAssignmentsForProjectAction } from "@/app/(app)/projects/assignment-actions";
import type { AssignmentRow } from "@/lib/api/job-assignments";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  lead: "Lead", crew: "Crew", supervisor: "Supervisor", specialist: "Specialist", other: "Other",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  completed: "bg-muted text-muted-foreground",
  removed: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

export function ProjectAssignmentsSummary({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listAssignmentsForProjectAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [projectId]);

  if (!loaded || rows.length === 0) return null;

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Assigned{" "}
        <span className="text-muted-foreground font-normal normal-case">· {activeCount} active</span>
      </p>
      <Card className="bg-card p-0 shadow-sm">
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="text-brand-charcoal font-medium">{r.assignee_name}</span>
              <span className="text-muted-foreground rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px]">
                {ROLE_LABEL[r.role] ?? r.role}
              </span>
              {r.assignee_kind === "tech" && (
                <span className="text-muted-foreground text-[10px]">(in-house)</span>
              )}
              <span className="text-muted-foreground text-xs">
                {r.scope === "job" && r.job_id ? (
                  <Link href={`/projects/${projectId}/jobs/${r.job_id}`} className="hover:underline">
                    {r.job_label ?? "Job"}
                  </Link>
                ) : (
                  "Project-wide"
                )}
              </span>
              <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status])}>
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
