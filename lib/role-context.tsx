"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Role } from "./types";
import { hasPermission, type Action, type Resource } from "./permissions";
import { useAuth } from "@/components/auth/AuthProvider";

// ============================================================================
// RoleProvider — Session A onwards.
//
// Pre-Session-A this was a localStorage-backed UI demo store that the
// top-bar role-switcher mutated freely. Now that Supabase Auth is real, the
// role is sourced exclusively from the authenticated user's profile row —
// `setRole` is preserved as a no-op so the legacy RoleSwitcher dropdown
// still compiles, but it no longer changes anything (intentional: Phase 6
// will remove the switcher entirely).
//
// `<Can resource action />` always reads the live auth role, regardless of
// any setRole call. This keeps permission gates correct even if a future
// surface tries to "demo override" the role.
// ============================================================================

interface RoleContextValue {
  role: Role;
  /** No-op since Session A. Kept for legacy callers (RoleSwitcher). */
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const DEFAULT_ROLE: Role = "ViewOnly";

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value = useMemo<RoleContextValue>(
    () => ({
      role: user?.role ?? DEFAULT_ROLE,
      setRole: () => {
        if (process.env.NODE_ENV !== "production") {
          // Surface stale demo wiring during dev; silent in prod.
          console.warn(
            "[role-context] setRole() is a no-op since Session A. The role is " +
              "read from the authenticated profile. Remove the legacy " +
              "RoleSwitcher in Phase 6."
          );
        }
      },
    }),
    [user?.role]
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

interface CanProps {
  resource: Resource;
  action: Action;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Permission gate. Reads the role straight from `useAuth()` rather than
 * the (now-no-op) RoleProvider state, so it can never be desynced.
 */
export function Can({ resource, action, fallback = null, children }: CanProps) {
  const { user } = useAuth();
  const role = user?.role ?? DEFAULT_ROLE;
  return hasPermission(role, resource, action) ? <>{children}</> : <>{fallback}</>;
}
