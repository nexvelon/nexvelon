// PROJ2-14/19 — the shared expiry vocabulary. Boundaries at 0 / warnDays /
// warnDays+1 out, and null end. This is the ONE date→state source; SUB-2's
// tests (run separately) confirm its 'valid' mapping is unchanged.

import { describe, it, expect } from "vitest";
import { expiryState, daysUntil, BOND_WARN_DAYS, WARRANTY_WARN_DAYS } from "@/lib/expiry-state";

const TODAY = "2026-07-23";

// helper: an ISO date `n` days from TODAY
function plus(n: number): string {
  const d = new Date(Date.UTC(2026, 6, 23) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("daysUntil", () => {
  it("counts days to the end date; negative once past; null with no end", () => {
    expect(daysUntil(plus(10), TODAY)).toBe(10);
    expect(daysUntil(plus(-3), TODAY)).toBe(-3);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});

describe("expiryState — boundaries (warnDays = 30)", () => {
  const W = 30;
  it("no end date → no_expiry", () => {
    expect(expiryState(null, TODAY, W)).toBe("no_expiry");
  });
  it("past → expired", () => {
    expect(expiryState(plus(-1), TODAY, W)).toBe("expired");
  });
  it("today (0 days) → expiring_soon, not expired", () => {
    expect(expiryState(plus(0), TODAY, W)).toBe("expiring_soon");
  });
  it("exactly warnDays out → expiring_soon (inclusive)", () => {
    expect(expiryState(plus(W), TODAY, W)).toBe("expiring_soon");
  });
  it("warnDays + 1 out → active", () => {
    expect(expiryState(plus(W + 1), TODAY, W)).toBe("active");
  });
});

describe("warn windows", () => {
  it("bonds = 30, warranties = 60 (warranties want longer notice)", () => {
    expect(BOND_WARN_DAYS).toBe(30);
    expect(WARRANTY_WARN_DAYS).toBe(60);
    // a date 45 days out is 'active' for a bond but 'expiring_soon' for a warranty
    expect(expiryState(plus(45), TODAY, BOND_WARN_DAYS)).toBe("active");
    expect(expiryState(plus(45), TODAY, WARRANTY_WARN_DAYS)).toBe("expiring_soon");
  });
});
