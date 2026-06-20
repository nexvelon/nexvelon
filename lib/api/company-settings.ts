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

// POLISH-5 — Prestige Tier description blocks. SINGLE SOURCE for the invite
// email's tier list AND the approval / tier-change outcome emails. Keyed by the
// lowercase tier name (the clients.tier column is PascalCase — see tierKey()).
export type TierLevel = "bronze" | "silver" | "gold" | "platinum";

export const TIER_TEXT_KEYS: Record<TierLevel, string> = {
  bronze: "tier_bronze_text",
  silver: "tier_silver_text",
  gold: "tier_gold_text",
  platinum: "tier_platinum_text",
};

export const TIER_TEXT_DEFAULTS: Record<TierLevel, string> = {
  bronze:
    "Bronze — for clients who bring business with us occasionally. Standard pricing and service levels apply.",
  silver:
    "Silver — For clients bringing at least $500,000 in business annually. Enjoy priority scheduling and modest loyalty discounts on parts and labour.",
  gold:
    "Gold — for clients who consolidate all of their security, access control, CCTV, and ULC fire alarm monitoring work with us exclusively, with at least $500,000 of annual business. Benefits include preferred response times, exclusive promotional pricing, and dedicated account support.",
  platinum:
    "Platinum — for clients who bring $1,000,000 or more of annual business and remain exclusively partnered with Nexvelon Global for all security needs. Top-tier benefits include white-glove account management, the deepest exclusive discounts and promotions, first-access to new services along with priority service, and extended warranty on installations. Also includes one complimentary 1-week international all-inclusive vacation package annually, courtesy of Nexvelon Global, plus one year of complimentary ULC fire alarm monitoring services, and much more.",
};

/** Map a PascalCase clients.tier value (e.g. "Gold") to its lowercase key. */
export function tierKey(tier: string): TierLevel | null {
  const k = tier.toLowerCase();
  return k === "bronze" || k === "silver" || k === "gold" || k === "platinum"
    ? (k as TierLevel)
    : null;
}

async function db() {
  return createSupabaseServerClient();
}

/** The four tier description texts (Settings override, else the in-code default). */
export async function getTierTexts(): Promise<Record<TierLevel, string>> {
  const levels: TierLevel[] = ["bronze", "silver", "gold", "platinum"];
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
