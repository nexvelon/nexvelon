// INV-FIX-1 — the lot-selection rule (Gap 1) and unpinned-line labelling (Gap 2),
// with worked numbers. Specific identification: every draw keeps its own lot cost.

import { describe, it, expect } from "vitest";
import {
  planOldestFirst,
  costFromDraws,
  drawsCost,
  remainingDraws,
  lineCostSource,
  describeDraws,
  type LotForPlanning,
} from "@/lib/inventory/stock-draws";
import { applyDrawsToLine, markManualCost } from "@/lib/inventory/line-cost";
import type { BuilderLineItem } from "@/lib/types";

// The FIFO-1 example: 10 readers @ $80 received 1 Oct, 10 more @ $95 on 15 Oct.
const A: LotForPlanning = { id: "lot-a", quantity: 10, unit_cost: 80, status: "in_stock", acquired_at: "2026-10-01", po_number: "1042" };
const B: LotForPlanning = { id: "lot-b", quantity: 10, unit_cost: 95, status: "in_stock", acquired_at: "2026-10-15", po_number: "1077" };

function line(over: Partial<BuilderLineItem> = {}): BuilderLineItem {
  return {
    id: "li-1",
    type: "product",
    productId: "reader",
    name: "Reader",
    description: "",
    qty: 15,
    unitCost: 90,
    margin: 40,
    unitPrice: 150,
    ...over,
  } as BuilderLineItem;
}

describe("Gap 1 — oldest first, across lots", () => {
  it("issuing 15 draws 10 @ $80 then 5 @ $95 = $1,275 (unit $85), whatever order the lots are listed in", () => {
    const plan = planOldestFirst([B, A], 15);
    expect(plan.draws.map((d) => [d.stockId, d.qty, d.unitCost])).toEqual([
      ["lot-a", 10, 80],
      ["lot-b", 5, 95],
    ]);
    expect(plan.shortfall).toBe(0);
    expect(drawsCost(plan.draws)).toBe(1275);
    const c = costFromDraws({ qty: 15, draws: plan.draws, catalogCost: 90 });
    expect(c).toEqual({ unitCost: 85, costSource: "stock" });
    // The 5 left are the $95 lot: worth $475.
    expect(B.quantity - 5).toBe(5);
  });

  it("is not cheapest-first: a dearer OLDER lot is drawn before a cheaper newer one", () => {
    const old = { ...A, unit_cost: 99 };
    const cheapNew = { ...B, unit_cost: 70 };
    expect(planOldestFirst([cheapNew, old], 3).draws[0].stockId).toBe("lot-a");
  });

  it("partial consumption leaves the rest of a lot available to the next line", () => {
    const reserved = new Map([["lot-a", 6]]); // another line of this quote plans 6 from lot A
    const plan = planOldestFirst([A, B], 8, reserved);
    expect(plan.draws.map((d) => [d.stockId, d.qty])).toEqual([
      ["lot-a", 4],
      ["lot-b", 4],
    ]);
    expect(drawsCost(plan.draws)).toBe(4 * 80 + 4 * 95); // 700
  });

  it("never auto-draws stock already on a job, on an RMA, not in stock, or empty", () => {
    const onJob = { ...A, id: "j", current_cost_center_id: "cc-9", acquired_at: "2026-01-01" };
    const onRma = { ...A, id: "r", rma_status: "rma_pending", acquired_at: "2026-01-02" };
    const used = { ...A, id: "u", status: "consumed", acquired_at: "2026-01-03" };
    const plan = planOldestFirst([onJob, onRma, used, B], 2);
    expect(plan.draws.map((d) => d.stockId)).toEqual(["lot-b"]);
  });

  it("undated lots come after dated ones (they can't be proven oldest)", () => {
    const undated = { ...A, id: "x", acquired_at: null };
    expect(planOldestFirst([undated, B], 1).draws[0].stockId).toBe("lot-b");
  });

  it("serialized units are lots of 1: a line of 3 draws three units, oldest first", () => {
    const cams = [3, 1, 2].map((n) => ({ id: `cam-${n}`, quantity: 1, unit_cost: 400 + n, status: "in_stock", acquired_at: `2026-09-0${n}`, serial_number: `SN${n}` }));
    const plan = planOldestFirst(cams, 3);
    expect(plan.draws.map((d) => d.serialNumber)).toEqual(["SN1", "SN2", "SN3"]);
    expect(drawsCost(plan.draws)).toBe(401 + 402 + 403);
  });
});

