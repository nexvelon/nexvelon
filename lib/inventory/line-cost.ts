// INV-FIX-1 — apply a stock-draw plan to a quote line: the line's cost becomes
// the exact cost of the lots it draws (specific identification), any units no
// stock covers are the catalog estimate, and the line says which it is (§2.8).
//
// PRICE RULE. A cost plan never silently changes what the CLIENT is charged:
//   • "add"  — a brand-new line whose price was derived from cost moments ago:
//              a margin-tier product re-prices from the planned cost (same rule
//              as adding it); a fixed-price product keeps its price.
//   • "hold" — any later change (a quantity re-plan, choosing lots by hand,
//              removing stock): the sell price is HELD and the margin moves,
//              because the margin is what actually changed.

import { recalcLineItem, recalcMarginFromPrice } from "@/lib/quote-helpers";
import { costFromDraws, type StockDraw, type StockSource } from "@/lib/inventory/stock-draws";
import type { BuilderLineItem } from "@/lib/types";

export function applyDrawsToLine(
  item: BuilderLineItem,
  input: {
    draws: StockDraw[];
    source: StockSource | null; // null = no stock (pure catalog estimate)
    catalogCost: number | null;
    pricing: "add_tier" | "add_fixed" | "hold";
  }
): BuilderLineItem {
  const { unitCost, costSource } = costFromDraws({
    qty: item.qty,
    draws: input.draws,
    catalogCost: input.catalogCost,
  });
  const next: BuilderLineItem = {
    ...item,
    unitCost,
    costSource,
    stockDraws: input.draws.length > 0 ? input.draws : undefined,
    stockSource: input.draws.length > 0 ? input.source ?? "auto" : undefined,
    // A multi-lot plan supersedes a legacy single-lot pin.
    stockUnitId: undefined,
  };
  return input.pricing === "add_tier" ? recalcLineItem(next) : recalcMarginFromPrice(next, item.unitPrice);
}

/** Someone typed a cost by hand: keep their figure, say so, keep the stock plan
 *  (stock is still drawn on commit — only the COST shown is theirs). */
export function markManualCost(item: BuilderLineItem): BuilderLineItem {
  return { ...item, costSource: item.productId && item.type === "product" ? "manual" : item.costSource };
}
