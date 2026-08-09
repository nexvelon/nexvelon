// UIDG-2 — the theme single-source guarantees. These lock in that:
//  - every preset resolves to a COMPLETE token set,
//  - optional tokens fall back to the default theme / shared defaults,
//  - the chart palette matches the chrome tokens (no royal-navy-style drift),
//  - the generator emits one block per key with every declaration, and
//  - the committed generated CSS is in sync with lib/theme.ts (drift guard).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  THEMES,
  THEME_ORDER,
  DEFAULT_THEME,
  DEFAULT_FONTS,
  DEFAULT_STATUS_GREEN,
  DEFAULT_STATUS_RED,
  resolveTheme,
} from "@/lib/theme";
import { themePresetsCss } from "@/lib/theme-css";

describe("THEME_ORDER ↔ THEMES", () => {
  it("THEME_ORDER lists exactly the THEMES keys, once each", () => {
    expect([...THEME_ORDER].sort()).toEqual(Object.keys(THEMES).sort());
    expect(new Set(THEME_ORDER).size).toBe(THEME_ORDER.length);
  });
});

describe("resolveTheme produces a complete token set for every preset", () => {
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  for (const key of THEME_ORDER) {
    it(`${key} is complete`, () => {
      const t = resolveTheme(key);
      for (const field of [
        "primary", "accent", "accentSoft", "bg", "text", "card", "border",
        "muted", "sidebarAccent", "sidebarBorder", "chartTertiary",
        "chartQuaternary", "statusGreen", "statusRed",
      ] as const) {
        expect(t[field], `${key}.${field}`).toMatch(HEX);
      }
      expect(t.charts).toHaveLength(5);
      t.charts.forEach((c) => expect(c).toMatch(HEX));
      expect(t.fonts.sans).toBeTruthy();
      expect(t.fonts.serif).toBeTruthy();
      expect(t.fonts.mono).toBeTruthy();
    });
  }
});

describe("optional tokens fall back to the defaults", () => {
  const INHERITORS = ["onyx-brass", "oxford-green", "burgundy-reserve"] as const;

  it("presets that omit accentSoft inherit the default theme's value", () => {
    for (const key of INHERITORS) {
      expect(THEMES[key].accentSoft).toBeUndefined();
      expect(resolveTheme(key).accentSoft).toBe(THEMES[DEFAULT_THEME].accentSoft);
    }
  });

  it("status pair falls back to the shared defaults when unset", () => {
    for (const key of THEME_ORDER) {
      const t = resolveTheme(key);
      expect(t.statusGreen).toBe(THEMES[key].statusGreen ?? DEFAULT_STATUS_GREEN);
      expect(t.statusRed).toBe(THEMES[key].statusRed ?? DEFAULT_STATUS_RED);
    }
  });

  it("every preset still renders the Playfair serif (nothing changed visually)", () => {
    for (const key of THEME_ORDER) {
      expect(resolveTheme(key).fonts).toEqual(DEFAULT_FONTS);
      expect(resolveTheme(key).fonts.serif).toBe("var(--font-playfair)");
    }
  });
});

describe("chrome and charts read the same tokens (no drift)", () => {
  // The CSS derives --chart-1..4 from --brand-primary/accent/chart-tertiary/
  // chart-quaternary; the JS Recharts palette must match those exactly.
  it("charts[0..3] equal primary / accent / chartTertiary / chartQuaternary", () => {
    for (const key of THEME_ORDER) {
      const t = resolveTheme(key);
      expect(t.charts[0]).toBe(t.primary);
      expect(t.charts[1]).toBe(t.accent);
      expect(t.charts[2]).toBe(t.chartTertiary);
      expect(t.charts[3]).toBe(t.chartQuaternary);
    }
  });

  it("royal-navy converged onto its chrome values (the fixed §9 bug)", () => {
    const t = resolveTheme("royal-navy");
    expect(t.primary).toBe("#0A1226");
    expect(t.accent).toBe("#B8924B");
    expect(t.charts[0]).toBe("#0A1226");
    expect(t.charts[1]).toBe("#B8924B");
  });
});

describe("generated CSS", () => {
  const css = themePresetsCss();

  it("emits one block per preset (default theme also claims bare :root)", () => {
    for (const key of THEME_ORDER) {
      const count = css.split(`[data-theme="${key}"]`).length - 1;
      expect(count, key).toBe(1);
    }
    expect(css).toMatch(/:root,\n:root\[data-theme="royal-navy"\]/);
  });

  it("every block defines all 17 brand/font declarations", () => {
    const TOKENS = [
      "--brand-primary", "--brand-accent", "--brand-accent-soft", "--brand-bg",
      "--brand-text", "--brand-card", "--brand-border", "--brand-muted",
      "--brand-sidebar-accent", "--brand-sidebar-border", "--brand-chart-tertiary",
      "--brand-chart-quaternary", "--brand-status-green", "--brand-status-red",
      "--brand-font-sans", "--brand-font-serif", "--brand-font-mono",
    ];
    for (const token of TOKENS) {
      const count = css.split(`${token}:`).length - 1;
      expect(count, token).toBe(THEME_ORDER.length);
    }
  });

  it("the committed app/theme-presets.generated.css is in sync (run `npm run gen:theme`)", () => {
    const onDisk = readFileSync(
      join(process.cwd(), "app/theme-presets.generated.css"),
      "utf8"
    );
    expect(onDisk).toBe(css);
  });
});
