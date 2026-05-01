"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History,
  Lock,
  Mail,
  Phone,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATA_SCOPES,
  FIELD_VISIBILITIES,
  MODULE_ORDER,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  type DataScope,
  type PermModule,
} from "@/lib/permissions-matrix";
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

const ROLE_LABEL: Record<Role | "Custom", string> = {
  Admin: "Admin",
  SalesRep: "Sales Rep",
  ProjectManager: "Project Manager",
  Technician: "Lead Technician / Technician",
  Subcontractor: "Subcontractor",
  Accountant: "Accountant",
  ViewOnly: "View Only",
  Custom: "Custom (per-user overrides)",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Props {
  user: User | null;
  onClose: () => void;
}

export function UserDrawer({ user, onClose }: Props) {
  const open = user !== null;
  const [role, setRole] = useState<Role>(user?.role ?? "Admin");
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<DataScope>("All data");
  const [fieldVis, setFieldVis] = useState<Record<string, boolean>>({});
  const [mfa, setMfa] = useState(true);
  const [ipAllow, setIpAllow] = useState("");
  const [timeoutMin, setTimeoutMin] = useState("60");

  // Reset state when a different user is picked.
  useEffect(() => {
    if (!user) return;
    setRole(user.role);
    setGrants(new Set(ROLE_DEFAULT_PERMISSIONS[user.role]));
    setScope("All data");
    setFieldVis(
      Object.fromEntries(FIELD_VISIBILITIES.map((f) => [f.id, true]))
    );
    setMfa(user.id === "u-001" || user.id === "u-018");
    setIpAllow("");
    setTimeoutMin("60");
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map<PermModule, typeof PERMISSION_CATALOG>();
    for (const m of MODULE_ORDER) map.set(m, []);
    for (const p of PERMISSION_CATALOG) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return MODULE_ORDER.map((m) => ({ module: m, perms: map.get(m) ?? [] }));
  }, []);

  const togglePerm = (id: string) => {
    setGrants((g) => {
      const next = new Set(g);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetToRole = () => {
    setGrants(new Set(ROLE_DEFAULT_PERMISSIONS[role]));
    toast.success(`Reset to ${ROLE_LABEL[role]} defaults`);
  };

  const grantedCount = grants.size;
  const totalCount = PERMISSION_CATALOG.length;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[640px] overflow-y-auto sm:max-w-2xl"
      >
        {user && (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <Avatar className="ring-brand-gold/40 h-14 w-14 ring-2">
                  <AvatarFallback
                    style={{ backgroundColor: user.avatarColor }}
                    className="text-sm font-semibold text-white"
                  >
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <SheetTitle className="font-serif text-xl">
                    {user.name}
                  </SheetTitle>
                  <SheetDescription>
                    <span className="bg-brand-navy/10 text-brand-navy mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                      {ROLE_LABEL[user.role]}
                    </span>
                  </SheetDescription>
                  <div className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                    <p>
                      <Mail className="-mt-0.5 mr-1 inline h-3 w-3" />
                      {user.email}
                    </p>
                    <p>
                      <Phone className="-mt-0.5 mr-1 inline h-3 w-3" />
                      {user.phone}
                    </p>
                    <p>
                      Last active —{" "}
                      <span className="text-brand-charcoal/70">2h ago · 192.168.1.45</span>
                    </p>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              {/* Section 1 — Role */}
              <Section title="Role assignment">
                <Select value={role} onValueChange={(v) => {
                  const next = (v ?? "Admin") as Role;
                  setRole(next);
                  setGrants(new Set(ROLE_DEFAULT_PERMISSIONS[next]));
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Section>

              {/* Section 2 — Permission overrides */}
              <Section
                title="Permission overrides"
                rightSlot={
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[11px]">
                      <span className="text-brand-charcoal font-semibold">
                        {grantedCount}
                      </span>{" "}
                      of {totalCount} granted
                    </span>
                    <Button size="xs" variant="ghost" onClick={resetToRole}>
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Reset to role defaults
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  {grouped.map(({ module, perms }) => (
                    <div key={module}>
                      <h4 className="text-muted-foreground sticky top-0 z-[1] bg-card py-1 font-serif text-xs font-semibold uppercase tracking-wider">
                        {module}
                      </h4>
                      <ul className="mt-1 divide-y divide-[var(--border)] rounded-md border">
                        {perms.map((p) => (
                          <li key={p.id} className="flex items-start gap-3 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => togglePerm(p.id)}
                              className={cn(
                                "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                                grants.has(p.id)
                                  ? "bg-brand-gold"
                                  : "bg-muted"
                              )}
                              aria-checked={grants.has(p.id)}
                              role="switch"
                            >
                              <span
                                className={cn(
                                  "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                                  grants.has(p.id) ? "translate-x-4" : "translate-x-0"
                                )}
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="text-brand-charcoal text-xs font-medium">
                                {p.label}
                                {p.enforced && (
                                  <span
                                    title="Live-enforced at runtime"
                                    className="bg-brand-navy/10 text-brand-navy ml-1.5 rounded px-1 text-[9px] uppercase"
                                  >
                                    live
                                  </span>
                                )}
                              </p>
                              <p className="text-muted-foreground text-[11px] leading-snug">
                                {p.description}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Section 3 — Data scope */}
              <Section title="Data scope">
                <div className="space-y-1.5">
                  {DATA_SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="data-scope"
                        checked={scope === s}
                        onChange={() => setScope(s)}
                        className="accent-brand-gold"
                      />
                      <span className="text-brand-charcoal">{s}</span>
                    </label>
                  ))}
                </div>
              </Section>

              {/* Section 4 — Field-level visibility */}
              <Section title="Field-level visibility">
                <ul className="space-y-1.5">
                  {FIELD_VISIBILITIES.map((f) => (
                    <li key={f.id} className="flex items-center justify-between text-xs">
                      <span className="text-brand-charcoal">{f.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setFieldVis((s) => ({ ...s, [f.id]: !s[f.id] }))
                        }
                        className={cn(
                          "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                          fieldVis[f.id] ?? true ? "bg-brand-gold" : "bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                            fieldVis[f.id] ?? true ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Section 5 — Session & security */}
              <Section title="Session & security">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-[11px]">MFA required</Label>
                    <button
                      type="button"
                      onClick={() => setMfa((m) => !m)}
                      className={cn(
                        "mt-1 inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                        mfa ? "bg-brand-gold" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                          mfa ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-[11px]">Session timeout (min)</Label>
                    <Input
                      value={timeoutMin}
                      onChange={(e) => setTimeoutMin(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-[11px]">IP allowlist</Label>
                    <Input
                      value={ipAllow}
                      onChange={(e) => setIpAllow(e.target.value)}
                      placeholder="e.g. 198.51.100.0/24, 203.0.113.55"
                    />
                  </div>
                </div>
              </Section>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    toast(`Audit log filtered to ${user.name}`, {
                      description: "Switch to the Activity Log tab to review.",
                    })
                  }
                >
                  <History className="mr-1 h-3.5 w-3.5" />
                  View audit log for this user
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy"
                    onClick={() => {
                      toast.success(`Saved permissions for ${user.name}`, {
                        description: `${grantedCount} of ${totalCount} permissions granted.`,
                      });
                      onClose();
                    }}
                  >
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                </div>
              </div>

              <p className="text-muted-foreground/80 flex items-start gap-1.5 text-[10px]">
                <Lock className="mt-0.5 h-3 w-3" />
                <span>
                  Permissions tagged <span className="bg-brand-navy/10 text-brand-navy mx-0.5 rounded px-1">live</span>
                  are enforced at runtime — flip them and switch the global role
                  in the top bar to see the UI react. The rest are cosmetic in
                  this build but persist to the role record.
                </span>
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
  rightSlot,
}: {
  title: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-sm">{title}</h3>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}
