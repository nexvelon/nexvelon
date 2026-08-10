"use server";

// UIDG-3/4 — theme persistence + custom-theme actions.
//   Personal / org default:  setMyThemeAction, setOrgDefaultThemeAction
//   Custom themes:            create / update / delete / publish / unpublish /
//                             duplicate, plus getThemeStudioAction for the editor.
// Every mutation validates server-side, is permission-gated, and writes a
// best-effort activity_log row (§5, entity_type 'ui_theme').

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
import type { DbRole } from "@/lib/types/database";
import {
  THEMES,
  THEME_ORDER,
  isThemeKey,
  isThemeMode,
  isUuid,
  resolveTheme,
  themeTokens,
  type ThemeMode,
  type ThemeTokens,
} from "@/lib/theme";
import {
  getThemeSettings,
  setUserThemeKey,
  setUserThemeMode,
  setOrgDefaultThemeKey,
  setOrgDefaultThemeMode,
  logThemeChange,
  logThemeAudit,
} from "@/lib/api/ui-theme";
import {
  listVisibleCustomThemes,
  getCustomThemeForResolve,
  getCustomThemeRow,
  createCustomTheme,
  updateCustomTheme,
  softDeleteCustomTheme,
  setCustomThemePublished,
  type CustomThemeSummary,
} from "@/lib/api/custom-themes";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

async function canManageOrg(role: DbRole): Promise<boolean> {
  return hasPermission(adaptRole(role), "settings", "manage");
}

// ── Studio data ──────────────────────────────────────────────────────────────

export interface ThemeStudioData {
  builtins: { key: string; name: string }[];
  customs: CustomThemeSummary[];
  orgDefaultKey: string;
  userOverrideKey: string | null;
  orgDefaultMode: ThemeMode;
  userOverrideMode: ThemeMode | null;
  canManageOrg: boolean;
  meId: string;
}

export async function getThemeStudioAction(): Promise<ActionResult<ThemeStudioData>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  try {
    const [settings, customs] = await Promise.all([
      getThemeSettings(me.id),
      listVisibleCustomThemes(me.id),
    ]);
    return {
      ok: true,
      data: {
        builtins: THEME_ORDER.map((key) => ({ key, name: THEMES[key].name })),
        customs,
        orgDefaultKey: settings.orgDefaultKey,
        userOverrideKey: settings.userOverrideKey,
        orgDefaultMode: settings.orgDefaultMode,
        userOverrideMode: settings.userOverrideMode,
        canManageOrg: await canManageOrg(me.role),
        meId: me.id,
      },
    };
  } catch (e) {
    return fail(e, "Failed to load themes.");
  }
}

// ── Mode (light / dark axis) ─────────────────────────────────────────────────

export async function setMyThemeModeAction(
  mode: ThemeMode | null
): Promise<ActionResult<{ mode: ThemeMode | null }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  if (mode !== null && !isThemeMode(mode)) {
    return { ok: false, error: `Unknown mode: ${mode}` };
  }
  try {
    const before = await getThemeSettings(me.id);
    await setUserThemeMode(me.id, mode);
    await logThemeChange(me.id, "user", {
      theme_mode: { from: before.userOverrideMode, to: mode },
    });
    return { ok: true, data: { mode } };
  } catch (e) {
    return fail(e, "Failed to save mode.");
  }
}

export async function setOrgDefaultThemeModeAction(
  mode: ThemeMode
): Promise<ActionResult<{ mode: ThemeMode }>> {
  const me = await getCurrentProfile();
  if (!me || !(await canManageOrg(me.role))) {
    return { ok: false, error: "You do not have permission to set the company default mode." };
  }
  if (!isThemeMode(mode)) return { ok: false, error: `Unknown mode: ${mode}` };
  try {
    const before = await getThemeSettings(me.id);
    await setOrgDefaultThemeMode(mode);
    await logThemeChange(me.id, "org", {
      default_ui_theme_mode: { from: before.orgDefaultMode, to: mode },
    });
    return { ok: true, data: { mode } };
  } catch (e) {
    return fail(e, "Failed to set company default mode.");
  }
}

// ── Personal / org default ───────────────────────────────────────────────────

/** True if the caller may apply this key as their personal theme: any built-in,
 *  or a custom theme they can see (own or published — enforced by RLS on the
 *  caller's session client). */
async function userMayUse(key: string): Promise<boolean> {
  if (isThemeKey(key)) return true;
  if (!isUuid(key)) return false;
  const supabase = await createSupabaseServerClient();
  return (await getCustomThemeForResolve(supabase, key)) !== null;
}

export async function setMyThemeAction(
  themeKey: string | null
): Promise<ActionResult<{ orgDefaultKey: string; effectiveKey: string }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  if (themeKey !== null && !(await userMayUse(themeKey))) {
    return { ok: false, error: "That theme isn't available to you." };
  }
  try {
    const before = await getThemeSettings(me.id);
    await setUserThemeKey(me.id, themeKey);
    await logThemeChange(me.id, "user", {
      theme_key: { from: before.userOverrideKey, to: themeKey },
    });
    return {
      ok: true,
      data: { orgDefaultKey: before.orgDefaultKey, effectiveKey: themeKey ?? before.orgDefaultKey },
    };
  } catch (e) {
    return fail(e, "Failed to save theme.");
  }
}

