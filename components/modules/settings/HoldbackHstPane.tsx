"use client";

// FIN-TAX-1 — Settings → Tax & Currency → Holdback HST treatment. Admin-editable
// org default for how HST on Ontario construction holdback is handled. Writes the
// company_settings key `holdback_hst_treatment`. Changing it affects FUTURE
// invoices only — each invoice freezes the treatment at creation (§2.2), so this
// never alters an already-issued invoice's tax.

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  getHoldbackHstTreatmentAction,
  setHoldbackHstTreatmentAction,
} from "@/app/(app)/settings/company-settings-actions";
import {
  HOLDBACK_HST_TREATMENTS,
  HOLDBACK_HST_TREATMENT_META,
  type HoldbackHstTreatment,
} from "@/lib/tax/holdback-hst";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/role-context";

export function HoldbackHstPane() {
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const [value, setValue] = useState<HoldbackHstTreatment | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getHoldbackHstTreatmentAction();
    if (res.ok) setValue(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function choose(next: HoldbackHstTreatment) {
    if (next === value) return;
    start(async () => {
      const res = await setHoldbackHstTreatmentAction(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setValue(next);
      toast.success("Holdback HST treatment saved — applies to future invoices");
    });
  }

  return (
    <div className="mt-8 space-y-4 border-t border-[var(--border)] pt-6">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">
          Holdback HST treatment
        </h2>
        <p className="text-muted-foreground text-sm">
          How HST on Ontario construction holdback (the 10% the client retains) is
          handled. This is a tax-policy choice — confirm it with your bookkeeper.
          Changing it applies to <strong>future invoices only</strong>; invoices
          already issued keep the tax they were issued with.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {HOLDBACK_HST_TREATMENTS.map((t) => {
          const meta = HOLDBACK_HST_TREATMENT_META[t];
          const selected = value === t;
          return (
            <Card
              key={t}
              className={cn(
                "bg-card p-4 shadow-sm transition-colors",
                selected
                  ? "border-brand-gold ring-brand-gold/30 ring-1"
                  : "border-[var(--border)]",
                isAdmin && !pending ? "cursor-pointer hover:border-brand-gold/60" : ""
              )}
              onClick={() => isAdmin && !loading && !pending && choose(t)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                    selected ? "border-brand-gold" : "border-muted-foreground/40"
                  )}
                >
                  {selected && (
                    <span className="bg-brand-gold h-2 w-2 rounded-full" />
                  )}
                </span>
                <div>
                  <p className="text-brand-navy text-sm font-semibold">
                    {meta.label}
                    {selected && (
                      <span className="text-brand-gold ml-2 text-[10px] font-medium uppercase tracking-wide">
                        In effect
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {meta.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!isAdmin && (
        <p className="text-muted-foreground text-xs">
          Only an administrator can change this.
        </p>
      )}
      {loading && <p className="text-muted-foreground text-xs">Loading…</p>}
    </div>
  );
}
