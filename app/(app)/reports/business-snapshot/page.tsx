"use client";

// REP-4 — Business snapshot. Real operating metrics ONLY. As-of. financials:edit.
// The note makes the honesty explicit: this is NOT a business valuation.

import { OperationalReport } from "@/components/reports/OperationalReport";

export default function BusinessSnapshotReportPage() {
  return (
    <OperationalReport
      reportKey="business-snapshot"
      eyebrow="Overview"
      title="Business snapshot"
      description="Real operating metrics — run-rate, margin, backlog and working-capital position."
      note="Operating snapshot — real figures only. This is NOT a business valuation: it contains no earnings multiple, no recurring-revenue (MRR) line, and no bank-cash balance, because the system holds no source for those."
    />
  );
}