describe("Gap 1 — manual override still works (specific identification)", () => {
  it("a person can choose the newer lot deliberately; it's recorded as manual", () => {
    const chosen = [{ stockId: "lot-b", qty: 10, unitCost: 95 }, { stockId: "lot-a", qty: 5, unitCost: 80 }];
    const next = applyDrawsToLine(line(), { draws: chosen, source: "manual", catalogCost: 90, pricing: "hold" });
    expect(next.stockSource).toBe("manual");
    expect(next.costSource).toBe("stock");
    expect(next.qty * next.unitCost!).toBe(1350); // 10×95 + 5×80
    expect(next.unitPrice).toBe(150); // price held
  });
});

describe("Gap 2 — a cost that isn't real stock says so", () => {
  it("no free stock → catalog estimate, labelled", () => {
    const plan = planOldestFirst([], 4);
    expect(plan.shortfall).toBe(4);
    expect(costFromDraws({ qty: 4, draws: plan.draws, catalogCost: 90 })).toEqual({ unitCost: 90, costSource: "catalog_estimate" });
  });

  it("not enough stock → the covered part is real, the rest an estimate, labelled 'partly'", () => {
    const plan = planOldestFirst([A], 12); // only 10 in stock
    expect(plan.shortfall).toBe(2);
    const c = costFromDraws({ qty: 12, draws: plan.draws, catalogCost: 90 });
    expect(c.costSource).toBe("partial_estimate");
    expect(c.unitCost * 12).toBe(10 * 80 + 2 * 90); // 980
  });

  it("typing a cost by hand is labelled manual", () => {
    expect(markManualCost(line({ costSource: "stock" })).costSource).toBe("manual");
  });

  it("removing stock drops the plan and labels the estimate", () => {
    const next = applyDrawsToLine(line({ stockDraws: [{ stockId: "lot-a", qty: 15, unitCost: 80 }], stockSource: "auto" }), {
      draws: [],
      source: null,
      catalogCost: 90,
      pricing: "hold",
    });
    expect(next.stockDraws).toBeUndefined();
    expect(next.costSource).toBe("catalog_estimate");
    expect(next.unitCost).toBe(90);
  });
});

describe("price rule — a cost plan never silently re-prices a priced line", () => {
  it("'hold' keeps the sell price and moves the margin", () => {
    const next = applyDrawsToLine(line(), { draws: planOldestFirst([A, B], 15).draws, source: "auto", catalogCost: 90, pricing: "hold" });
    expect(next.unitPrice).toBe(150);
    expect(next.margin).toBe(43.33); // (150 − 85) / 150
  });

  it("'add_tier' prices a brand-new margin-tier line from the planned cost", () => {
    const next = applyDrawsToLine(line({ margin: 40 }), { draws: planOldestFirst([A, B], 15).draws, source: "auto", catalogCost: 90, pricing: "add_tier" });
    expect(next.unitPrice).toBe(141.67); // 85 / (1 − 0.40)
  });
});

describe("history — existing lines are never recomputed", () => {
  it("a legacy line is LABELLED from what it already has; its figures are untouched", () => {
    const legacyPinned = line({ stockUnitId: "lot-a", unitCost: 80, unitPrice: 133.33, margin: 40 });
    const legacyEstimate = line({ unitCost: 90 });
    expect(lineCostSource(legacyPinned)).toBe("stock");
    expect(lineCostSource(legacyEstimate)).toBe("catalog_estimate");
    // lineCostSource is a pure read — nothing on the line changed.
    expect(legacyPinned.unitCost).toBe(80);
    expect(legacyPinned.unitPrice).toBe(133.33);
  });
});

describe("commit bookkeeping", () => {
  it("a partially committed line only retries what's left", () => {
    const draws = [{ stockId: "lot-a", qty: 10, unitCost: 80 }, { stockId: "lot-b", qty: 5, unitCost: 95 }];
    const committed = [{ sourceStockId: "lot-a", consumedRowId: "c1", qty: 10, unitCost: 80 }];
    expect(remainingDraws(draws, committed)).toEqual([{ stockId: "lot-b", qty: 5, unitCost: 95 }]);
    expect(remainingDraws(draws, [...committed, { sourceStockId: "lot-b", consumedRowId: "c2", qty: 5, unitCost: 95 }])).toEqual([]);
  });

  it("describes the draw for the commit dialog", () => {
    const d = describeDraws(planOldestFirst([A, B], 15).draws, (n) => `$${n.toFixed(2)}`);
    expect(d).toBe("10 × $80.00 (PO 1042, 2026-10-01) + 5 × $95.00 (PO 1077, 2026-10-15)");
  });
});