export async function setOrgDefaultThemeAction(
  themeKey: string
): Promise<ActionResult<{ orgDefaultKey: string }>> {
  const me = await getCurrentProfile();
  if (!me || !(await canManageOrg(me.role))) {
    return { ok: false, error: "You do not have permission to set the company default theme." };
  }
  // Built-in OR a PUBLISHED custom theme — a private theme can never be the org
  // default (guarded server-side).
  if (!isThemeKey(themeKey)) {
    if (!isUuid(themeKey)) return { ok: false, error: `Unknown theme: ${themeKey}` };
    const row = await getCustomThemeRow(themeKey);
    if (!row) return { ok: false, error: "That theme no longer exists." };
    if (!row.is_published) {
      return { ok: false, error: "Publish the theme before making it the company default." };
    }
  }
  try {
    const before = await getThemeSettings(me.id);
    await setOrgDefaultThemeKey(themeKey);
    await logThemeChange(me.id, "org", {
      default_ui_theme: { from: before.orgDefaultKey, to: themeKey },
    });
    return { ok: true, data: { orgDefaultKey: themeKey } };
  } catch (e) {
    return fail(e, "Failed to set company default.");
  }
}

// ── Custom-theme CRUD ────────────────────────────────────────────────────────

export async function createCustomThemeAction(input: {
  name: string;
  tokens: ThemeTokens;
  baseThemeKey?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  try {
    const id = await createCustomTheme(me.id, input);
    await logThemeAudit(me.id, id, "create", {
      name: { from: null, to: input.name },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e, "Failed to create theme.");
  }
}

/** Clone a built-in or a visible custom theme into a new private custom theme —
 *  the primary creation path (start from something that works). */
export async function duplicateThemeAction(
  sourceKey: string
): Promise<ActionResult<{ id: string; name: string }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  try {
    let tokens: ThemeTokens;
    let sourceName: string;
    if (isThemeKey(sourceKey)) {
      tokens = themeTokens(resolveTheme(sourceKey));
      sourceName = THEMES[sourceKey].name;
    } else if (isUuid(sourceKey)) {
      const supabase = await createSupabaseServerClient();
      const src = await getCustomThemeForResolve(supabase, sourceKey);
      if (!src) return { ok: false, error: "That theme isn't available to copy." };
      tokens = src.tokens;
      sourceName = src.name;
    } else {
      return { ok: false, error: `Unknown theme: ${sourceKey}` };
    }
    const name = `${sourceName} copy`;
    const id = await createCustomTheme(me.id, { name, tokens, baseThemeKey: sourceKey });
    await logThemeAudit(me.id, id, "create", { name: { from: null, to: name } });
    return { ok: true, data: { id, name } };
  } catch (e) {
    return fail(e, "Failed to duplicate theme.");
  }
}

/** Owner-or-Admin guard, returning the row so callers reuse it. */
async function requireEditableTheme(
  id: string,
  me: { id: string; role: DbRole }
): Promise<{ ok: true; row: NonNullable<Awaited<ReturnType<typeof getCustomThemeRow>>> } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: `Unknown theme: ${id}` };
  const row = await getCustomThemeRow(id);
  if (!row) return { ok: false, error: "That theme no longer exists." };
  const mine = row.created_by === me.id;
  if (!mine && !(await canManageOrg(me.role))) {
    return { ok: false, error: "You can only edit your own themes." };
  }
  return { ok: true, row };
}

export async function updateCustomThemeAction(
  id: string,
  patch: { name?: string; tokens?: ThemeTokens }
): Promise<ActionResult<{ id: string }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  const gate = await requireEditableTheme(id, me);
  if (!gate.ok) return gate;
  try {
    await updateCustomTheme(id, patch);
    await logThemeAudit(me.id, id, "update", {
      ...(patch.name !== undefined ? { name: { from: gate.row.name, to: patch.name } } : {}),
      ...(patch.tokens !== undefined ? { tokens: { from: "(previous)", to: "(updated)" } } : {}),
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e, "Failed to update theme.");
  }
}

export async function deleteCustomThemeAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  const gate = await requireEditableTheme(id, me);
  if (!gate.ok) return gate;
  try {
    await softDeleteCustomTheme(id);
    await logThemeAudit(me.id, id, "delete", { name: { from: gate.row.name, to: null } });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e, "Failed to delete theme.");
  }
}

async function setPublished(id: string, published: boolean): Promise<ActionResult<{ id: string }>> {
  const me = await getCurrentProfile();
  if (!me || !(await canManageOrg(me.role))) {
    return { ok: false, error: "Only an admin can publish or unpublish themes." };
  }
  if (!isUuid(id)) return { ok: false, error: `Unknown theme: ${id}` };
  const row = await getCustomThemeRow(id);
  if (!row) return { ok: false, error: "That theme no longer exists." };
  try {
    await setCustomThemePublished(id, published);
    await logThemeAudit(me.id, id, "update", {
      is_published: { from: row.is_published, to: published },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e, "Failed to update publication state.");
  }
}

export async function publishCustomThemeAction(id: string) {
  return setPublished(id, true);
}
export async function unpublishCustomThemeAction(id: string) {
  return setPublished(id, false);
}
