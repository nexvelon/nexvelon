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

// ============================================================================
// Quote template registry (Chunk B)
// ----------------------------------------------------------------------------
// Two letterhead templates keyed by legal entity. `integrated_solutions` is
// enabled and mirrors the values from COMPANY_PROFILE above (preserved
// verbatim per "no drift" — Chunk D will switch QuoteDocument.tsx onto the
// registry; until then COMPANY_PROFILE remains the only consumer). `guardian`
// ships disabled — the Nexvelon Guardian letterhead has not yet been designed
// so most fields are empty placeholders; the picker UI in Chunk E will gate
// selection on `enabled`.
//
// Discrepancies vs the NEXVELON handover packet §2:
//   · phone: kept existing "Toll-Free: 1-855-969-8655" (with colon) over the
//     packet's "Toll-Free 1-855-969-8655" (no colon).
//   · address: kept existing line1 string verbatim
//     ("350 Rutherford Rd S, Unit 104, Plaza II") as `line1` and left `line2`
//     empty rather than splitting the unit/plaza into a separate field.
//     Chunk D consumer renders only non-empty address rows, so the visual
//     output stays the same.
// ============================================================================

export type QuoteTemplateSlug = "integrated_solutions" | "guardian";

export interface QuoteTemplateAddress {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface QuoteTemplate {
  slug: QuoteTemplateSlug;
  displayName: string;     // admin-editable later
  enabled: boolean;        // Guardian = false until letterhead designed
  legalName: string;
  tradeName: string;
  brandMark: string;       // top-line cover text, e.g. "NEXVELON"
  brandSub: string;        // sub-line cover text, e.g. "GLOBAL" or "GUARDIAN"
  tagline: string;
  address: QuoteTemplateAddress;
  phone: string;
  email: string;
  web: string;
  hstNumber: string;       // e.g. "785486770 RT0001"
  footerShort: string;     // per-page footer left, e.g. "NEXVELON · GLOBAL"
  footerLong: string;      // acceptance-page footer
}

export const QUOTE_TEMPLATES: Record<QuoteTemplateSlug, QuoteTemplate> = {
  integrated_solutions: {
    slug: "integrated_solutions",
    displayName: "Integrated Solutions",
    enabled: true,
    legalName: "Nexvelon Integrated Solutions Inc.",
    tradeName: "Nexvelon Global",
    brandMark: "NEXVELON",
    brandSub: "GLOBAL",
    tagline: "Engineered to Protect Everything That Matters.",
    address: {
      line1: "350 Rutherford Rd S, Unit 104, Plaza II",
      line2: "",
      city: "Brampton",
      province: "Ontario",
      postalCode: "L6W4N6",
      country: "Canada",
    },
    phone: "Toll-Free: 1-855-969-8655",
    email: "SecurityServices@NexvelonGlobal.com",
    web: "www.NexvelonGlobal.com",
    hstNumber: "785486770 RT0001",
    footerShort: "NEXVELON · GLOBAL",
    footerLong: "NEXVELON INTEGRATED SOLUTIONS INC. — HST/GST 785486770 RT0001",
  },
  guardian: {
    slug: "guardian",
    displayName: "Guardian",
    enabled: false,
    legalName: "Nexvelon Guardian Inc.",
    tradeName: "Nexvelon Guardian",
    brandMark: "NEXVELON",
    brandSub: "GUARDIAN",
    tagline: "",
    address: { line1: "", line2: "", city: "", province: "", postalCode: "", country: "" },
    phone: "",
    email: "",
    web: "",
    hstNumber: "",
    footerShort: "NEXVELON · GUARDIAN",
    footerLong: "",
  },
};

export const QUOTE_TEMPLATE_SLUGS: QuoteTemplateSlug[] = Object.keys(QUOTE_TEMPLATES) as QuoteTemplateSlug[];

export const DEFAULT_QUOTE_TEMPLATE_SLUG: QuoteTemplateSlug = "integrated_solutions";

export function getQuoteTemplate(slug: QuoteTemplateSlug): QuoteTemplate {
  return QUOTE_TEMPLATES[slug];
}

export function isValidQuoteTemplateSlug(value: string): value is QuoteTemplateSlug {
  return value in QUOTE_TEMPLATES;
}
