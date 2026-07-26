"use client";

// REP-3 — Sales pipeline. Period-aware. quotes:view.

import { OperationalReport } from "@/components/reports/OperationalReport";
import { PeriodControls } from "@/components/reports/PeriodControls";

export default function PipelineReportPage() {
  return (
    <OperationalReport
      reportKey="pipeline"
      title="Sales pipeline"
      description="Quotes by stage — count, value and conversion rate."
      renderControls={(a) => <PeriodControls {...a} />}
    />
  );
}
