import "server-only";

// PERM-2 — the request-scoped permission resolver. Resolves a user's role
// permission set ONCE per request from the DB matrix (role_permission_matrix,
// seeded byte-faithfully from lib/permissions.ts by 0114), then answers checks
// against it in memory.
//
// FAIL-SAFE: on ANY DB error, fall back to the STATIC matrix (ROLE_PERMISSIONS)
// for the role — never more permissive than today, and never a lock-out on a
// transient blip. Per-user overrides (PERM-3) will layer on top and skip on
// error.
//
// hasPermission() (lib/permissions.ts) is UNCHANGED this chunk — it stays the
// synchronous static oracle that all existing call sites use and that this
// resolver falls back to. The 847-triple parity gate proves the DB set equals
// that static matrix on every cell, so sourcing a decision from either path
// yields the identical answer.

import { cache } from "react";
import { getCurrentProfile } from "@/lib/auth/profile";
import {
  loadRoleMatrix,
  loadUserOverrides,
  type RoleMatrix,
} from "@/lib/permissions/db-matrix";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import type { Action, Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbProfile, DbRole } from "@/lib/types/database";

/**
 * The 11-value DB role → 7-value app Role adapter used by the SERVER gates.
 * This is the single canonical copy of the function that was duplicated
 * byte-for-byte across 34 server files. Semantics are preserved EXACTLY —
 * note `Warehouse → Technician` (NOT ViewOnly): the client-side
 * `normalizeDbRole` maps Warehouse → ViewOnly, so the two intentionally differ
 * and are NOT merged here (reconciling them would change Warehouse users'
 * server permissions — out of scope for a no-decision-change cutover).
 */
export function adaptDbRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

/**
 * Load the role matrix ONCE per request. React `cache()` memoizes per request,
 * so repeat resolves within one request share a single DB round-trip. On DB
 * error, fall back to the static matrix (the fail-safe oracle) so a decision is
 * never blocked and never more permissive than today.
 */
export const getRoleMatrix = cache(async (): Promise<RoleMatrix> => {
  try {
    return await loadRoleMatrix();
  } catch (e) {
    console.warn(
      "[permissions] role_permission_matrix load failed — falling back to the static matrix.",
      e
    );
    return buildGrantedMatrix(); // == ROLE_PERMISSIONS, per the PERM-1 parity gate
  }
});

/**
 * Load the current user's active overrides ONCE per request (cached by id).
 * FAIL-SAFE: on DB error, resolve to NO overrides so the user falls back to
 * their role default — a denied user reverts to their role's normal access
 * (not an escalation BEYOND the role), and a granted-extra user loses the extra
 * (safe). Overrides are never granted-on-error.
 */
const getOverrides = cache(async (userId: string) => {
  try {
    return await loadUserOverrides(userId);
  } catch (e) {
    console.warn(
      "[permissions] user_permission_overrides load failed — resolving role defaults only.",
      e
    );
    return { granted: new Set<string>(), denied: new Set<string>() };
  }
});

export interface ResolvedAuth {
  profile: DbProfile | null;
  role: Role | null;
  /** Sync check against the resolved set (role default + grants − denies). */
  can: (resource: Resource, action: Action) => boolean;
}

/**
 * Resolve the current user's identity + permission checker ONCE per request.
 * Callers `await getCurrentAuth()` (they are already in an async context) and
 * then call `auth.can(resource, action)` synchronously.
 *
 * PRECEDENCE: role-default set, + granted overrides, − denied overrides applied
 * LAST → deny > grant > default.
 */
export const getCurrentAuth = cache(async (): Promise<ResolvedAuth> => {
  const profile = await getCurrentProfile();
  if (!profile) return { profile: null, role: null, can: () => false };
  const role = adaptDbRole(profile.role);
  const matrix = await getRoleMatrix();
  const overrides = await getOverrides(profile.id);

  // Build the effective set: start from the role default, add grants, then
  // remove denies LAST so a deny always wins over a grant and the role default.
  const resolved = new Set<string>(matrix.get(role) ?? new Set<string>());
  for (const key of overrides.granted) resolved.add(key);
  for (const key of overrides.denied) resolved.delete(key);

  return {
    profile,
    role,
    can: (resource, action) => resolved.has(`${resource}:${action}`),
  };
});

/**
 * The override-aware permission check for the CURRENT request's user. This is
 * what the security-critical server gates call in place of the sync static
 * `hasPermission(adaptRole(me.role), …)` so per-user overrides take effect.
 * For a user with NO overrides it returns the identical answer to the static
 * matrix (proven by the parity gate).
 */
export async function can(resource: Resource, action: Action): Promise<boolean> {
  return (await getCurrentAuth()).can(resource, action);
}

// ── Consolidated server gates ────────────────────────────────────────────────

export type AdminGate =
  | { ok: true; profile: DbProfile }
  | { ok: false; error: string };

/**
 * The single canonical `requireAdmin`, replacing 14 byte-identical local copies.
 * Semantics preserved EXACTLY: signed-in + Active + raw role === "Admin". Admin
 * is a role check (not a matrix permission — the matrix has no `admin` action),
 * so this deliberately does NOT route through `can()`. Returns the profile so
 * callers that needed `.id` / `.email` still have them.
 */
export async function requireAdmin(): Promise<AdminGate> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active") return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true, profile: me };
}

export type PermissionGate =
  | { ok: true; profile: DbProfile }
  | { ok: false; error: string };

/**
 * DB-sourced resource gate (resolve-once + fail-safe). Available for PERM-3 to
 * migrate the inline server gates onto; not yet wired into the 29 inline call
 * sites this chunk.
 */
export async function requirePermission(
  resource: Resource,
  action: Action
): Promise<PermissionGate> {
  const auth = await getCurrentAuth();
  if (!auth.profile) return { ok: false, error: "You're not signed in." };
  if (auth.profile.status !== "Active") return { ok: false, error: "Your account is not active." };
  if (!auth.can(resource, action)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, profile: auth.profile };
}
