"use client";

// PROJ2-12 (6c) — a compact deficiency summary on the project detail page: open
// and safety-severity counts across the project's jobs, red when any safety
// item is open. Self-hides when the project has no deficiencies. Counts come
// from lib/deficiencies/deficiency-status.ts so this can't disagree with the tab.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { getProjectDeficiencyCountsAction } from "@/app/(app)/projects/deficiency-actions";
import type { DeficiencyCounts } from "@/lib/deficiencies/deficiency-status";
import { cn } from "@/lib/utils";

export function ProjectDeficienciesCard({ projectId }: { projectId: string }) {
  const [counts, setCounts] = useState<DeficiencyCounts | null>(null);

  useEffect(() => {
    getProjectDeficiencyCountsAction(projectId).then((res) => {
      if (res.ok) setCounts(res.data);
    });
  }, [projectId]);

  if (!counts || counts.total === 0) return null;

  const hasSafety = counts.open_safety > 0;

  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Deficiencies{" "}
        <span className="text-muted-foreground font-normal normal-case">
          · {counts.open} open of {counts.total}
        </span>
      </p>
      <Card
        className={cn(
          "flex flex-wrap items-center gap-3 p-4 shadow-sm",
          hasSafety && "border-destructive/40"
        )}
      >
        {hasSafety && (
          <span className="text-destructive inline-flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            {counts.open_safety} open safety
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Open <span className="text-brand-charcoal font-semibold tabular-nums">{counts.open}</span>
        </span>
        {counts.overdue > 0 && (
          <span className="text-destructive text-xs font-medium">
            {counts.overdue} overdue
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Closed <span className="text-brand-charcoal font-semibold tabular-nums">{counts.closed}</span>
        </span>
        <span className="text-muted-foreground ml-auto text-[11px]">
          Manage deficiencies on each job&rsquo;s Deficiencies tab.
        </span>
      </Card>
    </div>
  );
}
