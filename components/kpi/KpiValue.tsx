"use client";

// UIDG-6 — the standard headline value. Screen-reader accessible (plain text),
// count-up animated for polish. Every variant that shows a primary number uses it,
// so the number always reads the same size + weight across the family.

import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";

export function KpiValue({
  value,
  format,
  animate = true,
  className = "",
}: {
  value: number;
  format: (n: number) => string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`text-brand-navy text-3xl font-semibold tracking-tight tabular-nums ${className}`}
    >
      {animate ? <AnimatedNumber value={value} format={format} /> : format(value)}
    </div>
  );
}
