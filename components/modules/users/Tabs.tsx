"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Building2,
  Check,
  Copy,
  Mail,
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
import type { Role, User } from "@/lib/types";

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

interface UsersTabProps {
  onPick: (u: User) => void;
}

export function UsersTab({ onPick }: UsersTabProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter((v ?? "all") as typeof roleFilter)}>
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
        <Button onClick={() => toast.success("Invitation drafted", { description: "Demo: would send email." })}>
          <Mail className="mr-1 h-3.5 w-3.5" />
          Invite User
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
              <TableHead className="text-[11px] uppercase">Last Active</TableHead>
              <TableHead className="text-[11px] uppercase">MFA</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id} className="cursor-pointer hover:bg-brand-gold/5" onClick={() => onPick(u)}>
                <TableCell>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback
                      style={{ backgroundColor: u.avatarColor }}
                      className="text-[9px] font-semibold text-white"
                    >
                      {initials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="text-brand-charcoal text-xs font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                <TableCell className="text-xs">
                  <span className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]">
                    {ROLE_LABELS[u.role]}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {u.role === "ProjectManager"
                    ? "Operations"
                    : u.role === "SalesRep"
                      ? "Sales"
                      : u.role === "Accountant"
                        ? "Finance"
                        : u.role === "Subcontractor"
                          ? "External"
                          : "Field"}
                </TableCell>
                <TableCell className="text-xs">
                  {u.active ? (
                    <span className="bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      Active
                    </span>
                  ) : (
                    <span className="bg-amber-50 text-amber-800 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      Suspended
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {u.id === "u-001" ? "Just now" : u.id === "u-018" ? "2h ago" : "Yesterday"}
                </TableCell>
                <TableCell>
                  {u.id === "u-001" || u.id === "u-018" || u.id === "u-009" ? (
                    <Check className="text-emerald-600 h-4 w-4" />
                  ) : (
                    <X className="text-muted-foreground/40 h-4 w-4" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="xs" variant="ghost">
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
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

const INVITATIONS = [
  { id: "inv-1", email: "lina.brooks@nexvelon.com", role: "Technician" as Role, sentAt: "2026-04-18", status: "Pending" },
  { id: "inv-2", email: "claire.dorothy@nexvelon.com", role: "Accountant" as Role, sentAt: "2026-04-22", status: "Pending" },
  { id: "inv-3", email: "marcus.fielding@beacon-fire.com", role: "Subcontractor" as Role, sentAt: "2026-04-25", status: "Pending" },
];

export function InvitationsTab() {
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Email</TableHead>
            <TableHead className="text-[11px] uppercase">Role</TableHead>
            <TableHead className="text-[11px] uppercase">Sent</TableHead>
            <TableHead className="text-[11px] uppercase">Status</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {INVITATIONS.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="text-xs">{i.email}</TableCell>
              <TableCell className="text-xs">
                <span className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]">
                  {ROLE_LABELS[i.role]}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {format(parseISO(i.sentAt), "MMM d, yyyy")}
              </TableCell>
              <TableCell>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  {i.status}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <Button size="xs" variant="outline" onClick={() => toast.success(`Resent to ${i.email}`)}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Resend
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => toast(`Revoked invite for ${i.email}`)}>
                    Revoke
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
