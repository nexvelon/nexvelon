import "server-only";

// PO-1 — server-only vendors API (public.vendors, migration 0030). Mirrors the
// clients API posture: cookie-aware server client so RLS is enforced and the
// caller's auth session attributes created_by/updated_by. Mutations are
// additionally gated by hasPermission(role, "inventory", ...) at the action
// layer (app/(app)/vendors/actions.ts).
//
// SEC-2 — vendors.account_number is a stored credential (a supplier/banking
// account identifier). It is encrypted at rest (account_number_encrypted, an
// AES-256-GCM envelope) and NEVER returned in a read payload. Reads expose only
// `has_account_number` (so the UI can show "••••" vs nothing, §2.8). The
// plaintext is available only through revealVendorAccountNumber(), server-side,
// behind a permission check + audit at the action layer — never in bulk.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  encryptCredential,
  decryptCredential,
  looksEncrypted,
} from "@/lib/crypto/credentials";
import type {
  DbVendor,
  DbVendorInsert,
  DbVendorUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** A vendor as it leaves the server: the two credential columns are stripped and
 *  replaced by a boolean presence flag. No caller ever receives the ciphertext
 *  or the (legacy) plaintext. */
export type VendorRead = Omit<
  DbVendor,
  "account_number" | "account_number_encrypted"
> & { has_account_number: boolean };

/** Strip both credential columns from a raw row and add the presence flag. */
function toVendorRead(row: DbVendor): VendorRead {
  const { account_number, account_number_encrypted, ...rest } = row;
  return {
    ...rest,
    has_account_number: !!account_number_encrypted || !!account_number,
  };
}

/** All vendors, active first, then alphabetical by name. Credential-stripped. */
export async function getVendors(): Promise<VendorRead[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`getVendors: ${error.message}`);
  return ((data ?? []) as DbVendor[]).map(toVendorRead);
}

/** One vendor by id, or null when not found. Credential-stripped. */
export async function getVendorById(id: string): Promise<VendorRead | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getVendorById: ${error.message}`);
  return data ? toVendorRead(data as DbVendor) : null;
}

/**
 * SEC-2 — translate an incoming plaintext account_number into the encrypted
 * column and guarantee the plaintext column is never written. Returns the DB
 * patch to spread into the insert/update.
 *   - key absent (undefined) → leave the encrypted column untouched (unchanged).
 *   - non-empty string       → encrypt it.
 *   - empty string / null    → clear the credential.
 */
function encryptAccountNumberPatch(
  payload: { account_number?: string | null }
): { account_number: null; account_number_encrypted?: string | null } {
  // Always force the legacy plaintext column to null on any write.
  const patch: { account_number: null; account_number_encrypted?: string | null } = {
    account_number: null,
  };
  if (!("account_number" in payload)) return patch; // unchanged
  const raw = payload.account_number;
  if (raw == null || raw === "") {
    patch.account_number_encrypted = null; // cleared
  } else {
    patch.account_number_encrypted = encryptCredential(raw);
  }
  return patch;
}

/** Create a vendor, stamping created_by/updated_by from the auth uid. */
export async function createVendor(payload: DbVendorInsert): Promise<VendorRead> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { account_number: _plain, ...rest } = payload;
  void _plain;
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      ...rest,
      ...encryptAccountNumberPatch(payload),
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createVendor: ${error.message}`);
  return toVendorRead(data as DbVendor);
}

/** Patch a vendor, re-stamping updated_by from the auth uid (updated_at via trigger). */
export async function updateVendor(
  id: string,
  payload: DbVendorUpdate
): Promise<VendorRead> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { account_number: _plain, ...rest } = payload;
  void _plain;
  const patch: Record<string, unknown> = { ...rest, updated_by: user?.id ?? null };
  // Only touch the encrypted column when the caller actually sent account_number.
  if ("account_number" in payload) {
    Object.assign(patch, encryptAccountNumberPatch(payload));
  }
  const { data, error } = await supabase
    .from("vendors")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateVendor: ${error.message}`);
  return toVendorRead(data as DbVendor);
}

/**
 * SEC-2 — decrypt and return ONE vendor's account number. Server-only; the
 * caller (the reveal action) MUST enforce the permission + audit before calling.
 * Returns null when no value is stored. Throws (fail-closed) when decryption is
 * impossible (missing key / tampered ciphertext) — the caller shows masked, never
 * plaintext. Handles the transition window where a row may still hold legacy
 * plaintext that the backfill has not yet encrypted.
 */
export async function revealVendorAccountNumber(id: string): Promise<string | null> {
  const supabase = await db();
  // select("*") (not an explicit column list) so this keeps working after the
  // optional 0126 migration drops the legacy plaintext column.
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`revealVendorAccountNumber: ${error.message}`);
  if (!data) return null;
  const row = data as {
    account_number?: string | null;
    account_number_encrypted: string | null;
  };
  if (row.account_number_encrypted && looksEncrypted(row.account_number_encrypted)) {
    return decryptCredential(row.account_number_encrypted);
  }
  // Pre-backfill fallback: a not-yet-encrypted legacy plaintext value.
  return row.account_number ?? null;
}

/**
 * Hard-delete a vendor. Activity-log rows for the deleted vendor SURVIVE per
 * ACT-1 design (no FK on activity_log.entity_id).
 *
 * @returns true when a row was actually removed; false when the id didn't match.
 */
export async function deleteVendor(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteVendor: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
