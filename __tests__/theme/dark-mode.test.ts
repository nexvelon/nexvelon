// UIDG-4B — dark mode: derivation, WCAG AA for every built-in in BOTH modes,
// both-mode validation, and the generated CSS carrying both modes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  THEME_ORDER,
  resolveTheme,
  deriveDarkTokens,
  themeTokens,
  type ThemeMode,
} from "@/lib/theme";
import {
  contrastRatio,
  validateThemeBothModes,
  WCAG_AA_NORMAL,
} from "@/lib/theme-validate";

const relLum = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

describe("deriveDarkTokens", () => {
  it("produces a dark background and light text from a light palette", () => {
    const light = themeTokens(resolveTheme("royal-navy", "light"));
    const dark = deriveDarkTokens(light);
    expect(relLum(dark.bg)).toBeLessThan(relLum(light.bg));
    expect(relLum(dark.text)).toBeGreaterThan(relLum(light.text));
    expect(relLum(dark.bg)).toBeLessThan(0.1); // genuinely dark
    expect(dark.accent).toBe(light.accent); // accent kept for identity
  });
});

describe("every built-in passes WCAG AA in BOTH modes", () => {
  const pairs: [string, (t: ReturnType<typeof resolveTheme>) => string, (t: ReturnType<typeof resolveTheme>) => string][] = [
    ["text/bg", (t) => t.text, (t) => t.bg],
    ["text/card", (t) => t.text, (t) => t.card],
    ["primary/bg", (t) => t.primary, (t) => t.bg],
    ["statusGreen/bg", (t) => t.statusGreen, (t) => t.bg],
    ["statusRed/bg", (t) => t.statusRed, (t) => t.bg],
  ];
  for (const mode of ["light", "dark"] as ThemeMode[]) {
    for (const key of THEME_ORDER) {
      it(`${key} — ${mode}`, () => {
        const t = resolveTheme(key, mode);
        for (const [label, fg, bg] of pairs) {
          const ratio = contrastRatio(fg(t), bg(t));
          expect(ratio, `${key}/${mode} ${label} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      });
    }
  }
});

describe("validateThemeBothModes", () => {
  it("accepts a legible palette", () => {
    const good = themeTokens(resolveTheme("royal-navy", "light"));
    expect(validateThemeBothModes(good).ok).toBe(true);
  });
  it("rejects a light palette that fails contrast", () => {
    const good = themeTokens(resolveTheme("royal-navy", "light"));
    const r = validateThemeBothModes({ ...good, text: "#FEFEFE", bg: "#FFFFFF" });
    expect(r.ok).toBe(false);
  });
});

describe("generated CSS carries light + dark for every preset", () => {
  const css = readFileSync(join(process.cwd(), "app/theme-presets.generated.css"), "utf8");
  it("has a :root.dark block for every palette", () => {
    for (const key of THEME_ORDER) {
      // royal-navy (default) uses the combined :root.dark selector
      const needle =
        key === "royal-navy"
          ? ':root.dark,'
          : `:root.dark[data-theme="${key}"]`;
      expect(css.includes(needle), `missing dark block for ${key}`).toBe(true);
    }
  });
  it("has a light block for every palette too", () => {
    for (const key of THEME_ORDER) {
      const needle = key === "royal-navy" ? ":root,\n:root[data-theme=\"royal-navy\"]" : `:root[data-theme="${key}"]`;
      expect(css.includes(needle)).toBe(true);
    }
  });
});
