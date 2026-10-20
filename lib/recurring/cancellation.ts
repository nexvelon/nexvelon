// RECUR-2 — the pure mid-cycle cancellation-credit rule (2g). No I/O.
//
// THE RULE
//   A contract billed IN ADVANCE that is cancelled part-way through a billed period
//   has been paid (or invoiced) for days it will not serve. Those days are credited
//   back, pro-rated by calendar day:
//     daysInPeriod = periodEnd − periodStart + 1                  (inclusive)
//     daysUsed     = effectiveDate − periodStart + 1, clamped to [0, daysInPeriod]
//     earned       = prorate(periodSubtotal, …)                   (billing-schedule.ts)
//     creditSub    = periodSubtotal − earned
//     creditTax    = tax_exempt ? 0 : round2(creditSub × taxRate / 100)
//     creditTotal  = creditSub + creditTax
//   `effectiveDate` is the LAST day of service (inclusive). A period that starts
//   after it is credited in full; a period that ends on/before it earns in full and
//   gets no credit. Voided invoices are skipped (nothing was billed).
//
// HOW THE CREDIT LANDS (never by editing an issued invoice — §2.2):
//   • draft invoice           → a negative "Cancellation credit" line on the draft
//                               (it has not been issued, so it is still editable).
//   • sent / partially paid   → a NON-CASH 'credit_applied' settlement against the
//                               open balance, up to that balance (like a deposit
//                               application); any excess becomes a refund due.
//   • paid                    → the whole credit is a refund due to the client.
//   A refund due is RECORDED and surfaced, not paid out — Nexvelon has no money-out
//   workflow; whoever issues the refund (cheque / e-transfer) does so outside the
//   system. Flagged for Jay.
//
// Arrears-billed contracts are the mirror case (the partial period is not yet
// billed — a final pro-rated invoice is owed). That is NOT auto-issued here; the
// cancel dialog says so and the item is recorded as deferred on the roadmap.

import { prorate } from "@/lib/recurring/billing-schedule";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface BilledPeriod {
  periodStart: string;
  periodEnd: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  invoiceStatus: string; // draft | sent | partially_paid | paid | void
  /** Σ of the invoice's lines (pre-tax). */
  subtotal: number;
  taxRatePct: number;
  taxExempt: boolean;
  amountDue: number;
  /** Σ payments already recorded against the invoice. */
  paid: number;
}

export type CreditDisposition = "reduce_draft" | "apply_to_balance" | "refund_due" | "split";

export interface PeriodCredit {
  periodStart: string;
  periodEnd: string;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceStatus: string;
  daysInPeriod: number;
  daysUsed: number;
  periodSubtotal: number;
  earnedSubtotal: number;
  creditSubtotal: number;
  creditTax: number;
  creditTotal: number;
  disposition: CreditDisposition;
  /** Portion that reduces what the client owes on this invoice. */
  appliedAmount: number;
  /** Portion owed back to the client (already paid). */
  refundDue: number;
}

const DAY = 86_400_000;
function dayNum(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
}

export function computeCancellationCredits(
  periods: BilledPeriod[],
  effectiveDate: string
): PeriodCredit[] {
  const out: PeriodCredit[] = [];
  for (const p of periods) {
    if (p.invoiceStatus === "void") continue;
    if (p.periodEnd <= effectiveDate) continue; // fully served — nothing unearned
    const daysInPeriod = dayNum(p.periodEnd) - dayNum(p.periodStart) + 1;
    const daysUsed = Math.max(0, Math.min(daysInPeriod, dayNum(effectiveDate) - dayNum(p.periodStart) + 1));
    const subtotal = round2(p.subtotal);
    const earned = prorate(subtotal, p.periodStart, p.periodEnd, effectiveDate);
    const creditSubtotal = round2(subtotal - earned);
    if (!(creditSubtotal > 0)) continue;
    const creditTax = p.taxExempt ? 0 : round2((creditSubtotal * p.taxRatePct) / 100);
    const creditTotal = round2(creditSubtotal + creditTax);

    let disposition: CreditDisposition;
    let appliedAmount = 0;
    let refundDue = 0;
    if (p.invoiceStatus === "draft") {
      disposition = "reduce_draft";
      appliedAmount = creditTotal;
    } else if (p.invoiceStatus === "sent" || p.invoiceStatus === "partially_paid") {
      const balance = Math.max(0, round2(p.amountDue - p.paid));
      appliedAmount = round2(Math.min(creditTotal, balance));
      refundDue = round2(creditTotal - appliedAmount);
      disposition = refundDue > 0 ? (appliedAmount > 0 ? "split" : "refund_due") : "apply_to_balance";
    } else {
      // paid (or any other settled state)
      disposition = "refund_due";
      refundDue = creditTotal;
    }

    out.push({
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoiceNumber ?? null,
      invoiceStatus: p.invoiceStatus,
      daysInPeriod,
      daysUsed,
      periodSubtotal: subtotal,
      earnedSubtotal: earned,
      creditSubtotal,
      creditTax,
      creditTotal,
      disposition,
      appliedAmount,
      refundDue,
    });
  }
  return out;
}

export function sumCredits(credits: PeriodCredit[]): { total: number; applied: number; refundDue: number } {
  return {
    total: round2(credits.reduce((s, c) => s + c.creditTotal, 0)),
    applied: round2(credits.reduce((s, c) => s + c.appliedAmount, 0)),
    refundDue: round2(credits.reduce((s, c) => s + c.refundDue, 0)),
  };
}
