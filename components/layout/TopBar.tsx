"use client";

import { Suspense } from "react";
import { Mail, Shield } from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { AvatarMenu } from "./AvatarMenu";
import { GoldBreadcrumbs } from "./Breadcrumbs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/permissions";
import { useAuth } from "@/components/auth/AuthProvider";

// The center search bar that triggered the global ⌘K command palette was
// removed — it was crashing on focus/click because GlobalCommandPalette
// references mock-data tables that haven't been wired to the DB yet, and
// there's nothing real to search across modules until they migrate. Will
// be reintroduced in a future session once the modules ship real data.

const ROLE_DISPLAY: Record<string, string> = {
  Admin: "Operations Director",
  ProjectManager: "Project Manager",
  SalesRep: "Sales Lead",
  Technician: "Senior Technician",
  Subcontractor: "Subcontractor",
  Accountant: "Controller",
  ViewOnly: "Observer",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TopBar() {
  const { user } = useAuth();

  const role = user?.role ?? "ViewOnly";
  const displayName = user?.name ?? "—";
  const displayTitle = ROLE_DISPLAY[role] ?? ROLE_LABELS[role];

  return (
    <header
      className="sticky top-0 z-20 flex h-20 items-center gap-6 border-b px-8 backdrop-blur"
      style={{
        background: "color-mix(in oklab, var(--brand-bg) 85%, transparent)",
        borderColor: "var(--brand-border)",
      }}
    >
      {/* Left — gold uppercase breadcrumbs */}
      <div className="min-w-0 flex-1">
        <Suspense
          fallback={
            <span className="text-muted-foreground text-[10px] tracking-[0.2em] uppercase">
              …
            </span>
          }
        >
          <GoldBreadcrumbs />
        </Suspense>
      </div>

      {/* Right — actions + role + user */}
      <div className="flex items-center gap-3">
        <NotificationsBell />
        <button
          type="button"
          className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors"
          aria-label="Messages"
        >
          <Mail className="h-4 w-4" />
        </button>

        {/* Real role indicator (read-only) — replaced the demo-era role-switcher
            in Phase 6. Roles are now driven by profiles.role for the signed-in
            user and cannot be flipped client-side. */}
        <div
          className="hidden items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[11px] md:inline-flex"
          style={{
            borderColor: "color-mix(in oklab, var(--brand-accent) 35%, transparent)",
            color: "var(--brand-text)",
          }}
          title={`Signed in as ${displayName}`}
        >
          <Shield className="h-3.5 w-3.5" style={{ color: "var(--brand-accent)" }} />
          <span className="text-muted-foreground tracking-[0.08em] uppercase font-mono text-[10px]">
            Role
          </span>
          <span className="font-medium">{ROLE_LABELS[role]}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden text-right md:block">
            <p
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "var(--brand-text)" }}
            >
              {displayName}
            </p>
            <p
              className="text-[10px] font-semibold tracking-[0.2em] uppercase leading-tight"
              style={{ color: "var(--brand-accent-soft)" }}
            >
              {displayTitle}
            </p>
          </div>
          <AvatarMenu>
            <Avatar
              className="h-9 w-9 ring-2"
              style={{
                ["--tw-ring-color" as string]: "var(--brand-accent)",
              }}
            >
              <AvatarFallback
                className="text-xs font-semibold text-white"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
          </AvatarMenu>
        </div>
      </div>
    </header>
  );
}
