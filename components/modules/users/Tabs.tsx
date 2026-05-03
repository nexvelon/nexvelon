"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import {
  Building2,
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { users } from "@/lib/mock-data/users";
import { auditLog } from "@/lib/mock-data/audit-log";
import { subcontractors } from "@/lib/mock-data/subcontractors";
import {
  MODULE_ORDER,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions-matrix";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { normalizeDbRole } from "@/lib/auth/normalize-role";
import {
  reactivateUserAction,
  suspendUserAction,
  terminateUserAction,
} from "@/app/(app)/users/actions";
import type { Role } from "@/lib/types";
import type { DbProfile, DbProfileStatus } from "@/lib/types/database";

const ROLES: Role[] = [
  "Admin",
  "SalesRep",
  "ProjectManager",
  "Technician",
  "Subcontractor",
  "Accountant",
  "ViewOnly",
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ────────────────────────────────────────────────────────────────────────────
// USERS
// ────────────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "Active" | "Invited" | "Suspended";

const STATUS_PILL: Record<DbProfileStatus, { label: string; cls: string }> = {
  Active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  Invited: { label: "Invited", cls: "bg-amber-50 text-amber-800" },
  Suspended: { label: "Suspended", cls: "bg-red-50 text-red-700" },
  Terminated: { label: "Terminated", cls: "bg-zinc-100 text-zinc-700" },
};

function profileDisplayName(p: DbProfile): string {
  const first = (p.first_name ?? "").trim();
  const last = (p.last_name ?? "").trim();
  const display = (p.display_name ?? "").trim();
  const composed = [first, last].filter(Boolean).join(" ");
  const localPart = p.email.split("@")[0] ?? p.email;
  return display || composed || localPart;
}

interface UsersTabProps {
  realUsers: DbProfile[];
  onInvite: () => void;
}

export function UsersTab({ realUsers, onInvite }: UsersTabProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return realUsers.filter((u) => {
      const appRole = normalizeDbRole(u.role);
      if (roleFilter !== "all" && appRole !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (q) {
        const name = profileDisplayName(u).toLowerCase();
        if (!name.includes(q) && !u.email.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [realUsers, roleFilter, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-3 shadow-sm">
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) =>
            setRoleFilter((v ?? "all") as typeof roleFilter)
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v ?? "all") as StatusFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Invited">Invited</SelectItem>
            <SelectItem value="Suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onInvite} className="ml-auto">
          + Invite User
        </Button>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-[11px] uppercase">Name</TableHead>
              <TableHead className="text-[11px] uppercase">Email</TableHead>
              <TableHead className="text-[11px] uppercase">Role</TableHead>
              <TableHead className="text-[11px] uppercase">Department</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Last Login</TableHead>
              <TableHead className="text-[11px] uppercase">MFA</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-12 text-center text-xs"
                >
                  No matching users.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => {
              const name = profileDisplayName(u);
              const appRole = normalizeDbRole(u.role);
              const pill = STATUS_PILL[u.status];
              return (
                <TableRow key={u.id} className="hover:bg-brand-gold/5">
                  <TableCell>
                    <Avatar className="h-7 w-7">
                      <AvatarFallback
                        className="text-[9px] font-semibold text-white"
                        style={{ backgroundColor: "var(--brand-primary)" }}
                      >
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-xs font-medium">
                    {name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {u.email}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]">
                      {ROLE_LABELS[appRole]}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {u.department ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        pill.cls
                      )}
                    >
                      {pill.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {u.last_login_at
                      ? format(parseISO(u.last_login_at), "MMM d, HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {u.mfa_enrolled ? (
                      <Check className="text-emerald-600 h-4 w-4" />
                    ) : (
                      <X className="text-muted-foreground/40 h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions profile={u} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Per-row action menu (Suspend / Reactivate / Terminate).
// Calls server actions in app/(app)/users/actions.ts. Disabled when the
// row is the signed-in user (you can't suspend yourself out of the UI).
function UserRowActions({ profile }: { profile: DbProfile }) {
  const { user: me } = useAuth();
  const [pending, startTransition] = useTransition();
  const isSelf = me?.id === profile.id;
  const isTerminated = profile.status === "Terminated";

  const run = (
    fn: typeof suspendUserAction,
    confirmMsg: string,
    successMsg: string
  ) => {
    if (isSelf) return;
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      const result = await fn(profile.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-50"
        aria-label={`Actions for ${profile.email}`}
        disabled={pending || isSelf || isTerminated}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
          {profile.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(profile.status === "Active" || profile.status === "Invited") && (
          <DropdownMenuItem
            onClick={() =>
              run(
                suspendUserAction,
                `Suspend ${profileDisplayName(profile)}? Active sessions will be revoked.`,
                "User suspended."
              )
            }
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Suspend
          </DropdownMenuItem>
        )}
        {profile.status === "Suspended" && (
          <DropdownMenuItem
            onClick={() =>
              run(
                reactivateUserAction,
                `Reactivate ${profileDisplayName(profile)}?`,
                "User reactivated."
              )
            }
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Reactivate
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            run(
              terminateUserAction,
              `Terminate ${profileDisplayName(profile)}? They will be signed out everywhere and unable to sign back in. This cannot be undone from the UI.`,
              "User terminated."
            )
          }
          className="text-red-600 focus:text-red-700"
        >
          <X className="mr-2 h-3.5 w-3.5" />
          Terminate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ROLES
// ────────────────────────────────────────────────────────────────────────────

export function RolesTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {ROLES.map((r) => {
        const granted = ROLE_DEFAULT_PERMISSIONS[r].size;
        const total = PERMISSION_CATALOG.length;
        const userCount = users.filter((u) => u.role === r).length;
        return (
          <Card key={r} className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-brand-navy font-serif text-base">
                  {ROLE_LABELS[r]}
                </h3>
                <p className="text-muted-foreground text-[11px]">
                  {userCount} {userCount === 1 ? "user" : "users"} assigned
                </p>
              </div>
              <Shield className="text-brand-gold h-4 w-4" />
            </div>
            <div className="mt-3">
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-brand-gold h-full"
                  style={{ width: `${(granted / total) * 100}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                {granted} / {total} permissions enabled
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="xs" variant="outline" onClick={() => toast.info(`Editing ${ROLE_LABELS[r]}…`)}>
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
              <Button size="xs" variant="ghost" onClick={() => toast.success(`Cloned ${ROLE_LABELS[r]}`)}>
                <Copy className="mr-1 h-3 w-3" />
                Duplicate
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PERMISSIONS MATRIX
// ────────────────────────────────────────────────────────────────────────────

export function PermissionsMatrixTab() {
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <div className="overflow-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="bg-card sticky left-0 top-0 z-10 border-r border-b border-[var(--border)] px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                Role
              </th>
              {MODULE_ORDER.map((module) => {
                const modulePerms = PERMISSION_CATALOG.filter((p) => p.module === module);
                return (
                  <th
                    key={module}
                    colSpan={modulePerms.length}
                    className="border-l border-r border-b border-[var(--border)] px-2 py-1 text-center"
                  >
                    <span className="font-serif text-[11px] text-brand-navy">{module}</span>
                  </th>
                );
              })}
            </tr>
            <tr className="bg-muted/30">
              <th className="bg-card sticky left-0 z-10 border-r border-b border-[var(--border)] px-3 py-2"></th>
              {MODULE_ORDER.flatMap((module) =>
                PERMISSION_CATALOG.filter((p) => p.module === module).map((p) => (
                  <th
                    key={p.id}
                    className="border-l border-b border-[var(--border)] px-2 py-1 text-left text-[9px] font-medium text-muted-foreground"
                    style={{ writingMode: "vertical-rl" as const, height: 100 }}
                    title={p.description}
                  >
                    {p.label}
                    {p.enforced && <span className="text-brand-gold">·live</span>}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => {
              const grants = ROLE_DEFAULT_PERMISSIONS[r];
              return (
                <tr key={r}>
                  <td className="bg-card sticky left-0 z-10 border-r border-b border-[var(--border)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-navy font-serif text-xs font-semibold">
                        {ROLE_LABELS[r]}
                      </span>
                    </div>
                  </td>
                  {MODULE_ORDER.flatMap((module) =>
                    PERMISSION_CATALOG.filter((p) => p.module === module).map((p) => (
                      <td
                        key={`${r}-${p.id}`}
                        className={cn(
                          "border-l border-b border-[var(--border)] px-2 py-2 text-center",
                          grants.has(p.id) && "bg-brand-gold/8"
                        )}
                      >
                        {grants.has(p.id) ? (
                          <Check className="text-brand-gold mx-auto h-3 w-3" />
                        ) : (
                          <X className="text-muted-foreground/40 mx-auto h-3 w-3" />
                        )}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ACTIVITY LOG
// ────────────────────────────────────────────────────────────────────────────

export function ActivityLogTab() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const userById = new Map(users.map((u) => [u.id, u]));

  const filtered = useMemo(() => {
    return auditLog.filter((e) => {
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const u = userById.get(e.userId);
        if (
          !e.action.toLowerCase().includes(q) &&
          !e.target.toLowerCase().includes(q) &&
          !(u?.name.toLowerCase().includes(q) ?? false)
        )
          return false;
      }
      return true;
    });
  }, [search, moduleFilter, userById]);

  return (
    <div className="space-y-3">
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-3 shadow-sm">
        <Input
          placeholder="Search action, target, or user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {["Quotes", "Projects", "Inventory", "Scheduling", "Financials", "Users", "Settings", "Auth"].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs ml-auto">
          {filtered.length} of {auditLog.length} entries
        </span>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Timestamp</TableHead>
              <TableHead className="text-[11px] uppercase">User</TableHead>
              <TableHead className="text-[11px] uppercase">Module</TableHead>
              <TableHead className="text-[11px] uppercase">Action</TableHead>
              <TableHead className="text-[11px] uppercase">Target</TableHead>
              <TableHead className="text-[11px] uppercase">IP</TableHead>
              <TableHead className="text-[11px] uppercase">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 100).map((e) => {
              const u = userById.get(e.userId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground text-[11px] tabular-nums">
                    {format(parseISO(e.timestamp), "MMM d, HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-xs">{u?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.module}</TableCell>
                  <TableCell className="text-brand-charcoal text-xs">{e.action}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[260px] truncate text-[11px]">
                    {e.target}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[11px]">{e.ipAddress}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        e.result === "Success"
                          ? "bg-emerald-50 text-emerald-700"
                          : e.result === "Denied"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                      )}
                    >
                      {e.result}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUBCONTRACTORS
// ────────────────────────────────────────────────────────────────────────────

export function SubcontractorsTab() {
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Company</TableHead>
            <TableHead className="text-[11px] uppercase">Primary Contact</TableHead>
            <TableHead className="text-[11px] uppercase">Trade</TableHead>
            <TableHead className="text-[11px] uppercase">Insurance Expiry</TableHead>
            <TableHead className="text-[11px] uppercase">WSIB #</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Active Projects</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Paid YTD</TableHead>
            <TableHead className="text-[11px] uppercase">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subcontractors.map((s) => {
            const expiry = parseISO(s.insuranceExpiry);
            const daysToExpiry = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const expiringSoon = daysToExpiry < 60;
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="text-brand-charcoal inline-flex items-center gap-2 text-xs font-medium">
                    <Building2 className="text-brand-gold h-3.5 w-3.5" />
                    {s.company}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div>{s.primaryContact}</div>
                  <div className="text-muted-foreground text-[10px]">{s.email}</div>
                </TableCell>
                <TableCell className="text-xs">{s.trade}</TableCell>
                <TableCell
                  className={cn(
                    "text-xs tabular-nums",
                    expiringSoon ? "text-red-600 font-semibold" : "text-muted-foreground"
                  )}
                >
                  {format(expiry, "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-[11px]">{s.wsibNumber}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{s.activeProjects}</TableCell>
                <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                  {formatCurrency(s.paidYTD)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      s.status === "Active"
                        ? "bg-emerald-50 text-emerald-700"
                        : s.status === "Pending Documents"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-red-50 text-red-700"
                    )}
                  >
                    {s.status}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// INVITATIONS
// ────────────────────────────────────────────────────────────────────────────

interface InvitationsTabProps {
  realUsers: DbProfile[];
}

export function InvitationsTab({ realUsers }: InvitationsTabProps) {
  const pending = useMemo(
    () => realUsers.filter((u) => u.status === "Invited"),
    [realUsers]
  );

  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Email</TableHead>
            <TableHead className="text-[11px] uppercase">Name</TableHead>
            <TableHead className="text-[11px] uppercase">Role</TableHead>
            <TableHead className="text-[11px] uppercase">Sent</TableHead>
            <TableHead className="text-[11px] uppercase">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-12 text-center text-xs"
              >
                No pending invitations.
              </TableCell>
            </TableRow>
          )}
          {pending.map((i) => {
            const appRole = normalizeDbRole(i.role);
            return (
              <TableRow key={i.id}>
                <TableCell className="text-xs">{i.email}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {profileDisplayName(i)}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]">
                    {ROLE_LABELS[appRole]}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {format(parseISO(i.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    Awaiting password setup
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
