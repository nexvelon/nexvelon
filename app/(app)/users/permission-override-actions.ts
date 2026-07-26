"use server";

// PERM-3 — admin-gated server actions for per-user permission overrides + the
// audit ledger. Same Admin gate as the existing user-grants controls
// (requireAdmin, consolidated in PERM-2). Every mutation is audited in the
// data layer (append-only permission_audit).

import { requireAdmin } from "@/lib/permissions/resolve";
import {
  listOverridesForUser,
  setOverride,
  revokeOverride,
  listPermissionAudit,
  type PermissionOverride,
  type PermissionAuditRow,
  type OverrideState,
} from "@/lib/api/permission-overrides";
import type { Action, Resource } from "@/lib/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

export async function listUserOverridesAction(
  userId: string
): Promise<ActionResult<PermissionOverride[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    if (!userId) return { ok: false, error: "No user specified." };
    return { ok: true, data: await listOverridesForUser(userId) };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserOverrideAction(input: {
  userId: string;
  resource: Resource;
  action: Action;
  state: OverrideState;
  reason?: string;
}): Promise<ActionResult<PermissionOverride>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    if (!input.userId) return { ok: false, error: "No user specified." };
    const data = await setOverride({
      userId: input.userId,
      resource: input.resource,
      action: input.action,
      state: input.state,
      reason: input.reason ?? null,
      actorId: gate.profile.id,
    });
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeUserOverrideAction(input: {
  id: string;
}): Promise<ActionResult<{ revoked: true }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    if (!input.id) return { ok: false, error: "No override specified." };
    await revokeOverride({ id: input.id, actorId: gate.profile.id });
    return { ok: true, data: { revoked: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function listPermissionAuditAction(input: {
  targetUserId?: string;
  from?: string;
  to?: string;
} = {}): Promise<ActionResult<PermissionAuditRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    return { ok: true, data: await listPermissionAudit(input) };
  } catch (e) {
    return fail(e);
  }
}
