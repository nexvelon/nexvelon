// PROJ2-6a — pure totals for a Job's line items. Mirrors lib/quotes/totals.ts's
// contract, adapted to the DbJobLineItem shape. The key difference from a quote:
// discount is PER LINE (discount_pct on each row), not a single quote-level
// figure. Tax is intentionally excluded here (the footer shows sell/cost/profit/
// margin only; tax lands with invoicing). Margin is SP-based on the
// post-discount, pre-tax figure — same definition as the quote builder.

import { round2 } from "@/lib/quote-helpers";

export interface JobLineItemTotalsInput {
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount_pct: number;
}

export interface JobLineItemTotals {
  sellSubtotal: number; // Σ qty × unit_price (pre-discount)
  discountTotal: number; // Σ per-line discount
  sellAfterDiscount: number; // sellSubtotal − discountTotal
  costTotal: number; // Σ qty × unit_cost
  profit: number; // sellAfterDiscount − costTotal
  marginPct: number | null; // null when sellAfterDiscount ≤ 0
}

export function computeJobLineItemTotals(
  items: JobLineItemTotalsInput[]
): JobLineItemTotals {
  let sell = 0;
  let discount = 0;
  let cost = 0;
  for (const li of items) {
    const qty = Number(li.quantity) || 0;
    const lineSell = qty * (Number(li.unit_price) || 0);
    const lineDiscount = lineSell * ((Number(li.discount_pct) || 0) / 100);
    sell += lineSell;
    discount += lineDiscount;
    cost += qty * (Number(li.unit_cost) || 0);
  }

  const sellSubtotal = round2(sell);
  const discountTotal = round2(discount);
  const sellAfterDiscount = round2(sellSubtotal - discountTotal);
  const costTotal = round2(cost);
  const profit = round2(sellAfterDiscount - costTotal);
  const marginPct =
    sellAfterDiscount > 0
      ? round2((profit / sellAfterDiscount) * 100)
      : null;

  return {
    sellSubtotal,
    discountTotal,
    sellAfterDiscount,
    costTotal,
    profit,
    marginPct,
  };
}
