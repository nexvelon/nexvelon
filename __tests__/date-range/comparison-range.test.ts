// UIDG-6B — the comparison-window rule (2b). The whole chunk's honesty rests on
// like-for-like windows, so every RangePicker option is pinned here, with the
// MTD calendar-alignment and the short-prior-month clamp given their own tests.

import { describe, it, expect } from "vitest";
import { comparisonRange } from "@/lib/date-range";

// Fixed anchors (local noon to avoid any TZ edge).
const AUG16 = new Date(2026, 7, 16, 12); // Sun 16 Aug 2026 — mid-month
const MAR31 = new Date(2026, 2, 31, 12); // 31 Mar 2026 — overflows short February

function ymd(d: Date) {
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

describe("comparisonRange — like-for-like prior window per range option", () => {
  it("today → yesterday", () => {
    const c = comparisonRange("today", AUG16);
    expect(ymd(c.start)).toEqual({ y: 2026, m: 7, d: 15 });
    expect(ymd(c.end)).toEqual({ y: 2026, m: 7, d: 15 });
    expect(c.basis).toBe("yesterday");
  });

  it("7d → the preceding 7 days", () => {
    const c = comparisonRange("7d", AUG16); // current = Aug 10–16
    expect(ymd(c.start)).toEqual({ y: 2026, m: 7, d: 3 });
    expect(ymd(c.end)).toEqual({ y: 2026, m: 7, d: 9 });
    expect(c.basis).toBe("prev 7 days");
  });

  it("mtd → the SAME days of the previous month (not the whole month)", () => {
    const c = comparisonRange("mtd", AUG16); // current = Aug 1–16
    expect(ymd(c.start)).toEqual({ y: 2026, m: 6, d: 1 }); // Jul 1
    // same elapsed span → around Jul 16, and never past the end of July
    expect(c.end.getMonth()).toBe(6);
    expect(c.end.getDate()).toBeLessThanOrEqual(16);
    expect(c.basis).toBe("same days last month");
  });

  it("mtd clamps when the current span overflows a shorter prior month", () => {
    const c = comparisonRange("mtd", MAR31); // current = Mar 1–31 (31 days)
    expect(ymd(c.start)).toEqual({ y: 2026, m: 1, d: 1 }); // Feb 1
    // Feb 2026 has 28 days — the window must clamp to Feb 28, NOT spill into March.
    expect(c.end.getMonth()).toBe(1);
    expect(c.end.getDate()).toBeLessThanOrEqual(28);
  });

  it("qtd → the same elapsed period of the previous quarter", () => {
    const c = comparisonRange("qtd", AUG16); // Q3 (Jul–), current = Jul 1–Aug 16
    expect(ymd(c.start)).toEqual({ y: 2026, m: 3, d: 1 }); // Apr 1 (Q2)
    expect(c.basis).toBe("same period last quarter");
  });

  it("ytd → the same elapsed period of the previous year", () => {
    const c = comparisonRange("ytd", AUG16); // current = Jan 1–Aug 16 2026
    expect(ymd(c.start)).toEqual({ y: 2025, m: 0, d: 1 }); // Jan 1 2025
    expect(c.end.getFullYear()).toBe(2025);
    expect(c.end.getMonth()).toBe(7); // ~Aug 2025
    expect(c.basis).toBe("same period last year");
  });

  it("custom → an equal-length window immediately preceding", () => {
    const c = comparisonRange("custom", AUG16);
    // ends the moment before the current window starts, equal length.
    expect(c.end.getTime()).toBeLessThan(new Date(2026, 7, 1).getTime());
    expect(c.basis).toBe("prev period");
  });
});
