import "server-only";

// UIDG-4 — data layer for public.custom_themes (schema landed in 0117).
//
// Reads (picker/resolution) use the session client, so RLS enforces "own OR
// published". Admin-scoped writes (publish, or editing/deleting another user's
// theme) use the service-role admin client AFTER the action layer has checked
// the caller's permission — the same authorised-privileged-write pattern as
// lib/api/settings-audit.ts and lib/api/ui-theme.ts. Tokens are validated on
// every write (the DB only enforces "is an object").

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateThemeTokens } from "@/lib/theme-validate";
import type { ThemeTokens } from "@/lib/theme";
import type { DbCustomTheme } from "@/lib/types/database";

export interface CustomThemeSummary {
  id: string;
  name: string;
  createdBy: string;
  isMine: boolean;
  isPublished: boolean;
  baseThemeKey: string | null;
  tokens: ThemeTokens;
}

/** Themes visible to the user (their own + any published), newest first, for the
 *  picker and studio. Rows whose tokens fail validation are skipped (never
 *  surfaced as broken). */
export async function listVisibleCustomThemes(
  userId: string
): Promise<CustomThemeSummary[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("custom_themes")
    .select("id, name, created_by, is_published, base_theme_key, tokens")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listVisibleCustomThemes: ${error.message}`);

  const out: CustomThemeSummary[] = [];
  for (const row of (data ?? []) as Partial<DbCustomTheme>[]) {
    const v = validateThemeTokens(row.tokens);
    if (!v.ok) {
      console.error(`[custom_themes] skipping invalid theme ${row.id}: ${v.error}`);
      continue;
    }
    out.push({
      id: row.id as string,
      name: row.name as string,
      createdBy: row.created_by as string,
      isMine: row.created_by === userId,
      isPublished: Boolean(row.is_published),
      baseThemeKey: (row.base_theme_key as string | null) ?? null,
      tokens: v.value,
    });
  }
  return out;
}

/** A single custom theme's validated tokens, readable if own-or-published and not
 *  deleted (RLS). Returns null when missing / not visible / invalid — callers
 *  degrade to the org default. Takes the caller's session client so RLS applies. */
export async function getCustomThemeForResolve(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string
): Promise<{ name: string; tokens: ThemeTokens } | null> {
  const { data } = await supabase
    .from("custom_themes")
    .select("name, tokens")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const v = validateThemeTokens((data as { tokens: unknown }).tokens);
  if (!v.ok) {
    console.error(`[custom_themes] ${id} failed validation on resolve: ${v.error}`);
    return null;
  }
  return { name: (data as { name: string }).name, tokens: v.value };
}

/** The raw row via the admin client (sees private rows), for action-layer
 *  ownership / published checks. Null when missing or soft-deleted. */
export async function getCustomThemeRow(id: string): Promise<DbCustomTheme | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("custom_themes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getCustomThemeRow: ${error.message}`);
  return (data as DbCustomTheme | null) ?? null;
}

/** Create a private custom theme owned by the caller. Session client → RLS
 *  insert-own. Validates tokens. Returns the new id. */
export async function createCustomTheme(
  userId: string,
  input: { name: string; tokens: unknown; baseThemeKey?: string | null }
): Promise<string> {
  const v = validateThemeTokens(input.tokens);
  if (!v.ok) throw new Error(v.error);
  const name = input.name.trim();
  if (!name) throw new Error("A theme name is required.");

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("custom_themes")
    .insert({
      name,
      created_by: userId,
      tokens: v.value,
      base_theme_key: input.baseThemeKey ?? null,
      is_published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createCustomTheme: ${error.message}`);
  return (data as { id: string }).id;
}

/** Update a custom theme's name/tokens (admin client — the action gate has
 *  already confirmed creator-or-Admin). Validates tokens when provided. */
export async function updateCustomTheme(
  id: string,
  patch: { name?: string; tokens?: unknown }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A theme name is required.");
    update.name = name;
  }
  if (patch.tokens !== undefined) {
    const v = validateThemeTokens(patch.tokens);
    if (!v.ok) throw new Error(v.error);
    update.tokens = v.value;
  }
  if (Object.keys(update).length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin.from("custom_themes").update(update).eq("id", id);
  if (error) throw new Error(`updateCustomTheme: ${error.message}`);
}

/** Soft-delete (§1) — admin client (gate already checked). */
export async function softDeleteCustomTheme(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("custom_themes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`softDeleteCustomTheme: ${error.message}`);
}

/** Publish / unpublish org-wide (admin client — Admin gate already checked). */
export async function setCustomThemePublished(
  id: string,
  published: boolean
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("custom_themes")
    .update({ is_published: published })
    .eq("id", id);
  if (error) throw new Error(`setCustomThemePublished: ${error.message}`);
}
