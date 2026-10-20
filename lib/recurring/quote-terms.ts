// RECUR-2 — the pure quote → service-contract model. No I/O, no server-only guard:
// shared by the builder (validation + preview), the portal snapshot, the PDF, and
// the conversion engine, and exhaustively unit-tested.
//
// THE LINE MODEL (2b). A service-contract quote expresses BOTH components on one
// document, each in the place the quote already had for it:
//   • ONE-TIME  — the quote's sections (Particulars) plus the monitoring schedule's
//                 optional one-time setup line. Totals = the existing one-time
//                 pipeline (computeQuoteTotals) + setup.
//   • RECURRING — the Guardian monitoring schedule (GF-1): one line per service,
//                 each priced PER MONTH. The billing CADENCE (this module) decides
//                 how many months each invoice covers.
// Only the RECURRING component carries into the contract. The one-time component
// is invoiced once (a draft one-off invoice at conversion, if the operator asks).
//
// Fees are always quoted per month because that is how monitoring is sold and how
// the existing monitoring page already reads; a quarterly contract bills 3 × the
// monthly fee per invoice. Custom (day-interval) cadences are deliberately NOT
// offered on a quote — a monthly fee has no exact day-interval equivalent, and a
// client should never sign a number we then have to approximate.

import type {
  ServiceContractBillingTiming,
  ServiceContractCadence,
} from "@/lib/types/database";
import type { Quote } from "@/lib/types";
import type { MonitoringScheduleInstance } from "@/lib/quote-schedules";
import { validateLateFeeTerms, normalizeLateFeeTerms, type LateFeeTerms } from "@/lib/recurring/late-fees";
import { advanceByCadence } from "@/lib/recurring/billing-schedule";
import { format, parseISO, subDays } from "date-fns";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The cadences a quote may carry (month-based only — see header). */
export type QuoteContractCadence = Exclude<ServiceContractCadence, "custom">;
export const QUOTE_CONTRACT_CADENCES: QuoteContractCadence[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

export const MONTHS_PER_PERIOD: Record<QuoteContractCadence, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const CADENCE_PERIOD_NOUN: Record<QuoteContractCadence, string> = {
  monthly: "month",
  quarterly: "quarter",
  semiannual: "half-year",
  annual: "year",
};

export const CADENCE_ADVERB: Record<QuoteContractCadence, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  semiannual: "semi-annually",
  annual: "annually",
};

/** The operator-captured agreement terms on a service-contract quote (jsonb on the
 *  quote blob — no migration). `cadence` has NO default: a monitoring quote without
 *  a cadence is incomplete, and the builder says so until one is chosen. */
export interface QuoteServiceContractTerms {
  cadence?: QuoteContractCadence | null;
  billingTiming?: ServiceContractBillingTiming;
  /** Initial term in months; null / 0 = open-ended (month-to-month). */
  termMonths?: number | null;
  /** The intended service start (YYYY-MM-DD). Informational — the operator
   *  confirms the real start date at conversion. */
  proposedStartDate?: string | null;
  lateFee?: LateFeeTerms;
}

export function isServiceContractQuote(q: Pick<Quote, "intendedTargetKind">): boolean {
  return q.intendedTargetKind === "service_contract";
}

/** The monitoring schedules on a quote that are switched on. */
export function includedMonitoringSchedules(q: Pick<Quote, "schedules">): MonitoringScheduleInstance[] {
  return (q.schedules ?? []).filter(
    (s): s is MonitoringScheduleInstance => s.kind === "monitoring" && s.included !== false
  );
}

export interface RecurringService {
  label: string;
  detail?: string;
  monthlyFee: number;
}

/** Every priced recurring service across the included monitoring schedules.
 *  Blank, zero-fee placeholder rows (the defaults the schedule seeds) are dropped. */
export function recurringServices(q: Pick<Quote, "schedules">): RecurringService[] {
  const out: RecurringService[] = [];
  for (const s of includedMonitoringSchedules(q)) {
    for (const svc of s.services ?? []) {
      const fee = round2(Number(svc.monthlyFee) || 0);
      const label = (svc.label ?? "").trim();
      if (!label && fee === 0) continue;
      if (fee === 0) continue; // an unpriced placeholder is not a billable service
      out.push({ label: label || "Monitoring service", detail: svc.detail?.trim() || undefined, monthlyFee: fee });
    }
  }
  return out;
}

/** The one-time setup line(s) on the monitoring schedule(s), if any. */
export function recurringSetup(q: Pick<Quote, "schedules">): { label: string; amount: number } | null {
  let amount = 0;
  let label = "";
  for (const s of includedMonitoringSchedules(q)) {
    const a = round2(Number(s.setupAmount) || 0);
    if (a > 0) {
      amount = round2(amount + a);
      label = label || s.setupLabel?.trim() || "One-time setup";
    }
  }
  return amount > 0 ? { label, amount } : null;
}

export function monthlyTotal(services: RecurringService[]): number {
  return round2(services.reduce((s, x) => s + x.monthlyFee, 0));
}

