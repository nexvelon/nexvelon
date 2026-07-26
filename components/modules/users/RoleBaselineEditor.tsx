"use client";

// DES-1 — the role-baseline editor. Edits what an ENTIRE role grants (the
// enforced lib/permissions.ts matrix, mirrored in role_permission_matrix). A
// change here affects EVERY current + future user of that role — distinct from
// the per-user override editor (UserPermissionsSheet), which affects one user.
//
// Admins toggle cells; non-admins see it read-only. The protected Admin cells
// (guard.ts) are locked — an admin can never strip the ability to manage
// permissions (also enforced server-side, defense in depth).

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Lock, Minus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ALL_ROLES, ALL_RESOURCES, ALL_ACTIONS, ROLE_LABELS, ROLE_DESCRIPTIONS,
  type Action, type Resource,
} from "@/lib/permissions";
import { isProtectedAdminCell, ADMIN_LOCKOUT_ERROR } from "@/lib/permissions/guard";
import { permKey } from "@/lib/permissions/admin-ui";
import {
  getRoleMatrixAction, setRoleBaselineAction,
} from "@/app/(app)/users/role-permission-actions";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoleBaselineEditor() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [matrix, setMatrix] = useState<Record<string, Set<string>> | null>(null);
  const [role, setRole] = useState<Role>("Warehouse");
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getRoleMatrixAction();
    if (res.ok) {
      const m: Record<string, Set<string>> = {};
      for (const r of ALL_ROLES) m[r] = new Set(res.data[r] ?? []);
      setMatrix(m);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const roleSet = useMemo(() => matrix?.[role] ?? new Set<string>(), [matrix, role]);

  const toggle = (resource: Resource, action: Action) => {
    if (!isAdmin || !matrix) return;
    const key = permKey(resource, action);
    const currentlyGranted = roleSet.has(key);
    const nextGranted = !currentlyGranted;
    // Client-side lock (server enforces too).
    if (role === "Admin" && !nextGranted && isProtectedAdminCell(resource, action)) {
      toast.error("This permission is required for managing permissions and can't be removed.");
      return;
    }
    // Optimistic.
    setMatrix((prev) => {
      if (!prev) return prev;
      const copy = { ...prev, [role]: new Set(prev[role]) };
      if (nextGranted) copy[role].add(key); else copy[role].delete(key);
      return copy;
    });
    startTransition(async () => {
      const res = await setRoleBaselineAction({ role, resource, action, granted: nextGranted });
      if (!res.ok) {
        await load(); // revert to server truth
        toast.error(res.error === ADMIN_LOCKOUT_ERROR
          ? "That permission is required for managing permissions and can't be removed."
          : res.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="nx-eyebrow">Role</span>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground mt-1 text-[12px]">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <p className="text-muted-foreground max-w-sm text-right text-[11px]">
          {isAdmin
            ? "Editing a role changes it for EVERY user with that role (and future hires). For one person, use a per-user override on the Users tab."
            : "Read-only — role baselines can only be edited by an admin."}
        </p>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 p-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Resource</TableHead>
                  {ALL_ACTIONS.map((a) => (
                    <TableHead key={a} className="text-center text-[9px] uppercase">{a}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_RESOURCES.map((resource) => (
                  <TableRow key={resource}>
                    <TableCell className="text-xs font-medium">{resource}</TableCell>
                    {ALL_ACTIONS.map((action) => {
                      const granted = roleSet.has(permKey(resource, action));
                      const locked = role === "Admin" && isProtectedAdminCell(resource, action);
                      return (
                        <TableCell key={action} className="p-0 text-center">
                          <button
                            type="button"
                            disabled={!isAdmin || pending || locked}
                            onClick={() => toggle(resource, action)}
                            title={locked ? "Required for permission management — cannot be removed" : `${resource}:${action}`}
                            className={cn(
                              "flex h-7 w-full items-center justify-center transition-colors",
                              isAdmin && !locked && "hover:bg-muted/50",
                              granted && "bg-emerald-50",
                              (!isAdmin || locked) && "cursor-not-allowed"
                            )}
                          >
                            {locked ? (
                              <Lock className="h-3 w-3 text-muted-foreground/70" />
                            ) : granted ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Minus className="h-3 w-3 text-muted-foreground/40" />
                            )}
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
