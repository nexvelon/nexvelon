"use client";

// REP-5 — Saved reports: every report saved with its filters, its schedule (if
// any), and how its last run went. Gated reports:view (server-side in the action).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportProblemsBanner } from "@/components/reports/ReportProblemsBanner";
import { listSavedReportsAction } from "@/app/(app)/reports/saved-actions";
import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { describeParams } from "@/lib/reports/saved-params";
import { describeSchedule } from "@/lib/reports/schedule";
import type { SavedReportListRow } from "@/lib/api/saved-reports";
import { cn } from "@/lib/utils";

const RUN_TONE: Record<string, string> = {
  delivered: "text-[var(--brand-status-green)]",
  partial: "text-amber-700",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  running: "text-muted-foreground",
};

export default function SavedReportsPage() {
  const [rows, setRows] = useState<SavedReportListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSavedReportsAction().then((r) => (r.ok ? setRows(r.data) : setError(r.error)));
  }, []);

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[12px] font-medium">
        <ArrowLeft className="h-3.5 w-3.5" /> Reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Saved reports"
        description="Reports saved with their filters. Open one to run it again or have it emailed on a schedule."
      />
      <ReportProblemsBanner />

      {error && (
        <Card className="bg-card p-6 text-sm shadow-sm">
          <p className="text-destructive">{error}</p>
        </Card>
      )}
      {!error && rows === null && (
        <Card className="bg-card p-6 shadow-sm">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </Card>
      )}
      {rows && rows.length === 0 && (
        <Card className="bg-card p-8 text-center shadow-sm">
          <p className="text-brand-navy font-serif text-lg">No saved reports yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Open any report, set its filters, and click <strong>Save</strong>.
          </p>
        </Card>
      )}
      {rows && rows.length > 0 && (
        <Card className="bg-card overflow-x-auto p-0 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-[11px] uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Report · filters</th>
                <th className="px-4 py-2">Schedule</th>
                <th className="px-4 py-2">Last run</th>
                <th className="px-4 py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/reports/saved/${r.id}`} className="text-brand-navy font-medium underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {REPORT_CATALOG[r.report_key]?.title ?? r.report_key}
                    <span className="text-muted-foreground block">{describeParams(r.report_key, r.params ?? {})}</span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.schedule ? (
                      <>
                        {describeSchedule({ cadence: r.schedule.cadence, dayOfWeek: r.schedule.day_of_week, dayOfMonth: r.schedule.day_of_month })}
                        <span className="text-muted-foreground block">
                          {r.schedule.active ? `${r.recipient_count} recipient${r.recipient_count === 1 ? "" : "s"}` : "Paused"}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.last_run ? (
                      <span className={cn("capitalize", RUN_TONE[r.last_run.status])}>
                        {r.last_run.status} · {r.last_run.run_date}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">{r.owner_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
