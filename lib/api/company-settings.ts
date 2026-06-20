import "server-only";

// Chunk 2 — org-wide key/value settings store (public.company_settings,
// migration 0028). A generic singleton: getSetting/setSetting by key. Reads are
// open to authenticated callers; writes are gated by requireAdmin at the action
// layer. The table starts empty — callers fall back to an in-code default when a
// key is absent (e.g. DEFAULT_TERMS for 'default_quote_terms').

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const DEFAULT_TERMS_KEY = "default_quote_terms";
export const DEFAULT_TERMS_GUARDIAN_KEY = "default_quote_terms_guardian";
// POLISH-6 (CHANGE 6/12) — the small-print disclaimer shown under the tier
// opt-in section and snapshotted at submit.
export const TIER_DISCLAIMER =
  "Tier requirements and benefits are updated from time to time; clients are required to maintain qualifying conditions to retain their tier benefits.";

// POLISH-7 (CHANGE 5) — the Nexvelon-discretion disclaimer. Editable in Settings
// under this key; appears beneath TIER_DISCLAIMER in the invite email + form and
// is snapshotted at submit.
export const TIER_DISCRETION_DISCLAIMER_KEY = "tier_disclaimer_text";
export const TIER_DISCRETION_DISCLAIMER_DEFAULT =
  "Tier assignment is at the sole discretion of Nexvelon Global and its operating entities. Nexvelon Global reserves the right to assign, modify, or revoke any client's prestige tier at any time, irrespective of the business volume or selections indicated by the client.";

// POLISH-5/7 — Prestige Tier description blocks. SINGLE SOURCE for the invite
// email's tier list AND the approval / tier-change outcome emails. Keyed by the
// lowercase tier name (the clients.tier column is PascalCase — see tierKey()).
// Order, highest first: Diamond > Platinum > Gold > Silver > Bronze.
export type TierLevel = "diamond" | "platinum" | "gold" | "silver" | "bronze";

// Display/iteration order (highest tier first).
export const TIER_LEVELS_ORDERED: TierLevel[] = [
  "diamond",
  "platinum",
  "gold",
  "silver",
  "bronze",
];

export const TIER_TEXT_KEYS: Record<TierLevel, string> = {
  diamond: "tier_diamond_text",
  platinum: "tier_platinum_text",
  gold: "tier_gold_text",
  silver: "tier_silver_text",
  bronze: "tier_bronze_text",
};

export const TIER_TEXT_DEFAULTS: Record<TierLevel, string> = {
  diamond:
    "Diamond — for clients who lock in a 3 to 5 year exclusive contract entrusting Nexvelon Global with 100% of their security and related work across all of their sites, while remaining exclusively partnered with us for all security needs. Top-tier benefits: white-glove account management, the deepest exclusive discounts and promotions, and first-access to new services with priority service across all engagements. Best-in-class discounts along with extended warranties on many items. Includes one complimentary 1-week international all-inclusive vacation package annually courtesy of Nexvelon Global, one year of complimentary ULC fire alarm monitoring services, and a host of other premium benefits reserved exclusively for Diamond clients.",
  platinum:
    "Platinum — for clients who bring $1,000,000 or more of annual business with us and remain exclusively partnered with Nexvelon Global for all security needs. High-tier benefits with enhanced discounts and exclusive promotions. Includes one complimentary 1-week international all-inclusive vacation package annually courtesy of Nexvelon Global, one year of complimentary ULC fire alarm monitoring services, and additional premium benefits.",
  gold:
    "Gold — for clients who consolidate all of their security, access control, CCTV, and ULC fire alarm monitoring work with us exclusively, with at least $500,000 of annual business. Benefits include preferred response times, exclusive promotional pricing, and dedicated account support.",
  silver:
    "Silver — For clients bringing at least $500,000 in business annually. Enjoy priority scheduling and modest loyalty discounts on parts and labour.",
  bronze:
    "Bronze — for clients who bring business with us occasionally. Standard pricing and service levels apply.",
};

/** Map a PascalCase clients.tier value (e.g. "Diamond") to its lowercase key. */
export function tierKey(tier: string): TierLevel | null {
  const k = tier.toLowerCase();
  return (TIER_LEVELS_ORDERED as string[]).includes(k) ? (k as TierLevel) : null;
}

/** The Nexvelon-discretion disclaimer (Settings override, else default). */
export async function getTierDiscretionDisclaimer(): Promise<string> {
  try {
    const v = await getSetting(TIER_DISCRETION_DISCLAIMER_KEY);
    return v && v.trim() !== "" ? v : TIER_DISCRETION_DISCLAIMER_DEFAULT;
  } catch {
    return TIER_DISCRETION_DISCLAIMER_DEFAULT;
  }
}

async function db() {
  return createSupabaseServerClient();
}

/** The five tier description texts (Settings override, else the in-code default). */
export async function getTierTexts(): Promise<Record<TierLevel, string>> {
  const levels = TIER_LEVELS_ORDERED;
  const out = {} as Record<TierLevel, string>;
  await Promise.all(
    levels.map(async (t) => {
      let v: string | null = null;
      try {
        v = await getSetting(TIER_TEXT_KEYS[t]);
      } catch {
        v = null;
      }
      out[t] = v && v.trim() !== "" ? v : TIER_TEXT_DEFAULTS[t];
    })
  );
  return out;
}

/** Read a setting's value, or null when the key isn't set. */
export async function getSetting(key: string): Promise<string | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`getSetting: ${error.message}`);
  return (data?.value as string | undefined) ?? null;
}

/** Upsert a setting's value, stamping the caller as updated_by. */
export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("company_settings")
    .upsert(
      { key, value, updated_by: user?.id ?? null },
      { onConflict: "key" }
    );
  if (error) throw new Error(`setSetting: ${error.message}`);
}
