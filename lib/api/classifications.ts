import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

export interface DbLineItemClassification {
  id: string;
  name: string;
  applies_to: "product" | "labor" | "misc" | "both" | "service";
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export async function listClassifications(
  opts: { includeInactive?: boolean } = {}
): Promise<DbLineItemClassification[]> {
  const supabase = await db();
  let query = supabase.from("line_item_classifications").select("*");
  if (!opts.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query.order("display_order", {
    ascending: true,
  });
  if (error) {
    throw new Error(`Failed to list classifications: ${error.message}`);
  }
  return (data ?? []) as DbLineItemClassification[];
}

// audit-field uid stamp: mirrors softDeleteClient in lib/api/clients.ts
// (createClient there does NOT stamp audit fields; the established uid-stamp
// idiom in this codebase is `supabase.auth.getUser()` → user.id, used for
// deleted_by). created_by / updated_by are auth.users(id) per migration 0008.

export async function createClassification(payload: {
  name: string;
  applies_to: "product" | "labor" | "misc" | "both" | "service";
  display_order: number;
  is_active?: boolean;
}): Promise<DbLineItemClassification> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("line_item_classifications")
    .insert({
      name: payload.name,
      applies_to: payload.applies_to,
      display_order: payload.display_order,
      is_active: payload.is_active ?? true,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createClassification: ${error.message}`);
  return data as DbLineItemClassification;
}

export async function updateClassification(
  id: string,
  payload: Partial<{
    name: string;
    applies_to: "product" | "labor" | "misc" | "both" | "service";
    display_order: number;
    is_active: boolean;
  }>
): Promise<DbLineItemClassification> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("line_item_classifications")
    .update({ ...payload, updated_by: user?.id ?? null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateClassification: ${error.message}`);
  return data as DbLineItemClassification;
}

/**
 * Soft-delete (deactivate) a classification — sets is_active=false. Never
 * hard-deletes (past-data preservation principle). Guarded by is_active=true
 * so a second deactivate is a no-op.
 * @returns true if an active row was deactivated; false otherwise.
 */
export async function softDeleteClassification(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("line_item_classifications")
    .update({ is_active: false, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error(`softDeleteClassification: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Restore a deactivated classification — sets is_active=true. Guarded by
 * is_active=false so a restore on an active row is a no-op.
 * @returns true if an inactive row was reactivated; false otherwise.
 */
export async function restoreClassification(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("line_item_classifications")
    .update({ is_active: true, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", false)
    .select("id");
  if (error) throw new Error(`restoreClassification: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Permanently removes a classification row. Unlike softDeleteClassification
 * this is irreversible. Line items do NOT FK to this table — quotes that
 * already reference the name keep their snapshotted data unchanged.
 */
export async function hardDeleteClassification(id: string): Promise<boolean> {
  const supabase = await db();
  const { error } = await supabase
    .from("line_item_classifications")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to hard-delete classification: ${error.message}`);
  }
  return true;
}
