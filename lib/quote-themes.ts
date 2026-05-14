// Quote PDF theme registry — 12 locked NEXVELON presets.
// All themes share Letter page size, 6-page structure, Cormorant × Inter
// typography, and ornaments (❦ ✦ ⚜ ◆). They differ only in ambience
// (page background), accent (headings/ornaments/"Quotation" word), and
// ink (body text). `displayName` is admin-editable later via admin UI;
// defaults to slug verbatim.

export type QuoteThemeSlug =
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
}

export const QUOTE_THEMES: Record<QuoteThemeSlug, QuoteTheme> = {
  solid_white_pista:     { slug: "solid_white_pista",     displayName: "solid_white_pista",     ambience: "#F5F2E8", accent: "#5A8A6A", ink: "#1E3A2A", mood: "fresh, clean" },
  solid_white:           { slug: "solid_white",           displayName: "solid_white",           ambience: "#F8F5EE", accent: "#C9A24B", ink: "#2D2820", mood: "classic neutral" },
  light_grey:            { slug: "light_grey",            displayName: "light_grey",            ambience: "#E8E8E5", accent: "#C9A24B", ink: "#2D2820", mood: "quiet, refined" },
  solid_bronze:          { slug: "solid_bronze",          displayName: "solid_bronze",          ambience: "#E8DCC6", accent: "#A8853D", ink: "#2D2820", mood: "warm, premium" },
  solid_brown:           { slug: "solid_brown",           displayName: "solid_brown",           ambience: "#3A2A1F", accent: "#C9A24B", ink: "#F5EBD9", mood: "rich, intimate" },
  solid_brick_colour:    { slug: "solid_brick_colour",    displayName: "solid_brick_colour",    ambience: "#4A1F26", accent: "#C9A24B", ink: "#F5EBD9", mood: "strong, bold" },
  porshe_green:          { slug: "porshe_green",          displayName: "porshe_green",          ambience: "#1A3A28", accent: "#C9A24B", ink: "#F5EBD9", mood: "luxury, executive" },
  english_green:         { slug: "english_green",         displayName: "english_green",         ambience: "#1F3A2A", accent: "#C9A24B", ink: "#F5EBD9", mood: "traditional" },
  solid_green:           { slug: "solid_green",           displayName: "solid_green",           ambience: "#2A4A35", accent: "#C9A24B", ink: "#F5EBD9", mood: "grounded" },
  solid_light_green:     { slug: "solid_light_green",     displayName: "solid_light_green",     ambience: "#2D4536", accent: "#C9A24B", ink: "#F5EBD9", mood: "corporate-green" },
  solid_different_green: { slug: "solid_different_green", displayName: "solid_different_green", ambience: "#0F2A2A", accent: "#C9A24B", ink: "#F5EBD9", mood: "nautical" },
  solid_grey_shade2:     { slug: "solid_grey_shade2",     displayName: "solid_grey_shade2",     ambience: "#1F1F1F", accent: "#C9A24B", ink: "#F5EBD9", mood: "architectural" },
};

export const QUOTE_THEME_SLUGS: QuoteThemeSlug[] = Object.keys(QUOTE_THEMES) as QuoteThemeSlug[];

export const DEFAULT_QUOTE_THEME_SLUG: QuoteThemeSlug = "solid_white";

export function getQuoteTheme(slug: QuoteThemeSlug): QuoteTheme {
  return QUOTE_THEMES[slug];
}

export function isValidQuoteThemeSlug(value: string): value is QuoteThemeSlug {
  return value in QUOTE_THEMES;
}
