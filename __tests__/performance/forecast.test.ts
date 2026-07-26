// PERF-1 — the honest forecast-at-completion math. projected_cost = actual +
// max(0, estimated − actual) = max(actual, estimated): you can't un-spend.

import { describe, it, expect } from "vitest";
import { projectedCost, projectedProfit, projectedMarginPct } from "@/lib/performance/forecast";

describe("projectedCost", () => {
  it("under budget (actual < estimated) → the estimate (remaining still to spend)", () => {
    expect(projectedCost(500, 800)).toBe(800);
  });
  it("overrun (actual > estimated) → the actual, never un-spends below it", () => {
    expect(projectedCost(800, 600)).toBe(800);
  });
  it("exactly on estimate → the estimate", () => {
    expect(projectedCost(600, 600)).toBe(600);
  });
});

describe("projectedProfit + margin", () => {
  it("profit = contract − projected cost", () => {
    expect(projectedProfit(1000, 800)).toBe(200);
    expect(projectedProfit(1000, 1200)).toBe(-200); // forecast loss
  });
  it("margin % = profit ÷ contract", () => {
    expect(projectedMarginPct(1000, 200)).toBe(20);
  });
  it("zero/negative contract → null margin (no divide-by-zero)", () => {
    expect(projectedMarginPct(0, 200)).toBeNull();
    expect(projectedMarginPct(-5, 200)).toBeNull();
  });
});
