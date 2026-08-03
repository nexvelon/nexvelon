"use server";

// CLEAN-1 §4c — real-source breadcrumb labels. The top-bar breadcrumb used to
// resolve project/quote names from lib/mock-data arrays that are now empty, so a
// detail route rendered the raw uuid. These tiny reads resolve the id against the
// live tables instead. RLS applies (the action runs as the signed-in user); an
// unknown/inaccessible id resolves to null and the caller falls back to the uuid.

import { createClient } from "@/lib/supabase/server";

export async function resolveProjectCrumbAction(
  id: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("project_number, title")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return data.project_number || data.title || null;
}

export async function resolveQuoteCrumbAction(
  id: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotes")
    .select("number")
    .eq("id", id)
    .maybeSingle();
  return data?.number ?? null;
}
