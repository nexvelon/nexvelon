"use client";

// DASH-3 — REAL inventory health: stock value by CATEGORY (getInventoryReportData
// — the mock did by-vendor with no source) + low-stock list. inventory:view gated.

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { DonutChart } from "@/components/charts";
import { getInventoryHealthAction } from "@/app/(app)/dashboard/actions";
import type { InventoryHealth as InventoryHealthData } from "@/lib/api/dashboard";

export function InventoryHealth() {
  const [data, setData] = useState<InventoryHealthData | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    getInventoryHealthAction().then((r) => {
      if (r.ok) setData(r.data);
      else setRestricted(true);
    });
  }, []);

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Inventory health <span className="text-muted-foreground text-xs font-normal">· as of today</span></CardTitle>
      </CardHeader>
      <CardContent>
        {restricted ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Lock className="h-4 w-4" /> Requires inventory access.
          </div>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Value by category */}
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] uppercase tracking-wide">Value by category</p>
              {/* UIDG-5 — donut via the wrapper. Slice colours now come from
                  seriesColor (distinct past 5 categories — the old palette[i %]
                  made the 6th category identical to the 1st), tooltip is themed,
                  and the total moves into the donut centre. */}
              <DonutChart
                summary="Inventory value by category"
                height={150}
                data={data.by_category.map((c) => ({ name: c.category, value: c.value }))}
                valueFormatter={formatCurrency}
                centerCaption="total"
                emptyMessage="No stock on hand."
              />
            </div>

            {/* Low stock */}
            <div>
              <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                Low stock
                {data.low_stock_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> {data.low_stock_count}
                  </span>
                )}
              </p>
              {data.low_stock_count === 0 ? (
                <p className="text-[var(--brand-status-green)] text-xs font-medium">✓ All stocked</p>
              ) : (
                <ul className="max-h-[150px] space-y-1 overflow-y-auto">
                  {data.low_stock.slice(0, 8).map((p) => (
                    <li key={p.product_id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate" style={{ color: "var(--brand-primary)" }}>{p.name}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        <span className="font-semibold text-amber-600">{p.on_hand}</span> / {p.reorder_point}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
