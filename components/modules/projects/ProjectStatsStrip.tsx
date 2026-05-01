"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: LucideIcon;
  accent?: "default" | "warning";
}

interface Props {
  active: number;
  atRisk: number;
  completedMTD: number;
  totalBacklog: number;
}

export function ProjectStatsStrip({
  active,
  atRisk,
  completedMTD,
  totalBacklog,
}: Props) {
  const stats: Stat[] = [
    { label: "Active Projects", value: active, format: formatNumber, icon: FolderOpen },
    {
      label: "At Risk",
      value: atRisk,
      format: formatNumber,
      icon: AlertTriangle,
      accent: atRisk > 0 ? "warning" : "default",
    },
    { label: "Completed MTD", value: completedMTD, format: formatNumber, icon: CheckCircle2 },
    { label: "Total Backlog", value: totalBacklog, format: formatCurrency, icon: Wallet },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((s, idx) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: idx * 0.04 }}
        >
          <Card
            className={cn(
              "border-t-2 flex h-full flex-col gap-1.5 p-4 shadow-sm transition-shadow hover:shadow-md",
              s.accent === "warning" ? "border-t-red-500" : "border-t-[#C9A24B]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-serif text-xs tracking-wide text-brand-charcoal/70">
                {s.label}
              </span>
              <s.icon
                className={cn(
                  "h-4 w-4",
                  s.accent === "warning" ? "text-red-500" : "text-brand-gold"
                )}
              />
            </div>
            <div className="text-brand-navy text-2xl font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={s.value} format={s.format} />
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
