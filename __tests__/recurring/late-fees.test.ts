// RECUR-2 — late-fee arithmetic with worked numbers (2f).

import { describe, it, expect } from "vitest";
import {
  annualEquivalentPct,
  daysOverdue,
  describeLateFeeTerms,
  dueLateFeeProposals,
  lateFeeBlock,
  lateFeeForBlock,
  normalizeLateFeeTerms,
  validateLateFeeTerms,
  CRIMINAL_RATE_APR_PCT,
} from "@/lib/recurring/late-fees";

const PCT2 = { mode: "percent_monthly" as const, monthlyPct: 2, graceDays: 5 };
const FLAT25 = { mode: "flat" as const, flatAmount: 25, graceDays: 0 };

describe("late fees — blocks", () => {
  it("counts calendar days overdue", () => {
    expect(daysOverdue("2026-10-31", "2026-10-31")).toBe(0);
    expect(daysOverdue("2026-10-31", "2026-11-06")).toBe(6);
    expect(daysOverdue("2026-10-31", "2026-10-20")).toBe(-11);
  });

  it("starts block 1 the day after grace and a new block every 30 days", () => {
    expect(lateFeeBlock(5, 5)).toBe(0); // still within grace
    expect(lateFeeBlock(6, 5)).toBe(1);
    expect(lateFeeBlock(35, 5)).toBe(1);
    expect(lateFeeBlock(36, 5)).toBe(2);
    expect(lateFeeBlock(1, 0)).toBe(1);
    expect(lateFeeBlock(31, 0)).toBe(2);
  });
});

describe("late fees — worked example (2%/month, 5 grace days)", () => {
  // $85.00 monitoring + 13% HST = $96.05, due 2026-10-31, unpaid.
  const inv = { dueDate: "2026-10-31", balance: 96.05 };

  it("nothing is proposed inside the grace period", () => {
    expect(dueLateFeeProposals(PCT2, inv, "2026-11-05", new Set())).toEqual([]);
  });

  it("day 6 overdue → block 1 → $96.05 × 2% = $1.92", () => {
    const p = dueLateFeeProposals(PCT2, inv, "2026-11-06", new Set());
    expect(p).toEqual([{ block: 1, daysOverdue: 6, basisBalance: 96.05, amount: 1.92 }]);
  });

  it("day 36 overdue → block 2 is proposed once block 1 was assessed", () => {
    const p = dueLateFeeProposals(PCT2, inv, "2026-12-06", new Set([1]));
    expect(p).toEqual([{ block: 2, daysOverdue: 36, basisBalance: 96.05, amount: 1.92 }]);
  });

  it("catches up missed blocks once each, never re-proposing assessed ones", () => {
    const p = dueLateFeeProposals(PCT2, inv, "2026-12-06", new Set());
    expect(p.map((x) => x.block)).toEqual([1, 2]);
  });

  it("no compounding: the basis is the invoice balance, never prior fees", () => {
    // A partially paid invoice: $50 left → 2% = $1.00
    const p = dueLateFeeProposals(PCT2, { dueDate: "2026-10-31", balance: 50 }, "2026-11-06", new Set());
    expect(p[0].amount).toBe(1);
  });

  it("states the annual equivalent (Interest Act s.4)", () => {
    expect(annualEquivalentPct(2)).toBe(24);
    expect(describeLateFeeTerms(PCT2)).toContain("2% per month (24% per year)");
  });
});

describe("late fees — flat", () => {
  it("charges $25 once per overdue invoice", () => {
    const inv = { dueDate: "2026-10-31", balance: 96.05 };
    expect(dueLateFeeProposals(FLAT25, inv, "2026-11-01", new Set())).toEqual([
      { block: 1, daysOverdue: 1, basisBalance: 96.05, amount: 25 },
    ]);
    expect(dueLateFeeProposals(FLAT25, inv, "2027-01-15", new Set([1]))).toEqual([]);
    expect(lateFeeForBlock(FLAT25, 96.05, 2)).toBe(0);
  });
});

describe("late fees — opt-in and guard rails", () => {
  it("defaults to no fee", () => {
    expect(normalizeLateFeeTerms(undefined).mode).toBe("none");
    expect(dueLateFeeProposals({ mode: "none" }, { dueDate: "2026-01-01", balance: 100 }, "2026-12-01", new Set())).toEqual([]);
  });

  it("never charges a paid / zero balance or an invoice with no due date", () => {
    expect(dueLateFeeProposals(PCT2, { dueDate: "2026-10-31", balance: 0 }, "2026-12-01", new Set())).toEqual([]);
    expect(dueLateFeeProposals(PCT2, { dueDate: null, balance: 96.05 }, "2026-12-01", new Set())).toEqual([]);
  });

  it("refuses a rate at or above the criminal rate", () => {
    expect(validateLateFeeTerms({ mode: "percent_monthly", monthlyPct: 2.5 })).toBeNull(); // 30%/yr
    const pct = CRIMINAL_RATE_APR_PCT / 12; // exactly 35%/yr
    expect(validateLateFeeTerms({ mode: "percent_monthly", monthlyPct: pct })).toMatch(/criminal/);
    expect(validateLateFeeTerms({ mode: "percent_monthly", monthlyPct: 0 })).toMatch(/above 0%/);
    expect(validateLateFeeTerms({ mode: "flat", flatAmount: 0 })).toMatch(/above \$0/);
    expect(validateLateFeeTerms({ mode: "flat", flatAmount: 10, graceDays: -1 })).toMatch(/grace/);
  });
});
