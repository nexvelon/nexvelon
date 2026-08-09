// UIDG-2 — the SINGLE SOURCE OF TRUTH for every theme preset.
//
// Both the CSS `[data-theme]` blocks (app/theme-presets.generated.css, emitted by
// scripts/generate-theme-css.ts) AND the JS chart palette Recharts reads are
// derived from the THEMES object below. Adding a preset means editing THIS FILE
// ONLY, then running `npm run gen:theme` to re-emit the CSS partial.
//
// Historically a theme lived in four places (this file, hand-written CSS blocks,
// a regex in app/layout.tsx, and the settings copy) which drifted — royal-navy
// rendered one navy in the app chrome and a different navy in its charts. That is
// now impossible: the chrome and the charts read the same values.

export type ThemeKey =
  | "royal-navy"
  | "onyx-brass"
  | "oxford-green"
  | "burgundy-reserve"
  // Chunk E — 10 additional luxury themes.
  | "imperial-plum"
  | "sapphire-noir"
  | "emerald-dynasty"
  | "espresso-gilt"
  | "slate-rose"
  | "midnight-teal"
  | "mahogany-brass"
  | "amethyst-dusk"
  | "ivory-court"
  | "pearl-platinum";

/**
 * Font stacks are theme tokens (UIDG-2 §4a) so a future preset can carry a
 * different serif without touching app/layout.tsx. Values reference the
 * next/font CSS variables — next/font owns the loading and the variable names,
 * so we never hardcode a font-family string here.
 */
export interface ThemeFonts {
  sans: string;
  serif: string;
  mono: string;
}

/** The live stack every existing preset uses. Omitting `fonts` on a preset
 *  resolves to this (see resolveTheme). */
export const DEFAULT_FONTS: ThemeFonts = {
  sans: "var(--font-inter)",
  serif: "var(--font-playfair)",
  mono: "var(--font-geist-mono)",
};

/** The shared semantic status pair. Uniform across every current preset; a
 *  preset may override, otherwise these apply (see resolveTheme). */
export const DEFAULT_STATUS_GREEN = "#5C7A4A";
export const DEFAULT_STATUS_RED = "#A03B3B";

export interface ThemeColors {
  key: ThemeKey;
  name: string;
  description: string;
  primary: string;
  accent: string;
  /** Muted variant of the accent (nested eyebrow labels, etc.). Optional —
   *  falls back to the default theme's value when omitted. */
  accentSoft?: string;
  bg: string;
  text: string;
  card: string;
  border: string;
  muted: string;
  sidebarAccent: string;
  sidebarBorder: string;
  chartTertiary: string;
  chartQuaternary: string;
  /** Optional per-preset override of the shared status pair. */
  statusGreen?: string;
  statusRed?: string;
  /** Optional per-preset font stack. Falls back to DEFAULT_FONTS. */
  fonts?: ThemeFonts;
  /** Five-stop chart palette in stable order — used by Recharts. Kept in lockstep
   *  with the chrome: [primary, accent, chartTertiary, chartQuaternary, text]. */
  charts: [string, string, string, string, string];
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  "royal-navy": {
    key: "royal-navy",
    name: "Royal Navy",
    description: "House default — deep navy with warm gold and ivory linen.",
    primary: "#0A1226",
    accent: "#B8924B",
    accentSoft: "#9A7B3A",
    bg: "#F5F1E8",
    text: "#1A1F2E",
    card: "#FAF7F0",
    border: "#E0D9C8",
    muted: "#EBE5D6",
    sidebarAccent: "#131C36",
    sidebarBorder: "#1B2542",
    chartTertiary: "#5C6A8A",
    chartQuaternary: "#A8B0C4",
    charts: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
  },
  "onyx-brass": {
    key: "onyx-brass",
    name: "Onyx & Brass",
    description: "Near-black with warm brass — for late-night ops centres.",
    primary: "#1A1A1A",
    accent: "#B5895A",
    bg: "#F1ECE3",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#DCD4C5",
    muted: "#E8E2D6",
    sidebarAccent: "#2A2A2A",
    sidebarBorder: "#333333",
    chartTertiary: "#5C5C5C",
    chartQuaternary: "#A8A8A8",
    charts: ["#1A1A1A", "#B5895A", "#5C5C5C", "#A8A8A8", "#2A2A2A"],
  },
  "oxford-green": {
    key: "oxford-green",
    name: "Oxford Green",
    description: "Deep forest with gold — heritage estate feel.",
    primary: "#0F2A1D",
    accent: "#C9A24B",
    bg: "#F4F1EA",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#DDD7C8",
    muted: "#E8E1D2",
    sidebarAccent: "#163826",
    sidebarBorder: "#1F4A33",
    chartTertiary: "#4A6B5A",
    chartQuaternary: "#8FA89B",
    charts: ["#0F2A1D", "#C9A24B", "#4A6B5A", "#8FA89B", "#1F4A33"],
  },
  "burgundy-reserve": {
    key: "burgundy-reserve",
    name: "Burgundy Reserve",
    description: "Vintage burgundy with gold — boutique private banking.",
    primary: "#3B0D1A",
    accent: "#C9A24B",
    bg: "#F8F5EE",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#E2D6D9",
    muted: "#EDE2E5",
    sidebarAccent: "#4A1322",
    sidebarBorder: "#5A1828",
    chartTertiary: "#7A4A55",
    chartQuaternary: "#B89094",
    charts: ["#3B0D1A", "#C9A24B", "#7A4A55", "#B89094", "#5A1828"],
  },

