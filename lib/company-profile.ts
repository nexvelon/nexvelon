// ============================================================================
// Company profile — interim constants for the quote letterhead.
//
// These values are read by `components/modules/quotes/builder/QuoteDocument.tsx`
// in place of the previous "Configure address in Settings → Company Profile"
// placeholder string. They will be superseded by a `settings_company_profile`
// row (single-row Admin-managed table) when Quotes v1 lands — see
// NEXVELON_ROADMAP.md "Open architectural decisions" → "Company-profile data
// source (PDF letterhead)".
//
// Until then this file is the single source of truth for letterhead / footer
// content. Update here; redeploy; the next quote PDF reflects the new values.
// ============================================================================

export const COMPANY_PROFILE = {
  legal_name: "Nexvelon Integrated Solutions Inc.",
  trade_name: "Nexvelon Global",
  tagline: "Engineered to Protect Everything That Matters.",
  address: {
    line1: "350 Rutherford Rd S, Unit 104, Plaza II",
    city: "Brampton",
    province: "Ontario",
    postal_code: "L6W4N6",
    country: "Canada",
  },
  phone: "Toll-Free: 1-855-969-8655",
  email: "SecurityServices@NexvelonGlobal.com",
  website: "www.NexvelonGlobal.com",
  gst_hst_number: "785486770 RT0001",
} as const;
