// ADDR-1 — Per-country, per-region default tax rates (percent).
//
// Values are PERCENTAGES (not decimals) — matches the DB column
// sites.tax_rate numeric(5,3), which holds e.g. 14.975 for QC exactly.
//
// Caveats per country:
//
//   * Canada: HST/GST combined per province. Unchanged from SITES-2b.
//     QC needs the (5,3) precision since 14.975 = 5% GST + 9.975% QST.
//     HST provinces (ON/NB/NS/PE/NL) bake the federal 5% in.
//
//   * USA: BASE STATE SALES TAX rates only. City/county add-ons are
//     NOT included — many municipalities add 1-3% on top. Operator
//     overrides per-site if a more accurate rate is needed.
//
//   * UAE: Uniform 5% federal VAT across all 7 emirates.
//
//   * India: Default 18% reflects the most common B2B services GST.
//     Other goods/service categories may use 5%, 12%, or 28% rates —
//     operator overrides per goods category.
//
//   * Ireland: Uniform 23% standard VAT. Reduced rates (9%, 13.5%, 4.8%)
//     apply to specific categories like hospitality, tourism, food —
//     operator overrides if a reduced rate applies.
//
// Distinct from lib/quote-helpers.ts DEFAULT_TAX_RATE (a single 0.13
// decimal used by the legacy Quote builder). Sites carry their own rate
// independent of the quote engine.

import type { Country } from "./countries";

export const TAX_RATES_BY_COUNTRY_PROVINCE: Record<
  Country,
  Record<string, number>
> = {
  Canada: {
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
  },
  USA: {
    AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35,
    DE: 0, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6,
    KS: 6.5, KY: 6, LA: 4.45, ME: 5.5, MD: 6, MA: 6.25, MI: 6,
    MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0,
    NJ: 6.625, NM: 4.875, NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5,
    OR: 0, PA: 6, RI: 7, SC: 6, SD: 4.5, TN: 7, TX: 6.25, UT: 4.85,
    VT: 6, VA: 5.3, WA: 6.5, WV: 6, WI: 5, WY: 4, DC: 6,
  },
  UAE: {
    "Abu Dhabi": 5,
    Dubai: 5,
    Sharjah: 5,
    Ajman: 5,
    "Umm Al Quwain": 5,
    "Ras Al Khaimah": 5,
    Fujairah: 5,
  },
  India: {
    "Andhra Pradesh": 18, "Arunachal Pradesh": 18, Assam: 18, Bihar: 18,
    Chhattisgarh: 18, Goa: 18, Gujarat: 18, Haryana: 18,
    "Himachal Pradesh": 18, Jharkhand: 18, Karnataka: 18, Kerala: 18,
    "Madhya Pradesh": 18, Maharashtra: 18, Manipur: 18, Meghalaya: 18,
    Mizoram: 18, Nagaland: 18, Odisha: 18, Punjab: 18,
    Rajasthan: 18, Sikkim: 18, "Tamil Nadu": 18, Telangana: 18,
    Tripura: 18, "Uttar Pradesh": 18, Uttarakhand: 18, "West Bengal": 18,
    "Andaman and Nicobar Islands": 18, Chandigarh: 18,
    "Dadra and Nagar Haveli and Daman and Diu": 18, Delhi: 18,
    "Jammu and Kashmir": 18, Ladakh: 18, Lakshadweep: 18, Puducherry: 18,
  },
  Ireland: {
    Carlow: 23, Cavan: 23, Clare: 23, Cork: 23, Donegal: 23, Dublin: 23,
    Galway: 23, Kerry: 23, Kildare: 23, Kilkenny: 23, Laois: 23, Leitrim: 23,
    Limerick: 23, Longford: 23, Louth: 23, Mayo: 23, Meath: 23, Monaghan: 23,
    Offaly: 23, Roscommon: 23, Sligo: 23, Tipperary: 23, Waterford: 23,
    Westmeath: 23, Wexford: 23, Wicklow: 23,
  },
};

/**
 * Look up the default tax rate for a country + province combination.
 * Returns null if either is empty or the country isn't in the supported
 * 5-country set — caller renders "—" / disables the "Use default"
 * button. Operator can always manually type a rate if no default is
 * defined for an obscure region.
 */
export function defaultTaxRateForProvince(
  country: Country | string | null | undefined,
  province: string | null | undefined
): number | null {
  if (!country || !province) return null;
  const countryRates = TAX_RATES_BY_COUNTRY_PROVINCE[country as Country];
  if (!countryRates) return null;
  const rate = countryRates[province];
  return rate ?? null;
}
