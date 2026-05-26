// ADDR-1 — Multi-country address support.
//
// 5 supported countries with full per-country province/state/region
// lists. Replaces lib/canada-provinces.ts (deleted in this chunk).
//
// Country values are stored as DISPLAY-NAME strings ("Canada" /
// "USA" / "UAE" / "India" / "Ireland") rather than ISO codes — keeps
// the DB rows self-describing for non-engineer reads and matches what
// the operator sees in the dropdown. Form layer enforces the union;
// DB columns stay `text` for backward compat (no CHECK constraint).
//
// Province/state lists are full per country: Canada 13 codes,
// USA 50 + DC, UAE 7 emirates, India 28 states + 8 UTs, Ireland 26
// counties. Total ~140 values across all 5.
//
// Naming convention: the second-level region is generically called
// "province" in code (UI shows "Province / State") to avoid per-country
// branching. The Excel template's named ranges all use the uniform
// `_Regions` suffix so the INDIRECT formula stays simple.

export type Country = "Canada" | "USA" | "UAE" | "India" | "Ireland";

export const COUNTRIES: readonly Country[] = [
  "Canada",
  "USA",
  "UAE",
  "India",
  "Ireland",
] as const;

/**
 * Per-country list of provinces/states/emirates/counties. Used by form
 * dropdowns + Excel named ranges. Order within each country follows
 * the operator's filing convention (Canada: ON first; USA + India:
 * alphabetical; UAE: by population; Ireland: alphabetical).
 */
export const PROVINCES_BY_COUNTRY: Record<Country, readonly string[]> = {
  Canada: [
    "ON", "BC", "AB", "SK", "MB", "QC",
    "NB", "NS", "PE", "NL", "YT", "NT", "NU",
  ],
  USA: [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
  ],
  UAE: [
    "Abu Dhabi", "Dubai", "Sharjah", "Ajman",
    "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
  ],
  India: [
    // 28 states
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    // 8 Union Territories
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
    "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
  ],
  Ireland: [
    // 26 counties of the Republic of Ireland
    "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin",
    "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim",
    "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan",
    "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford",
    "Westmeath", "Wexford", "Wicklow",
  ],
};

/**
 * Named-range identifier used inside the Excel template's INDIRECT
 * formula. Uniform `_Regions` suffix per Phase 0 DP2: the province cell
 * validation becomes a single formula `=INDIRECT($<countryCell> & "_Regions")`
 * that works for all 5 countries without per-country branching.
 */
export const PROVINCE_LIST_NAME_BY_COUNTRY: Record<Country, string> = {
  Canada: "Canada_Regions",
  USA: "USA_Regions",
  UAE: "UAE_Regions",
  India: "India_Regions",
  Ireland: "Ireland_Regions",
};
