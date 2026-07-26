import "server-only";

// PERM-3 — per-user permission overrides + the append-only permission audit.
// Data layer (writes gated to Admin at the action layer). Every override
// mutation writes a permission_audit row; the audit table is immutable
// (block-trigger from migration 0115).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { Action, Resource } from "@/lib/permissions";

async function db() {
  return createSupabaseServerClient();
}

export type OverrideState = "granted" | "denied";

export interface PermissionOverride {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  state: OverrideState;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PermissionAuditRow {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  target_role: string | null;
  resource: string | null;
  action: string | null;
  change_type: "grant" | "deny" | "revoke" | "role_change";
  old_state: string | null;
  new_state: string | null;
  reason: string | null;
  created_at: string;
}

/** Active (non-revoked) overrides for one user. */
export async function listOverridesForUser(
  userId: string
): Promise<PermissionOverride[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("id, user_id, resource, action, state, reason, created_by, created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOverridesForUser: ${error.message}`);
  return (data ?? []) as PermissionOverride[];
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof db>>,
  row: {
    actorId: string | null;
    targetUserId: string;
    resource: string | null;
    action: string | null;
    changeType: PermissionAuditRow["change_type"];
    oldState: string | null;
    newState: string | null;
    reason: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("permission_audit").insert({
    actor_user_id: row.actorId,
    target_user_id: row.targetUserId,
    resource: row.resource,
    action: row.action,
    change_type: row.changeType,
    old_state: row.oldState,
    new_state: row.newState,
    reason: row.reason,
  });
  if (error) throw new Error(`writeAudit: ${error.message}`);
}

/**
 * Set an active override for (user, resource, action). Revokes any existing
 * active override for that triple first (the active-unique index allows only
 * one), inserts the new one, and appends a permission_audit row (grant/deny).
 */
export async function setOverride(input: {
  userId: string;
  resource: Resource;
  action: Action;
  state: OverrideState;
  reason?: string | null;
  actorId: string | null;
}): Promise<PermissionOverride> {
  const supabase = await db();

  // Capture + revoke any existing active override for this triple.
  const { data: existing, error: exErr } = await supabase
    .from("user_permission_overrides")
    .select("id, state")
    .eq("user_id", input.userId)
    .eq("resource", input.resource)
    .eq("action", input.action)
    .is("revoked_at", null)
    .maybeSingle();
  if (exErr) throw new Error(`setOverride/existing: ${exErr.message}`);

  const prior = existing as { id: string; state: string } | null;
  if (prior) {
    const { error: rvErr } = await supabase
      .from("user_permission_overrides")
      .update({ revoked_at: new Date().toISOString(), revoked_by: input.actorId })
      .eq("id", prior.id);
    if (rvErr) throw new Error(`setOverride/revoke-prior: ${rvErr.message}`);
  }

  const { data, error } = await supabase
    .from("user_permission_overrides")
    .insert({
      user_id: input.userId,
      resource: input.resource,
      action: input.action,
      state: input.state,
      reason: input.reason ?? null,
      created_by: input.actorId,
    })
    .select("id, user_id, resource, action, state, reason, created_by, created_at")
    .single();
  if (error) throw new Error(`setOverride/insert: ${error.message}`);

  await writeAudit(supabase, {
    actorId: input.actorId,
    targetUserId: input.userId,
    resource: input.resource,
    action: input.action,
    changeType: input.state === "granted" ? "grant" : "deny",
    oldState: prior?.state ?? null,
    newState: input.state,
    reason: input.reason ?? null,
  });

  return data as PermissionOverride;
}

/** Soft-revoke an override (audit trail preserved) + append a 'revoke' row. */
export async function revokeOverride(input: {
  id: string;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const { data: row, error: getErr } = await supabase
    .from("user_permission_overrides")
    .select("id, user_id, resource, action, state, revoked_at")
    .eq("id", input.id)
    .maybeSingle();
  if (getErr) throw new Error(`revokeOverride/get: ${getErr.message}`);
  const ovr = row as
    | { id: string; user_id: string; resource: string; action: string; state: string; revoked_at: string | null }
    | null;
  if (!ovr) throw new Error("Override not found.");
  if (ovr.revoked_at) return; // already revoked — idempotent

  const { error } = await supabase
    .from("user_permission_overrides")
    .update({ revoked_at: new Date().toISOString(), revoked_by: input.actorId })
    .eq("id", input.id);
  if (error) throw new Error(`revokeOverride/update: ${error.message}`);

  await writeAudit(supabase, {
    actorId: input.actorId,
    targetUserId: ovr.user_id,
    resource: ovr.resource,
    action: ovr.action,
    changeType: "revoke",
    oldState: ovr.state,
    newState: null,
    reason: null,
  });
}

/** The append-only audit ledger, most-recent first. */
export async function listPermissionAudit(
  filters: { targetUserId?: string; from?: string; to?: string } = {}
): Promise<PermissionAuditRow[]> {
  const supabase = await db();
  let q = supabase
    .from("permission_audit")
    .select(
      "id, actor_user_id, target_user_id, target_role, resource, action, change_type, old_state, new_state, reason, created_at"
    );
  if (filters.targetUserId) q = q.eq("target_user_id", filters.targetUserId);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`listPermissionAudit: ${error.message}`);
  return (data ?? []) as PermissionAuditRow[];
}
