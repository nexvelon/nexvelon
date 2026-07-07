// PROJ2-6a — computeJobLineItemTotals. Pure function, no mocks. Per-line
// discount; margin SP-based on the post-discount figure; no clamps (bugfix).

import { describe, it, expect } from "vitest";
import {
  computeJobLineItemTotals,
  type JobLineItemTotalsInput,
} from "@/lib/jobs/totals";

function line(p: Partial<JobLineItemTotalsInput>): JobLineItemTotalsInput {
  return {
    quantity: p.quantity ?? 1,
    unit_cost: p.unit_cost ?? 0,
    unit_price: p.unit_price ?? 0,
    discount_pct: p.discount_pct ?? 0,
  };
}

describe("computeJobLineItemTotals", () => {
  it("sums parts + labour (no discount)", () => {
    const t = computeJobLineItemTotals([
      // part: 2 @ cost 50 / sell 100 → sell 200, cost 100
      line({ quantity: 2, unit_cost: 50, unit_price: 100 }),
      // labour: 8h @ cost 87 / sell 145 → sell 1160, cost 696
      line({ quantity: 8, unit_cost: 87, unit_price: 145 }),
    ]);
    expect(t.sellSubtotal).toBe(1360);
    expect(t.discountTotal).toBe(0);
    expect(t.sellAfterDiscount).toBe(1360);
    expect(t.costTotal).toBe(796);
    expect(t.profit).toBe(564);
    expect(t.marginPct).toBeCloseTo((564 / 1360) * 100, 2);
  });

  it("applies per-line discounts", () => {
    const t = computeJobLineItemTotals([
      line({ quantity: 1, unit_cost: 60, unit_price: 100, discount_pct: 10 }),
    ]);
    expect(t.sellSubtotal).toBe(100);
    expect(t.discountTotal).toBe(10);
    expect(t.sellAfterDiscount).toBe(90);
    expect(t.costTotal).toBe(60);
    expect(t.profit).toBe(30);
    expect(t.marginPct).toBeCloseTo((30 / 90) * 100, 2);
  });

  it("zero-line job → zeroes and null margin", () => {
    const t = computeJobLineItemTotals([]);
    expect(t.sellSubtotal).toBe(0);
    expect(t.sellAfterDiscount).toBe(0);
    expect(t.costTotal).toBe(0);
    expect(t.profit).toBe(0);
    expect(t.marginPct).toBeNull();
  });

  it("preserves decimal cents", () => {
    const t = computeJobLineItemTotals([
      line({ quantity: 1, unit_cost: 10.55, unit_price: 20.1 }),
    ]);
    expect(t.sellSubtotal).toBe(20.1);
    expect(t.costTotal).toBe(10.55);
    expect(t.profit).toBe(9.55);
  });

  it("discount_pct > 100 does not throw (no clamp); margin goes null when SP ≤ 0", () => {
    const t = computeJobLineItemTotals([
      line({ quantity: 1, unit_cost: 20, unit_price: 100, discount_pct: 150 }),
    ]);
    expect(t.sellSubtotal).toBe(100);
    expect(t.discountTotal).toBe(150);
    expect(t.sellAfterDiscount).toBe(-50);
    expect(t.marginPct).toBeNull();
    expect(Number.isFinite(t.profit)).toBe(true);
  });
});
