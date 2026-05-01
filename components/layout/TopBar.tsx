"use client";

import { Suspense } from "react";
import { Beaker, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RoleSwitcher } from "./RoleSwitcher";
import { NotificationsBell } from "./NotificationsBell";
import { AvatarMenu } from "./AvatarMenu";
import { Breadcrumbs } from "./Breadcrumbs";
import { useRole } from "@/lib/role-context";
import { ROLE_LABELS } from "@/lib/permissions";

export function TopBar() {
  const { role } = useRole();

  return (
    <>
      <header className="bg-background/85 sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-[var(--border)] px-6 backdrop-blur">
        <div className="relative max-w-xl flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            readOnly
            placeholder="Search projects, clients, quotes, SKUs…"
            className="bg-card border-[var(--border)] cursor-pointer pl-9 pr-20"
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true })
              );
            }}
          />
          <kbd className="text-muted-foreground/80 absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-card px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden flex-col items-end md:flex">
            <span
              title="Live demo mode — current role"
              className="border-brand-gold/40 bg-brand-gold/10 text-brand-charcoal inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            >
              <Beaker className="text-brand-gold h-3 w-3" />
              {ROLE_LABELS[role]}
            </span>
            <span className="text-muted-foreground/80 mt-0.5 text-[9px] uppercase tracking-[0.2em]">
              Demo Mode
            </span>
          </div>

          <RoleSwitcher />
          <NotificationsBell />
          <AvatarMenu />
        </div>
      </header>

      <div className="bg-background/70 sticky top-16 z-[15] border-b border-[var(--border)] px-6 py-2 backdrop-blur">
        <Suspense fallback={<span className="text-muted-foreground text-xs">…</span>}>
          <Breadcrumbs />
        </Suspense>
      </div>
    </>
  );
}
