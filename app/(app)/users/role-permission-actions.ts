"use server";

// DES-1 — admin-gated server actions for editing ROLE BASELINES (what an entire
// role grants). Distinct from the per-user override actions (PERM-3/4): a
// baseline edit affects EVERY user of the role. Same Admin gate (requireAdmin).
// The resolver is request-cached (React cache) so the next request reloads the
// matrix and picks up the edit — no TTL to wait out.

import { requireAdmin } from "@/lib/permissions/resolve";
import { getAllRoleMatrix, setRoleBaseline } from "@/lib/api/role-permissions";
import type { Action, Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

/** All roles' granted sets for the editor grid. Admin-gated. */
export async function getRoleMatrixAction(): Promise<ActionResult<Record<string, string[]>>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    return { ok: true, data: await getAllRoleMatrix() };
  } catch (e) {
    return fail(e);
  }
}

/** Grant/revoke a single role-baseline cell. Admin-gated; audited; guardrailed. */
export async function setRoleBaselineAction(input: {
  role: Role;
  resource: Resource;
  action: Action;
  granted: boolean;
}): Promise<ActionResult<{ ok: true }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    await setRoleBaseline({
      role: input.role,
      resource: input.resource,
      action: input.action,
      granted: input.granted,
      actorId: gate.profile.id,
    });
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}
