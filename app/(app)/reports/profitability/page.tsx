"use client";

// REP-2 — Project profitability ranking, ranked by gross profit, snapshot,
// financials:edit.

import { FinancialReport } from "@/components/reports/FinancialReport";

export default function ProfitabilityReportPage() {
  return (
    <FinancialReport
      reportKey="profitability"
      title="Project profitability ranking"
      description="Active projects ranked by gross profit, project-to-date."
    />
  );
}
