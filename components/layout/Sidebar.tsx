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
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r"
      style={{
        background: "var(--brand-primary)",
        borderColor: "var(--brand-sidebar-border)",
      }}
    >
      {/* Logo block — bracketed seal + serif wordmark */}
      <div
        className="flex h-20 items-center gap-3 border-b px-5"
        style={{ borderColor: "var(--brand-sidebar-border)" }}
      >
        <Link href="/dashboard" className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center font-serif text-base font-semibold"
            style={{
              border: "1px solid var(--brand-accent)",
              color: "var(--brand-accent)",
            }}
            aria-hidden
          >
            N
          </span>
          <span
            className="font-serif text-[15px] tracking-[0.32em] text-white"
            style={{ fontWeight: 500 }}
          >
            NEXVELON
          </span>
        </Link>
      </div>

      {/* Operations sub-nav header */}
      <p
        className="px-5 pt-5 pb-3 text-[10px] font-semibold tracking-[0.32em] uppercase"
        style={{ color: "var(--brand-accent-soft)" }}
      >
        ── Operations
      </p>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const allowed = canViewRoute(role, item.resource);
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (!allowed) {
            return (
              <div
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded-sm px-3 py-2 text-[13px]"
                style={{ color: "rgba(245,241,232,0.25)" }}
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
                "group relative flex items-center gap-3 rounded-sm px-3 py-2 text-[13px] transition-colors"
              )}
              style={{
                color: isActive ? "#FFFFFF" : "rgba(245,241,232,0.7)",
                background: isActive
                  ? "var(--brand-sidebar-accent)"
                  : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "rgba(245,241,232,0.95)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "rgba(245,241,232,0.7)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {isActive && (
                <span
                  className="absolute inset-y-1 left-0 w-[3px]"
                  style={{ background: "var(--brand-accent)" }}
                />
              )}
              <Icon
                className="h-4 w-4 shrink-0"
                style={{
                  color: isActive
                    ? "var(--brand-accent)"
                    : "rgba(245,241,232,0.55)",
                }}
              />
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && (
                <span
                  className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
                  style={{
                    background: isActive
                      ? "rgba(184,146,75,0.2)"
                      : "rgba(245,241,232,0.08)",
                    color: isActive
                      ? "var(--brand-accent)"
                      : "rgba(245,241,232,0.7)",
                  }}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* EST stamp + version */}
      <div
        className="flex items-center gap-2.5 border-t px-5 py-4"
        style={{ borderColor: "var(--brand-sidebar-border)" }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full font-serif text-[8px] tracking-[0.2em] uppercase"
          style={{
            border: "1px solid rgba(184,146,75,0.4)",
            color: "var(--brand-accent-soft)",
          }}
        >
          EST
        </span>
        <span
          className="font-serif text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "rgba(184,146,75,0.6)" }}
        >
          v 4 . 18 . 2
          <br />
          <span className="font-serif tracking-[0.2em]">est. mmxxiv</span>
        </span>
      </div>
    </aside>
  );
}
