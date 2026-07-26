"use client";

// REP-3 — Technician utilization. Window-aware (defaults to trailing 7 days).
// scheduling:view. Booked-vs-available only; no billable split.

import { OperationalReport } from "@/components/reports/OperationalReport";
import { PeriodControls } from "@/components/reports/PeriodControls";

export default function UtilizationReportPage() {
  return (
    <OperationalReport
      reportKey="labour-utilization"
      title="Technician utilization"
      description="Booked vs available hours over the window."
      renderControls={(a) => <PeriodControls {...a} />}
    />
  );
}
