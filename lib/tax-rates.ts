// SITES-2b — Province → combined federal+provincial sales-tax rate.
// Values are PERCENTAGES (not decimals) — matches the DB column
// sites.tax_rate numeric(5,3), which holds e.g. 14.975 for QC exactly.
//
// QC needs the (5,3) precision since 14.975 = 5% GST + 9.975% QST.
// HST provinces (ON/NB/NS/PE/NL) bake the federal 5% in.
//
// Distinct from lib/quote-helpers.ts DEFAULT_TAX_RATE (a single 0.13
// decimal used by the legacy Quote builder). Sites carry their own rate
// independent of the quote engine.

import type { ProvinceCode } from "./canada-provinces";

export const TAX_RATES_BY_PROVINCE: Record<ProvinceCode, number> = {
  ON: 13.0, // HST
  BC: 12.0, // 5% GST + 7% PST
  AB: 5.0, // GST only
  SK: 11.0, // 5% GST + 6% PST
  MB: 12.0, // 5% GST + 7% PST
  QC: 14.975, // 5% GST + 9.975% QST
  NB: 15.0, // HST
  NS: 15.0, // HST
  PE: 15.0, // HST
  NL: 15.0, // HST
  YT: 5.0, // GST only
  NT: 5.0, // GST only
  NU: 5.0, // GST only
};

/**
 * Look up the default rate for a province code. Lenient: accepts
 * `null` / `undefined` / unknown strings and returns `null` so callers
 * can render "—" without a try/catch.
 */
export function defaultTaxRateForProvince(
  p: ProvinceCode | string | null | undefined
): number | null {
  if (!p) return null;
  return TAX_RATES_BY_PROVINCE[p as ProvinceCode] ?? null;
}
