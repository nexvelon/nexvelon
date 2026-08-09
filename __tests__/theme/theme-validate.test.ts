// UIDG-4 — custom-theme token validation + WCAG contrast block.

import { describe, it, expect } from "vitest";
import { validateThemeTokens, checkContrast, contrastRatio } from "@/lib/theme-validate";
import { themeTokens, resolveTheme } from "@/lib/theme";

const good = themeTokens(resolveTheme("royal-navy"));

describe("validateThemeTokens", () => {
  it("accepts a complete, legible token set", () => {
    const r = validateThemeTokens(good);
    expect(r.ok).toBe(true);
  });

  it("rejects a missing colour token", () => {
    const { primary, ...rest } = good as unknown as Record<string, unknown>;
    void primary;
    const r = validateThemeTokens(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/primary/);
  });

  it("rejects a non-hex colour", () => {
    const r = validateThemeTokens({ ...good, accent: "not-a-colour" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hex/i);
  });

  it("rejects a chart palette that isn't 5 colours", () => {
    const r = validateThemeTokens({ ...good, charts: ["#000000", "#111111"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/5/);
  });

  it("rejects a font that isn't a loaded family", () => {
    const r = validateThemeTokens({ ...good, fonts: { ...good.fonts, serif: "var(--font-comic-sans)" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fonts\.serif/);
  });

  it("hard-blocks a theme that fails WCAG AA on text/background", () => {
    // near-white text on white bg → ~1:1
    const r = validateThemeTokens({ ...good, text: "#FEFEFE", bg: "#FFFFFF" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/contrast/i);
      expect(r.error).toMatch(/WCAG AA/);
    }
  });

  it("rejects a non-object", () => {
    expect(validateThemeTokens(null).ok).toBe(false);
    expect(validateThemeTokens("x").ok).toBe(false);
    expect(validateThemeTokens([]).ok).toBe(false);
  });
});

describe("contrast helpers", () => {
  it("black on white is 21:1", () => {
    expect(Math.round(contrastRatio("#000000", "#FFFFFF"))).toBe(21);
  });
  it("checkContrast flags a failing pair", () => {
    expect(checkContrast("#FFFFFF", "#FFFFFF").passes).toBe(false);
    expect(checkContrast("#1A1F2E", "#F5F1E8").passes).toBe(true);
  });
});