  // ── Chunk E: 10 additional luxury themes. ──
  "imperial-plum": {
    key: "imperial-plum",
    name: "Imperial Plum",
    description: "Royal purple with warm gold — regal and opulent.",
    primary: "#2E1A47",
    accent: "#C9A24B",
    accentSoft: "#A8843B",
    bg: "#F6F2EC",
    text: "#221A2E",
    card: "#FCFAF6",
    border: "#E2D9CF",
    muted: "#ECE4DA",
    sidebarAccent: "#3A2257",
    sidebarBorder: "#4A2D6E",
    chartTertiary: "#7A5C9A",
    chartQuaternary: "#B9A8CE",
    charts: ["#2E1A47", "#C9A24B", "#7A5C9A", "#B9A8CE", "#4A2D6E"],
  },
  "sapphire-noir": {
    key: "sapphire-noir",
    name: "Sapphire Noir",
    description: "Deep sapphire with cool silver — quiet and precise.",
    primary: "#0A1F38",
    accent: "#9DB2CE",
    accentSoft: "#7E94B0",
    bg: "#F1F4F8",
    text: "#16202E",
    card: "#FFFFFF",
    border: "#D5DEE9",
    muted: "#E3EAF2",
    sidebarAccent: "#112A47",
    sidebarBorder: "#1A3556",
    chartTertiary: "#4A6488",
    chartQuaternary: "#93A8C4",
    charts: ["#0A1F38", "#9DB2CE", "#4A6488", "#93A8C4", "#1A3556"],
  },
  "emerald-dynasty": {
    key: "emerald-dynasty",
    name: "Emerald Dynasty",
    description: "Imperial emerald with bright gilt — heritage and wealth.",
    primary: "#0C3B2E",
    accent: "#D4AF37",
    accentSoft: "#B0902C",
    bg: "#F3F1E9",
    text: "#18241F",
    card: "#FFFFFF",
    border: "#D9DDCF",
    muted: "#E6E8DA",
    sidebarAccent: "#114A39",
    sidebarBorder: "#195C47",
    chartTertiary: "#3F7A63",
    chartQuaternary: "#8FB3A2",
    charts: ["#0C3B2E", "#D4AF37", "#3F7A63", "#8FB3A2", "#195C47"],
  },
  "espresso-gilt": {
    key: "espresso-gilt",
    name: "Espresso Gilt",
    description: "Rich espresso brown with soft gilt — warm and grounded.",
    primary: "#2A1B12",
    accent: "#C8A45C",
    accentSoft: "#A8863F",
    bg: "#F4EFE7",
    text: "#251C14",
    card: "#FCF8F1",
    border: "#E0D6C7",
    muted: "#EBE2D3",
    sidebarAccent: "#3A271A",
    sidebarBorder: "#4A3324",
    chartTertiary: "#8A6A4A",
    chartQuaternary: "#C2A98C",
    charts: ["#2A1B12", "#C8A45C", "#8A6A4A", "#C2A98C", "#4A3324"],
  },
  "slate-rose": {
    key: "slate-rose",
    name: "Slate Rose",
    description: "Graphite slate with muted rose-gold — understated luxe.",
    primary: "#2C2F36",
    accent: "#C08A6E",
    accentSoft: "#A4715A",
    bg: "#F4F2F1",
    text: "#20242B",
    card: "#FFFFFF",
    border: "#DCD8D6",
    muted: "#E8E4E2",
    sidebarAccent: "#383C44",
    sidebarBorder: "#474C56",
    chartTertiary: "#8A7A82",
    chartQuaternary: "#BDB0B6",
    charts: ["#2C2F36", "#C08A6E", "#8A7A82", "#BDB0B6", "#474C56"],
  },
  "midnight-teal": {
    key: "midnight-teal",
    name: "Midnight Teal",
    description: "Deep teal with antique gold — coastal and composed.",
    primary: "#0C2E33",
    accent: "#BFA05A",
    accentSoft: "#9E8344",
    bg: "#F0F3F2",
    text: "#152426",
    card: "#FFFFFF",
    border: "#D2DCDA",
    muted: "#E0E8E6",
    sidebarAccent: "#103B41",
    sidebarBorder: "#184C53",
    chartTertiary: "#3F757C",
    chartQuaternary: "#8DB0B4",
    charts: ["#0C2E33", "#BFA05A", "#3F757C", "#8DB0B4", "#184C53"],
  },
  "mahogany-brass": {
    key: "mahogany-brass",
    name: "Mahogany Brass",
    description: "Warm mahogany with brass — library-panel richness.",
    primary: "#3A1E16",
    accent: "#C09A53",
    accentSoft: "#A07E3E",
    bg: "#F6F1EA",
    text: "#261812",
    card: "#FFFFFF",
    border: "#E3D8CC",
    muted: "#EDE3D6",
    sidebarAccent: "#4A271C",
    sidebarBorder: "#5C3325",
    chartTertiary: "#8E5E4A",
    chartQuaternary: "#C49E8C",
    charts: ["#3A1E16", "#C09A53", "#8E5E4A", "#C49E8C", "#5C3325"],
  },
  "amethyst-dusk": {
    key: "amethyst-dusk",
    name: "Amethyst Dusk",
    description: "Twilight amethyst with soft lilac — calm and refined.",
    primary: "#2A2140",
    accent: "#A88FC0",
    accentSoft: "#8A72A2",
    bg: "#F4F2F7",
    text: "#201B2E",
    card: "#FFFFFF",
    border: "#DED7E5",
    muted: "#E8E2EE",
    sidebarAccent: "#342843",
    sidebarBorder: "#443458",
    chartTertiary: "#6E5E8A",
    chartQuaternary: "#AD9EC4",
    charts: ["#2A2140", "#A88FC0", "#6E5E8A", "#AD9EC4", "#443458"],
  },
  "ivory-court": {
    key: "ivory-court",
    name: "Ivory Court",
    description: "Light — warm taupe on ivory with gold. Bright and airy.",
    primary: "#4A4036",
    accent: "#C9A24B",
    accentSoft: "#A8843B",
    bg: "#FAF7F0",
    text: "#2A2418",
    card: "#FFFFFF",
    border: "#E8E0D2",
    muted: "#F0E9DC",
    sidebarAccent: "#564A3E",
    sidebarBorder: "#6A5C4C",
    chartTertiary: "#9A8A6A",
    chartQuaternary: "#C9BCA2",
    charts: ["#4A4036", "#C9A24B", "#9A8A6A", "#C9BCA2", "#6A5C4C"],
  },
  "pearl-platinum": {
    key: "pearl-platinum",
    name: "Pearl Platinum",
    description: "Light — cool platinum greys on pearl. Crisp and modern.",
    primary: "#3A3E44",
    accent: "#7E848C",
    accentSoft: "#646A72",
    bg: "#F5F6F7",
    text: "#21262C",
    card: "#FFFFFF",
    border: "#DDE0E3",
    muted: "#E9EBED",
    sidebarAccent: "#454A51",
    sidebarBorder: "#565C64",
    chartTertiary: "#7E868F",
    chartQuaternary: "#B4BAC1",
    charts: ["#3A3E44", "#7E848C", "#7E868F", "#B4BAC1", "#565C64"],
  },
};

