import "server-only";

// DES-1 — role-baseline editing. Reads/writes public.role_permission_matrix
// (the DB mirror of ROLE_PERMISSIONS, editable now). A baseline edit changes
// what an ENTIRE role grants (all current + future users of that role), on top
// of which the PERM-3 per-user overrides still apply (deny > grant > default).
//
// Storage model (from 0114): GRANTED-ONLY — a row present = granted, absent =
// denied. So "grant a cell" = upsert the row; "revoke a cell" = delete it.
//
// WRITE PATH: authenticated is SELECT-only on the matrix (0114); writes go
// through the SERVICE-ROLE admin client here, reached only via the Admin-gated
// setRoleBaselineAction. Every edit appends a permission_audit row.
//
// GUARDRAIL: the protected Admin cells (lib/permissions/guard.ts) can never be
// revoked from the Admin role — an admin must never be able to strip the
// ability to manage permissions.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_ROLES, type Action, type Resource } from "@/lib/permissions";
import { ADMIN_LOCKOUT_ERROR, isProtectedAdminCell } from "@/lib/permissions/guard";
import type { Role } from "@/lib/types";

export interface RoleMatrixRow {
  role: string;
  resource: string;
  action: string;
}

/** Every role's granted set, as `role → ["resource:action", …]` — the editor grid. */
export async function getAllRoleMatrix(): Promise<Record<string, string[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_permission_matrix")
    .select("role, resource, action");
  if (error) throw new Error(`getAllRoleMatrix: ${error.message}`);

  const out: Record<string, string[]> = {};
  for (const r of ALL_ROLES) out[r] = [];
  for (const row of (data ?? []) as RoleMatrixRow[]) {
    (out[row.role] ??= []).push(`${row.resource}:${row.action}`);
  }
  return out;
}

/**
 * Grant (upsert) or revoke (delete) a single role-baseline cell, then append a
 * permission_audit row. Blocks revoking a protected Admin cell.
 */
export async function setRoleBaseline(input: {
  role: Role;
  resource: Resource;
  action: Action;
  granted: boolean;
  actorId: string | null;
}): Promise<void> {
  // GUARDRAIL — never let the admin-management capability be stripped from Admin.
  if (input.role === "Admin" && !input.granted && isProtectedAdminCell(input.resource, input.action)) {
    throw new Error(ADMIN_LOCKOUT_ERROR);
  }

  const admin = createAdminClient();

  if (input.granted) {
    const { error } = await admin
      .from("role_permission_matrix")
      .upsert(
        { role: input.role, resource: input.resource, action: input.action, granted: true },
        { onConflict: "role,resource,action", ignoreDuplicates: true }
      );
    if (error) throw new Error(`setRoleBaseline/grant: ${error.message}`);
  } else {
    const { error } = await admin
      .from("role_permission_matrix")
      .delete()
      .eq("role", input.role)
      .eq("resource", input.resource)
      .eq("action", input.action);
    if (error) throw new Error(`setRoleBaseline/revoke: ${error.message}`);
  }

  const { error: auditErr } = await admin.from("permission_audit").insert({
    actor_user_id: input.actorId,
    target_role: input.role,
    resource: input.resource,
    action: input.action,
    change_type: input.granted ? "role_baseline_grant" : "role_baseline_revoke",
    old_state: input.granted ? null : "granted",
    new_state: input.granted ? "granted" : null,
  });
  if (auditErr) throw new Error(`setRoleBaseline/audit: ${auditErr.message}`);
}
