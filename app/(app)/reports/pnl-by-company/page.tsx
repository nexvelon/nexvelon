"use client";

// REP-2 — P&L by company. Per-opco, snapshot (project-to-date), financials:edit.

import { FinancialReport } from "@/components/reports/FinancialReport";

export default function PnlByCompanyReportPage() {
  return (
    <FinancialReport
      reportKey="opco-pnl"
      title="Profit & loss by company"
      description="Per-company profit & loss — never blended, project-to-date."
    />
  );
}
