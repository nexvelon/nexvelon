import "server-only";

// UIDG-3 — server-side theme resolution + persistence.
//
// Precedence (highest wins): per-user override → org default → DEFAULT_THEME.
// The org default lives in the company_settings KV store (key
// 'default_ui_theme'); the per-user override lives in user_ui_prefs (NULL =
// inherit). Every read is fail-safe — a theme lookup must NEVER throw and break
// a page render (same posture as the permissions resolver, PERM-2).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting, setSetting } from "@/lib/api/company-settings";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  deriveDarkTokens,
  isThemeKey,
  isThemeMode,
  isUuid,
  resolveTheme,
  themeTokens,
  type ResolvedThemeColors,
  type ThemeMode,
  type ThemeTokens,
} from "@/lib/theme";
import { getCustomThemeForResolve } from "@/lib/api/custom-themes";
import type { ActivityChanges } from "@/lib/types/database";

export const ORG_DEFAULT_THEME_KEY = "default_ui_theme";
export const ORG_DEFAULT_THEME_MODE_KEY = "default_ui_theme_mode";
/** Fixed entity id for org-level (non-user) theme audit rows. entity_id is a
 *  NOT NULL uuid with no FK; the nil uuid denotes "the organisation". */
const ORG_THEME_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

export interface ResolvedServerTheme {
  /** The data-theme value to stamp (a built-in key or a custom-theme uuid). */
  key: string;
  /** The resolved mode; the layout stamps `.dark` on <html> when "dark". */
  mode: ThemeMode;
  /** Fully-resolved colours for the ACTIVE mode (Recharts + client context). */
  colors: ResolvedThemeColors;
  /** True when `key` is a custom theme whose CSS must be injected inline. */
  isCustom: boolean;
  /** For a custom theme only — the light + derived-dark token sets to inject as
   *  an inline <style> so BOTH modes are available (client toggle, no flash). */
  customLight?: ThemeTokens;
  customDark?: ThemeTokens;
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type PaletteRef =
  | { kind: "builtin"; key: string }
  | { kind: "custom"; key: string; name: string; light: ThemeTokens };

/** Resolve one stored palette reference (built-in key or custom uuid), or null
 *  if it can't be used (unknown / deleted / unpublished-and-not-owned / invalid)
 *  so the caller falls through to the next precedence level. */
async function resolvePaletteRef(
  supabase: ServerClient,
  key: string
): Promise<PaletteRef | null> {
  if (isThemeKey(key)) return { kind: "builtin", key };
  if (!isUuid(key)) return null;
  const custom = await getCustomThemeForResolve(supabase, key);
  if (!custom) return null;
  return { kind: "custom", key, name: custom.name, light: custom.tokens };
}

function buildResolved(ref: PaletteRef, mode: ThemeMode): ResolvedServerTheme {
  if (ref.kind === "builtin") {
    const key = isThemeKey(ref.key) ? ref.key : DEFAULT_THEME;
    return { key, mode, colors: resolveTheme(key, mode), isCustom: false };
  }
  const light = ref.light;
  const dark = deriveDarkTokens(light);
  const active = mode === "dark" ? dark : light;
  return {
    key: ref.key,
    mode,
    colors: { key: ref.key, name: ref.name, description: "", ...active },
    isCustom: true,
    customLight: themeTokens(light),
    customDark: themeTokens(dark),
  };
}

/**
 * The theme to render for the current request. Palette and mode resolve on the
 * SAME precedence but INDEPENDENTLY: user override → org default → default.
 * A palette reference that no longer resolves is skipped so the user degrades to
 * the org default rather than being orphaned. Resolved server-side so first paint
 * is correct (palette AND mode) with no flash and no JS. Never throws.
 */
export async function resolveServerTheme(): Promise<ResolvedServerTheme> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let prefKey: string | null = null;
    let prefMode: string | null = null;
    if (user) {
      const { data } = await supabase
        .from("user_ui_prefs")
        .select("theme_key, theme_mode")
        .eq("user_id", user.id)
        .maybeSingle();
      prefKey = (data?.theme_key as string | null) ?? null;
      prefMode = (data?.theme_mode as string | null) ?? null;
    }

    // Mode: user override → org default → light.
    let mode: ThemeMode = DEFAULT_MODE;
    if (isThemeMode(prefMode)) mode = prefMode;
    else {
      const orgMode = await getSetting(ORG_DEFAULT_THEME_MODE_KEY);
      if (isThemeMode(orgMode)) mode = orgMode;
    }

    // Palette: user override → org default → default.
    if (prefKey) {
      const ref = await resolvePaletteRef(supabase, prefKey);
      if (ref) return buildResolved(ref, mode);
    }
    const orgKey = await getSetting(ORG_DEFAULT_THEME_KEY);
    if (typeof orgKey === "string" && orgKey) {
      const ref = await resolvePaletteRef(supabase, orgKey);
      if (ref) return buildResolved(ref, mode);
    }
    return buildResolved({ kind: "builtin", key: DEFAULT_THEME }, mode);
  } catch {
    // DB unreachable / no session / RLS denial — never break the render.
    return buildResolved({ kind: "builtin", key: DEFAULT_THEME }, DEFAULT_MODE);
  }
}

