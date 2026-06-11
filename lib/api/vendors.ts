import "server-only";

// PO-1 — server-only vendors API (public.vendors, migration 0030). Mirrors the
// clients API posture: cookie-aware server client so RLS is enforced and the
// caller's auth session attributes created_by/updated_by. Mutations are
// additionally gated by hasPermission(role, "inventory", ...) at the action
// layer (app/(app)/vendors/actions.ts).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbVendor,
  DbVendorInsert,
  DbVendorUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** All vendors, active first, then alphabetical by name. */
export async function getVendors(): Promise<DbVendor[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`getVendors: ${error.message}`);
  return (data ?? []) as DbVendor[];
}

/** One vendor by id, or null when not found. */
export async function getVendorById(id: string): Promise<DbVendor | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getVendorById: ${error.message}`);
  return (data as DbVendor | null) ?? null;
}

/** Create a vendor, stamping created_by/updated_by from the auth uid. */
export async function createVendor(payload: DbVendorInsert): Promise<DbVendor> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("vendors")
    .insert({ ...payload, created_by: user?.id ?? null, updated_by: user?.id ?? null })
    .select("*")
    .single();
  if (error) throw new Error(`createVendor: ${error.message}`);
  return data as DbVendor;
}

/** Patch a vendor, re-stamping updated_by from the auth uid (updated_at via trigger). */
export async function updateVendor(
  id: string,
  payload: DbVendorUpdate
): Promise<DbVendor> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("vendors")
    .update({ ...payload, updated_by: user?.id ?? null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateVendor: ${error.message}`);
  return data as DbVendor;
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
