"use client";

// DASH-1 — like CanFinancials, but the financials:EDIT tier (cost-side figures:
// WIP, HST net, blended margin). Used as defense-in-depth alongside the action's
// server-authoritative redaction.

import type { ReactNode } from "react";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";

export function CanFinancialsEdit({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const { role } = useRole();
  return hasPermission(role, "financials", "edit") ? <>{children}</> : <>{fallback}</>;
}