export function periodAmount(monthlyFee: number, cadence: QuoteContractCadence): number {
  return round2(monthlyFee * MONTHS_PER_PERIOD[cadence]);
}

/** "Net 30" → 30. Unknown / absent → null (no due date → never overdue). */
export function paymentTermsDays(terms: string | undefined | null): number | null {
  const m = /(\d+)/.exec(terms ?? "");
  return m ? Number(m[1]) : null;
}

/** The quote stores HST as a fraction (0.13); contracts/invoices store a percent
 *  (13). Normalise defensively — a legacy value already in percent passes through. */
export function taxRatePercent(rate: number | undefined | null): number {
  if (rate === undefined || rate === null || !Number.isFinite(rate)) return 13;
  return rate <= 1 ? round2(rate * 100) : round2(rate);
}

// ─── Validation (builder + send gate) ──────────────────────────────────────────

/**
 * Everything that makes a service-contract quote incomplete or invalid, as
 * plain-language sentences the builder shows and the send gate enforces. Empty
 * array = complete. Only meaningful when isServiceContractQuote(q).
 */
export function serviceContractQuoteIssues(
  q: Pick<Quote, "intendedTargetKind" | "templateSlug" | "schedules" | "serviceContract">
): string[] {
  if (!isServiceContractQuote(q)) return [];
  const issues: string[] = [];
  // 2e — monitoring is Guardian. The monitoring schedule is Guardian-only, and the
  // contract's billing entity is the entity the client signs with, so a service-
  // contract quote must be ISSUED by Guardian. Never re-picked silently.
  if ((q.templateSlug ?? "integrated_solutions") !== "guardian") {
    issues.push(
      "Monitoring agreements are issued and billed by Nexvelon Guardian. Switch this quote's template to Guardian."
    );
  }
  const terms = q.serviceContract ?? {};
  if (!terms.cadence || !QUOTE_CONTRACT_CADENCES.includes(terms.cadence)) {
    issues.push("Choose a billing cadence (monthly, quarterly, semi-annual or annual).");
  }
  if (includedMonitoringSchedules(q).length === 0) {
    issues.push("Add the Monitoring Services schedule and price at least one service.");
  } else if (recurringServices(q).length === 0) {
    issues.push("Price at least one monitoring service (a monthly fee above $0).");
  }
  for (const s of includedMonitoringSchedules(q)) {
    for (const svc of s.services ?? []) {
      if (Number(svc.monthlyFee) < 0) issues.push("Monthly fees can't be negative.");
    }
  }
  if (
    terms.termMonths !== undefined &&
    terms.termMonths !== null &&
    (!Number.isInteger(terms.termMonths) || terms.termMonths < 0)
  ) {
    issues.push("The initial term must be a whole number of months (or blank for open-ended).");
  }
  const lateFeeError = validateLateFeeTerms(terms.lateFee);
  if (lateFeeError) issues.push(lateFeeError);
  return [...new Set(issues)];
}

// ─── The signed snapshot of the recurring terms (2d / §2.2) ────────────────────

/** Frozen into quote_portal_sends.snapshot at send time, so the contract is built
 *  from exactly what the client signed — never from the live (editable) quote. */
export interface RecurringTermsSnapshot {
  version: 1;
  opco: string;
  cadence: QuoteContractCadence;
  billingTiming: ServiceContractBillingTiming;
  termMonths: number | null;
  proposedStartDate: string | null;
  paymentTermsDays: number | null;
  taxRatePct: number;
  services: RecurringService[];
  monthlyTotal: number;
  periodTotal: number;
  setup: { label: string; amount: number } | null;
  lateFee: LateFeeTerms;
}

/** Build the recurring snapshot, or null when the quote isn't a complete
 *  service-contract quote (nothing is frozen for an incomplete one). */
export function buildRecurringSnapshot(
  q: Pick<
    Quote,
    "intendedTargetKind" | "templateSlug" | "schedules" | "serviceContract" | "paymentTerms" | "taxRate"
  >
): RecurringTermsSnapshot | null {
  if (!isServiceContractQuote(q)) return null;
  if (serviceContractQuoteIssues(q).length > 0) return null;
  const terms = q.serviceContract ?? {};
  const cadence = terms.cadence as QuoteContractCadence;
  const services = recurringServices(q);
  const monthly = monthlyTotal(services);
  return {
    version: 1,
    opco: q.templateSlug ?? "guardian",
    cadence,
    billingTiming: terms.billingTiming ?? "advance",
    termMonths: terms.termMonths ? terms.termMonths : null,
    proposedStartDate: terms.proposedStartDate || null,
    paymentTermsDays: paymentTermsDays(q.paymentTerms),
    taxRatePct: taxRatePercent(q.taxRate),
    services,
    monthlyTotal: monthly,
    periodTotal: periodAmount(monthly, cadence),
    setup: recurringSetup(q),
    lateFee: normalizeLateFeeTerms(terms.lateFee),
  };
}

