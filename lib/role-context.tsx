"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "./types";
import { hasPermission, type Action, type Resource } from "./permissions";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);
const STORAGE_KEY = "nexvelon:role";

const VALID_ROLES: Role[] = [
  "Admin",
  "SalesRep",
  "ProjectManager",
  "Technician",
  "Subcontractor",
  "Accountant",
  "ViewOnly",
];

function isRole(s: string | null): s is Role {
  return s !== null && (VALID_ROLES as string[]).includes(s);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  // Default to Admin server-side so SSR + client hydration match; sync from
  // localStorage after mount so demo-account chips persist across reloads.
  const [role, setRoleState] = useState<Role>("Admin");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isRole(saved)) setRoleState(saved);
  }, []);

  const setRole = (next: Role) => {
    setRoleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>
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

export function Can({ resource, action, fallback = null, children }: CanProps) {
  const { role } = useRole();
  return hasPermission(role, resource, action) ? <>{children}</> : <>{fallback}</>;
}
