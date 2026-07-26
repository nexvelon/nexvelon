// PERF-1 — the ONE new calculation for the performance board: an honest
// forecast-at-completion. Pure + client-safe (no server import), so the board
// assembler and any UI can share the same math.
//
// The model is deliberately simple and defensible: you cannot un-spend, so the
// projected cost is what you've ALREADY spent plus whatever estimate remains —
//   projected_cost = actual + max(0, estimated − actual)   (= max(actual, estimated))
// This just adds the existing `remaining_cost` (estimated − actual, floored at 0)
// back onto actual. It is a pure derivation over figures the rollup/WIP already
// compute — no new stored input, no migration.
//
// DEFERRED (not built here): a PM-driven re-forecast, where an operator enters
// an estimate-to-complete that overrides "remaining = estimated − actual". That
// needs a new stored input and is the sophisticated version of this.

import { round2 } from "@/lib/quote-helpers";

/** Projected total cost at completion = actual + remaining-to-spend (never < actual). */
export function projectedCost(actual: number, estimated: number): number {
  return round2(actual + Math.max(0, round2(estimated - actual)));
}

/** Projected profit = contract − projected cost. */
export function projectedProfit(contract: number, projCost: number): number {
  return round2(contract - projCost);
}

/** Projected margin % = projected profit ÷ contract. Null at zero/negative contract. */
export function projectedMarginPct(contract: number, projProfit: number): number | null {
  if (contract <= 0) return null;
  return round2((projProfit / contract) * 100);
}
