import "server-only";

// UIDG-8 — the dashboard layout data layer + resolver. Mirrors the theme model:
// per-user override (user_ui_prefs.dashboard_layout) → org default
// (company_settings KV) → built-in default, resolved SERVER-SIDE so the correct
// layout paints on first byte with no flash and no client reshuffle. The whole
// resolve is fail-safe (any DB/session failure falls back to the built-in), and
// the caller's permissions filter the widgets BEFORE they reach the client (a
// widget the user can't see never leaves the server).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting, setSetting } from "@/lib/api/company-settings";
import type { Role } from "@/lib/types";
import {
  BUILT_IN_LAYOUT,
  validateLayout,
  filterLayoutForRole,
  type DashboardLayout,
} from "@/lib/dashboard/widgets";

export const ORG_DEFAULT_LAYOUT_KEY = "dashboard_default_layout";

/** The current user's saved layout (validated), or null when they have none. */
export async function getUserLayout(userId: string): Promise<DashboardLayout | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_ui_prefs")
    .select("dashboard_layout")
    .eq("user_id", userId)
    .maybeSingle();
  return validateLayout((data as { dashboard_layout?: unknown } | null)?.dashboard_layout);
}

/** The org default layout (validated), or null when none is set. */
export async function getOrgDefaultLayout(): Promise<DashboardLayout | null> {
  const raw = await getSetting(ORG_DEFAULT_LAYOUT_KEY);
  if (!raw) return null;
  try {
    return validateLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The layout that should render for `userId`/`role`: user → org → built-in,
 * validated (unknown widget ids dropped, 2f), then permission-filtered + reflowed
 * (2e). Never throws — a failure degrades to the built-in default.
 */
export async function resolveDashboardLayout(
  userId: string | null,
  role: Role | null
): Promise<DashboardLayout> {
  let base: DashboardLayout = BUILT_IN_LAYOUT;
  try {
    const user = userId ? await getUserLayout(userId) : null;
    base = user ?? (await getOrgDefaultLayout()) ?? BUILT_IN_LAYOUT;
  } catch {
    base = BUILT_IN_LAYOUT;
  }
  // A logged-out/roleless caller only sees always-visible widgets.
  if (!role) return { widgets: base.widgets.filter((w) => w.id === "kpiOverview" || w.id === "alerts" || w.id === "activityFeed") };
  return filterLayoutForRole(base, role);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Save (or replace) the caller's personal layout. */
export async function saveUserLayout(userId: string, layout: DashboardLayout): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert({ user_id: userId, dashboard_layout: layout }, { onConflict: "user_id" });
  if (error) throw new Error(`saveUserLayout: ${error.message}`);
}

/** Clear the caller's override so they inherit the org/built-in default again.
 *  A NULL write — never a delete of the row (their theme prefs live there too). */
export async function clearUserLayout(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert({ user_id: userId, dashboard_layout: null }, { onConflict: "user_id" });
  if (error) throw new Error(`clearUserLayout: ${error.message}`);
}

export async function setOrgDefaultLayout(layout: DashboardLayout): Promise<void> {
  await setSetting(ORG_DEFAULT_LAYOUT_KEY, JSON.stringify(layout));
}

/** How many users have a personal layout override (for the apply-to-everyone
 *  confirmation). Admin client — owner RLS would otherwise scope to the caller. */
export async function countLayoutOverrides(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("user_ui_prefs")
    .select("user_id", { count: "exact", head: true })
    .not("dashboard_layout", "is", null);
  return count ?? 0;
}

/** "Apply to everyone" — NULL every personal layout so all inherit the new org
 *  default. Never deletes a row (theme prefs survive). Returns the count cleared. */
export async function clearAllLayoutOverrides(): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_ui_prefs")
    .update({ dashboard_layout: null })
    .not("dashboard_layout", "is", null)
    .select("user_id");
  return (data ?? []).length;
}
