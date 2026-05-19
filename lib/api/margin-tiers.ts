import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

export interface DbMarginTier {
  id: string;
  category: string;
  tier_1: number;
  tier_2: number;
  tier_3: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export async function listMarginTiers(
  opts: { includeInactive?: boolean } = {}
): Promise<DbMarginTier[]> {
  const supabase = await db();
  let query = supabase.from("margin_tiers").select("*");
  if (!opts.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query.order("display_order", {
    ascending: true,
  });
  if (error) {
    throw new Error(`Failed to list margin tiers: ${error.message}`);
  }
  return (data ?? []) as DbMarginTier[];
}

// audit-field uid stamp: mirrors lib/api/classifications.ts — the established
// idiom is `supabase.auth.getUser()` → user.id. created_by / updated_by are
// auth.users(id) per migration 0010.

export async function createMarginTier(payload: {
  category: string;
  tier_1: number;
  tier_2: number;
  tier_3: number;
  display_order: number;
  is_active?: boolean;
}): Promise<DbMarginTier> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("margin_tiers")
    .insert({
      category: payload.category,
      tier_1: payload.tier_1,
      tier_2: payload.tier_2,
      tier_3: payload.tier_3,
      display_order: payload.display_order,
      is_active: payload.is_active ?? true,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createMarginTier: ${error.message}`);
  return data as DbMarginTier;
}

export async function updateMarginTier(
  id: string,
  payload: Partial<{
    category: string;
    tier_1: number;
    tier_2: number;
    tier_3: number;
    display_order: number;
    is_active: boolean;
  }>
): Promise<DbMarginTier> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("margin_tiers")
    .update({ ...payload, updated_by: user?.id ?? null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateMarginTier: ${error.message}`);
  return data as DbMarginTier;
}

/**
 * Soft-delete (deactivate) a margin tier — sets is_active=false. Never
 * hard-deletes here (past-data preservation). Guarded by is_active=true so a
 * second deactivate is a no-op.
 * @returns true if an active row was deactivated; false otherwise.
 */
export async function softDeleteMarginTier(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("margin_tiers")
    .update({ is_active: false, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error(`softDeleteMarginTier: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Restore a deactivated margin tier — sets is_active=true. Guarded by
 * is_active=false so a restore on an active row is a no-op.
 * @returns true if an inactive row was reactivated; false otherwise.
 */
export async function restoreMarginTier(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("margin_tiers")
    .update({ is_active: true, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", false)
    .select("id");
  if (error) throw new Error(`restoreMarginTier: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Permanently removes a margin tier row. Irreversible. Nothing FKs to this
 * table — it is display-only config; deleting a tier has no transactional
 * side effects (Snapshot Principle: line margins are stored on the line item).
 */
export async function hardDeleteMarginTier(id: string): Promise<boolean> {
  const supabase = await db();
  const { error } = await supabase
    .from("margin_tiers")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to hard-delete margin tier: ${error.message}`);
  }
  return true;
}
