"use client";

// RECUR-2 — "Convert to service contract" (2c). A deliberate operator action:
// it loads the conversion state from the server, shows every reason it can't run
// yet (§2.8 — explained, never hidden), shows exactly what the contract will
// inherit from the SIGNED quote, and asks only for what the client didn't decide:
// the real start date, how invoices are generated, and whether to invoice the
// one-time items now.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSignature, Loader2 } from "lucide-react";
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
import { formatCurrency, businessDateISO } from "@/lib/format";
import { getQuoteTemplate, isValidQuoteTemplateSlug } from "@/lib/company-profile";
import {
  CADENCE_PERIOD_NOUN,
  contractLinesFromSnapshot,
  termEndDate,
} from "@/lib/recurring/quote-terms";
import { describeLateFeeTerms } from "@/lib/recurring/late-fees";
import {
  convertQuoteToContractAction,
  getQuoteContractConversionAction,
} from "@/app/(app)/contracts/actions";
import type { ContractConversionState } from "@/lib/api/contract-conversion";
import type { ServiceContractBillingMode } from "@/lib/types/database";

const SELECT_CLS = "border-input bg-background h-8 w-full rounded-md border px-2 text-xs";
const MODE_HELP: Record<ServiceContractBillingMode, string> = {
  draft_for_approval: "Each billing date creates a DRAFT invoice for someone to review and issue.",
  automatic: "Each billing date creates AND issues the invoice — no review.",
  manual: "Nothing generates on a schedule; invoices are created with “Generate now”.",
};

function companyName(slug: string): string {
  return isValidQuoteTemplateSlug(slug) ? getQuoteTemplate(slug).legalName : slug;
}

export function ContractConversionDialog({
  open,
  onOpenChange,
  quoteId,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteId: string;
  onConverted: (contractId: string) => void;
}) {
  const [state, setState] = useState<ContractConversionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [billingMode, setBillingMode] = useState<ServiceContractBillingMode>("draft_for_approval");
  const [name, setName] = useState("");
  const [activate, setActivate] = useState(true);
  const [invoiceOneTime, setInvoiceOneTime] = useState(true);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    getQuoteContractConversionAction(quoteId).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setState(res.data);
      setStartDate(res.data.signedTerms?.proposedStartDate || businessDateISO());
      setName(res.data.quote.name ?? "");
      setInvoiceOneTime(res.data.oneTimeLines.length > 0);
    });
    return () => {
      alive = false;
    };
  }, [open, quoteId]);

  const rec = state?.signedTerms ?? null;
  const lines = useMemo(() => (rec ? contractLinesFromSnapshot(rec) : []), [rec]);
  const endDate = rec && startDate ? termEndDate(startDate, rec.termMonths) : null;
  const blocked = !state || state.blockers.length > 0;

  const submit = async () => {
    if (!state || blocked) return;
    setSubmitting(true);
    try {
      const res = await convertQuoteToContractAction(quoteId, {
        startDate,
        billingMode,
        name,
        activate,
        createOneTimeInvoice: invoiceOneTime,
      });
      if (!res.ok) {
        toast.error("Couldn't convert", { description: res.error });
        return;
      }
      for (const w of res.data.warnings) toast.warning(w);
      toast.success("Service contract created", {
        description: res.data.oneTimeInvoiceId
          ? "A draft invoice for the one-time items is waiting in Invoices."
          : "The quote is now read-only.",
      });
      onConverted(res.data.contractId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Convert to service contract</DialogTitle>
          <DialogDescription>
            Creates a recurring-billing contract from the version of this quote the client signed.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the quote…
          </p>
        )}
        {loadError && <p className="text-destructive text-sm">{loadError}</p>}

        {state && state.blockers.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> This quote can&apos;t be converted yet
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {state.blockers.map((b) => (
                <li key={b.code + b.message}>{b.message}</li>
              ))}
            </ul>
            {state.existingContract && (
              <a className="mt-1 inline-block underline" href={`/contracts/${state.existingContract.id}`}>
                Open {state.existingContract.name}
              </a>
            )}
          </div>
        )}

        {state && rec && state.acceptance && (
          <div className="space-y-4 text-xs">
            <div className="bg-muted/40 flex items-start gap-2 rounded-md px-3 py-2">
              <FileSignature className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Signed by <strong>{state.acceptance.signerName ?? "the client"}</strong>
                {state.acceptance.signerTitle ? `, ${state.acceptance.signerTitle}` : ""} on{" "}
                {new Date(state.acceptance.acceptedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}.
                The contract links to this signed record permanently.
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium">The contract inherits (from the signed quote)</p>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground py-0.5 pr-2">Billed by</td>
                    <td>{companyName(rec.opco)}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-0.5 pr-2">Cadence</td>
                    <td>
                      Every {CADENCE_PERIOD_NOUN[rec.cadence]}, {rec.billingTiming === "arrears" ? "in arrears" : "in advance"}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-0.5 pr-2">Term</td>
                    <td>{rec.termMonths ? `${rec.termMonths} months${endDate ? ` (ends ${endDate})` : ""}` : "Open-ended"}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-0.5 pr-2">Payment terms</td>
                    <td>{rec.paymentTermsDays != null ? `Net ${rec.paymentTermsDays}` : "No due date"}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-0.5 pr-2 align-top">Late payment</td>
                    <td>{describeLateFeeTerms(rec.lateFee)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="mt-2 w-full border-t">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.description}>
                      <td className="py-0.5">{l.description}</td>
                      <td className="text-right tabular-nums">{formatCurrency(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="py-0.5">Per {CADENCE_PERIOD_NOUN[rec.cadence]} (+ {rec.taxRatePct}% HST)</td>
                    <td className="text-right tabular-nums">{formatCurrency(rec.periodTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="cc-name">
                  Contract name
                </label>
                <Input id="cc-name" className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="cc-start">
                  Service starts <span className="text-destructive">*</span>
                </label>
                <Input
                  id="cc-start"
                  type="date"
                  className="h-8 text-xs"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="cc-mode">
                  Invoices
                </label>
                <select
                  id="cc-mode"
                  className={SELECT_CLS}
                  value={billingMode}
                  onChange={(e) => setBillingMode(e.target.value as ServiceContractBillingMode)}
                >
                  <option value="draft_for_approval">Draft for approval (recommended)</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <p className="text-muted-foreground col-span-2 text-[11px]">{MODE_HELP[billingMode]}</p>
              <label className="col-span-2 flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                <span>
                  Activate now — billing starts on schedule from the start date. Untick to leave the contract as a
                  draft to review first.
                </span>
              </label>
            </div>

            {state.oneTimeLines.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={invoiceOneTime}
                    onChange={(e) => setInvoiceOneTime(e.target.checked)}
                  />
                  <span>
                    Create a draft invoice for the one-time items ({formatCurrency(state.oneTimeSubtotal)} + HST), billed
                    by {companyName(rec.opco)} — the company the client signed with.
                  </span>
                </label>
                <ul className="text-muted-foreground pl-6">
                  {state.oneTimeLines.map((l) => (
                    <li key={l.description} className="flex justify-between">
                      <span>{l.description}</span>
                      <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                    </li>
                  ))}
                </ul>
                {!invoiceOneTime && (
                  <p className="text-[11px] text-amber-800">
                    The one-time items won&apos;t be invoiced by this conversion — make sure they&apos;re billed another
                    way.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button
            onClick={submit}
            disabled={blocked || submitting || !startDate}
            className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy"
          >
            {submitting ? "Converting…" : "Create service contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
