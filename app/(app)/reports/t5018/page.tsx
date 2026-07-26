"use client";

// REP-2 — T5018 contractor payments. Year-aware. financials:edit. The year
// options come from getT5018YearsAction (the real years with sub payments); the
// current year is always offered so a fresh year can be started.

import { useEffect, useState } from "react";
import { getT5018YearsAction } from "@/app/(app)/financials/actions";
import { FinancialReport } from "@/components/reports/FinancialReport";

const CURRENT_YEAR = new Date().getFullYear();

export default function T5018ReportPage() {
  const [years, setYears] = useState<number[]>([CURRENT_YEAR]);

  useEffect(() => {
    getT5018YearsAction().then((res) => {
      if (res.ok) {
        const set = new Set<number>([CURRENT_YEAR, ...res.data]);
        setYears([...set].sort((a, b) => b - a));
      }
    });
  }, []);

  return (
    <FinancialReport
      reportKey="t5018"
      title="T5018 — contractor payments"
      description="Annual subcontractor payment report (tax-inclusive)."
      initialParams={{ year: CURRENT_YEAR }}
      renderControls={({ params, setParams, pending }) => (
        <label className="text-muted-foreground text-[11px]">
          <span className="mb-1 block uppercase tracking-wide">Reporting year</span>
          <select
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            value={params.year ?? CURRENT_YEAR}
            disabled={pending}
            onChange={(e) => setParams({ ...params, year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}
    />
  );
}
