"use client";

// PROJ2-16 (6c) — the "Field activity" card on the project detail page: the last
// ~7 days of site logs across the project's jobs, each linking into its day's
// report. The "what happened on site this week" glance. Self-hides when there's
// no recent activity.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudSun, Users, Clock, Camera } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getRecentLogsForProjectAction } from "@/app/(app)/projects/site-log-actions";
import type { SiteLogListRow } from "@/lib/api/site-logs";
import { cn } from "@/lib/utils";

export function ProjectFieldActivityCard({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<SiteLogListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getRecentLogsForProjectAction(projectId, 7).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [projectId]);

  if (!loaded || rows.length === 0) return null;

  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Field activity{" "}
        <span className="text-muted-foreground font-normal normal-case">· last 7 days</span>
      </p>
      <Card className="bg-card p-0 shadow-sm">
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/projects/${projectId}/jobs/${r.job_id}`}
                  className="text-brand-navy font-mono font-medium tabular-nums hover:underline"
                >
                  {r.log_date}
                </Link>
                {r.job_label && <span className="text-muted-foreground">{r.job_label}</span>}
                {r.weather && (
                  <span className="text-muted-foreground inline-flex items-center gap-1"><CloudSun className="h-3 w-3" /> {r.weather}</span>
                )}
                <span className="text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r.crew_count}</span>
                {r.hours_total > 0 && <span className="text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.hours_total}h</span>}
                {r.photo_count > 0 && <span className="text-muted-foreground inline-flex items-center gap-1"><Camera className="h-3 w-3" /> {r.photo_count}</span>}
                <span
                  className={cn(
                    "ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                    r.status === "submitted"
                      ? "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {r.status === "submitted" ? "Submitted" : "Draft"}
                </span>
              </div>
              {r.work_performed && (
                <p className="text-muted-foreground mt-0.5 line-clamp-1">{r.work_performed}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
