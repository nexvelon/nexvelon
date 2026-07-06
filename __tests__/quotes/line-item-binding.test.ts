// BUGFIX (quotes) Cluster C — two-way line-item binding between cost, margin,
// and selling price. Before this fix only cost/margin → SP existed (one-way);
// editing SP left margin stale. recalcMarginFromPrice adds the reverse leg.
//
//   cost or margin changes → recalcLineItem     → SP  = cost / (1 − margin/100)
//   SP changes             → recalcMarginFromPrice → margin = (1 − cost/SP) × 100
//
// The rule "don't recompute the field the user is actively editing" is enforced
// at the callsite by choosing WHICH recalc to run — recalcLineItem never rewrites
// margin, recalcMarginFromPrice never rewrites cost.

import { describe, it, expect } from "vitest";
import {
  recalcLineItem,
  recalcMarginFromPrice,
} from "@/lib/quote-helpers";
import type { BuilderLineItem } from "@/lib/types";

function line(partial: Partial<BuilderLineItem>): BuilderLineItem {
  return {
    id: "li-1",
    type: "product",
    name: "Test",
    description: "",
    classification: "Materials",
    qty: 1,
    unitCost: 0,
    margin: 0,
    unitPrice: 0,
    ...partial,
  };
}

describe("line-item binding", () => {
  it("cost change → SP recalculates, holding margin", () => {
    const before = line({ unitCost: 60, margin: 40, unitPrice: 100 });
    const after = recalcLineItem({ ...before, unitCost: 120 });
    // SP = 120 / (1 − 0.40) = 200; margin (the actively-held field) unchanged.
    expect(after.unitPrice).toBe(200);
    expect(after.margin).toBe(40);
  });

  it("margin change → SP recalculates, holding cost", () => {
    const before = line({ unitCost: 60, margin: 40, unitPrice: 100 });
    const after = recalcLineItem({ ...before, margin: 25 });
    // SP = 60 / (1 − 0.25) = 80; cost (actively unrelated) unchanged.
    expect(after.unitPrice).toBe(80);
    expect(after.unitCost).toBe(60);
  });

  it("SP change → margin recalculates from (1 − cost/SP), holding cost", () => {
    const before = line({ unitCost: 60, margin: 40, unitPrice: 100 });
    const after = recalcMarginFromPrice(before, 240);
    // margin = (1 − 60/240) × 100 = 75; SP is the edited field; cost unchanged.
    expect(after.unitPrice).toBe(240);
    expect(after.margin).toBe(75);
    expect(after.unitCost).toBe(60);
  });

  it("recalcMarginFromPrice does NOT overwrite the SP the user just typed", () => {
    const before = line({ unitCost: 50, margin: 40, unitPrice: 83.33 });
    const after = recalcMarginFromPrice(before, 125.5);
    expect(after.unitPrice).toBe(125.5); // exactly what was typed (round2)
  });

  it("recalcLineItem does NOT overwrite the margin the user just typed", () => {
    const before = line({ unitCost: 50, margin: 40, unitPrice: 83.33 });
    const after = recalcLineItem({ ...before, margin: 55 });
    expect(after.margin).toBe(55); // untouched; only SP is derived
  });

  it("guards div-by-zero: SP of 0 yields margin 0, not NaN/Infinity", () => {
    const after = recalcMarginFromPrice(line({ unitCost: 50 }), 0);
    expect(after.margin).toBe(0);
    expect(Number.isFinite(after.margin)).toBe(true);
  });

  it("guards div-by-zero: margin ≥ 100 keeps SP at cost, not Infinity", () => {
    const after = recalcLineItem(line({ unitCost: 80, margin: 100 }));
    expect(after.unitPrice).toBe(80);
    expect(Number.isFinite(after.unitPrice)).toBe(true);
  });

  it("preserves decimal cents through both directions", () => {
    // cost 10.55 @ 30% margin → SP 15.07 (10.55 / 0.70 = 15.071… → 15.07)
    const fwd = recalcLineItem(line({ unitCost: 10.55, margin: 30 }));
    expect(fwd.unitPrice).toBe(15.07);
    // reverse: SP 15.07, cost 10.55 → margin ≈ 30.0%
    const rev = recalcMarginFromPrice(line({ unitCost: 10.55 }), 15.07);
    expect(rev.margin).toBeCloseTo(30.0, 1);
  });
});
