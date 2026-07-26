"use client";

// PERM-4 — the per-user permission override editor. Admin-only surface (mounts
// behind the Users admin page, itself Admin-gated). Shows the user's role, an
// EFFECTIVE grid (resource × action) sourced from the server resolver (so it
// matches enforcement exactly), a tri-state override editor (Default / Granted /
// Denied) with a REQUIRED reason on grant/deny, and this user's permission-audit
// history. The separate quotes.edit_discount feature grant stays on the Users
// row toggle — untouched.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ALL_RESOURCES, ALL_ACTIONS, ROLE_LABELS, roleDefaultKeys,
  type Action, type Resource,
} from "@/lib/permissions";
import {
  overrideMap, cellStateFor, cellChangeFor, permKey, type CellState,
} from "@/lib/permissions/admin-ui";
import {
  listUserOverridesAction,
  setUserOverrideAction,
  revokeUserOverrideAction,
  getUserEffectivePermissionsAction,
  listPermissionAuditAction,
} from "@/app/(app)/users/permission-override-actions";
import type { PermissionOverride, PermissionAuditRow } from "@/lib/api/permission-overrides";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const NEXT_STATE: Record<CellState, CellState> = {
  default: "granted",
  granted: "denied",
  denied: "default",
};

export function UserPermissionsSheet({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [role, setRole] = useState<Role | null>(null);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [effective, setEffective] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<PermissionAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [ov, eff, au] = await Promise.all([
      listUserOverridesAction(userId),
      getUserEffectivePermissionsAction(userId),
      listPermissionAuditAction({ targetUserId: userId }),
    ]);
    if (!ov.ok || !eff.ok) {
      setRestricted(true);
      setLoading(false);
      return;
    }
    setRestricted(false);
    setOverrides(ov.data);
    setRole(eff.data.role);
    setEffective(new Set(eff.data.effective));
    setAudit(au.ok ? au.data : []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (open && userId) void load();
  }, [open, userId, load]);

  const ovMap = overrideMap(overrides);
  const roleDefaults = role ? roleDefaultKeys(role) : new Set<string>();

  const applyChange = (resource: Resource, action: Action, target: CellState) => {
    if (!userId) return;
    const change = cellChangeFor(target);
    startTransition(async () => {
      if (change.kind === "revoke") {
        const existing = overrides.find((o) => o.resource === resource && o.action === action);
        if (!existing) return; // already default
        const res = await revokeUserOverrideAction({ id: existing.id });
        if (!res.ok) { toast.error(res.error); return; }
      } else {
        const reason = window.prompt(
          `Reason for ${change.state === "granted" ? "granting" : "denying"} ${resource}:${action} (required for the audit log):`
        );
        if (reason == null || reason.trim() === "") {
          toast.error("A reason is required.");
          return;
        }
        const res = await setUserOverrideAction({ userId, resource, action, state: change.state, reason: reason.trim() });
        if (!res.ok) { toast.error(res.error); return; }
      }
      toast.success("Permission updated");
      await load();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Permissions — {userName}</SheetTitle>
          <SheetDescription>
            {role ? (
              <>Role <span className="font-medium">{ROLE_LABELS[role]}</span>. Cells show the effective result; click a cell to cycle Default → Granted → Denied. A deny always wins over a grant. Grant/deny require a reason (recorded in the audit log).</>
            ) : (
              "Per-user permission overrides on top of the role baseline."
            )}
          </SheetDescription>
        </SheetHeader>

        {restricted ? (
          <p className="text-muted-foreground p-6 text-sm">You don&apos;t have permission to manage user permissions.</p>
        ) : loading ? (
          <p className="text-muted-foreground flex items-center gap-2 p-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="space-y-6 py-4">
            {/* Legend */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-[11px]">
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" /> Effective (allowed)</span>
              <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5 text-emerald-600" /> Granted override</span>
              <span className="inline-flex items-center gap-1"><X className="h-3.5 w-3.5 text-red-600" /> Denied override</span>
              <span className="inline-flex items-center gap-1"><Minus className="h-3.5 w-3.5" /> Not granted</span>
            </div>

            {/* Effective grid — resource rows × action columns */}
            <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--brand-border)" }}>
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
                        const key = permKey(resource, action);
                        const state = cellStateFor(resource, action, ovMap);
                        const isEffective = effective.has(key);
                        const isBaseline = roleDefaults.has(key);
                        return (
                          <TableCell key={action} className="p-0 text-center">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => applyChange(resource, action, NEXT_STATE[state])}
                              title={`${resource}:${action} — ${state}${isBaseline ? " (role baseline)" : ""}`}
                              className={cn(
                                "flex h-7 w-full items-center justify-center transition-colors hover:bg-muted/50 disabled:opacity-50",
                                state === "granted" && "bg-emerald-50",
                                state === "denied" && "bg-red-50"
                              )}
                            >
                              <CellIcon state={state} isEffective={isEffective} />
                            </button>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Active overrides list */}
            <div>
              <p className="nx-eyebrow mb-2">Active overrides</p>
              {overrides.length === 0 ? (
                <p className="text-muted-foreground text-xs">None — this user has the role baseline only.</p>
              ) : (
                <ul className="space-y-1.5">
                  {overrides.map((o) => (
                    <li key={o.id} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--brand-border)" }}>
                      <span className="flex items-center gap-2">
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", o.state === "granted" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                          {o.state === "granted" ? "Grant" : "Deny"}
                        </span>
                        <span className="font-mono">{o.resource}:{o.action}</span>
                        {o.reason && <span className="text-muted-foreground">— {o.reason}</span>}
                      </span>
                      <Button size="xs" variant="ghost" disabled={pending}
                        onClick={() => applyChange(o.resource as Resource, o.action as Action, "default")}>
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Audit history */}
            <div>
              <p className="nx-eyebrow mb-2">Permission history</p>
              {audit.length === 0 ? (
                <p className="text-muted-foreground text-xs">No changes recorded.</p>
              ) : (
                <ul className="space-y-1">
                  {audit.map((a) => (
                    <li key={a.id} className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[11px]">
                      <span className="tabular-nums">{a.created_at ? format(parseISO(a.created_at), "MMM d, HH:mm") : "—"}</span>
                      <span className={cn("rounded px-1 text-[10px] font-medium",
                        a.change_type === "grant" ? "bg-emerald-50 text-emerald-700" : a.change_type === "deny" ? "bg-red-50 text-red-700" : "bg-muted")}>
                        {a.change_type}
                      </span>
                      {a.resource && <span className="font-mono">{a.resource}:{a.action}</span>}
                      {a.old_state && <span>({a.old_state}→{a.new_state ?? "default"})</span>}
                      {a.reason && <span>— {a.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CellIcon({ state, isEffective }: { state: CellState; isEffective: boolean }) {
  if (state === "granted") return <Plus className="h-3.5 w-3.5 text-emerald-600" />;
  if (state === "denied") return <X className="h-3.5 w-3.5 text-red-600" />;
  // default (role baseline): show a check if the baseline grants it, else a dash.
  return isEffective ? <Check className="h-3.5 w-3.5 text-emerald-600/70" /> : <Minus className="h-3 w-3 text-muted-foreground/40" />;
}
