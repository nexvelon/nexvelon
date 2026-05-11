"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/permissions";

// ============================================================================
// Avatar dropdown — Phase 6 minimal + Session B Priority 2 addition.
//
// Items (top to bottom):
//   - profile header (name / email / role badge)
//   - Change password   → /settings/security/change-password
//   - Sign out          → AuthProvider.signOut()
//
// "Change password" is rendered as a <Link> styled with cn() +
// buttonVariants(). NOT wrapped in DropdownMenuItem — base-ui's Menu.Item
// renders as a <button> and we can't nest an <a> inside it without
// asChild, which @base-ui/react doesn't support. The Link sits inside
// DropdownMenuContent as a sibling of the Sign-out item and visually
// matches the menu-item rhythm.
//
// DropdownMenu is controlled (open state) so the Link's onClick can
// close the menu before navigation — otherwise the menu would stay
// open after route change since the AppShell layout doesn't remount.
// ============================================================================

export function AvatarMenu({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

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
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
        <div className="p-1">
          <Link
            href="/settings/security/change-password"
            onClick={() => setMenuOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "w-full justify-start gap-1.5 px-1.5 text-sm font-normal"
            )}
          >
            <KeyRound className="mr-2 h-3.5 w-3.5" />
            Change password
          </Link>
        </div>
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
