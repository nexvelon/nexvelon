"use client";

// UIDG-10 — the quick-actions bar: one-click shortcuts to the app's real create
// flows. Every action is gated by the create permission for that resource (a user
// without quotes:create never sees "Create quote") and navigates to the REAL /new
// route — no modal stubs, no placeholders. Only verbs the app can actually perform
// standalone are offered: projects (convert-a-quote), invoices (project-first) and
// payments (recorded against an invoice/bill) have no standalone create entry, so
// they are deliberately absent rather than dead buttons (§2.8 / Step 5).

import Link from "next/link";
import { Building2, Boxes, ClipboardList, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import type { Resource, Action } from "@/lib/permissions";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  resource: Resource;
  action: Action;
}

const ACTIONS: QuickAction[] = [
  { label: "Create quote", href: "/quotes/new", icon: ClipboardList, resource: "quotes", action: "create" },
  { label: "Add client", href: "/clients/new", icon: Building2, resource: "clients", action: "create" },
  { label: "Add site", href: "/sites/new", icon: MapPin, resource: "clients", action: "create" },
  { label: "Add product", href: "/inventory/new", icon: Boxes, resource: "inventory", action: "create" },
];

export function QuickActionsWidget() {
  const { role } = useRole();
  const allowed = ACTIONS.filter((a) => hasPermission(role, a.resource, a.action));
  // Defensive: the widget is already permission-filtered out of the layout when the
  // user can do none of these, but never render an empty bar if it slips through.
  if (allowed.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-[var(--brand-border)] p-4 shadow-sm">
      <h3 className="text-brand-navy mb-3 font-serif text-base">Quick actions</h3>
      <div className="flex flex-wrap gap-2">
        {allowed.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="border-brand-navy/15 text-brand-charcoal hover:bg-brand-gold/10 hover:border-brand-gold/40 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
            >
              <Icon className="text-brand-navy h-4 w-4" />
              {a.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
