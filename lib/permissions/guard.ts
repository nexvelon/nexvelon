// DES-1 — the admin self-lockout guardrail. Certain Admin-role cells let an
// admin manage permissions; they must never be removable, or an admin could
// strip the very ability to fix permissions. Enforced server-side on BOTH the
// role-baseline editor (setRoleBaseline) and the per-user override editor
// (setOverride, when the target is an Admin), and mirrored client-side to lock
// the cells in the UI. Client-safe (no server imports).

import type { Action, Resource } from "@/lib/permissions";

export const ADMIN_LOCKOUT_ERROR = "admin_lockout_blocked";

/**
 * The protected (resource, action) cells for the Admin role. These gate access
 * to the permissions-management surfaces (the Users admin area + the role /
 * override editors), so they can never be revoked from Admin, nor denied to an
 * individual Admin account.
 */
export const PROTECTED_ADMIN_CELLS: { resource: Resource; action: Action }[] = [
  { resource: "users", action: "view" },
  { resource: "users", action: "manage" },
];

const PROTECTED_KEYS = new Set(
  PROTECTED_ADMIN_CELLS.map((c) => `${c.resource}:${c.action}`)
);

export function isProtectedAdminCell(resource: Resource, action: Action): boolean {
  return PROTECTED_KEYS.has(`${resource}:${action}`);
}
