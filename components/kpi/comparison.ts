// UIDG-6B — the period-over-period delta, with the edge cases a young dataset WILL
// hit (§2.8 — never a fabricated percentage):
//
//   • prior > 0                → a real percentage change.
//   • prior == 0, current != 0 → the % change is UNDEFINED (not +∞, not +100%);
//                                render a directional "up/down from 0" instead.
//   • prior == 0, current == 0 → nothing changed; no delta at all.
//   • prior absent (null)      → there is no comparison to make; no delta.
//
// Pure, so every case is unit-tested without a DOM.

export type DeltaResult =
  | { kind: "pct"; value: number } // value is a fraction, e.g. 0.12 = +12%
  | { kind: "fromZero"; direction: 1 | -1 }
  | { kind: "none" };

export function computeDelta(
  current: number,
  prior: number | null | undefined
): DeltaResult {
  if (prior === null || prior === undefined) return { kind: "none" };
  if (prior === 0) {
    if (current === 0) return { kind: "none" };
    return { kind: "fromZero", direction: current > 0 ? 1 : -1 };
  }
  return { kind: "pct", value: (current - prior) / prior };
}
