"use client";

// RECUR-2 — "Cancel contract" (2g). Asks for the LAST DAY OF SERVICE, previews the
// pro-rated credit for every billed period that runs past it (with the
// arithmetic shown), then cancels + issues the credits in one deliberate step.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessDateISO, formatCurrency } from "@/lib/format";
import { cancelContractAction, previewCancellationAction } from "@/app/(app)/contracts/actions";
import type { CancellationPreview } from "@/lib/api/contract-adjustments";

const DISPOSITION_LABEL: Record<string, string> = {
  reduce_draft: "Taken off the draft invoice",
  apply_to_balance: "Applied to the unpaid balance",
  refund_due: "Refund due (already paid)",
  split: "Part applied, part refund due",
};

export function CancelContractDialog({
  open,
  onOpenChange,
  contractId,
  onCancelled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contractId: string;
  onCancelled: () => void;
}) {
  const [date, setDate] = useState(businessDateISO());
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (!open || !date) return;
    startLoad(async () => {
      const res = await previewCancellationAction(contractId, date);
      if (res.ok) {
        setPreview(res.data);
        setError(null);
      } else {
        setPreview(null);
        setError(res.error);
      }
    });
  }, [open, date, contractId]);

  const confirm = () =>
    startSubmit(async () => {
      const res = await cancelContractAction(contractId, date);
      if (!res.ok) {
        toast.error("Couldn't cancel", { description: res.error });
        return;
      }
      const t = res.data.totals;
      toast.success("Contract cancelled", {
        description:
          t.total > 0
            ? `Credit ${formatCurrency(t.total)}${t.refundDue > 0 ? ` — ${formatCurrency(t.refundDue)} is a refund due to the client` : ""}.`
            : "No credit was due.",
      });
      onCancelled();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Cancel contract</DialogTitle>
          <DialogDescription>
            Billing stops, and any days already billed after the last day of service are credited back, pro-rated
            by day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="max-w-[12rem]">
            <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="cx-date">
              Last day of service
            </label>
            <Input
              id="cx-date"
              type="date"
              max={businessDateISO()}
              className="h-8 text-xs"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {loading && <p className="text-muted-foreground">Working out the credit…</p>}
          {error && <p className="text-destructive">{error}</p>}

          {preview && (
            <>
              {preview.credits.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-[10px] uppercase">
                      <th className="py-1">Period / invoice</th>
                      <th className="py-1">Unused days</th>
                      <th className="py-1 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.credits.map((c) => (
                      <tr key={c.periodStart} className="border-b align-top last:border-0">
                        <td className="py-1.5">
                          {c.periodStart} → {c.periodEnd}
                          <span className="text-muted-foreground block">
                            {c.invoiceNumber ?? "Draft"} · {DISPOSITION_LABEL[c.disposition] ?? c.disposition}
                          </span>
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {c.daysInPeriod - c.daysUsed} of {c.daysInPeriod}
                          <span className="text-muted-foreground block">
                            {formatCurrency(c.periodSubtotal)} − {formatCurrency(c.earnedSubtotal)} earned
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatCurrency(c.creditTotal)}
                          <span className="text-muted-foreground block">
                            {formatCurrency(c.creditSubtotal)} + {formatCurrency(c.creditTax)} HST
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-1.5" colSpan={2}>
                        Total credit
                        {preview.totals.refundDue > 0 && (
                          <span className="text-muted-foreground block font-normal">
                            {formatCurrency(preview.totals.applied)} reduces what&apos;s owed ·{" "}
                            {formatCurrency(preview.totals.refundDue)} refund due
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(preview.totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {preview.notes.map((n) => (
                <p key={n} className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  {n}
                </p>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep contract
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!preview || submitting || loading}>
            {submitting ? "Cancelling…" : "Cancel contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
