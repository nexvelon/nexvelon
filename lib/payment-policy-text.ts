// POLISH-9 — the EXACT "Payment terms and conditions" policy text shown on the
// Excel onboarding templates, reconstructed from the SAME canonical rate source
// (lib/late-payment-rates.ts) the templates use. Single source for the invite
// forms' Payment Policies block + the submission snapshot, so the web form, the
// Excel template, and the historical record all read identically.
//
// Wording mirrors the templates' locked formula block (client-onboarding-template
// .ts / site-form-template.ts): country-dependent rates, Canada as the no-country
// fallback (matching the templates' IFERROR fallback).
//
// Pure module (no "server-only") so client components can import it.

import { LATE_PAYMENT_RATES_BY_COUNTRY } from "./late-payment-rates";

/** The 3-line payment-policy text for a billing country (Canada fallback). */
export function paymentPolicyText(country?: string | null): string {
  const rates =
    (country &&
      (LATE_PAYMENT_RATES_BY_COUNTRY as Record<
        string,
        { monthlyPct: number; annualPct: number; ccSurchargePct: number }
      >)[country]) ||
    LATE_PAYMENT_RATES_BY_COUNTRY.Canada;
  return [
    "Payment terms and conditions:",
    `1> Invoices not settled beyond the selected payment term accrues interest at a rate of ${rates.monthlyPct}% per month (${rates.annualPct}% per annum) effective from that due date on all outstanding balances.`,
    `2> Credit card payments will incur a ${rates.ccSurchargePct}% merchant processing surcharge. To avoid this fee, you may choose to pay via EFT.`,
  ].join("\n");
}
