"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useThemeColors } from "@/lib/theme-context";
import type { UtilizationRow } from "@/lib/dashboard-data";

interface Props {
  rows: UtilizationRow[];
}

function useBandColor() {
  const t = useThemeColors();
  return (u: number): { bar: string; label: string } => {
    if (u >= 0.8) return { bar: t.accent, label: "text-amber-600" };
    if (u >= 0.5) return { bar: t.primary, label: "text-brand-navy" };
    return { bar: "#DC2626", label: "text-red-600" };
  };
}

const ROLE_LABEL: Record<string, string> = {
  Technician: "Technician",
  ProjectManager: "Project Mgr",
  Subcontractor: "Subcontractor",
};

export function TechnicianUtilization({ rows }: Props) {
  const bandColor = useBandColor();
  const t = useThemeColors();
  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">
          Technician Utilization — This week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rows.map((r, idx) => {
            const c = bandColor(r.utilization);
            return (
              <div key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-brand-charcoal font-medium">
                      {r.name}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {ROLE_LABEL[r.role] ?? r.role}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-semibold tabular-nums ${c.label}`}
                    >
                      {Math.round(r.utilization * 100)}%
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {r.billableHours}/{r.capacityHours}h
                    </span>
                  </div>
                </div>
                <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: c.bar }}
                    initial={{ width: 0 }}
                    animate={{ width: `${r.utilization * 100}%` }}
                    transition={{
                      duration: 0.9,
                      delay: idx * 0.05,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-muted-foreground mt-5 flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} /> ≥ 80%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: t.primary }} /> 50–80%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#DC2626]" /> &lt; 50%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
