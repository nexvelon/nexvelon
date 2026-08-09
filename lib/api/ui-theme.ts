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
import { DEFAULT_THEME, isThemeKey, type ThemeKey } from "@/lib/theme";
import type { ActivityChanges } from "@/lib/types/database";

export const ORG_DEFAULT_THEME_KEY = "default_ui_theme";
export const ORG_DEFAULT_THEME_MODE_KEY = "default_ui_theme_mode"; // future axis
/** Fixed entity id for org-level (non-user) theme audit rows. entity_id is a
 *  NOT NULL uuid with no FK; the nil uuid denotes "the organisation". */
const ORG_THEME_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The theme key to render for the current request. Resolved server-side so the
 * correct theme paints on first byte with no flash and no JS. Never throws.
 */
export async function resolveServerThemeKey(): Promise<ThemeKey> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("user_ui_prefs")
        .select("theme_key")
        .eq("user_id", user.id)
        .maybeSingle();
      const override = data?.theme_key;
      if (typeof override === "string" && isThemeKey(override)) return override;
    }

    const orgDefault = await getSetting(ORG_DEFAULT_THEME_KEY);
    if (orgDefault && isThemeKey(orgDefault)) return orgDefault;

    return DEFAULT_THEME;
  } catch {
    // DB unreachable / no session / RLS denial — never break the render.
    return DEFAULT_THEME;
  }
}

/** The org default + the current user's override (null = inheriting). For the
 *  settings pane. Falls back safely; does not throw for the caller's happy path. */
export async function getThemeSettings(
  userId: string
): Promise<{ orgDefaultKey: ThemeKey; userOverrideKey: ThemeKey | null }> {
  const supabase = await createSupabaseServerClient();
  const [prefsRes, orgRaw] = await Promise.all([
    supabase
      .from("user_ui_prefs")
      .select("theme_key")
      .eq("user_id", userId)
      .maybeSingle(),
    getSetting(ORG_DEFAULT_THEME_KEY),
  ]);

  const orgDefaultKey = orgRaw && isThemeKey(orgRaw) ? orgRaw : DEFAULT_THEME;
  const override = prefsRes.data?.theme_key;
  const userOverrideKey =
    typeof override === "string" && isThemeKey(override) ? override : null;

  return { orgDefaultKey, userOverrideKey };
}

/** Write (or clear, with null) the current user's theme override. Owner-scoped
 *  RLS restricts the row to the caller. */
export async function setUserThemeKey(
  userId: string,
  key: ThemeKey | null
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert({ user_id: userId, theme_key: key }, { onConflict: "user_id" });
  if (error) throw new Error(`setUserThemeKey: ${error.message}`);
}

/** Set the org-wide default theme (company_settings KV). */
export async function setOrgDefaultThemeKey(key: ThemeKey): Promise<void> {
  await setSetting(ORG_DEFAULT_THEME_KEY, key);
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
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      entity_type: "ui_theme",
      entity_id: scope === "user" ? (actorId ?? ORG_THEME_ENTITY_ID) : ORG_THEME_ENTITY_ID,
      action: "update",
      changes,
      actor_id: actorId,
    });
  } catch (e) {
    console.error("[ui_theme audit] write failed:", e);
  }
}
