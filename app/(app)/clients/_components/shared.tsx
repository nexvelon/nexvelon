// Shared helpers for the Clients module — used by both the list view
// (ClientsView / ClientRow) and the extracted right-panel components.

import type { DbClientTier } from "@/lib/types/database";

// Tier → badge styling. Shared by ClientRow (the list) and ClientHeader.
export const TIER_BADGE: Record<
  DbClientTier,
  { label: string; bg: string; text: string }
> = {
  Platinum: { label: "P", bg: "var(--brand-primary)", text: "var(--brand-bg)" },
  Gold: { label: "G", bg: "var(--brand-accent)", text: "var(--brand-primary)" },
  Silver: { label: "S", bg: "#A8B0C4", text: "#0A1226" },
  Bronze: { label: "B", bg: "var(--brand-accent-soft)", text: "var(--brand-bg)" },
};

/** First-letter initials (max 2) from a name — used for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
