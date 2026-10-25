"use client";

// REP-5 (2f) — failed scheduled runs and self-paused schedules, surfaced where
// people look: the Reports hub and the Saved reports list. Owners see their own;
// Admins see everyone's (so a schedule whose owner left can be taken over).

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { listReportProblemsAction } from "@/app/(app)/reports/saved-actions";
import type { RunProblem } from "@/lib/api/saved-reports";

export function ReportProblemsBanner() {
  const [problems, setProblems] = useState<RunProblem[]>([]);
  useEffect(() => {
    listReportProblemsAction().then((r) => r.ok && setProblems(r.data));
  }, []);
  if (problems.length === 0) return null;
  return (
    <Card className="border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] p-4 shadow-sm">
      <p className="text-destructive flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {problems.length} scheduled report{problems.length === 1 ? "" : "s"} need{problems.length === 1 ? "s" : ""} attention
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {problems.slice(0, 8).map((p) => (
          <li key={p.saved_report_id}>
            <Link href={`/reports/saved/${p.saved_report_id}`} className="text-brand-navy font-medium underline">
              {p.name}
            </Link>{" "}
            <span className="text-muted-foreground">
              {p.paused ? "— paused: " : p.run_date ? `— ${p.run_date} failed: ` : "— "}
              {p.error ?? "unknown error"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
