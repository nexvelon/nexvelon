// BUGFIX (quotes) Cluster B — computeQuoteTotals is the single source of truth
// for quote money math. Gross margin is SP-based on the POST-discount, PRE-tax
// figure: (SPafterDiscount − cost) / SPafterDiscount. Tax never enters cost or
// the margin base; discount reduces selling price only, never cost.

import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "@/lib/quotes/totals";
import type { BuilderLineItem, QuoteSection } from "@/lib/types";

function line(partial: Partial<BuilderLineItem>): BuilderLineItem {
  return {
    id: partial.id ?? "li-test",
    type: partial.type ?? "product",
    name: partial.name ?? "Test",
    description: partial.description ?? "",
    classification: partial.classification ?? "Materials",
    qty: partial.qty ?? 1,
    unitCost: partial.unitCost ?? 0,
    margin: partial.margin ?? 0,
    unitPrice: partial.unitPrice ?? 0,
    ...partial,
  };
}

function section(items: BuilderLineItem[]): QuoteSection {
  return { id: "sec-1", name: "Section", items };
}

describe("computeQuoteTotals", () => {
  it("reproduces the reported case: cost 10000, SP-after-discount 14448.93 → ~30.79% margin", () => {
    // One line priced so the 30% discount lands the SP at exactly 14,448.93.
    // subtotal 20641.33 × 0.70 = 14448.931 → 14448.93.
    const sections = [
      section([line({ unitCost: 10000, unitPrice: 20641.33, qty: 1 })]),
    ];
    const t = computeQuoteTotals(sections, 0.13, 30, "pct");

    expect(t.costTotal).toBe(10000);
    expect(t.sellingPriceAfterDiscount).toBe(14448.93);
    expect(t.profit).toBe(4448.93);
    // The user expected ~30.79% via (SP − cost)/SP — NOT the ~21.8% that the
    // missing cost/profit display made the old UI look inconsistent about.
    expect(t.marginPct).toBeCloseTo(30.79, 2);
    // Sanity: it is emphatically NOT a cost-based markup (44.49%).
    expect(t.marginPct).toBeLessThan(31);
  });

  it("no discount: cost 100 / SP 200 → 50% margin", () => {
    const t = computeQuoteTotals(
      [section([line({ unitCost: 100, unitPrice: 200, qty: 1 })])],
      0.13,
      0,
      "pct"
    );
    expect(t.costTotal).toBe(100);
    expect(t.sellingPriceAfterDiscount).toBe(200);
    expect(t.profit).toBe(100);
    expect(t.marginPct).toBe(50);
  });

  it("full (100%) discount → SP-after-discount 0, marginPct null, profit negative", () => {
    const t = computeQuoteTotals(
      [section([line({ unitCost: 100, unitPrice: 200, qty: 1 })])],
      0.13,
      100,
      "pct"
    );
    expect(t.sellingPriceAfterDiscount).toBe(0);
    expect(t.marginPct).toBeNull();
    expect(t.profit).toBe(-100);
  });

  it("tax does not shift margin (margin base is pre-tax)", () => {
    const sections = [
      section([line({ unitCost: 100, unitPrice: 200, qty: 1 })]),
    ];
    const noTax = computeQuoteTotals(sections, 0, 0, "pct");
    const withTax = computeQuoteTotals(sections, 0.13, 0, "pct");
    expect(noTax.marginPct).toBe(withTax.marginPct);
    expect(noTax.marginPct).toBe(50);
    // Tax still shows up in the grand total, just not the margin base.
    expect(withTax.taxAmount).toBeGreaterThan(0);
    expect(noTax.taxAmount).toBe(0);
  });

  it("mixes labour + parts: costTotal sums qty×unitCost across every line", () => {
    const sections = [
      section([
        // labour: 8h @ cost 87/h, sell 145/h
        line({ type: "labor", qty: 8, unitCost: 87, unitPrice: 145 }),
        // part: 2 @ cost 50, sell 100
        line({ type: "product", qty: 2, unitCost: 50, unitPrice: 100 }),
      ]),
    ];
    const t = computeQuoteTotals(sections, 0.13, 0, "pct");
    // cost = 8×87 + 2×50 = 696 + 100 = 796
    expect(t.costTotal).toBe(796);
    // SP = 8×145 + 2×100 = 1160 + 200 = 1360
    expect(t.sellingPriceSubtotal).toBe(1360);
    expect(t.profit).toBe(1360 - 796);
    expect(t.marginPct).toBeCloseTo(((1360 - 796) / 1360) * 100, 2);
  });

  it("preserves decimal cents (no integer truncation)", () => {
    const t = computeQuoteTotals(
      [section([line({ unitCost: 10.55, unitPrice: 20.1, qty: 1 })])],
      0,
      0,
      "pct"
    );
    expect(t.costTotal).toBe(10.55);
    expect(t.sellingPriceSubtotal).toBe(20.1);
    expect(t.profit).toBe(9.55);
  });

  it("flat-amount discount reduces SP by the given dollar amount", () => {
    const t = computeQuoteTotals(
      [section([line({ unitCost: 100, unitPrice: 500, qty: 1 })])],
      0,
      50,
      "amount"
    );
    expect(t.discountAmount).toBe(50);
    expect(t.sellingPriceAfterDiscount).toBe(450);
    expect(t.costTotal).toBe(100); // discount never touches cost
    expect(t.profit).toBe(350);
  });
});
