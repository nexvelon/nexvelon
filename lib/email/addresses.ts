import "server-only";

// MAIL-2 — the SERVER-ONLY resolver for operational email addresses. Reads the
// company_settings KV (migration 0028; no new table) with a safe per-field
// default, and NEVER throws — a failed read returns the full defaults so a
// settings outage can never break sending (esp. the auth/OTP path).
//
// All the client-safe config (keys, defaults, labels, types, the per-opco
// resolver and the pure validators) lives in ./address-config and is re-exported
// here so existing server importers keep working; the client Settings pane
// imports ./address-config directly to avoid pulling "server-only" into the
// browser bundle.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  EMAIL_ADDRESS_KEYS,
  EMAIL_ADDRESS_DEFAULTS,
  type EmailAddressField,
  type ResolvedEmailAddresses,
} from "@/lib/email/address-config";

export * from "@/lib/email/address-config";

/** Read all email-address settings in one query, falling back per-field to the
 *  in-code default when a row is absent OR blank. Never throws. */
export async function getEmailAddresses(): Promise<ResolvedEmailAddresses> {
  const out = { ...EMAIL_ADDRESS_DEFAULTS };
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("company_settings")
      .select("key, value")
      .in("key", Object.values(EMAIL_ADDRESS_KEYS));
    if (error) throw new Error(error.message);
    const byKey = new Map(
      (data ?? []).map((r) => [(r as { key: string }).key, (r as { value: string | null }).value])
    );
    (Object.keys(EMAIL_ADDRESS_KEYS) as EmailAddressField[]).forEach((field) => {
      const raw = byKey.get(EMAIL_ADDRESS_KEYS[field]);
      if (raw && raw.trim()) out[field] = raw.trim();
    });
  } catch (e) {
    console.error("[email] getEmailAddresses failed — using defaults:", e);
  }
  return out;
}
