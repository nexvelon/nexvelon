"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/permissions";

// ============================================================================
// Avatar dropdown — minimal post-Phase 6 version.
//
// Previous incarnations included Profile / Settings / Switch Workspace /
// Help links. Those routes don't all exist (or, for Profile, point at the
// directory rather than a self-edit page) and were causing dead-end clicks.
// They've been removed — we'll add real items back as the corresponding
// pages ship.
//
// We also stopped using <DropdownMenuLabel>. That primitive wraps
// @base-ui/react/menu's Menu.GroupLabel, which v1.4.x throws on when it
// isn't nested inside a Menu.Group. Plain divs inside the Popup avoid the
// constraint entirely and give us a freer hand with layout for the role
// badge.
// ============================================================================

export function AvatarMenu({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [pending, startTransition] = useTransition();

  const handleSignOut = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        await signOut();
        toast.success("Signed out.");
      } catch (e) {
        console.error("[AvatarMenu] signOut failed:", e);
        toast.error("Couldn't sign out. Please try again.");
      }
    });
  };

  const role = user?.role;
  const roleLabel = role ? ROLE_LABELS[role] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:ring-brand-gold/40 inline-flex items-center rounded-full transition hover:ring-2"
        aria-label="Open user menu"
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-0">
        <div className="px-3 py-3">
          <p
            className="truncate text-[13px] font-semibold leading-tight"
            style={{ color: "var(--brand-text)" }}
          >
            {user?.name ?? "Signed in"}
          </p>
          <p
            className="text-muted-foreground mt-0.5 truncate text-[11px] leading-tight"
            title={user?.email ?? ""}
          >
            {user?.email ?? ""}
          </p>
          {roleLabel && (
            <span
              className="mt-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
              style={{
                background:
                  "color-mix(in oklab, var(--brand-accent) 18%, transparent)",
                color: "var(--brand-accent-soft)",
              }}
            >
              {roleLabel}
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={pending}
          className="text-red-600"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
