"use client";

// DASH-3 — REAL inventory health: stock value by CATEGORY (getInventoryReportData
// — the mock did by-vendor with no source) + low-stock list. inventory:view gated.

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import { getInventoryHealthAction } from "@/app/(app)/dashboard/actions";
import type { InventoryHealth as InventoryHealthData } from "@/lib/api/dashboard";

export function InventoryHealth() {
  const t = useThemeColors();
  const [data, setData] = useState<InventoryHealthData | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    getInventoryHealthAction().then((r) => {
      if (r.ok) setData(r.data);
      else setRestricted(true);
    });
  }, []);

  const palette = [t.primary, t.accent, "#475569", "#1E40AF", "#0f766e", "#94a3b8"];
  const totalValue = data ? data.by_category.reduce((s, c) => s + c.value, 0) : 0;

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Inventory health</CardTitle>
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
              {totalValue === 0 ? (
                <p className="text-muted-foreground text-xs">No stock on hand.</p>
              ) : (
                <>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.by_category} dataKey="value" nameKey="category" innerRadius={38} outerRadius={64} paddingAngle={2}>
                          {data.by_category.map((_, i) => (
                            <Cell key={i} fill={palette[i % palette.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-muted-foreground mt-1 text-center text-[11px]">
                    <span className="text-brand-charcoal font-semibold tabular-nums">{formatCurrency(totalValue)}</span> total
                  </p>
                </>
              )}
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
