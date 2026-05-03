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
}

const RoleContext = createContext<RoleContextValue | null>(null);

const DEFAULT_ROLE: Role = "ViewOnly";

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value = useMemo<RoleContextValue>(
    () => ({ role: user?.role ?? DEFAULT_ROLE }),
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
 * Permission gate. Reads role straight from useAuth() so it stays correct
 * even if a wrapper provider misses an update.
 */
export function Can({ resource, action, fallback = null, children }: CanProps) {
  const { user } = useAuth();
  const role = user?.role ?? DEFAULT_ROLE;
  return hasPermission(role, resource, action) ? <>{children}</> : <>{fallback}</>;
}
