"use client";

// DASH-3 — REAL trailing-12-months revenue + cash (getMonthlyRevenue). The mock
// had a fabricated EBITDA line; this renders invoiced revenue (bars) + cash
// collected (line) ONLY — no synthetic third series. financials:view gated.

import { useEffect, useState } from "react";
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
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import { getRevenueTrendAction } from "@/app/(app)/dashboard/actions";
import type { MonthlyRevenuePoint } from "@/lib/api/financials";

interface TooltipPayload {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

function monthLabel(m: string): string {
  // "YYYY-MM" → "Mon 'YY"
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1] ?? mo} '${y.slice(2)}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border-border rounded-md border p-3 shadow-md">
      <p className="text-brand-navy font-serif text-sm font-medium">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.name ?? entry.dataKey}:</span>
            <span className="text-brand-charcoal font-medium tabular-nums">{formatCurrency(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RevenueTrendChart() {
  const t = useThemeColors();
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
        {restricted ? (
          <div className="text-muted-foreground flex h-[320px] items-center justify-center gap-2 text-sm">
            <Lock className="h-4 w-4" /> Requires financials access.
          </div>
        ) : !data ? (
          <div className="text-muted-foreground flex h-[320px] items-center justify-center text-sm">Loading…</div>
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={t.border} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: t.chartTertiary, fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: t.chartTertiary, fontSize: 12 }} tickFormatter={(v) => formatCurrencyCompact(Number(v))} width={64} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: `${t.primary}10` }} />
                <Bar dataKey="invoiced" name="Revenue" fill={t.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="collected" name="Cash collected" stroke={t.accent} strokeWidth={2.5} dot={{ r: 3, fill: t.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
