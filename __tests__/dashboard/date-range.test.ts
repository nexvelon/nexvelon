// CLEAN-1 §4b/§5 — the range helper was extracted from the retired
// lib/dashboard-data mock. The old mock anchored every range to a FROZEN demo
// date (new Date("2026-04-30")); the extracted util must default to the REAL
// current date so the dashboard shows live windows.

import { describe, it, expect } from "vitest";
import { rangeFor, RANGE_LABEL } from "@/lib/date-range";

describe("rangeFor default anchor is the real today (not the frozen demo date)", () => {
  it("YTD starts Jan 1 of the CURRENT year, not 2026", () => {
    const now = new Date();
    const r = rangeFor("ytd");
    expect(r.start.getFullYear()).toBe(now.getFullYear());
    expect(r.start.getMonth()).toBe(0);
    expect(r.start.getDate()).toBe(1);
  });

  it("today's window ends today (same calendar day as new Date())", () => {
    const now = new Date();
    const r = rangeFor("today");
    expect(r.end.getFullYear()).toBe(now.getFullYear());
    expect(r.end.getMonth()).toBe(now.getMonth());
    expect(r.end.getDate()).toBe(now.getDate());
    // start-of-day → end-of-day span
    expect(r.start.getHours()).toBe(0);
    expect(r.end.getHours()).toBe(23);
  });

  it("an explicit anchor is still honoured (callers may pass new Date())", () => {
    const anchor = new Date(2020, 5, 15); // Jun 15 2020
    const r = rangeFor("ytd", anchor);
    expect(r.start.getFullYear()).toBe(2020);
    expect(r.start.getMonth()).toBe(0);
  });

  it("the previous-period window sits immediately before the current one", () => {
    const r = rangeFor("7d");
    expect(r.prevEnd.getTime()).toBeLessThan(r.start.getTime());
    expect(r.prevStart.getTime()).toBeLessThan(r.prevEnd.getTime());
  });

  it("every range key has a label", () => {
    for (const k of ["today", "7d", "mtd", "qtd", "ytd", "custom"] as const) {
      expect(RANGE_LABEL[k]).toBeTruthy();
    }
  });
});
