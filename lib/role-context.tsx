"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Role } from "./types";
import { hasPermission, type Action, type Resource } from "./permissions";
import { useAuth } from "@/components/auth/AuthProvider";

// ============================================================================
// RoleProvider — sources `role` from the authenticated profile.
//
// Pre-Session-A this was a localStorage-backed UI demo store mutated by the
// top-bar role-switcher. The switcher and its setter were retired in
// Session A · Phase 6. The provider survives because Sidebar.tsx,
// `lib/use-read-only.ts`, and a handful of other surfaces still read role
// via useRole() — they get the live, authoritative value now.
//
// `<Can resource action />` reads from useAuth() directly so it can never
// be desynced from the real role.
// ============================================================================

interface RoleContextValue {
  role: Role;
  /** Chunk 3c: the current user's per-user grant keys (allow-only overlay). */
  grants: Set<string>;
  /**
   * PERM-2: DB-resolved permission set ("resource:action"), or null until
   * loaded / on failure. Consumers prefer this and fall back to the static
   * matrix when null.
   */
  permissionSet: Set<string> | null;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const DEFAULT_ROLE: Role = "ViewOnly";
const EMPTY_GRANTS: Set<string> = new Set();

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, grants, permissionSet } = useAuth();

  const value = useMemo<RoleContextValue>(
    () => ({
      role: user?.role ?? DEFAULT_ROLE,
      grants: grants ?? EMPTY_GRANTS,
      permissionSet: permissionSet ?? null,
    }),
    [user?.role, grants, permissionSet]
  );

  return (
    <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}

/**
 * PERM-2 — the single client permission decision. Prefers the DB-resolved set
 * when loaded; falls back to the static matrix otherwise (fail-safe, and
 * identical to the DB set per the PERM-1 parity gate).
 */
export function resolveClientPermission(
  role: Role,
  resource: Resource,
  action: Action,
  permissionSet: Set<string> | null
): boolean {
  if (permissionSet) return permissionSet.has(`${resource}:${action}`);
  return hasPermission(role, resource, action);
}

interface CanProps {
  resource: Resource;
  action: Action;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Permission gate. Reads role straight from useAuth() so it stays correct
 * even if a wrapper provider misses an update.
 */
export function Can({ resource, action, fallback = null, children }: CanProps) {
  const { user, permissionSet } = useAuth();
  const role = user?.role ?? DEFAULT_ROLE;
  // PERM-2: prefer the DB-resolved set; fall back to the static matrix until it
  // loads / on failure. The two are equal per the PERM-1 parity gate, so there
  // is no visible change.
  return resolveClientPermission(role, resource, action, permissionSet ?? null)
    ? <>{children}</>
    : <>{fallback}</>;
}
