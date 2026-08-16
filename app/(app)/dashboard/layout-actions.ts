"use server";

// UIDG-8 — dashboard layout mutations. Personal layout writes need only a
// dashboard viewer; the org-default write needs settings:manage (the existing key)
// and audits BOTH outcomes distinctly with the blast radius (§5), via the
// settings_audit_log (the org default is a company_settings KV entry).

import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
import {
  saveUserLayout,
  clearUserLayout,
  setOrgDefaultLayout,
  countLayoutOverrides,
  clearAllLayoutOverrides,
  getOrgDefaultLayout,
} from "@/lib/api/dashboard-layout";
import { insertAuditRow } from "@/lib/api/settings-audit";
import { validateLayout, type DashboardLayout } from "@/lib/dashboard/widgets";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function actorName(me: { display_name?: string | null; first_name?: string | null; last_name?: string | null }): string | null {
  return (
    me.display_name ||
    [me.first_name, me.last_name].filter(Boolean).join(" ") ||
    null
  );
}

/** Persist the caller's own layout (validated against the widget registry). */
export async function saveUserLayoutAction(
  layout: DashboardLayout
): Promise<ActionResult<null>> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "dashboard", "view")) {
    return { ok: false, error: "You don't have access to the dashboard." };
  }
  const clean = validateLayout(layout);
  if (!clean) return { ok: false, error: "That layout is not valid." };
  try {
    await saveUserLayout(me.id, clean);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save your layout." };
  }
}

/** Clear the caller's override so they inherit the company / built-in default. */
export async function resetUserLayoutAction(): Promise<ActionResult<null>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  try {
    await clearUserLayout(me.id);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reset your layout." };
  }
}

/** How many users have a personal layout — for the apply-to-everyone dialog. */
export async function countLayoutOverridesAction(): Promise<ActionResult<{ count: number }>> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "settings", "manage")) {
    return { ok: false, error: "You don't have permission to manage the company default." };
  }
  try {
    return { ok: true, data: { count: await countLayoutOverrides() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't count overrides." };
  }
}

/**
 * Set the company-default dashboard layout. When `applyToEveryone`, every personal
 * override is NULLed so all inherit the new default (never deletes anything). Both
 * outcomes write a distinct audit row carrying the affected-user count.
 */
export async function setOrgDefaultLayoutAction(
  layout: DashboardLayout,
  applyToEveryone = false
): Promise<ActionResult<{ affected: number }>> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "settings", "manage")) {
    return { ok: false, error: "You don't have permission to set the company default layout." };
  }
  const clean = validateLayout(layout);
  if (!clean) return { ok: false, error: "That layout is not valid." };
  try {
    const before = await getOrgDefaultLayout();
    await setOrgDefaultLayout(clean);
    let affected = 0;
    if (applyToEveryone) affected = await clearAllLayoutOverrides();

    await insertAuditRow({
      setting_key: "dashboard_default_layout",
      before_text: before ? JSON.stringify(before) : null,
      after_text: JSON.stringify(clean),
      edited_by_user_id: me.id,
      edited_by_email: me.email ?? null,
      edited_by_name: actorName(me),
      action_type: "edit",
      change_summary: applyToEveryone
        ? `Set company default dashboard layout — reset ${affected} personal layout(s)`
        : "Set company default dashboard layout — kept users' choices",
    });

    return { ok: true, data: { affected } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't set the company default." };
  }
}
