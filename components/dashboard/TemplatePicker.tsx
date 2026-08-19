"use client";

// UIDG-10 — pick a ready-made dashboard template. Applying one is DESTRUCTIVE to
// the current layout, so the pick is confirmed first (with what is lost stated
// plainly). An Admin can additionally push a template out as the company default,
// which reuses the SAME ApplyDefaultDialog + settings:manage path as UIDG-8 (the
// parent wires onSetOrgDefault to it) — no new key, no new confirmation model.

import { useState } from "react";
import { Building2, LayoutTemplate } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DASHBOARD_TEMPLATES, type DashboardTemplate } from "@/lib/dashboard/templates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageOrg: boolean;
  /** Replace the caller's own layout with this template (parent persists + reflows). */
  onApply: (template: DashboardTemplate) => void;
  /** Admin only — set this template as the company default (parent opens ApplyDefaultDialog). */
  onSetOrgDefault: (template: DashboardTemplate) => void;
}

export function TemplatePicker({ open, onOpenChange, canManageOrg, onApply, onSetOrgDefault }: Props) {
  const [pending, setPending] = useState<DashboardTemplate | null>(null);

  function close() {
    setPending(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] w-[92vw] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-serif">Start from a template</DialogTitle>
          <DialogDescription>
            A template replaces your current dashboard with a ready-made arrangement. You
            can still customise it afterwards.
          </DialogDescription>
        </DialogHeader>

        {!pending ? (
          <ul className="-mr-2 max-h-[60vh] space-y-2 overflow-y-auto pr-2">
            {DASHBOARD_TEMPLATES.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-3 rounded-md border border-[var(--brand-border)] p-3"
              >
                <span
                  className="bg-brand-gold/10 text-brand-navy grid h-9 w-9 shrink-0 place-items-center rounded-md"
                  aria-hidden
                >
                  <LayoutTemplate className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-brand-navy text-sm font-medium">
                    {t.name}{" "}
                    <span className="text-muted-foreground text-xs font-normal">· {t.audience}</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{t.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPending(t)}
                  className="border-brand-navy/15 text-brand-charcoal hover:bg-brand-gold/10 hover:border-brand-gold/40 inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium"
                >
                  Use this template
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Apply <span className="font-medium">{pending.name}</span>? This replaces your
              current dashboard arrangement — your existing layout will be lost. Widgets you
              don&rsquo;t have access to are left out automatically.
            </p>
            <DialogFooter className="gap-2 sm:justify-between">
              {canManageOrg && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    onSetOrgDefault(pending);
                    close();
                  }}
                >
                  <Building2 className="h-3.5 w-3.5" /> Set as company default…
                </Button>
              )}
              <div className="flex gap-2 sm:ml-auto">
                <Button variant="outline" size="sm" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onApply(pending);
                    close();
                  }}
                >
                  Apply template
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
