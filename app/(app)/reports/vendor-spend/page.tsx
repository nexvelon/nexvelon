"use client";

// REP-3 — Vendor spend top-N. Period-aware. financials:view (spend is money).

import { OperationalReport } from "@/components/reports/OperationalReport";
import { PeriodControls } from "@/components/reports/PeriodControls";

export default function VendorSpendReportPage() {
  return (
    <OperationalReport
      reportKey="vendor-spend"
      title="Vendor spend"
      description="Top vendors by pre-tax billed spend over the period."
      renderControls={(a) => <PeriodControls {...a} />}
    />
  );
}
