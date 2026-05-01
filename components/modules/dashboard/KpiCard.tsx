"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "./AnimatedNumber";

interface KpiCardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  delta?: number;
  deltaFormat?: (n: number) => string;
  trendInverted?: boolean;
  icon?: LucideIcon;
  accent?: "default" | "danger";
  footer?: React.ReactNode;
  index?: number;
}

function trendColor(delta: number, inverted: boolean): string {
  if (delta === 0) return "text-muted-foreground";
  const positive = inverted ? delta < 0 : delta > 0;
  return positive ? "text-emerald-600" : "text-red-600";
}

function TrendIcon({ delta, inverted }: { delta: number; inverted: boolean }) {
  if (delta === 0) return <Minus className="h-3.5 w-3.5" />;
  const up = inverted ? delta < 0 : delta > 0;
  return up ? (
    <ArrowUpRight className="h-3.5 w-3.5" />
  ) : (
    <ArrowDownRight className="h-3.5 w-3.5" />
  );
}

export function KpiCard({
  label,
  value,
  format,
  delta,
  deltaFormat,
  trendInverted = false,
  icon: Icon,
  accent = "default",
  footer,
  index = 0,
}: KpiCardProps) {
  const accentBorder =
    accent === "danger" ? "border-t-red-500" : "border-t-[#C9A24B]";
  const labelColor =
    accent === "danger" ? "text-red-700" : "text-brand-charcoal/70";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card
        className={cn(
          "border-t-2 bg-card flex h-full flex-col gap-2 p-5 shadow-sm transition-shadow hover:shadow-md",
          accentBorder
        )}
      >
        <div className="flex items-start justify-between">
          <span className={cn("font-serif text-sm tracking-wide", labelColor)}>
            {label}
          </span>
          {Icon && (
            <Icon
              className={cn(
                "h-4 w-4",
                accent === "danger" ? "text-red-500" : "text-brand-gold"
              )}
            />
          )}
        </div>

        <div className="text-brand-navy text-3xl font-semibold tracking-tight tabular-nums">
          <AnimatedNumber value={value} format={format} />
        </div>

        {delta !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trendColor(delta, trendInverted)
            )}
          >
            <TrendIcon delta={delta} inverted={trendInverted} />
            <span>{deltaFormat ? deltaFormat(delta) : `${(delta * 100).toFixed(1)}%`}</span>
            <span className="text-muted-foreground font-normal">vs prev period</span>
          </div>
        )}

        {footer && <div className="mt-1">{footer}</div>}
      </Card>
    </motion.div>
  );
}
