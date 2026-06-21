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
// POLISH-10 (CHANGE 10) — stronger legal language affirming sole discretion.
// Default only; admin-edited Settings rows are preserved.
export const TIER_DISCRETION_DISCLAIMER_DEFAULT =
  "Tier eligibility, assignment, and continuation are determined exclusively at the sole discretion of Nexvelon Global and its operating entities. Nexvelon Global reserves the unconditional right to assign, withhold, modify, suspend, or revoke any client's prestige tier and any associated benefits at any time, in whole or in part, for any reason or for no reason, regardless of the business volume, exclusivity arrangements, or selections indicated by the client.\n\nTier benefits are provided as a courtesy and do not constitute a contractual obligation. All benefits, terms, and tier requirements are subject to change without prior notice. The client acknowledges and agrees that participation in the tier program is voluntary and that Nexvelon Global's decisions regarding tier matters are final and not subject to dispute, arbitration, or further review.";

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

// POLISH-9 — polished marketing copy (headline + "- " bullets per the parser,
// lib/tier-text-parser.ts). Defaults only; admin-edited Settings rows are never
// overwritten. "entrusting" removed from Diamond per spec.
export const TIER_TEXT_DEFAULTS: Record<TierLevel, string> = {
  diamond: [
    "Diamond — For 3 to 5 year exclusive contract partners. The pinnacle of our partnership program.",
    "- White-glove account management with dedicated executive contact",
    "- Deepest exclusive discounts and the strongest promotional pricing",
    "- Extended warranties on installations and equipment",
    "- First access to new services and emerging technologies",
    "- Priority service across all engagements without exception",
    "- Complimentary 1-week international all-inclusive vacation annually courtesy of Nexvelon Global",
    "- 1 year of complimentary ULC fire alarm monitoring services",
    "- Additional curated benefits reserved exclusively for Diamond clients",
  ].join("\n"),
  platinum: [
    "Platinum — For $1M+ annual exclusive partners. Enhanced benefits across the board.",
    "- Enhanced discounts and exclusive promotions",
    "- Complimentary 1-week international all-inclusive vacation annually courtesy of Nexvelon Global",
    "- 1 year of complimentary ULC fire alarm monitoring services",
    "- Premium account support with priority service across all engagements",
  ].join("\n"),
  gold: [
    "Gold — Exclusive partnership for clients who consolidate all security work with us, $500K+ annually.",
    "- Sole-source for all security, access control, CCTV, and ULC fire alarm monitoring",
    "- Preferred response times across all engagements",
    "- Exclusive promotional pricing and seasonal offers",
    "- Dedicated account support and project coordination",
  ].join("\n"),
  silver: [
    "Silver — Built on $500,000+ in annual partnership with Nexvelon Global.",
    "- Priority scheduling on all service requests",
    "- Loyalty discounts on parts and labour",
    "- Recognized as a valued partner",
  ].join("\n"),
  bronze: [
    "Bronze — Welcome aboard. Standard partnership pricing and service.",
    "- Standard service levels and response times",
    "- Standard pricing across all services",
  ].join("\n"),
};

// Low → high display order for the invite email + form tier cards (CHANGE 3).
export const TIER_LEVELS_ASCENDING: TierLevel[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
];

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