export const THEME_ORDER: ThemeKey[] = [
  "royal-navy",
  "onyx-brass",
  "oxford-green",
  "burgundy-reserve",
  "imperial-plum",
  "sapphire-noir",
  "emerald-dynasty",
  "espresso-gilt",
  "slate-rose",
  "midnight-teal",
  "mahogany-brass",
  "amethyst-dusk",
  "ivory-court",
  "pearl-platinum",
];

export const DEFAULT_THEME: ThemeKey = "royal-navy";
export const STORAGE_KEY = "nexvelon:theme";

export function isThemeKey(s: string | null): s is ThemeKey {
  return s !== null && (THEME_ORDER as string[]).includes(s);
}

/** Every token a preset resolves to, with optional fields filled from the
 *  defaults (default theme's accentSoft, the shared status pair, DEFAULT_FONTS).
 *  Both the CSS generator and JS consumers read fully-resolved themes so the two
 *  can never diverge again. */
export interface ResolvedThemeColors {
  key: ThemeKey;
  name: string;
  description: string;
  primary: string;
  accent: string;
  accentSoft: string;
  bg: string;
  text: string;
  card: string;
  border: string;
  muted: string;
  sidebarAccent: string;
  sidebarBorder: string;
  chartTertiary: string;
  chartQuaternary: string;
  statusGreen: string;
  statusRed: string;
  fonts: ThemeFonts;
  charts: [string, string, string, string, string];
}

export function resolveTheme(key: ThemeKey): ResolvedThemeColors {
  const t = THEMES[key];
  const def = THEMES[DEFAULT_THEME];
  return {
    key: t.key,
    name: t.name,
    description: t.description,
    primary: t.primary,
    accent: t.accent,
    accentSoft: t.accentSoft ?? def.accentSoft ?? t.accent,
    bg: t.bg,
    text: t.text,
    card: t.card,
    border: t.border,
    muted: t.muted,
    sidebarAccent: t.sidebarAccent,
    sidebarBorder: t.sidebarBorder,
    chartTertiary: t.chartTertiary,
    chartQuaternary: t.chartQuaternary,
    statusGreen: t.statusGreen ?? DEFAULT_STATUS_GREEN,
    statusRed: t.statusRed ?? DEFAULT_STATUS_RED,
    fonts: t.fonts ?? DEFAULT_FONTS,
    charts: t.charts,
  };
}
