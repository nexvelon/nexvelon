"use client";

// UIDG-5 — the ONE themed tooltip. Pass it to any Recharts chart as
// `content={<ChartTooltipContent formatter={…} />}`. This is exactly what the two
// default-white Recharts tooltips UIDG-4B had to patch by hand per-file
// eliminate: it reads the theme (light + dark) itself.

import { useChartTheme } from "./useChartTheme";

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
}

export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** Format a series value (e.g. formatCurrency). Defaults to String(). */
  formatter?: (value: number | string, name?: string) => string;
  /** Format the header label. Defaults to String(). */
  labelFormatter?: (label: string | number) => string;
  /** Hide the header row (e.g. for a single-category donut). */
  hideLabel?: boolean;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  hideLabel,
}: ChartTooltipContentProps) {
  const ct = useChartTheme();
  if (!active || !payload?.length) return null;

  const fmt = formatter ?? ((v: number | string) => String(v));

  return (
    <div
      className="rounded-md p-2.5 text-xs shadow-md"
      style={{
        background: ct.tooltipBg,
        border: `1px solid ${ct.tooltipBorder}`,
        color: ct.tooltipFg,
      }}
    >
      {!hideLabel && label !== undefined && label !== "" && (
        <p className="mb-1 font-serif text-sm font-medium" style={{ color: ct.tooltipFg }}>
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={entry.dataKey ?? i} className="flex items-center gap-2">
            {entry.color && (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
                aria-hidden
              />
            )}
            {entry.name && (
              <span style={{ color: ct.tooltipMuted }}>{entry.name}:</span>
            )}
            <span className="font-medium tabular-nums" style={{ color: ct.tooltipFg }}>
              {fmt(entry.value ?? 0, entry.name)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
