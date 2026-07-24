"use client";

// PROJ2-14/19 — one badge for the shared expiry vocabulary (lib/expiry-state.ts)
// so warranties and bonds render their derived state identically.

import type { ExpiryState } from "@/lib/expiry-state";
import { cn } from "@/lib/utils";

const TONE: Record<ExpiryState, { label: string; cls: string }> = {
  no_expiry: { label: "No expiry", cls: "bg-muted text-muted-foreground" },
  active: { label: "Active", cls: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]" },
  expiring_soon: { label: "Expiring", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  expired: { label: "Expired", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
};

export function ExpiryBadge({ state, label }: { state: ExpiryState; label?: string }) {
  const t = TONE[state];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", t.cls)}>
      {label ?? t.label}
    </span>
  );
}
