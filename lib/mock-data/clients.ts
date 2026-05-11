import type { Client } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied so unwired modules
// render empty states instead of fake rows. The Client type, ClientTier
// type, and the derivation helpers below are preserved — once a module is
// migrated to its real DB-backed lib/api/<module>.ts, the helpers are
// reused; for now the empty array means consumers fall through cleanly.
export const clients: Client[] = [];

// Tier metadata mirrors the screenshot — Platinum / Gold / Silver / Bronze
// based on lifetime value buckets. Used by the new Clients page.
export type ClientTier = "Platinum" | "Gold" | "Silver" | "Bronze";

export function clientTier(c: Client): ClientTier {
  if (c.totalRevenue >= 1_000_000) return "Platinum";
  if (c.totalRevenue >= 400_000) return "Gold";
  if (c.totalRevenue >= 100_000) return "Silver";
  return "Bronze";
}

export const CLIENT_TIER_BADGE: Record<ClientTier, { label: string; bg: string; text: string }> = {
  Platinum: { label: "P", bg: "#0A1226", text: "#F5F1E8" },
  Gold: { label: "G", bg: "#B8924B", text: "#0A1226" },
  Silver: { label: "S", bg: "#A8B0C4", text: "#0A1226" },
  Bronze: { label: "B", bg: "#9A7B3A", text: "#F5F1E8" },
};
