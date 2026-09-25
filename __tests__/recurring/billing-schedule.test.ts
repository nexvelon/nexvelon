// RECUR-1 — the recurring-billing arithmetic, proven on worked edges: month-end
// anchoring, leap-day, every cadence, advance vs arrears periods, pro-ration, MRR,
// and the missed-day catch-up.

import { describe, it, expect } from "vitest";
import {
  advanceByCadence,
  firstBillingDate,
  billingRuns,
  nextBillingDateAfter,
  prorate,
  monthlyEquivalent,
} from "@/lib/recurring/billing-schedule";

describe("advanceByCadence — month-end holds because it computes from the anchor", () => {
  it("Jan 31 monthly, by cycle index: Feb 28 → Mar 31 → Apr 30 (no drift)", () => {
    expect(advanceByCadence("2026-01-31", "monthly", null, 1)).toBe("2026-02-28"); // 2026 not leap
    expect(advanceByCadence("2026-01-31", "monthly", null, 2)).toBe("2026-03-31");
    expect(advanceByCadence("2026-01-31", "monthly", null, 3)).toBe("2026-04-30");
    expect(advanceByCadence("2026-01-31", "monthly", null, 12)).toBe("2027-01-31");
  });
  it("leap-day annual anchor: 2024-02-29 → 2025-02-28 → 2028-02-29", () => {
    expect(advanceByCadence("2024-02-29", "annual", null, 1)).toBe("2025-02-28");
    expect(advanceByCadence("2024-02-29", "annual", null, 4)).toBe("2028-02-29");
  });
  it("quarterly / semiannual / annual / custom steps", () => {
    expect(advanceByCadence("2026-01-15", "quarterly", null, 1)).toBe("2026-04-15");
    expect(advanceByCadence("2026-01-15", "semiannual", null, 1)).toBe("2026-07-15");
    expect(advanceByCadence("2026-01-15", "annual", null, 1)).toBe("2027-01-15");
    expect(advanceByCadence("2026-01-15", "custom", 30, 1)).toBe("2026-02-14");
    expect(advanceByCadence("2026-01-15", "custom", 30, 3)).toBe("2026-04-15");
  });
  it("custom cadence without an interval throws", () => {
    expect(() => advanceByCadence("2026-01-15", "custom", null, 1)).toThrow();
  });
});

describe("firstBillingDate", () => {
  it("advance = the start date; arrears = one cadence later", () => {
    expect(firstBillingDate("2026-01-17", "monthly", null, "advance")).toBe("2026-01-17");
    expect(firstBillingDate("2026-01-17", "monthly", null, "arrears")).toBe("2026-02-17");
  });
});

describe("billingRuns — advance (monitoring default): full first period, no proration", () => {
  it("$85/mo starting Jan 17 → periods [17→next 16], month-end held", () => {
    const runs = billingRuns("2026-01-17", "monthly", null, "advance", "2026-04-01");
    expect(runs.map((r) => r.billingDate)).toEqual([
      "2026-01-17",
      "2026-02-17",
      "2026-03-17",
    ]);
    expect(runs[0]).toEqual({
      billingDate: "2026-01-17",
      periodStart: "2026-01-17",
      periodEnd: "2026-02-16",
    });
    expect(runs[1]).toEqual({
      billingDate: "2026-02-17",
      periodStart: "2026-02-17",
      periodEnd: "2026-03-16",
    });
  });
  it("month-end anchor covers to the day before the next (clamped) billing date", () => {
    const runs = billingRuns("2026-01-31", "monthly", null, "advance", "2026-03-01");
    // Jan 31 → covers to Feb 27 (day before Feb 28); Feb 28 → covers to Mar 30.
    expect(runs[0]).toEqual({ billingDate: "2026-01-31", periodStart: "2026-01-31", periodEnd: "2026-02-27" });
    expect(runs[1]).toEqual({ billingDate: "2026-02-28", periodStart: "2026-02-28", periodEnd: "2026-03-30" });
  });
});

describe("billingRuns — arrears: first bill one cadence after start, covering the elapsed period", () => {
  it("starting Jan 17 arrears → first run Feb 17 covers [Jan 17 → Feb 16]", () => {
    const runs = billingRuns("2026-01-17", "monthly", null, "arrears", "2026-03-01");
    // Only Feb 17 is due by Mar 1 (the Mar 17 arrears run hasn't arrived yet).
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({
      billingDate: "2026-02-17",
      periodStart: "2026-01-17",
      periodEnd: "2026-02-16",
    });
    // Extending asOf past Mar 17 brings in the next arrears run.
    const more = billingRuns("2026-01-17", "monthly", null, "arrears", "2026-03-20");
    expect(more.map((r) => r.billingDate)).toEqual(["2026-02-17", "2026-03-17"]);
  });
});

describe("billingRuns — missed-day catch-up", () => {
  it("a 3-day (multi-period) gap yields every missed run, not just the latest", () => {
    // Monthly from Jan 1; scheduler last ran before Jan 1, now catching up at Mar 15.
    const runs = billingRuns("2026-01-01", "monthly", null, "advance", "2026-03-15");
    expect(runs.map((r) => r.billingDate)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("nextBillingDateAfter", () => {
  it("returns the first billing date strictly after asOf; null past end_date", () => {
    expect(nextBillingDateAfter("2026-01-01", "monthly", null, "advance", "2026-02-01", null)).toBe("2026-03-01");
    expect(nextBillingDateAfter("2026-01-01", "monthly", null, "advance", "2026-02-01", "2026-02-15")).toBeNull();
  });
});

describe("prorate — mid-cycle cancellation", () => {
  it("$85, Jan period (31 days), through Jan 16 = 16/31 → $43.87", () => {
    expect(prorate(85, "2026-01-01", "2026-01-31", "2026-01-16")).toBe(43.87);
  });
  it("full period → full amount; before period → 0; one-day period bills one day", () => {
    expect(prorate(85, "2026-01-01", "2026-01-31", "2026-01-31")).toBe(85);
    expect(prorate(85, "2026-01-01", "2026-01-31", "2025-12-20")).toBe(0);
    expect(prorate(30, "2026-01-01", "2026-01-01", "2026-01-01")).toBe(30);
  });
});

describe("monthlyEquivalent — honest MRR normalisation", () => {
  it("normalises each cadence to a monthly figure", () => {
    expect(monthlyEquivalent(85, "monthly", null)).toBe(85);
    expect(monthlyEquivalent(300, "quarterly", null)).toBe(100);
    expect(monthlyEquivalent(600, "semiannual", null)).toBe(100);
    expect(monthlyEquivalent(1200, "annual", null)).toBe(100);
    expect(monthlyEquivalent(85, "custom", 30)).toBe(86.24); // 85 × 30.4375 / 30
  });
});
