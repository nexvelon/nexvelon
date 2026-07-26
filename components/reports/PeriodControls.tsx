"use client";

// REP-3 — the shared From/To date range control for the period-aware
// operational reports (pipeline, utilization, vendor spend). Blank = all time /
// the report's default window.

import { Input } from "@/components/ui/input";
import type { OperationalReportParams } from "@/app/(app)/reports/operational-actions";

export function PeriodControls({
  params,
  setParams,
  pending,
}: {
  params: OperationalReportParams;
  setParams: (next: OperationalReportParams) => void;
  pending: boolean;
}) {
  return (
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
  );
}
