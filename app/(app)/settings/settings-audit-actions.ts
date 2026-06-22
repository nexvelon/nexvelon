"use server";

// POLISH-17 — server actions for the locked legal-document editor + audit log.
// Only the two T&C settings keys can be written through here. Every save and
// restore appends an immutable row to settings_audit_log. Admin-gated (defense
// in depth on top of RLS). There is intentionally NO delete action — the audit
// log is append-only.

import { revalidatePath } from "next/cache";
import { getSetting, setSetting } from "@/lib/api/company-settings";
import { LEGAL_DOC_NAMES } from "@/lib/legal-doc-keys";
import {
  insertAuditRow,
  listAuditRows,
  getAuditRow,
  type DbSettingsAuditRow,
  type AuditFilters,
} from "@/lib/api/settings-audit";
import { getCurrentProfile } from "@/lib/auth/profile";
import { changeSummary } from "@/lib/word-diff";
import { businessDateTime } from "@/lib/format";
import type { DbProfile } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

async function requireAdmin(): Promise<
  { ok: true; profile: DbProfile } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true, profile: me };
}

function editorName(p: DbProfile): string {
  return (
    p.display_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    p.email
  );
}

function assertLegalKey(key: string): void {
  if (!LEGAL_DOC_NAMES[key]) {
    throw new Error("This document is not an editable legal document.");
  }
}

/** Save an edit: append an audit row, then update the setting. */
export async function saveLegalDocumentAction(
  settingKey: string,
  newText: string
): Promise<ActionResult<{ auditId: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    assertLegalKey(settingKey);

    const current = (await getSetting(settingKey)) ?? "";
    if (current === newText) {
      return { ok: false, error: "No changes to save." };
    }

    const row = await insertAuditRow({
      setting_key: settingKey,
      before_text: current,
      after_text: newText,
      edited_by_user_id: gate.profile.id,
      edited_by_email: gate.profile.email,
      edited_by_name: editorName(gate.profile),
      action_type: "edit",
      change_summary: changeSummary(current, newText),
    });

    await setSetting(settingKey, newText);
    revalidatePath("/settings");
    revalidatePath("/quotes/new");
    return { ok: true, data: { auditId: row.id } };
  } catch (e) {
    return fail(e);
  }
}

/** List audit entries (admin-only), newest first, with optional filters. */
export async function getAuditLogAction(
  filters: AuditFilters = {}
): Promise<ActionResult<DbSettingsAuditRow[]>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    return { ok: true, data: await listAuditRows(filters) };
  } catch (e) {
    return fail(e);
  }
}

/** Restore a prior version: append a NEW audit row (action_type='restore')
 *  whose before = the current value, after = the target version, then write the
 *  restored value. The chain is preserved indefinitely. */
export async function restoreLegalDocumentAction(
  auditId: string
): Promise<ActionResult<{ newAuditId: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;

    const target = await getAuditRow(auditId);
    if (!target) return { ok: false, error: "That version no longer exists." };
    assertLegalKey(target.setting_key);

    const current = (await getSetting(target.setting_key)) ?? "";
    const restoredText = target.after_text;

    const fromWhen = businessDateTime(target.edited_at);
    const fromWho = target.edited_by_name ?? "an earlier editor";

    const row = await insertAuditRow({
      setting_key: target.setting_key,
      before_text: current,
      after_text: restoredText,
      edited_by_user_id: gate.profile.id,
      edited_by_email: gate.profile.email,
      edited_by_name: editorName(gate.profile),
      action_type: "restore",
      restored_from_audit_id: target.id,
      change_summary: `Restored from ${fromWhen} version by ${fromWho}`,
    });

    await setSetting(target.setting_key, restoredText);
    revalidatePath("/settings");
    revalidatePath("/quotes/new");
    return { ok: true, data: { newAuditId: row.id } };
  } catch (e) {
    return fail(e);
  }
}
