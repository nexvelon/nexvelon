"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import type { VendorStockSlice } from "@/lib/dashboard-data";

interface Props {
  data: VendorStockSlice[];
  alerts: {
    id: string;
    sku: string;
    name: string;
    stock: number;
    reorderPoint: number;
    vendor: string;
  }[];
}

interface TooltipPayload {
  payload?: { vendor: string; value: number };
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const { vendor, value } = payload[0].payload;
  return (
    <div className="bg-card border-border rounded-md border p-3 shadow-md">
      <p className="text-brand-navy font-serif text-sm font-medium">{vendor}</p>
      <p className="text-brand-charcoal tabular-nums text-sm">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export function InventoryHealth({ data, alerts }: Props) {
  const t = useThemeColors();
  const themed = data.map((d, i) => ({ ...d, fill: t.charts[i % t.charts.length] }));
  const total = themed.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Inventory Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-4">
          <div className="relative col-span-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<DonutTooltip />} />
                <Pie
                  data={themed}
                  dataKey="value"
                  nameKey="vendor"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {themed.map((entry) => (
                    <Cell key={entry.vendor} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                Stock value
              </p>
              <p className="text-brand-navy font-serif text-lg leading-tight">
                {formatCurrency(total)}
              </p>
            </div>
          </div>

          <div className="col-span-3 space-y-2">
            {themed.map((d) => (
              <div key={d.vendor} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: d.fill }}
                  />
                  <span className="text-brand-charcoal font-medium">{d.vendor}</span>
                </div>
                <span className="text-brand-charcoal tabular-nums">
                  {formatCurrency(d.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-brand-charcoal/70 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Low-stock alerts
          </div>
          <ul className="divide-border divide-y rounded-md border">
            {alerts.length === 0 && (
              <li className="text-muted-foreground p-3 text-sm">
                All SKUs above reorder point.
              </li>
            )}
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-brand-charcoal truncate font-medium">
                    {a.name}
                  </p>
                  <p className="text-muted-foreground">
                    {a.sku} · {a.vendor}
                  </p>
                </div>
                <div className="ml-3 text-right">
                  <p className="font-semibold text-red-600 tabular-nums">
                    {a.stock}
                  </p>
                  <p className="text-muted-foreground">
                    reorder @ {a.reorderPoint}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
