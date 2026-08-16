// UIDG-5 — the pure chart-theme derivation + the series-colour rule (2d). Charts
// read their colours from here, so this is where the "no two series identical"
// guarantee and the light↔dark resolution are pinned.

import { describe, it, expect } from "vitest";
import {
  chartThemeFrom,
  seriesColor,
  seriesColors,
  shiftLightness,
  withAlpha,
} from "@/lib/charts/theme";
import type { ResolvedThemeColors } from "@/lib/theme";

// Minimal light + dark resolved-colour stand-ins (only the fields the chart
// theme reads matter here).
function resolved(over: Partial<ResolvedThemeColors>): ResolvedThemeColors {
  return {
    key: "t", name: "T", description: "",
    primary: "#0A1226", accent: "#B8924B", accentSoft: "#9A7B3A",
    bg: "#ffffff", text: "#1A1F2E", card: "#ffffff", border: "#e5e5e5",
    muted: "#f4f4f4", sidebarAccent: "#000", sidebarBorder: "#000",
    chartTertiary: "#5C6A8A", chartQuaternary: "#A8B0C4",
    statusGreen: "#4F6A3C", statusRed: "#8a3b3b",
    fonts: {} as ResolvedThemeColors["fonts"],
    charts: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
    ...over,
  } as ResolvedThemeColors;
}

describe("chartThemeFrom — reads the resolved (mode-correct) palette", () => {
  it("maps palette, axis, grid and tooltip from the theme colours", () => {
    const ct = chartThemeFrom(resolved({}));
    expect(ct.palette).toEqual(["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"]);
    expect(ct.axisTick).toBe("#5C6A8A");
    expect(ct.gridStroke).toBe("#e5e5e5");
    expect(ct.tooltipBg).toBe("#ffffff");
    expect(ct.tooltipFg).toBe("#1A1F2E");
  });

  it("light and dark resolve to different grid/tooltip surfaces (mode flows through)", () => {
    const light = chartThemeFrom(resolved({ card: "#ffffff", border: "#e5e5e5", text: "#1A1F2E" }));
    const dark = chartThemeFrom(resolved({ card: "#12172a", border: "#2a2f45", text: "#e8eaf0" }));
    expect(light.tooltipBg).not.toBe(dark.tooltipBg);
    expect(light.gridStroke).not.toBe(dark.gridStroke);
    expect(light.tooltipFg).not.toBe(dark.tooltipFg);
  });
});

describe("seriesColor — the 6+ series rule (2d): never silently identical", () => {
  const palette = ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"];

  it("uses the palette as-is for the first five series", () => {
    for (let i = 0; i < 5; i++) expect(seriesColor(i, palette)).toBe(palette[i]);
  });

  it("the sixth series is NOT identical to the first (the cycling bug)", () => {
    expect(seriesColor(5, palette)).not.toBe(seriesColor(0, palette));
  });

  it("produces all-distinct colours well past the palette length", () => {
    const colors = seriesColors(12, palette);
    expect(new Set(colors).size).toBe(12);
  });

  it("stays a valid hex at every wrap", () => {
    for (const c of seriesColors(15, palette)) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("hex maths", () => {
  it("shiftLightness moves lightness and clamps", () => {
    expect(shiftLightness("#808080", 20)).not.toBe("#808080");
    // clamped — never pure white/black
    expect(shiftLightness("#ffffff", 50)).not.toBe("#ffffff");
    expect(shiftLightness("#000000", -50)).not.toBe("#000000");
  });

  it("withAlpha appends an 8-digit hex alpha", () => {
    expect(withAlpha("#0A1226", 0.5)).toMatch(/^#0a1226[0-9a-f]{2}$/);
    expect(withAlpha("#0A1226", 0)).toBe("#0a122600");
  });
});
