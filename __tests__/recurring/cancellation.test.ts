// RECUR-2 — cancellation-credit arithmetic with worked numbers (2g).

import { describe, it, expect } from "vitest";
import { computeCancellationCredits, sumCredits, type BilledPeriod } from "@/lib/recurring/cancellation";

function period(over: Partial<BilledPeriod> = {}): BilledPeriod {
  // $85.00/month monitoring, billed in advance for October (31 days), + 13% HST.
  return {
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    invoiceId: "inv-oct",
    invoiceNumber: "NG-0101",
    invoiceStatus: "sent",
    subtotal: 85,
    taxRatePct: 13,
    taxExempt: false,
    amountDue: 96.05,
    paid: 0,
    ...over,
  };
}

describe("cancellation credit — worked example", () => {
  // Cancelled with service through Oct 10: 10 of 31 days used.
  //   earned       = 85 × 10/31        = 27.42
  //   credit sub   = 85 − 27.42        = 57.58
  //   credit HST   = 57.58 × 13%       =  7.49
  //   credit total                     = 65.07
  it("pro-rates the unused days of an unpaid invoice and applies it to the balance", () => {
    const [c] = computeCancellationCredits([period()], "2026-10-10");
    expect(c).toMatchObject({
      daysInPeriod: 31,
      daysUsed: 10,
      earnedSubtotal: 27.42,
      creditSubtotal: 57.58,
      creditTax: 7.49,
      creditTotal: 65.07,
      disposition: "apply_to_balance",
      appliedAmount: 65.07,
      refundDue: 0,
    });
    // The client still owes 96.05 − 65.07 = 30.98 = the 10 days used, with HST.
    expect(Math.round((96.05 - c.appliedAmount) * 100) / 100).toBe(30.98);
  });

  it("is a refund due when the invoice is already paid", () => {
    const [c] = computeCancellationCredits([period({ invoiceStatus: "paid", paid: 96.05 })], "2026-10-10");
    expect(c.disposition).toBe("refund_due");
    expect(c.refundDue).toBe(65.07);
    expect(c.appliedAmount).toBe(0);
  });

  it("splits when part is paid: applies up to the balance, refunds the rest", () => {
    // $50 paid → $46.05 open; credit 65.07 → 46.05 applied, 19.02 refund.
    const [c] = computeCancellationCredits(
      [period({ invoiceStatus: "partially_paid", paid: 50 })],
      "2026-10-10"
    );
    expect(c.disposition).toBe("split");
    expect(c.appliedAmount).toBe(46.05);
    expect(c.refundDue).toBe(19.02);
  });

  it("reduces a draft that hasn't been issued", () => {
    const [c] = computeCancellationCredits([period({ invoiceStatus: "draft" })], "2026-10-10");
    expect(c.disposition).toBe("reduce_draft");
    expect(c.creditSubtotal).toBe(57.58);
  });
});

describe("cancellation credit — edges", () => {
  it("no credit when cancelled on the period's last day", () => {
    expect(computeCancellationCredits([period()], "2026-10-31")).toEqual([]);
  });

  it("a period billed ahead that starts after the cancel date is credited in full", () => {
    const nov = period({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      invoiceId: "inv-nov",
      invoiceStatus: "paid",
      paid: 96.05,
    });
    const credits = computeCancellationCredits([period(), nov], "2026-10-10");
    expect(credits).toHaveLength(2);
    expect(credits[1]).toMatchObject({ daysUsed: 0, creditSubtotal: 85, creditTax: 11.05, creditTotal: 96.05 });
    expect(sumCredits(credits)).toEqual({ total: 161.12, applied: 65.07, refundDue: 96.05 });
  });

  it("skips voided invoices and tax-exempt credits carry no HST", () => {
    expect(computeCancellationCredits([period({ invoiceStatus: "void" })], "2026-10-10")).toEqual([]);
    const [c] = computeCancellationCredits([period({ taxExempt: true, amountDue: 85 })], "2026-10-10");
    expect(c.creditTax).toBe(0);
    expect(c.creditTotal).toBe(57.58);
  });

  it("a quarterly period pro-rates across its full day count", () => {
    // Oct 1 – Dec 31 = 92 days, $255 (3 × $85). Cancel through Nov 15 = 46 days used.
    const [c] = computeCancellationCredits(
      [period({ periodEnd: "2026-12-31", subtotal: 255, amountDue: 288.15 })],
      "2026-11-15"
    );
    expect(c.daysInPeriod).toBe(92);
    expect(c.daysUsed).toBe(46);
    expect(c.earnedSubtotal).toBe(127.5);
    expect(c.creditSubtotal).toBe(127.5);
    expect(c.creditTotal).toBe(144.08);
  });
});
