import "server-only";

// PART-FORM B1 — server-only manufacturers API (public.manufacturers,
// migration 0044). Cookie-aware server client so RLS is enforced. Mutations are
// gated by requireAdmin at the action layer (settings/manufacturers-actions.ts),
// mirroring the inventory-vocab settings posture. The list feeds the part form's
// Manufacturer dropdown; inventory_products.manufacturer stays free text.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbManufacturer } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** All manufacturers, alphabetical by name. */
export async function listManufacturers(): Promise<DbManufacturer[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("manufacturers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(`listManufacturers: ${error.message}`);
  return (data ?? []) as DbManufacturer[];
}

/** Create a manufacturer. Name must be unique (DB enforces). */
export async function createManufacturer(name: string): Promise<DbManufacturer> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("manufacturers")
    .insert({ name })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`"${name}" already exists.`);
    }
    throw new Error(`createManufacturer: ${error.message}`);
  }
  return data as DbManufacturer;
}

/** Rename a manufacturer. */
export async function renameManufacturer(
  id: string,
  name: string
): Promise<DbManufacturer> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("manufacturers")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`"${name}" already exists.`);
    }
    throw new Error(`renameManufacturer: ${error.message}`);
  }
  return data as DbManufacturer;
}

/** Delete a manufacturer. Existing parts keep their free-text value. */
export async function deleteManufacturer(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("manufacturers")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteManufacturer: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
