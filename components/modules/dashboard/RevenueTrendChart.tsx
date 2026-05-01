"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatCurrencyCompact,
} from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import type { MonthlyTrendPoint } from "@/lib/dashboard-data";

interface Props {
  data: MonthlyTrendPoint[];
}

interface TooltipPayload {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border-border rounded-md border p-3 shadow-md">
      <p className="text-brand-navy font-serif text-sm font-medium">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <div
            key={entry.dataKey}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground capitalize">
              {entry.name ?? entry.dataKey}:
            </span>
            <span className="text-brand-charcoal font-medium tabular-nums">
              {formatCurrency(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RevenueTrendChart({ data }: Props) {
  const t = useThemeColors();
  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">
          Revenue & EBITDA — Trailing 12 months
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid stroke={t.border} vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: t.chartTertiary, fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: t.chartTertiary, fontSize: 12 }}
                tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                width={64}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: `${t.primary}10` }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={t.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                type="monotone"
                dataKey="ebitda"
                name="EBITDA"
                stroke={t.accent}
                strokeWidth={2.5}
                dot={{ r: 3, fill: t.accent, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
