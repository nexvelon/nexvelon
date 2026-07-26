"use client";

// REP-2 — AP aging by vendor, snapshot, financials:view.

import { FinancialReport } from "@/components/reports/FinancialReport";

export default function ApAgingReportPage() {
  return (
    <FinancialReport
      reportKey="ap-aging"
      title="Accounts payable aging"
      description="Open payables by vendor and age bucket, as of today."
    />
  );
}
