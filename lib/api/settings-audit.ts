import "server-only";

// POLISH-17 — data layer for the append-only settings audit log (migration
// 0064). Every edit/restore of a locked legal document (Integrated + Guardian
// T&C) writes one row here. Reads + inserts go through the session-scoped
// server client (RLS: authenticated select/insert; no delete). Admin gating is
// enforced at the action layer on top.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsAuditAction = "edit" | "restore";

export interface DbSettingsAuditRow {
  id: string;
  setting_key: string;
  before_text: string | null;
  after_text: string;
  edited_by_user_id: string | null;
  edited_by_email: string | null;
  edited_by_name: string | null;
  edited_at: string;
  action_type: SettingsAuditAction;
  restored_from_audit_id: string | null;
  change_summary: string | null;
}

export interface NewAuditRow {
  setting_key: string;
  before_text: string | null;
  after_text: string;
  edited_by_user_id: string | null;
  edited_by_email: string | null;
  edited_by_name: string | null;
  action_type: SettingsAuditAction;
  restored_from_audit_id?: string | null;
  change_summary?: string | null;
}

export interface AuditFilters {
  /** Restrict to a single setting key (omit/"all" = every key). */
  settingKey?: string | null;
  /** ISO date (inclusive lower bound on edited_at). */
  from?: string | null;
  /** ISO date (inclusive upper bound on edited_at). */
  to?: string | null;
  limit?: number;
}

async function db() {
  return createSupabaseServerClient();
}

/** Append one audit row. */
export async function insertAuditRow(
  row: NewAuditRow
): Promise<DbSettingsAuditRow> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("settings_audit_log")
    .insert({
      setting_key: row.setting_key,
      before_text: row.before_text,
      after_text: row.after_text,
      edited_by_user_id: row.edited_by_user_id,
      edited_by_email: row.edited_by_email,
      edited_by_name: row.edited_by_name,
      action_type: row.action_type,
      restored_from_audit_id: row.restored_from_audit_id ?? null,
      change_summary: row.change_summary ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertAuditRow: ${error.message}`);
  return data as DbSettingsAuditRow;
}

/** List audit rows, newest first, with optional key/date filtering. */
export async function listAuditRows(
  filters: AuditFilters = {}
): Promise<DbSettingsAuditRow[]> {
  const supabase = await db();
  let q = supabase
    .from("settings_audit_log")
    .select("*")
    .order("edited_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 200, 500));
  if (filters.settingKey && filters.settingKey !== "all")
    q = q.eq("setting_key", filters.settingKey);
  if (filters.from) q = q.gte("edited_at", filters.from);
  if (filters.to) q = q.lte("edited_at", filters.to);
  const { data, error } = await q;
  if (error) throw new Error(`listAuditRows: ${error.message}`);
  return (data ?? []) as DbSettingsAuditRow[];
}

/** Fetch a single audit row by id. */
export async function getAuditRow(
  id: string
): Promise<DbSettingsAuditRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("settings_audit_log")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAuditRow: ${error.message}`);
  return (data as DbSettingsAuditRow | null) ?? null;
}

/** POLISH-30 — hard-delete a single audit row (admin-gated at the action layer).
 *  Uses the service-role client. The restored_from_audit_id FK is ON DELETE SET
 *  NULL, so any entry that restored from this version keeps working (its
 *  reference simply becomes null). */
export async function deleteAuditRow(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings_audit_log")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteAuditRow: ${error.message}`);
}
