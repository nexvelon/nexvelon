"use client";

// REP-2 — AR aging by client, snapshot, financials:view.

import { FinancialReport } from "@/components/reports/FinancialReport";

export default function ArAgingReportPage() {
  return (
    <FinancialReport
      reportKey="ar-aging"
      title="Accounts receivable aging"
      description="Open receivables by client and age bucket, as of today."
    />
  );
}
