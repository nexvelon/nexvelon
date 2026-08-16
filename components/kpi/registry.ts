// UIDG-6 — the enumerable KPI-variant registry. UIDG-10 draws its widget catalog
// from here (name, description, the data shape each needs, and sample props for a
// live preview); UIDG-8's layout model can render any entry by its Component with
// the shared KpiCommon contract. Keeping this list is what makes the family
// discoverable rather than ten loose exports.
//
// `sample` props are for the catalog PREVIEW only — they are never presented to a
// user as real dashboard data (§2.8).

import type { ComponentType } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { KpiPlain } from "./variants/KpiPlain";
import { KpiSparkline } from "./variants/KpiSparkline";
import { KpiRing } from "./variants/KpiRing";
import { KpiProgress } from "./variants/KpiProgress";
import { KpiTarget } from "./variants/KpiTarget";
import { KpiDual } from "./variants/KpiDual";
import { KpiGradient } from "./variants/KpiGradient";
import { KpiMicro } from "./variants/KpiMicro";
import { KpiHalfDonut } from "./variants/KpiHalfDonut";
import { KpiStatList } from "./variants/KpiStatList";

export type KpiVariantId =
  | "plain"
  | "sparkline"
  | "ring"
  | "progress"
  | "target"
  | "dual"
  | "gradient"
  | "micro"
  | "halfDonut"
  | "statList";

export interface KpiVariantMeta {
  id: KpiVariantId;
  name: string;
  /** One line for the catalog. */
  description: string;
  /** The data a caller must supply (human-readable — the placement contract). */
  requires: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<any>;
  /** Preview props for the catalog (sample data — not real). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sample: Record<string, any>;
}

export const KPI_VARIANTS: KpiVariantMeta[] = [
  {
    id: "plain",
    name: "Plain metric",
    description: "Label, value, optional delta pill.",
    requires: "value + format (delta optional)",
    Component: KpiPlain,
    sample: { label: "Deposits held", value: 42500, format: formatCurrency },
  },
  {
    id: "sparkline",
    name: "Metric + sparkline",
    description: "Value with an inline trend line.",
    requires: "value + format + real history series (≥2 points)",
    Component: KpiSparkline,
    sample: {
      label: "Revenue",
      value: 128400,
      format: formatCurrency,
      series: [90, 102, 96, 118, 121, 128],
    },
  },
  {
    id: "ring",
    name: "Metric + ring gauge",
    description: "Raw value with a fill ring against a max.",
    requires: "value + max + format (max must be a real ceiling)",
    Component: KpiRing,
    sample: { label: "Techs booked", value: 42, max: 60, format: formatNumber },
  },
  {
    id: "progress",
    name: "Progress ring",
    description: "A bounded percentage as a hero ring.",
    requires: "value (percentage)",
    Component: KpiProgress,
    sample: { label: "Blended margin", value: 34.2, caption: "gross margin" },
  },
  {
    id: "target",
    name: "Target bar",
    description: "Actual vs target with a ghost remainder track.",
    requires: "actual + target + format (target must exist)",
    Component: KpiTarget,
    sample: { label: "Billed vs contract", actual: 60000, target: 100000, format: formatCurrency },
  },
  {
    id: "dual",
    name: "Dual metric",
    description: "Two related values split by a divider.",
    requires: "primary + secondary metrics",
    Component: KpiDual,
    sample: {
      label: "Accounts receivable",
      primary: { label: "Outstanding", value: 84000, format: formatCurrency },
      secondary: { label: "Overdue", value: 12000, format: formatCurrency, tone: "bad" },
    },
  },
  {
    id: "gradient",
    name: "Gradient tile",
    description: "A tinted tile for a headline number.",
    requires: "value + format",
    Component: KpiGradient,
    sample: { label: "Revenue · MTD", value: 128400, format: formatCurrency },
  },
  {
    id: "micro",
    name: "Micro-chart tile",
    description: "Value with a dense bar strip beneath.",
    requires: "value + format + real bar series",
    Component: KpiMicro,
    sample: { label: "Daily volume", value: 312, format: formatNumber, bars: [4, 7, 5, 9, 6, 8, 11] },
  },
  {
    id: "halfDonut",
    name: "Half-donut gauge",
    description: "A value on a semicircular scale.",
    requires: "value + max + format",
    Component: KpiHalfDonut,
    sample: { label: "Capacity", value: 72, max: 100, format: (v: number) => `${Math.round(v)}%` },
  },
  {
    id: "statList",
    name: "Stat list",
    description: "3–5 label/value rows for grouped small metrics.",
    requires: "rows[]",
    Component: KpiStatList,
    sample: {
      label: "WIP position",
      rows: [
        { label: "Net", value: -8000, format: formatCurrency },
        { label: "Overbilled", value: 22000, format: formatCurrency, tone: "bad" },
        { label: "Underbilled", value: 30000, format: formatCurrency, tone: "good" },
      ],
    },
  },
];
