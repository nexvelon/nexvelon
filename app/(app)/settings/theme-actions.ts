"use server";

// UIDG-3 — theme persistence actions.
//   setMyThemeAction        — any authenticated user; writes/clears their override.
//   setOrgDefaultThemeAction — gated by settings:manage (Admin-only in the
//                              baseline matrix); sets the company-wide default.
//   getThemeSettingsAction   — reads the org default + the caller's override.
// Every mutation validates the key server-side and writes a best-effort
// activity_log row (§5).

import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
import { isThemeKey, type ThemeKey } from "@/lib/theme";
import {
  getThemeSettings,
  setUserThemeKey,
  setOrgDefaultThemeKey,
  logThemeChange,
} from "@/lib/api/ui-theme";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function getThemeSettingsAction(): Promise<
  ActionResult<{
    orgDefaultKey: ThemeKey;
    userOverrideKey: ThemeKey | null;
    canManageOrg: boolean;
  }>
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  try {
    const { orgDefaultKey, userOverrideKey } = await getThemeSettings(me.id);
    const canManageOrg = hasPermission(adaptRole(me.role), "settings", "manage");
    return { ok: true, data: { orgDefaultKey, userOverrideKey, canManageOrg } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load theme settings." };
  }
}

/** Write the current user's override, or clear it (pass null) to inherit the
 *  org default. */
export async function setMyThemeAction(
  themeKey: ThemeKey | null
): Promise<ActionResult<{ orgDefaultKey: ThemeKey; effectiveKey: ThemeKey }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Not authenticated." };
  if (themeKey !== null && !isThemeKey(themeKey)) {
    return { ok: false, error: `Unknown theme: ${themeKey}` };
  }
  try {
    const before = await getThemeSettings(me.id);
    await setUserThemeKey(me.id, themeKey);
    await logThemeChange(me.id, "user", {
      theme_key: { from: before.userOverrideKey, to: themeKey },
    });
    const effectiveKey = themeKey ?? before.orgDefaultKey;
    return { ok: true, data: { orgDefaultKey: before.orgDefaultKey, effectiveKey } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save theme." };
  }
}

/** Set the company-wide default theme. Admin-only via settings:manage. */
export async function setOrgDefaultThemeAction(
  themeKey: ThemeKey
): Promise<ActionResult<{ orgDefaultKey: ThemeKey }>> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "settings", "manage")) {
    return { ok: false, error: "You do not have permission to set the company default theme." };
  }
  if (!isThemeKey(themeKey)) {
    return { ok: false, error: `Unknown theme: ${themeKey}` };
  }
  try {
    const before = await getThemeSettings(me.id);
    await setOrgDefaultThemeKey(themeKey);
    await logThemeChange(me.id, "org", {
      default_ui_theme: { from: before.orgDefaultKey, to: themeKey },
    });
    return { ok: true, data: { orgDefaultKey: themeKey } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to set company default." };
  }
}
