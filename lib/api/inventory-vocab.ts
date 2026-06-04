import "server-only";

// Chunk B-1 — settings-managed inventory vocabularies (category / manufacturer
// / unit_of_measure / storage_location). Mirrors lib/api/classifications.ts:
// is_active soft-delete + restore, audit-uid stamp via auth.getUser(), one row
// per (kind, name). Backed by public.inventory_vocab (migration 0023).
//
// Storage-location specials: the seeded 'Default' location is protected (cannot
// be deactivated), and deactivating any other storage location reassigns its
// existing stock rows to 'Default' so no unit is left pointing at a dead value.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type VocabKind =
  | "category"
  | "manufacturer"
  | "unit_of_measure"
  | "storage_location";

export interface DbInventoryVocab {
  id: string;
  kind: VocabKind;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

async function db() {
  return createSupabaseServerClient();
}

/** List vocab rows for a kind, ordered by display_order then name. */
export async function listVocab(
  kind: VocabKind,
  opts: { includeInactive?: boolean } = {}
): Promise<DbInventoryVocab[]> {
  const supabase = await db();
  let query = supabase.from("inventory_vocab").select("*").eq("kind", kind);
  if (!opts.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listVocab: ${error.message}`);
  return (data ?? []) as DbInventoryVocab[];
}

/** Create a vocab value, appended after the current max display_order. */
export async function createVocab(
  kind: VocabKind,
  name: string
): Promise<DbInventoryVocab> {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Name is required.");

  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Append at the end of the kind's list.
  const { data: last } = await supabase
    .from("inventory_vocab")
    .select("display_order")
    .eq("kind", kind)
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = (last?.[0]?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("inventory_vocab")
    .insert({
      kind,
      name: trimmed,
      display_order: nextOrder,
      is_active: true,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`"${trimmed}" already exists in this list.`);
    }
    throw new Error(`createVocab: ${error.message}`);
  }
  return data as DbInventoryVocab;
}

/** Update a vocab row (rename / reorder / activate). uid-stamped. */
export async function updateVocab(
  id: string,
  payload: Partial<{ name: string; display_order: number; is_active: boolean }>
): Promise<DbInventoryVocab> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const patch = { ...payload, updated_by: user?.id ?? null };
  if (typeof patch.name === "string") patch.name = patch.name.trim();

  const { data, error } = await supabase
    .from("inventory_vocab")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("That name already exists in this list.");
    }
    throw new Error(`updateVocab: ${error.message}`);
  }
  return data as DbInventoryVocab;
}

/**
 * Soft-delete (deactivate) a vocab value — sets is_active=false.
 * Storage-location specials:
 *   - 'Default' is protected and cannot be deactivated.
 *   - deactivating any other storage location reassigns its stock rows to
 *     'Default' so no inventory_stock.location points at a dead value.
 * @returns true if an active row was deactivated.
 */
export async function softDeleteVocab(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the row first — we need kind + name for the storage-location rules.
  const { data: row, error: fetchErr } = await supabase
    .from("inventory_vocab")
    .select("kind, name")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new Error(`softDeleteVocab: ${fetchErr.message}`);
  if (!row) return false;

  if (row.kind === "storage_location") {
    if (row.name === "Default") {
      throw new Error("The Default storage location can't be removed.");
    }
    // Reassign any stock sitting in this location to Default before deactivating.
    const { error: reassignErr } = await supabase
      .from("inventory_stock")
      .update({ location: "Default" })
      .eq("location", row.name);
    if (reassignErr) {
      throw new Error(`softDeleteVocab/reassign: ${reassignErr.message}`);
    }
  }

  const { data, error } = await supabase
    .from("inventory_vocab")
    .update({ is_active: false, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error(`softDeleteVocab: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Restore a deactivated vocab value — sets is_active=true. */
export async function restoreVocab(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("inventory_vocab")
    .update({ is_active: true, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("is_active", false)
    .select("id");
  if (error) throw new Error(`restoreVocab: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
