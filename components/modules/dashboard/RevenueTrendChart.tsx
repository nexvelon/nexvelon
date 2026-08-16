"use client";

// DASH-3 — REAL trailing-12-months revenue + cash (getMonthlyRevenue). The mock
// had a fabricated EBITDA line; this renders invoiced revenue (bars) + cash
// collected (line) ONLY — no synthetic third series. financials:view gated.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { ComboChart } from "@/components/charts";
import { getRevenueTrendAction } from "@/app/(app)/dashboard/actions";
import type { MonthlyRevenuePoint } from "@/lib/api/financials";

function monthLabel(m: string): string {
  // "YYYY-MM" → "Mon 'YY"
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1] ?? mo} '${y.slice(2)}`;
}

export function RevenueTrendChart() {
  const [data, setData] = useState<(MonthlyRevenuePoint & { label: string })[] | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    getRevenueTrendAction().then((r) => {
      if (r.ok) setData(r.data.map((p) => ({ ...p, label: monthLabel(p.month) })));
      else setRestricted(true);
    });
  }, []);

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Revenue &amp; cash — trailing 12 months</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Gating preserved exactly — a restricted read renders the error state,
            never a chart. Colours now come from the wrapper (primary bars, accent
            line) instead of hand-wired hex. */}
        <ComboChart
          summary="Invoiced revenue (bars) and cash collected (line) by month, trailing 12 months"
          height={320}
          loading={!data && !restricted}
          error={restricted ? "Requires financials access." : null}
          data={data ?? []}
          xKey="label"
          bars={[{ key: "invoiced", name: "Revenue" }]}
          lines={[{ key: "collected", name: "Cash collected" }]}
          valueFormatter={formatCurrencyCompact}
          tooltipFormatter={formatCurrency}
        />
      </CardContent>
    </Card>
  );
}