/** One contract pricing line per signed service, priced for ONE billing period. */
export function contractLinesFromSnapshot(
  rec: Pick<RecurringTermsSnapshot, "services" | "cadence">
): { description: string; amount: number }[] {
  const months = MONTHS_PER_PERIOD[rec.cadence];
  return rec.services.map((s) => {
    const base = s.detail ? `${s.label} — ${s.detail}` : s.label;
    const description =
      months === 1 ? base : `${base} (${s.monthlyFee.toFixed(2)}/month × ${months})`;
    return { description, amount: periodAmount(s.monthlyFee, rec.cadence) };
  });
}

/** The last day of an initial term of `termMonths` from `startDate`, or null for an
 *  open-ended contract. Anchor-based (start + n months − 1 day). */
export function termEndDate(startDate: string, termMonths: number | null): string | null {
  if (!termMonths) return null;
  // Same anchor arithmetic as the billing schedule (addMonths clamps month-end).
  const anchor = advanceByCadence(startDate, "monthly", null, termMonths);
  return format(subDays(parseISO(anchor), 1), "yyyy-MM-dd");
}

// ─── The one-time component (2b) ────────────────────────────────────────────────

export interface OneTimeSnapshotInput {
  sections: { name: string; items: { qty: number; unitPrice: number }[] }[];
  subtotal: number;
  discount?: number;
  discountType?: "pct" | "amount";
}

/** The lines of the one-off invoice for a mixed quote's one-time component: one
 *  line per quoted section (its sell total), the discount as a negative line, and
 *  the monitoring setup fee. Empty when there is nothing one-time to bill. */
export function oneTimeInvoiceLines(
  snap: OneTimeSnapshotInput,
  setup: { label: string; amount: number } | null
): { description: string; amount: number }[] {
  const lines: { description: string; amount: number }[] = [];
  for (const s of snap.sections ?? []) {
    const amount = round2((s.items ?? []).reduce((t, it) => t + Number(it.qty) * Number(it.unitPrice), 0));
    if (amount !== 0) lines.push({ description: s.name || "Quoted items", amount });
  }
  const sectionsTotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const disc = Number(snap.discount ?? 0);
  if (disc > 0 && sectionsTotal > 0) {
    const off =
      (snap.discountType ?? "pct") === "pct" ? round2((sectionsTotal * disc) / 100) : round2(disc);
    if (off > 0) lines.push({ description: "Discount", amount: -off });
  }
  if (setup && setup.amount > 0) lines.push({ description: setup.label, amount: round2(setup.amount) });
  return lines;
}

// ─── Conversion gate (2c / §2.8) ────────────────────────────────────────────────

export type ConversionBlockerCode =
  | "wrong_type"
  | "already_converted"
  | "not_accepted"
  | "no_signed_terms"
  | "no_permission";

export interface ConversionBlocker {
  code: ConversionBlockerCode;
  message: string;
}

export interface ConversionGateInput {
  quote: Pick<Quote, "status" | "intendedTargetKind" | "contractId">;
  /** The accepted portal acceptance, if any (decision must be 'accepted'). */
  acceptance: { decision: "accepted" | "declined" } | null;
  /** The recurring terms frozen in the ACCEPTED send's snapshot. */
  signedTerms: RecurringTermsSnapshot | null;
  /** A contract already created from this quote, if any. */
  existingContractId: string | null;
  canConvert: boolean;
  canManageContracts: boolean;
}

/**
 * Why this quote cannot be converted to a service contract right now. An empty
 * array means it can. Every reason is a sentence the UI shows verbatim, so the
 * action is explained, never hidden (§2.8).
 */
export function contractConversionBlockers(input: ConversionGateInput): ConversionBlocker[] {
  const out: ConversionBlocker[] = [];
  if (!input.canConvert || !input.canManageContracts) {
    out.push({
      code: "no_permission",
      message: !input.canConvert
        ? "You don't have permission to convert quotes."
        : "Converting creates a billing contract, which needs permission to manage service contracts (financials:edit).",
    });
  }
  if (input.existingContractId || input.quote.contractId || input.quote.status === "Converted") {
    out.push({
      code: "already_converted",
      message: input.existingContractId || input.quote.contractId
        ? "This quote has already been converted to a service contract."
        : "This quote has already been converted.",
    });
    return out; // nothing else matters once it's converted
  }
  if (input.quote.intendedTargetKind !== "service_contract") {
    out.push({
      code: "wrong_type",
      message: "This quote isn't marked as a service-contract quote. Set “This quote is for” to a service contract.",
    });
  }
  if (!input.acceptance || input.acceptance.decision !== "accepted") {
    out.push({
      code: "not_accepted",
      message:
        "The client hasn't accepted this quote on the portal yet. A contract is only created from a signed acceptance.",
    });
  } else if (input.quote.status !== "Approved") {
    // An older acceptance exists, but the quote was reopened afterwards — the
    // live quote may no longer match what was signed.
    out.push({
      code: "not_accepted",
      message: `This quote was reopened after the client accepted it (it's now ${input.quote.status}). Re-send it and have the client accept the current version.`,
    });
  } else if (!input.signedTerms) {
    out.push({
      code: "no_signed_terms",
      message:
        "The signed version of this quote has no recurring terms (cadence and monthly fees). It was sent before they were set — complete them and re-send it for signature.",
    });
  }
  return out;
}
