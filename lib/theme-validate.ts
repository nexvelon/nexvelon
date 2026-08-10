// UIDG-4 — validation for custom-theme tokens. custom_themes.tokens is jsonb, so
// the DB accepts anything; application code must not. Validated on WRITE (before
// save) and on READ (before applying) — a row that fails falls back to the
// default theme rather than rendering a half-applied or blank app.
//
// Pure (no server-only, no DOM) so both the server actions and the live editor
// use the exact same rules — the inline contrast state can never disagree with
// the save-time block.

import {
  DEFAULT_FONTS,
  THEME_COLOR_TOKEN_KEYS,
  deriveDarkTokens,
  type ThemeFonts,
  type ThemeTokens,
} from "./theme";

/** WCAG 2.1 AA minimum contrast for normal-size text. */
export const WCAG_AA_NORMAL = 4.5;

/** The only font families the app actually loads (next/font, app/layout.tsx). A
 *  custom theme may only reference one of these — anything else wouldn't load. */
export const ALLOWED_FONT_VALUES: readonly string[] = [
  DEFAULT_FONTS.sans,
  DEFAULT_FONTS.serif,
  DEFAULT_FONTS.mono,
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // drop alpha for luminance
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio (1..21) between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast state for the editor's inline indicator (text on background). */
export function checkContrast(
  text: string,
  bg: string
): { ratio: number; passes: boolean } {
  if (!isHexColor(text) || !isHexColor(bg)) return { ratio: 0, passes: false };
  const ratio = Math.round(contrastRatio(text, bg) * 100) / 100;
  return { ratio, passes: ratio >= WCAG_AA_NORMAL };
}

export type ThemeTokensResult =
  | { ok: true; value: ThemeTokens }
  | { ok: false; error: string };

function validateFonts(raw: unknown): ThemeFonts | string {
  if (typeof raw !== "object" || raw === null) return "fonts must be an object";
  const f = raw as Record<string, unknown>;
  for (const slot of ["sans", "serif", "mono"] as const) {
    const v = f[slot];
    if (typeof v !== "string") return `fonts.${slot} is required`;
    if (!ALLOWED_FONT_VALUES.includes(v)) {
      return `fonts.${slot} must be one of the loaded families (${ALLOWED_FONT_VALUES.join(", ")})`;
    }
  }
  return { sans: f.sans as string, serif: f.serif as string, mono: f.mono as string };
}

/**
 * Validate an untrusted tokens object against the ThemeTokens shape:
 * every colour token present + a valid hex, a 5-stop hex chart palette, fonts
 * from the loaded set, and text/background contrast ≥ WCAG AA. On failure the
 * error names the problem (and the ratio for a contrast failure).
 */
export function validateThemeTokens(raw: unknown): ThemeTokensResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Theme tokens must be an object." };
  }
  const t = raw as Record<string, unknown>;

  for (const key of THEME_COLOR_TOKEN_KEYS) {
    if (!(key in t)) return { ok: false, error: `Missing colour token: ${key}` };
    if (!isHexColor(t[key])) {
      return { ok: false, error: `${key} must be a hex colour (got ${String(t[key])})` };
    }
  }

  if (!Array.isArray(t.charts) || t.charts.length !== 5) {
    return { ok: false, error: "charts must be a 5-colour palette" };
  }
  for (const c of t.charts) {
    if (!isHexColor(c)) return { ok: false, error: `chart palette has a non-hex colour (${String(c)})` };
  }

  const fonts = validateFonts(t.fonts);
  if (typeof fonts === "string") return { ok: false, error: fonts };

  // Hard block: text must be legible on the background (§ lockout prevention).
  const { ratio, passes } = checkContrast(t.text as string, t.bg as string);
  if (!passes) {
    return {
      ok: false,
      error: `Text/background contrast ${ratio.toFixed(2)}:1 fails WCAG AA (needs ${WCAG_AA_NORMAL}:1). Pick a darker text or lighter background.`,
    };
  }

  const value: ThemeTokens = {
    primary: t.primary as string,
    accent: t.accent as string,
    accentSoft: t.accentSoft as string,
    bg: t.bg as string,
    text: t.text as string,
    card: t.card as string,
    border: t.border as string,
    muted: t.muted as string,
    sidebarAccent: t.sidebarAccent as string,
    sidebarBorder: t.sidebarBorder as string,
    chartTertiary: t.chartTertiary as string,
    chartQuaternary: t.chartQuaternary as string,
    statusGreen: t.statusGreen as string,
    statusRed: t.statusRed as string,
    fonts,
    charts: t.charts as [string, string, string, string, string],
  };
  return { ok: true, value };
}

/**
 * UIDG-4B — a custom theme renders in BOTH light and dark, so it must be legible
 * in both. Validate the stored (light) tokens, then derive the dark tokens the
 * app will actually render and check their contrast too. A palette that reads in
 * light but not in dark is blocked, with the failing mode named.
 */
export function validateThemeBothModes(raw: unknown): ThemeTokensResult {
  const light = validateThemeTokens(raw); // structure + light text/bg contrast
  if (!light.ok) return light;

  const dark = deriveDarkTokens(light.value);
  const c = checkContrast(dark.text, dark.bg);
  if (!c.passes) {
    return {
      ok: false,
      error: `Dark-mode text/background contrast ${c.ratio.toFixed(2)}:1 fails WCAG AA (needs ${WCAG_AA_NORMAL}:1).`,
    };
  }
  return light; // the light tokens are what gets stored; dark is derived on render
}
