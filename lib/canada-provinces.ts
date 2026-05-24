// SITES-2b — Shared Canadian province/territory list. Lifted from
// lib/client-onboarding-template.ts (where it was a local PROVINCE_OPTIONS
// const) so SiteForm + ClientForm + the Excel template all consume one
// source of truth. The ordering matches the Excel template: ON first
// (most common), then provinces, then territories north-to-south.

export const CANADA_PROVINCES = [
  { code: "ON", name: "Ontario" },
  { code: "BC", name: "British Columbia" },
  { code: "AB", name: "Alberta" },
  { code: "SK", name: "Saskatchewan" },
  { code: "MB", name: "Manitoba" },
  { code: "QC", name: "Quebec" },
  { code: "NB", name: "New Brunswick" },
  { code: "NS", name: "Nova Scotia" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "YT", name: "Yukon" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
] as const;

export type ProvinceCode = (typeof CANADA_PROVINCES)[number]["code"];

/** Codes-only array — drop-in replacement for the old PROVINCE_OPTIONS. */
export const PROVINCE_CODES: readonly ProvinceCode[] = CANADA_PROVINCES.map(
  (p) => p.code
);
