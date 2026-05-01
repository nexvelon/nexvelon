"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";
import { useRole } from "@/lib/role-context";
import { canViewRoute } from "@/lib/permissions";

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useRole();

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r">
      <div className="border-sidebar-border flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="bg-brand-gold inline-block h-2 w-2 rounded-full" />
          <span className="font-serif text-2xl tracking-wide text-white">
            Nexvelon
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const allowed = canViewRoute(role, item.resource);
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (!allowed) {
            return (
              <div
                key={item.href}
                className="text-sidebar-foreground/40 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm"
                title="Not available for this role"
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              {isActive && (
                <span className="bg-brand-gold absolute inset-y-1 left-0 w-1 rounded-r-full" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "text-brand-gold" : "text-sidebar-foreground/70"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-sidebar-border border-t p-4">
        <p className="text-sidebar-foreground/60 font-serif text-xs">
          v0.1 · Operations Suite
        </p>
      </div>
    </aside>
  );
}
