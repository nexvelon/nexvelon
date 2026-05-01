"use client";

import type { ReactNode } from "react";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";

interface CanFinancialsProps {
  fallback: ReactNode;
  children: ReactNode;
}

export function CanFinancials({ fallback, children }: CanFinancialsProps) {
  const { role } = useRole();
  return hasPermission(role, "financials", "view") ? <>{children}</> : <>{fallback}</>;
}