/** The org default + the current user's override for BOTH axes (palette + mode),
 *  as the RAW stored values. Keys fall back to DEFAULT_THEME / light when unset.
 *  For the settings studio. */
export async function getThemeSettings(userId: string): Promise<{
  orgDefaultKey: string;
  userOverrideKey: string | null;
  orgDefaultMode: ThemeMode;
  userOverrideMode: ThemeMode | null;
}> {
  const supabase = await createSupabaseServerClient();
  const [prefsRes, orgRaw, orgModeRaw] = await Promise.all([
    supabase
      .from("user_ui_prefs")
      .select("theme_key, theme_mode")
      .eq("user_id", userId)
      .maybeSingle(),
    getSetting(ORG_DEFAULT_THEME_KEY),
    getSetting(ORG_DEFAULT_THEME_MODE_KEY),
  ]);

  const orgDefaultKey = typeof orgRaw === "string" && orgRaw ? orgRaw : DEFAULT_THEME;
  const override = prefsRes.data?.theme_key;
  const userOverrideKey = typeof override === "string" && override ? override : null;

  const orgDefaultMode: ThemeMode = isThemeMode(orgModeRaw) ? orgModeRaw : DEFAULT_MODE;
  const om = prefsRes.data?.theme_mode;
  const userOverrideMode: ThemeMode | null = isThemeMode(om) ? om : null;

  return { orgDefaultKey, userOverrideKey, orgDefaultMode, userOverrideMode };
}

/** Write (or clear, with null) the current user's theme override. Owner-scoped
 *  RLS restricts the row to the caller. Accepts a built-in key or a custom uuid;
 *  the action layer validates usability before calling. */
export async function setUserThemeKey(
  userId: string,
  key: string | null
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert({ user_id: userId, theme_key: key }, { onConflict: "user_id" });
  if (error) throw new Error(`setUserThemeKey: ${error.message}`);
}

/** Write (or clear, with null) the current user's mode override. */
export async function setUserThemeMode(
  userId: string,
  mode: ThemeMode | null
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert({ user_id: userId, theme_mode: mode }, { onConflict: "user_id" });
  if (error) throw new Error(`setUserThemeMode: ${error.message}`);
}

/** Set the org-wide default theme (company_settings KV). Accepts a built-in key
 *  or a PUBLISHED custom uuid; the action layer enforces that. */
export async function setOrgDefaultThemeKey(key: string): Promise<void> {
  await setSetting(ORG_DEFAULT_THEME_KEY, key);
}

/** Set the org-wide default mode (company_settings KV). */
export async function setOrgDefaultThemeMode(mode: ThemeMode): Promise<void> {
  await setSetting(ORG_DEFAULT_THEME_MODE_KEY, mode);
}

/** AUD-1 — how many users have chosen a personal palette (a non-NULL
 *  theme_key). Drives the "apply to everyone vs keep their choices" warning.
 *  Admin client (counts across all users; RLS would restrict to the caller). */
export async function countUsersWithThemeOverride(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_ui_prefs")
    .select("user_id", { count: "exact", head: true })
    .not("theme_key", "is", null);
  if (error) throw new Error(`countUsersWithThemeOverride: ${error.message}`);
  return count ?? 0;
}

/** AUD-1 — clear every user's personal palette override (theme_key → NULL) so
 *  all users inherit the org default. This ONLY nulls the preference; it never
 *  touches custom_themes (a saved theme is preserved, just not auto-applied).
 *  Returns the number of users affected. Admin client. */
export async function clearAllUserThemeOverrides(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_ui_prefs")
    .update({ theme_key: null })
    .not("theme_key", "is", null)
    .select("user_id");
  if (error) throw new Error(`clearAllUserThemeOverrides: ${error.message}`);
  return (data ?? []).length;
}

/**
 * Best-effort audit row for a theme change (§5). Written via the service-role
 * admin client because public.activity_log has no authenticated INSERT policy
 * (it is the one audit table missing it — its siblings settings_audit_log /
 * schedule_audit / permission_audit all have one), so the session client's
 * inserts are silently RLS-denied. Never throws — an audit failure must not
 * block the setting change.
 */
export async function logThemeChange(
  actorId: string | null,
  scope: "user" | "org",
  changes: ActivityChanges
): Promise<void> {
  await logThemeAudit(
    actorId,
    scope === "user" ? (actorId ?? ORG_THEME_ENTITY_ID) : ORG_THEME_ENTITY_ID,
    "update",
    changes
  );
}

/** Best-effort 'ui_theme' audit row for an arbitrary entity (a custom-theme id,
 *  a user, or the org sentinel). Service-role client; never throws (§2.8). */
export async function logThemeAudit(
  actorId: string | null,
  entityId: string,
  action: "create" | "update" | "delete",
  changes: ActivityChanges
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      entity_type: "ui_theme",
      entity_id: entityId,
      action,
      changes,
      actor_id: actorId,
    });
  } catch (e) {
    console.error("[ui_theme audit] write failed:", e);
  }
}
