"use client";

// SCHED-1 — the dispatch service-job backlog + booking surface (NOT the drag
// board; that's SCHED-2). Gated by scheduling:view; mutations re-gate at
// scheduling:edit in the server actions.

import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Can } from "@/lib/role-context";
import { ScheduleJobsManager } from "@/components/modules/scheduling/ScheduleJobsManager";

export default function ScheduleJobsPage() {
  return (
    <Can resource="scheduling" action="view" fallback={<Restricted />}>
      <ScheduleJobsManager />
    </Can>
  );
}

function Restricted() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Contact your administrator for access to scheduling.
        </p>
      </Card>
    </div>
  );
}
