"use client";

// PROJ2-11 (6d) — a compact task summary on the project detail page: counts by
// status across the WHOLE project (job tasks + project-level), overdue in red,
// with a per-job breakdown linking into each job's Tasks tab. Read-only — tasks
// are created and moved on the job. Self-hides when the project has no tasks.
//
// Counts come from lib/tasks/task-status.ts's summarizeTasks so this card can
// never disagree with the job tab's own numbers.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listTasksForProjectAction } from "@/app/(app)/projects/task-actions";
import type { TaskRow } from "@/lib/api/job-tasks";
import {
  KANBAN_STATUSES,
  TASK_STATUS_LABEL,
  isOpen,
  isOverdue,
  summarizeTasks,
} from "@/lib/tasks/task-status";
import { cn } from "@/lib/utils";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectTasksCard({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const today = todayIso();

  useEffect(() => {
    listTasksForProjectAction(projectId, { includeJobTasks: true }).then((res) => {
      setLoaded(true);
      if (res.ok) setTasks(res.data);
    });
  }, [projectId]);

  const counts = useMemo(() => summarizeTasks(tasks, today), [tasks, today]);

  // Per-job roll-up: open + overdue for each job that has tasks.
  const byJob = useMemo(() => {
    const map = new Map<string, { label: string; open: number; overdue: number }>();
    for (const t of tasks) {
      if (!t.job_id) continue;
      const cur =
        map.get(t.job_id) ?? { label: t.job_label ?? "Job", open: 0, overdue: 0 };
      if (isOpen(t)) cur.open += 1;
      if (isOverdue(t, today)) cur.overdue += 1;
      map.set(t.job_id, cur);
    }
    return [...map.entries()].filter(([, v]) => v.open > 0);
  }, [tasks, today]);

  const projectLevelOpen = tasks.filter((t) => !t.job_id && isOpen(t)).length;

  if (!loaded || tasks.length === 0) return null;

  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Tasks{" "}
        <span className="text-muted-foreground font-normal normal-case">
          · {counts.open} open of {counts.total}
        </span>
      </p>
      <Card className="space-y-3 p-4 shadow-sm">
        {/* Counts by status */}
        <div className="flex flex-wrap items-center gap-2">
          {KANBAN_STATUSES.map((s) => (
            <span
              key={s}
              className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px]"
            >
              {TASK_STATUS_LABEL[s]}{" "}
              <span className="text-brand-charcoal font-semibold tabular-nums">
                {counts[s]}
              </span>
            </span>
          ))}
          {counts.overdue > 0 && (
            <span className="text-destructive border-destructive/40 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium">
              {counts.overdue} overdue
            </span>
          )}
        </div>

        {/* Per-job breakdown → straight into that job's Tasks tab. */}
        {byJob.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {byJob.map(([jobId, v]) => (
              <li key={jobId} className="flex items-center gap-3 py-1.5 text-xs">
                <Link
                  href={`/projects/${projectId}/jobs/${jobId}`}
                  className="text-brand-navy hover:underline"
                >
                  {v.label}
                </Link>
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {v.open} open
                </span>
                {v.overdue > 0 && (
                  <span className={cn("font-semibold tabular-nums text-red-600")}>
                    {v.overdue} overdue
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {projectLevelOpen > 0 && (
          <p className="text-muted-foreground text-[11px]">
            {projectLevelOpen} project-level task{projectLevelOpen === 1 ? "" : "s"} not
            tied to a specific job.
          </p>
        )}
      </Card>
    </div>
  );
}
