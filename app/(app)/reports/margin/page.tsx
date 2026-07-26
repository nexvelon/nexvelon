"use client";

// REP-2 — Margin analysis. Per-project quoted-vs-actual margin, snapshot,
// financials:edit.

import { FinancialReport } from "@/components/reports/FinancialReport";

export default function MarginReportPage() {
  return (
    <FinancialReport
      reportKey="margin"
      title="Margin analysis"
      description="Quoted vs actual margin by project, project-to-date."
    />
  );
}
