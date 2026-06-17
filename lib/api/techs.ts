import "server-only";

// JC-1 — server-only techs API (public.techs, migration 0054). Cookie-aware
// server client so RLS is enforced. Mutations are gated by requireAdmin at the
// action layer (settings/techs-actions.ts), mirroring manufacturers. The list
// feeds the Settings → Techs pane and the project Add-labour Select.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbTech } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** All techs — active first, then inactive, each group alphabetical by name. */
export async function listTechs(): Promise<DbTech[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("techs")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`listTechs: ${error.message}`);
  return (data ?? []) as DbTech[];
}

/** Create a tech. Name must be unique (DB enforces). */
export async function createTech(
  name: string,
  default_cost_rate: number | null = null
): Promise<DbTech> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("techs")
    .insert({ name, default_cost_rate })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`"${name}" already exists.`);
    throw new Error(`createTech: ${error.message}`);
  }
  return data as DbTech;
}

/** Update a tech's name, default cost rate, and/or active flag. */
export async function updateTech(
  id: string,
  patch: { name?: string; default_cost_rate?: number | null; is_active?: boolean }
): Promise<DbTech> {
  const supabase = await db();
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.default_cost_rate !== undefined)
    fields.default_cost_rate = patch.default_cost_rate;
  if (patch.is_active !== undefined) fields.is_active = patch.is_active;
  const { data, error } = await supabase
    .from("techs")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`That name already exists.`);
    throw new Error(`updateTech: ${error.message}`);
  }
  return data as DbTech;
}

/**
 * Delete a tech — blocked while any labour entry still references it. The FK is
 * ON DELETE SET NULL (so the DB wouldn't stop us), but a tech with history
 * should be Deactivated, not deleted: deleting would orphan those entries'
 * tech_id and lose the link. We check first and refuse with a clear message.
 */
export async function deleteTech(id: string): Promise<boolean> {
  const supabase = await db();
  const { count, error: countErr } = await supabase
    .from("labour_entries")
    .select("id", { count: "exact", head: true })
    .eq("tech_id", id);
  if (countErr) throw new Error(`deleteTech: ${countErr.message}`);
  if ((count ?? 0) > 0) {
    throw new Error(
      "This tech has labour entries and can't be deleted. Deactivate it instead."
    );
  }
  const { data, error } = await supabase
    .from("techs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteTech: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
