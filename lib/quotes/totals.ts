// BUGFIX (quotes) — the single source of truth for quote money math. Gross
// margin is SP-based on the POST-DISCOUNT, PRE-TAX figure:
//
//   marginPct = (sellingPriceAfterDiscount - costTotal) / sellingPriceAfterDiscount × 100
//   profit    =  sellingPriceAfterDiscount - costTotal
//
// Tax is a pass-through — it never enters cost OR the margin base. Discount
// reduces selling price only; cost is unaffected. `costTotal` = Σ (unitCost × qty)
// across every line (parts AND labour).
//
// This consolidates the prior inline margin math (lib/quote-helpers.quoteTotals,
// which used the same formula but exposed margin as a 0–1 ratio and no
// cost/profit). Callers should prefer this function.

import type { QuoteSection } from "@/lib/types";
import { lineItemTotal, lineItemCost, round2 } from "@/lib/quote-helpers";

export interface QuoteTotals {
  costTotal: number;
  sellingPriceSubtotal: number; // pre-discount SP
  discountAmount: number;
  sellingPriceAfterDiscount: number; // post-discount, pre-tax
  taxAmount: number;
  sellingPriceTotal: number; // post-discount + tax
  profit: number; // SP-after-discount − cost
  marginPct: number | null; // null when SP-after-discount is 0
}

export function computeQuoteTotals(
  sections: QuoteSection[],
  taxRate: number, // fraction, e.g. 0.13
  discount = 0,
  discountType: "pct" | "amount" = "pct"
): QuoteTotals {
  const sellingPriceSubtotal = round2(
    sections.reduce(
      (s, sec) => s + sec.items.reduce((t, li) => t + lineItemTotal(li), 0),
      0
    )
  );
  const costTotal = round2(
    sections.reduce(
      (s, sec) => s + sec.items.reduce((c, li) => c + lineItemCost(li), 0),
      0
    )
  );

  const discountAmount =
    discountType === "pct"
      ? round2(sellingPriceSubtotal * (discount / 100))
      : round2(discount);
  const sellingPriceAfterDiscount = Math.max(
    0,
    round2(sellingPriceSubtotal - discountAmount)
  );

  const taxAmount = roundCRA(sellingPriceAfterDiscount * taxRate);
  const sellingPriceTotal = round2(sellingPriceAfterDiscount + taxAmount);

  const profit = round2(sellingPriceAfterDiscount - costTotal);
  const marginPct =
    sellingPriceAfterDiscount > 0
      ? round2((profit / sellingPriceAfterDiscount) * 100)
      : null;

  return {
    costTotal,
    sellingPriceSubtotal,
    discountAmount,
    sellingPriceAfterDiscount,
    taxAmount,
    sellingPriceTotal,
    profit,
    marginPct,
  };
}

// CRA-compliant rounding: inspect the 3rd decimal only (kept identical to
// lib/quote-helpers so tax matches the existing totals bar/PDF to the cent).
function roundCRA(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const cents = Math.floor(abs * 100);
  const thirdDecimal = Math.floor(abs * 1000) % 10;
  const result = thirdDecimal >= 5 ? cents + 1 : cents;
  return (sign * result) / 100;
}
