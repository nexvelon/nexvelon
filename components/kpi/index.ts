// UIDG-6 — the KPI card family. Import variants from here; the shared contract is
// KpiCommon (types.ts); the enumerable catalog is KPI_VARIANTS (registry.ts).

export type { KpiCommon, DeltaSpec } from "./types";
export { KpiShell } from "./KpiShell";
export { KpiValue } from "./KpiValue";
export { DeltaPill } from "./DeltaPill";

export { KpiPlain } from "./variants/KpiPlain";
export type { KpiPlainProps } from "./variants/KpiPlain";
export { KpiSparkline } from "./variants/KpiSparkline";
export type { KpiSparklineProps } from "./variants/KpiSparkline";
export { KpiRing } from "./variants/KpiRing";
export type { KpiRingProps } from "./variants/KpiRing";
export { KpiProgress } from "./variants/KpiProgress";
export type { KpiProgressProps } from "./variants/KpiProgress";
export { KpiTarget } from "./variants/KpiTarget";
export type { KpiTargetProps } from "./variants/KpiTarget";
export { KpiDual } from "./variants/KpiDual";
export type { KpiDualProps } from "./variants/KpiDual";
export { KpiGradient } from "./variants/KpiGradient";
export type { KpiGradientProps } from "./variants/KpiGradient";
export { KpiMicro } from "./variants/KpiMicro";
export type { KpiMicroProps } from "./variants/KpiMicro";
export { KpiHalfDonut } from "./variants/KpiHalfDonut";
export type { KpiHalfDonutProps } from "./variants/KpiHalfDonut";
export { KpiStatList } from "./variants/KpiStatList";
export type { KpiStatListProps, KpiStatRow } from "./variants/KpiStatList";

export { KPI_VARIANTS } from "./registry";
export type { KpiVariantId, KpiVariantMeta } from "./registry";
