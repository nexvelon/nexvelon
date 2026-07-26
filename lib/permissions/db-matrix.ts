import "server-only";

// PERM-1 — the DB-backed resolver STUB. Reads public.role_permission_matrix
// (seeded byte-faithfully from the static matrix by migration 0114) into an
// in-memory `role → Set<"resource:action">` map, and answers permission checks
// against it with the SAME "present = granted, absent = denied" rule as the
// static hasPermission.
//
// DORMANT this chunk: nothing calls loadRoleMatrix() from a gate yet —
// hasPermission() still reads the static path. PERM-2 swaps this resolver in
// under the same hasPermission signature (resolve-once-per-request, then check
// the set in memory — one query, not a query per gate). Proven identical to the
// static matrix by __tests__/permissions/matrix-parity.test.ts.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { matrixHasPermission } from "@/lib/permissions/seed-matrix";
import type { Action, Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export type RoleMatrix = Map<string, Set<string>>;

/**
 * Load the whole matrix in ONE query into a `role → Set<"resource:action">`
 * map. The reference table is tiny (~194 rows), so this is a single cheap read
 * the caller resolves once per request.
 */
export async function loadRoleMatrix(): Promise<RoleMatrix> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_permission_matrix")
    .select("role, resource, action");
  if (error) throw new Error(`loadRoleMatrix: ${error.message}`);

  const map: RoleMatrix = new Map();
  for (const r of (data ?? []) as { role: string; resource: string; action: string }[]) {
    let set = map.get(r.role);
    if (!set) {
      set = new Set<string>();
      map.set(r.role, set);
    }
    set.add(`${r.resource}:${r.action}`);
  }
  return map;
}

/**
 * Check a resolved matrix. Present = granted, absent = denied — identical to
 * `ROLE_PERMISSIONS[role].some(...)`. Pure; the async load is separate so a
 * request resolves the matrix once and checks it many times in memory.
 */
export function dbHasPermission(
  matrix: RoleMatrix,
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  return matrixHasPermission(matrix, role, resource, action);
}
