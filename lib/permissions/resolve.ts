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
import { loadRoleMatrix, dbHasPermission, type RoleMatrix } from "@/lib/permissions/db-matrix";
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

export interface ResolvedAuth {
  profile: DbProfile | null;
  role: Role | null;
  /** Sync check against the resolved (DB, or static-on-failure) set. */
  can: (resource: Resource, action: Action) => boolean;
}

/**
 * Resolve the current user's identity + permission checker ONCE per request.
 * Callers `await getCurrentAuth()` (they are already in an async context) and
 * then call `auth.can(resource, action)` synchronously. PERM-3 migrates the
 * security-critical server gates onto this so per-user overrides take effect.
 */
export const getCurrentAuth = cache(async (): Promise<ResolvedAuth> => {
  const profile = await getCurrentProfile();
  if (!profile) return { profile: null, role: null, can: () => false };
  const role = adaptDbRole(profile.role);
  const matrix = await getRoleMatrix();
  return {
    profile,
    role,
    can: (resource, action) => dbHasPermission(matrix, role, resource, action),
  };
});

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
