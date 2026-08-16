"use client";

// UIDG-6 — the frame every KPI variant sits in. It owns the shared chrome (Card +
// top-accent border + label/icon header), the drill-in link, the entrance
// animation, and the four non-data states so no variant re-invents them:
//   loading     — a skeleton, no layout jump
//   restricted  — the dashed Restricted card (never a redacted-looking blank)
//   error       — a readable message
//   empty       — "Not enough data yet" (§2.8), never a fabricated zero
// The header (label) always renders in the data states so switching state never
// jumps the card. Accessibility: the whole card is a labelled region; the value
// text lives inside, so a screen reader reads "<label> … <value>" — geometry
// (rings, bars) is never the only carrier of meaning.

import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiCommon } from "./types";

interface KpiShellProps extends KpiCommon {
  children: React.ReactNode;
  /** Optional explicit accessible name (defaults to the label). */
  ariaLabel?: string;
  /** Surface overrides (the gradient variant tints the card while keeping the
   *  shared chrome + states). */
  surfaceStyle?: React.CSSProperties;
  surfaceClassName?: string;
}

export function KpiShell({
  label,
  href,
  icon: Icon,
  accent = "default",
  index = 0,
  loading = false,
  error = null,
  restricted = false,
  empty = false,
  emptyMessage = "Not enough data yet",
  className,
  children,
  ariaLabel,
  surfaceStyle,
  surfaceClassName,
}: KpiShellProps) {
  // Restricted short-circuits to the dashed card (matches the dashboard pattern).
  if (restricted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
        className={className}
      >
        <Card className="bg-muted/40 border-dashed border-t-2 border-t-[#C9A24B]/40 flex h-full flex-col gap-2 p-5">
          <div className="text-brand-charcoal/50 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            <span className="font-serif text-sm">{label}</span>
          </div>
          <div className="text-muted-foreground/80 text-2xl font-semibold tracking-tight">—</div>
          <p className="text-muted-foreground text-xs">Restricted by current role.</p>
        </Card>
      </motion.div>
    );
  }

  const accentBorder = accent === "danger" ? "border-t-red-500" : "border-t-[#C9A24B]";
  const labelColor = accent === "danger" ? "text-red-700" : "text-brand-charcoal/70";

  const header = (
    <div className="flex items-start justify-between">
      <span className={cn("font-serif text-sm tracking-wide", labelColor)}>{label}</span>
      {Icon && (
        <Icon
          className={cn("h-4 w-4 shrink-0", accent === "danger" ? "text-red-500" : "text-brand-gold")}
          aria-hidden
        />
      )}
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div
        className="mt-2 h-8 w-2/3 animate-pulse rounded"
        style={{ background: "color-mix(in oklab, var(--brand-border) 45%, transparent)" }}
        aria-hidden
      />
    );
  } else if (error) {
    body = <p className="text-muted-foreground mt-2 text-sm">{error}</p>;
  } else if (empty) {
    body = <p className="text-muted-foreground mt-2 text-sm">{emptyMessage}</p>;
  } else {
    body = children;
  }

  const card = (
    <Card
      className={cn(
        "border-t-2 bg-card flex h-full flex-col gap-2 p-5 shadow-sm transition-shadow hover:shadow-md",
        accentBorder,
        href && "cursor-pointer",
        surfaceClassName
      )}
      style={surfaceStyle}
      role="group"
      aria-label={ariaLabel ?? label}
      aria-busy={loading || undefined}
    >
      {header}
      {body}
    </Card>
  );

  const inner = href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
      className={cn("h-full", className)}
    >
      {inner}
    </motion.div>
  );
}

export type { LucideIcon };
