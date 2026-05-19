// Quote PDF theme registry — 12 locked NEXVELON presets.
// All themes share A4 page size, 6-page structure, Cormorant × Inter
// typography, and ornaments (❦ ✦ ⚜ ◆). They differ only in ambience
// (page background), accent (headings/ornaments/"Quotation" word), and
// ink (body text). `displayName` is admin-editable later via admin UI;
// defaults to slug verbatim.

export type QuoteThemeSlug =
  | "default_theme_grayish"
  | "solid_white_pista"
  | "solid_white"
  | "light_grey"
  | "solid_bronze"
  | "solid_brown"
  | "solid_brick_colour"
  | "porshe_green"
  | "english_green"
  | "solid_green"
  | "solid_light_green"
  | "solid_different_green"
  | "solid_grey_shade2";

export interface QuoteTheme {
  slug: QuoteThemeSlug;
  displayName: string;
  ambience: string;
  accent: string;
  ink: string;
  mood: string;
  // NEW (QD-1) — optional; fall back to `accent` when undefined
  brandPrimary?: string; // First-segment color of the brand mark (e.g. "NEX")
  brandSecondary?: string; // Second-segment color of the brand mark + sub
  accentMuted?: string; // Dusty/secondary accent for subtitle text
  // QD-2 palette extensions (optional — other themes fall back to accent)
  soft?: string; // dusty cream — secondary surfaces
  muted?: string; // dusty gold — mid-emphasis text
  deepMuted?: string; // burnished bronze — low-emphasis text / rules
}

// Hex values re-derived against Jay's actual 12 sample PDFs (Chunk I,
// 2026-05-14). Biggest fix: light_grey is now a dark navy-charcoal canvas
// with cream ink (was previously a light-grey ambience approximation).
// Several others nudged for closer fidelity to the sample artwork.
// `displayName` and `mood` fields preserved verbatim.
export const QUOTE_THEMES: Record<QuoteThemeSlug, QuoteTheme> = {
  default_theme_grayish: {
    slug: "default_theme_grayish",
    displayName: "default_theme_grayish",
    ambience: "#121212", // jet — was #212327
    accent: "#b4924c", // champagne — was #AF9357
    ink: "#f6f0e2", // bone — was #EFE8D8
    mood: "default · dark grey",
    brandPrimary: "#5EC269",
    brandSecondary: "#FFFFFF",
    accentMuted: "#978C73",
    // QD-2
    soft: "#dcd3bb",
    muted: "#b1a487",
    deepMuted: "#8c8167",
  },
  solid_white_pista:     { slug: "solid_white_pista",     displayName: "solid_white_pista",     ambience: "#F0EBE0", accent: "#4A7D4A", ink: "#1F3D2A", mood: "fresh, clean" },
  solid_white:           { slug: "solid_white",           displayName: "solid_white",           ambience: "#F7F3EA", accent: "#A8853D", ink: "#2D2820", mood: "classic neutral" },
  light_grey:            { slug: "light_grey",            displayName: "light_grey",            ambience: "#1A1F2A", accent: "#B8923E", ink: "#E8DCC2", mood: "quiet, refined" },
  solid_bronze:          { slug: "solid_bronze",          displayName: "solid_bronze",          ambience: "#E8DCC0", accent: "#A07A35", ink: "#2D2820", mood: "warm, premium" },
  solid_brown:           { slug: "solid_brown",           displayName: "solid_brown",           ambience: "#3A2A1F", accent: "#C9A24B", ink: "#E8DCC0", mood: "rich, intimate" },
  solid_brick_colour:    { slug: "solid_brick_colour",    displayName: "solid_brick_colour",    ambience: "#5C1F26", accent: "#C9A24B", ink: "#E8DCC0", mood: "strong, bold" },
  porshe_green:          { slug: "porshe_green",          displayName: "porshe_green",          ambience: "#14342B", accent: "#C9A24B", ink: "#E8DCC0", mood: "luxury, executive" },
  english_green:         { slug: "english_green",         displayName: "english_green",         ambience: "#1F4A35", accent: "#C9A24B", ink: "#E8DCC0", mood: "traditional" },
  solid_green:           { slug: "solid_green",           displayName: "solid_green",           ambience: "#2A4A35", accent: "#C9A24B", ink: "#E8DCC0", mood: "grounded" },
  solid_light_green:     { slug: "solid_light_green",     displayName: "solid_light_green",     ambience: "#2D4536", accent: "#C9A24B", ink: "#E8DCC0", mood: "corporate-green" },
  solid_different_green: { slug: "solid_different_green", displayName: "solid_different_green", ambience: "#0A1E26", accent: "#C9A24B", ink: "#E8DCC0", mood: "nautical" },
  solid_grey_shade2:     { slug: "solid_grey_shade2",     displayName: "solid_grey_shade2",     ambience: "#1A1A1A", accent: "#C9A24B", ink: "#E8DCC0", mood: "architectural" },
};

export const QUOTE_THEME_SLUGS: QuoteThemeSlug[] = Object.keys(QUOTE_THEMES) as QuoteThemeSlug[];

export const DEFAULT_QUOTE_THEME_SLUG: QuoteThemeSlug = "default_theme_grayish";

export function getQuoteTheme(slug: QuoteThemeSlug): QuoteTheme {
  return QUOTE_THEMES[slug];
}

export function isValidQuoteThemeSlug(value: string): value is QuoteThemeSlug {
  return value in QUOTE_THEMES;
}
