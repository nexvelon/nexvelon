"use client";

// REP-2 — HST net position. Period-aware (from/to) and per-opco. financials:edit.
// Blank period = all periods to date.

import { Input } from "@/components/ui/input";
import { FinancialReport } from "@/components/reports/FinancialReport";

export default function HstReportPage() {
  return (
    <FinancialReport
      reportKey="hst"
      title="HST net position"
      description="Per-company HST collected, input tax credits and net owing."
      renderControls={({ params, setParams, pending }) => (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-muted-foreground text-[11px]">
            <span className="mb-1 block uppercase tracking-wide">From</span>
            <Input
              type="date"
              className="h-8 w-40"
              value={params.from ?? ""}
              disabled={pending}
              onChange={(e) => setParams({ ...params, from: e.target.value || undefined })}
            />
          </label>
          <label className="text-muted-foreground text-[11px]">
            <span className="mb-1 block uppercase tracking-wide">To</span>
            <Input
              type="date"
              className="h-8 w-40"
              value={params.to ?? ""}
              disabled={pending}
              onChange={(e) => setParams({ ...params, to: e.target.value || undefined })}
            />
          </label>
        </div>
      )}
    />
  );
}
