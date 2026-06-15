"use client";

// INV-6 — inventory reports. Lazy-fetches aggregated data (computed server-side
// over real inventory_stock rows, §2.4-accurate) when this tab mounts. Three
// sections: Stock Valuation (by category), Aging (by acquired_at bucket), and
// Consumption-90d (a turnover PROXY, clearly labeled). All $ figures are gated
// behind inventory:viewCost; unit counts always render.

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { useThemeColors } from "@/lib/theme-context";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getInventoryReportDataAction } from "@/app/(app)/inventory/actions";
import { LowStockReport } from "./LowStockReport";
import type { InventoryReportData } from "@/lib/api/products";

export function ReportsTab() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const t = useThemeColors();

  const [data, setData] = useState<InventoryReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getInventoryReportDataAction()
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // PARTS-3: the Low Stock report is self-contained, so it renders in every
  // state — even while the aggregate charts load or fail.
  if (loading) {
    return (
      <div className="space-y-6">
        <LowStockReport showCost={showCost} />
        <Card className="bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">Loading reports…</p>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <LowStockReport showCost={showCost} />
        <Card className="bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            Couldn’t load reports. Try again shortly.
          </p>
        </Card>
      </div>
    );
  }

  const valuationData = data.valuationByCategory.map((c, i) => ({
    label: c.category,
    value: c.value,
    units: c.units,
    fill: t.charts[i % t.charts.length],
  }));
  const agingData = data.aging.map((a) => ({
    label: a.bucket,
    value: a.value,
    units: a.units,
  }));
  const hasInStock = data.valuationByCategory.length > 0;

  return (
    <div className="space-y-6">
      {/* PARTS-3: Low Stock report — most actionable, shown first. */}
      <LowStockReport showCost={showCost} />

      {/* Stock Valuation */}
      <Card className="bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
            Stock Valuation{" "}
            <span className="text-muted-foreground font-normal">
              (in-stock units)
            </span>
          </h2>
          {showCost && (
            <span className="text-brand-navy text-lg font-semibold tabular-nums">
              {formatCurrency(data.totalValuation)}
            </span>
          )}
        </div>

        {!hasInStock ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No in-stock units to value yet.
          </p>
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={valuationData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--brand-text)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--brand-text)" }}
                    tickLine={false}
                    axisLine={false}
                    width={showCost ? 64 : 40}
                  />
                  <Tooltip
                    content={
                      <ReportTooltip showValue={showCost} valueLabel="Value" />
                    }
                  />
                  <Bar
                    dataKey={showCost ? "value" : "units"}
                    radius={[4, 4, 0, 0]}
                  >
                    {valuationData.map((d) => (
                      <Cell key={d.label} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Category breakdown table */}
            <ul className="mt-4 space-y-1.5">
              {valuationData.map((d) => (
                <li
                  key={d.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: d.fill }}
                    />
                    <span className="text-brand-charcoal">{d.label}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(d.units)} units
                    {showCost && (
                      <span className="text-brand-charcoal ml-3 font-medium">
                        {formatCurrency(d.value)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Aging */}
      <Card className="bg-card p-5 shadow-sm">
        <h2 className="text-brand-navy mb-3 text-sm font-semibold tracking-wide uppercase">
          Aging{" "}
          <span className="text-muted-foreground font-normal">
            (in-stock units by age, days)
          </span>
        </h2>
        {!hasInStock ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No in-stock units to age yet.
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={agingData}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--brand-text)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--brand-text)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<ReportTooltip showValue={showCost} valueLabel="Value" />}
                />
                <Bar dataKey="units" radius={[4, 4, 0, 0]} fill={t.primary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Consumption (90 days) — turnover proxy */}
      <Card className="bg-card p-5 shadow-sm">
        <h2 className="text-brand-navy mb-3 text-sm font-semibold tracking-wide uppercase">
          Consumption · last 90 days
        </h2>
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
              Units consumed / retired
            </p>
            <p className="text-brand-navy text-2xl font-semibold tabular-nums">
              {formatNumber(data.consumption90d.units)}
            </p>
          </div>
          {showCost && (
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Value consumed / retired
              </p>
              <p className="text-brand-navy text-2xl font-semibold tabular-nums">
                {formatCurrency(data.consumption90d.value)}
              </p>
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-3 text-xs italic">
          Approximate — based on units marked consumed/retired in the last 90
          days. Full inventory turnover requires a movements ledger (future).
        </p>
      </Card>
    </div>
  );
}

function ReportTooltip({
  active,
  payload,
  showValue,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { label: string; units: number; value: number } }>;
  showValue: boolean;
  valueLabel: string;
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-card border-border rounded-md border p-3 shadow-md">
      <p className="text-brand-navy font-serif text-sm font-medium">{p.label}</p>
      <p className="text-brand-charcoal text-xs tabular-nums">
        {formatNumber(p.units)} units
      </p>
      {showValue && (
        <p className="text-brand-charcoal text-xs tabular-nums">
          {valueLabel}: {formatCurrency(p.value)}
        </p>
      )}
    </div>
  );
}
