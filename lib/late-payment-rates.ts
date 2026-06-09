// ADDR-2 — Per-country late-payment + credit-card surcharge rates.
//
// Used by the Excel templates' dynamic locked text block: the
// "Payment terms and conditions" paragraph is written as a VLOOKUP
// formula against the LateFees named range so the text auto-updates
// when the operator/client picks a billing country.
//
// Caveats:
//   * Annual rate is approximately monthly_rate × 12. Compound-
//     interest difference is ignored (the operator-facing text is
//     informational, not a contractual calculation).
//   * Credit-card surcharge values reflect the typical maximum
//     allowed under each country's merchant agreement regulations as
//     of 2024. Operators in regulated markets (Ireland, UAE) where
//     surcharges are prohibited see 0%.
//   * Canada values are reconciled with DEFAULT_TERMS (lib/quote-helpers
//     .ts): 2.5% monthly / 30% annual interest, 2.5% credit-card surcharge.

import type { Country } from "./countries";

export interface LatePaymentRates {
  /** Monthly interest rate on overdue invoices (percent). */
  monthlyPct: number;
  /** Annualized equivalent (approximately monthlyPct × 12). */
  annualPct: number;
  /** Credit-card processing surcharge (percent). 0 = surcharge
   *  prohibited or operator chooses not to pass it through. */
  ccSurchargePct: number;
}

export const LATE_PAYMENT_RATES_BY_COUNTRY: Record<Country, LatePaymentRates> =
  {
    Canada: { monthlyPct: 2.5, annualPct: 30, ccSurchargePct: 2.5 },
    USA: { monthlyPct: 1.5, annualPct: 18, ccSurchargePct: 3.0 },
    Ireland: { monthlyPct: 0.84, annualPct: 10.15, ccSurchargePct: 0 },
    India: { monthlyPct: 1.5, annualPct: 18, ccSurchargePct: 2.0 },
    UAE: { monthlyPct: 1.0, annualPct: 12, ccSurchargePct: 0 },
  };
