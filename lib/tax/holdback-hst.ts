// FIN-TAX-1 — Ontario construction-holdback HST treatment, made EXPLICIT.
//
// Holdback is the portion of an invoice the client legally retains (Ontario
// Construction Act; released ~60 days after substantial completion). The tax
// question is WHEN the HST on that retained portion becomes payable. There are
// two defensible treatments; this module names them so the arithmetic is never
// something the next reader has to reverse-engineer from a multiplication.
//
//   ┌ "charged_upfront" (the system's original + default behaviour, FIN-9) ─────┐
//   │ HST is charged on the FULL invoice value at invoicing, including the      │
//   │ held-back portion. The holdback-release invoice is then TAX-EXEMPT — the  │
//   │ HST was already collected and remitted. Holdback only defers CASH, not    │
//   │ tax.                                                                       │
//   └───────────────────────────────────────────────────────────────────────────┘
//   ┌ "deferred_to_release" ────────────────────────────────────────────────────┐
//   │ HST on the held-back portion is DEFERRED until release. The original       │
//   │ invoice charges HST only on the amount payable now (subtotal − holdback).  │
//   │ The release invoice is TAXABLE and carries the HST on the holdback.        │
//   └───────────────────────────────────────────────────────────────────────────┘
//
// This is a TAX-POLICY choice, not a matter this code asserts as CRA law. The org
// picks one (company_settings key `holdback_hst_treatment`, Admin-editable); each
// invoice SNAPSHOTS the treatment in force when it was created (§2.2), so changing
// the org setting only affects future invoices — an issued invoice keeps the tax
// it was issued with.
//
// Non-negotiable invariant (why the two coupling points must always be inverses):
// across the invoice→release lifecycle the HST on the holdback dollar must be
// collected EXACTLY ONCE. "charged_upfront" collects it on the original invoice
// (release exempt); "deferred_to_release" collects it on the release invoice
// (original taxes only the payable portion). Never both, never neither.

export const HOLDBACK_HST_TREATMENTS = [
  "charged_upfront",
  "deferred_to_release",
] as const;

export type HoldbackHstTreatment = (typeof HOLDBACK_HST_TREATMENTS)[number];

/** The default = what the system did before FIN-TAX-1 (§2.2: deploy changes
 *  nothing). Legacy invoices with a null treatment are read as this. */
export const DEFAULT_HOLDBACK_HST_TREATMENT: HoldbackHstTreatment = "charged_upfront";

/** company_settings KV key for the org-level default. */
export const HOLDBACK_HST_TREATMENT_KEY = "holdback_hst_treatment";

/** Human labels + one-line descriptions for the settings UI and the surfaced
 *  notes on the holdback panel / release invoice / HST return. */
export const HOLDBACK_HST_TREATMENT_META: Record<
  HoldbackHstTreatment,
  { label: string; short: string; description: string }
> = {
  charged_upfront: {
    label: "HST charged up front",
    short: "HST on the full value at invoicing; release is tax-exempt.",
    description:
      "HST is charged on the full invoice value when it is issued, including the held-back portion. The holdback-release invoice is tax-exempt because the HST was already collected. Holdback defers cash, not tax.",
  },
  deferred_to_release: {
    label: "HST deferred to release",
    short: "HST on the payable portion now; holdback HST charged at release.",
    description:
      "HST on the held-back portion is deferred: the original invoice charges HST only on the amount payable now (subtotal minus holdback). The holdback-release invoice is taxable and carries the HST on the released holdback.",
  },
};

/** Coerce any stored/settings string (or null) to a valid treatment, falling
 *  back to the default. Never throws — an unknown value reads as the default. */
export function asHoldbackHstTreatment(
  value: string | null | undefined
): HoldbackHstTreatment {
  return (HOLDBACK_HST_TREATMENTS as readonly string[]).includes(value ?? "")
    ? (value as HoldbackHstTreatment)
    : DEFAULT_HOLDBACK_HST_TREATMENT;
}

/**
 * The ONE place the treatment changes the arithmetic: the HST taxable base for an
 * invoice. `charged_upfront` taxes the full subtotal; `deferred_to_release` taxes
 * only the payable portion (subtotal − holdback), so the holdback's HST is left
 * for the release invoice. A tax-exempt invoice always has a zero base.
 *
 * `holdbackAmount` is the dollar figure already retained on THIS invoice (0 on a
 * release invoice and on non-holdback invoices, so the base is the full subtotal
 * for both treatments there — the difference only bites on an original invoice
 * that actually retains holdback).
 */
export function hstTaxableBase(input: {
  subtotal: number;
  holdbackAmount: number;
  treatment: HoldbackHstTreatment;
}): number {
  if (input.treatment === "deferred_to_release") {
    return Math.max(0, input.subtotal - input.holdbackAmount);
  }
  return input.subtotal;
}
