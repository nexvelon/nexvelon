"use client";

import { Suspense, useState } from "react";
import { Search, Shield } from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { AvatarMenu } from "./AvatarMenu";
import { GoldBreadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/permissions";
import { useAuth } from "@/components/auth/AuthProvider";

// SEARCH-1: the center search trigger is restored. It opens <GlobalSearch>
// (a fresh component wired to real data only — DB clients + local quotes +
// nav links), built on the CMDK-FIX-patched Command primitives.

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
  const [searchOpen, setSearchOpen] = useState(false);

  const role = user?.role ?? "ViewOnly";
  const displayName = user?.name ?? "—";
  const displayTitle = ROLE_DISPLAY[role] ?? ROLE_LABELS[role];

  return (
    <header
      className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b px-4 backdrop-blur sm:gap-6 sm:px-8"
      style={{
        background: "color-mix(in oklab, var(--brand-bg) 85%, transparent)",
        borderColor: "var(--brand-border)",
      }}
    >
      {/* Left — gold uppercase breadcrumbs. Desktop chrome; hidden below md so
          the fixed-height bar doesn't overflow (and cover the bell) on phones. */}
      <div className="hidden min-w-0 md:block">
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

      {/* Center — global search trigger */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hover:bg-muted/60 bg-muted/40 text-muted-foreground flex w-full max-w-[11rem] items-center gap-3 rounded-md border px-3 py-1.5 text-sm transition sm:max-w-xs md:max-w-md"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">
            Search clients, quotes, navigation…
          </span>
          {/* Desktop-only shortcut hint — hidden below md (mobile/landscape
              phones have no keyboard and it crowded the bell). */}
          <kbd className="bg-background text-muted-foreground hidden items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium md:inline-flex">
            ⌘K
          </kbd>
        </button>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Right — actions + role + user */}
      <div className="flex shrink-0 items-center gap-3">
        <NotificationsBell />

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
