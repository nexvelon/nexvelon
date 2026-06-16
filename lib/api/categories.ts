import "server-only";

// PART-FIX-2 — server-only category-tree API (public.inventory_categories,
// migration 0052). Arbitrary-depth tree; sub-categories are local to a parent
// (UNIQUE(parent_id, name)). Cookie-aware server client (RLS); mutations gated
// by requireAdmin at the action layer (settings/category-actions.ts), mirroring
// manufacturers.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbInventoryCategory,
  DbInventoryCategoryUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** Every category node, ordered for stable tree assembly. */
export async function listCategories(): Promise<DbInventoryCategory[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listCategories: ${error.message}`);
  return (data ?? []) as DbInventoryCategory[];
}

export async function createCategory(
  name: string,
  parentId: string | null
): Promise<DbInventoryCategory> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_categories")
    .insert({ name, parent_id: parentId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`"${name}" already exists under this parent.`);
    }
    throw new Error(`createCategory: ${error.message}`);
  }
  return data as DbInventoryCategory;
}

export async function updateCategory(
  id: string,
  patch: DbInventoryCategoryUpdate
): Promise<DbInventoryCategory> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_categories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("A sibling with that name already exists.");
    }
    throw new Error(`updateCategory: ${error.message}`);
  }
  return data as DbInventoryCategory;
}

/** Delete a node. ON DELETE CASCADE removes its whole subtree;
 *  inventory_products.category_id is ON DELETE SET NULL. */
export async function deleteCategory(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_categories")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteCategory: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Resolve the root→leaf name path for a set of category ids, in one query.
 * Returns a map of leaf id → ["Access Control", "Cables", "FT6"]. Used to give
 * each product its categoryPath for the tree-aware filter.
 */
export async function resolveCategoryPaths(
  ids: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return out;

  // The tree is small — load it all and walk parents in JS.
  const all = await listCategories();
  const byId = new Map(all.map((c) => [c.id, c]));
  for (const leaf of wanted) {
    const path: string[] = [];
    let node = byId.get(leaf);
    const guard = new Set<string>(); // cycle safety
    while (node && !guard.has(node.id)) {
      path.unshift(node.name);
      guard.add(node.id);
      node = node.parent_id ? byId.get(node.parent_id) : undefined;
    }
    if (path.length > 0) out.set(leaf, path);
  }
  return out;
}
