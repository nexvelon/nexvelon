"use client";

import { useMemo } from "react";
import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import type { FunnelStage } from "@/lib/dashboard-data";

interface Props {
  data: FunnelStage[];
}

interface TooltipPayload {
  payload?: { name: string; value: number };
}

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const { name, value } = payload[0].payload;
  return (
    <div className="bg-card border-border rounded-md border p-3 shadow-md">
      <p className="text-brand-navy font-serif text-sm font-medium">{name}</p>
      <p className="text-brand-charcoal tabular-nums text-sm">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export function PipelineFunnel({ data }: Props) {
  const t = useThemeColors();
  const themed = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        fill: t.charts[i % t.charts.length],
      })),
    [data, t]
  );

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Project Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip content={<FunnelTooltip />} />
              <Funnel dataKey="value" data={themed} isAnimationActive>
                {themed.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList
                  position="right"
                  fill={t.text}
                  stroke="none"
                  fontSize={12}
                  dataKey="name"
                />
                <LabelList
                  position="center"
                  fill="#FFFFFF"
                  stroke="none"
                  fontSize={11}
                  dataKey="value"
                  formatter={(v: unknown) => formatCurrencyCompact(Number(v))}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
