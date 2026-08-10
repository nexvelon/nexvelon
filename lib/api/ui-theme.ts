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
  DEFAULT_THEME,
  isThemeKey,
  isUuid,
  resolveTheme,
  type ResolvedThemeColors,
} from "@/lib/theme";
import { getCustomThemeForResolve } from "@/lib/api/custom-themes";
import type { ActivityChanges } from "@/lib/types/database";

export const ORG_DEFAULT_THEME_KEY = "default_ui_theme";
export const ORG_DEFAULT_THEME_MODE_KEY = "default_ui_theme_mode"; // future axis
/** Fixed entity id for org-level (non-user) theme audit rows. entity_id is a
 *  NOT NULL uuid with no FK; the nil uuid denotes "the organisation". */
const ORG_THEME_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

export interface ResolvedServerTheme {
  /** The data-theme value to stamp (a built-in key or a custom-theme uuid). */
  key: string;
  /** Fully-resolved colours for this theme (Recharts + client context). */
  colors: ResolvedThemeColors;
  /** True when `key` is a custom theme whose CSS must be injected inline. */
  isCustom: boolean;
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function builtin(key: string): ResolvedServerTheme {
  const k = isThemeKey(key) ? key : DEFAULT_THEME;
  return { key: k, colors: resolveTheme(k), isCustom: false };
}

/** Resolve one stored theme reference (built-in key or custom uuid) to a render
 *  target, or null if it can't be used (unknown / deleted / unpublished-and-not-
 *  owned / invalid tokens) so the caller falls through to the next precedence. */
async function resolveRef(
  supabase: ServerClient,
  key: string
): Promise<ResolvedServerTheme | null> {
  if (isThemeKey(key)) return builtin(key);
  if (!isUuid(key)) return null;
  const custom = await getCustomThemeForResolve(supabase, key);
  if (!custom) return null;
  return {
    key,
    colors: { key, name: custom.name, description: "", ...custom.tokens },
    isCustom: true,
  };
}

/**
 * The theme to render for the current request. Precedence (highest wins):
 * user override → org default → DEFAULT_THEME. A reference that no longer
 * resolves (deleted/unpublished/invalid custom theme) is skipped so the user
 * degrades cleanly to the org default rather than being orphaned. Resolved
 * server-side so first paint is correct with no flash and no JS. Never throws.
 */
export async function resolveServerTheme(): Promise<ResolvedServerTheme> {
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
      if (typeof override === "string" && override) {
        const r = await resolveRef(supabase, override);
        if (r) return r;
      }
    }

    const orgDefault = await getSetting(ORG_DEFAULT_THEME_KEY);
    if (typeof orgDefault === "string" && orgDefault) {
      const r = await resolveRef(supabase, orgDefault);
      if (r) return r;
    }
  } catch {
    // DB unreachable / no session / RLS denial — never break the render.
  }
  return builtin(DEFAULT_THEME);
}

/** The org default + the current user's override, as the RAW stored keys (a
 *  built-in key or a custom uuid). The org default falls back to DEFAULT_THEME
 *  when unset. For the settings studio. */
export async function getThemeSettings(
  userId: string
): Promise<{ orgDefaultKey: string; userOverrideKey: string | null }> {
  const supabase = await createSupabaseServerClient();
  const [prefsRes, orgRaw] = await Promise.all([
    supabase
      .from("user_ui_prefs")
      .select("theme_key")
      .eq("user_id", userId)
      .maybeSingle(),
    getSetting(ORG_DEFAULT_THEME_KEY),
  ]);

  const orgDefaultKey = typeof orgRaw === "string" && orgRaw ? orgRaw : DEFAULT_THEME;
  const override = prefsRes.data?.theme_key;
  const userOverrideKey = typeof override === "string" && override ? override : null;

  return { orgDefaultKey, userOverrideKey };
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

/** Set the org-wide default theme (company_settings KV). Accepts a built-in key
 *  or a PUBLISHED custom uuid; the action layer enforces that. */
export async function setOrgDefaultThemeKey(key: string): Promise<void> {
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
