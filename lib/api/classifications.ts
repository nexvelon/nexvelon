import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

export interface DbLineItemClassification {
  id: string;
  name: string;
  applies_to: "product" | "labor" | "misc" | "both";
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

// Phase 3 will add: createClassification, updateClassification,
// deleteClassification (soft delete via is_active=false). Stubs not added now
// to keep this PR's scope tight.
