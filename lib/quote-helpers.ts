import type {
  BuilderLineItem,
  Quote,
  QuoteSection,
  QuoteStatus,
} from "./types";
import { products } from "./mock-data/products";

export const DEFAULT_TAX_RATE = 0.13; // ON HST
export const DEFAULT_LABOR_RATE = 145;

export const DEFAULT_TERMS = `Quote valid for 30 days from the date issued. Pricing is subject to change based on vendor availability, currency fluctuation, and lead times beyond 4 weeks.

Installation is performed during standard business hours unless otherwise noted. After-hours work is billed at 1.5× the standard rate. A 50% deposit is due on acceptance; balance is due Net 30 from substantial completion. Travel beyond 75 km is billed at $0.65/km.

Site readiness, conduit, and 120V power are by others unless explicitly listed. Nexvelon Inc. is not responsible for delays caused by site access, building permits, or third-party trades.`;

export const SECTION_PRESETS = [
  "Access Control Hardware",
  "CCTV / Video Surveillance",
  "Intrusion Detection",
  "Intercom & Audio",
  "Networking & Power",
  "Cabling & Accessories",
  "Programming & Commissioning",
  "Labor",
];

export function newId(prefix: string = "li"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "product",
    description: "",
    qty: 1,
    unitCost: 0,
    markup: 30,
    unitPrice: 0,
  };
}

export function laborLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "labor",
    description: "On-site installation labor",
    qty: 1,
    unitCost: 0,
    markup: 0,
    unitPrice: 0,
    hours: 8,
    rate: DEFAULT_LABOR_RATE,
  };
}

export function lineItemTotal(li: BuilderLineItem): number {
  if (li.type === "labor") {
    return (li.hours ?? 0) * (li.rate ?? 0);
  }
  return li.qty * li.unitPrice;
}

export function lineItemCost(li: BuilderLineItem): number {
  if (li.type === "labor") {
    // Labor is mostly margin in this model (~ 35% notional cost).
    return lineItemTotal(li) * 0.35;
  }
  return li.qty * li.unitCost;
}

export function recalcLineItem(li: BuilderLineItem): BuilderLineItem {
  if (li.type === "labor") {
    return { ...li };
  }
  const unitPrice = round2(li.unitCost * (1 + li.markup / 100));
  return { ...li, unitPrice };
}

export function sectionSubtotal(s: QuoteSection): number {
  return s.items.reduce((sum, li) => sum + lineItemTotal(li), 0);
}

export function quoteTotals(
  sections: QuoteSection[],
  taxRate: number,
  discount = 0,
  discountType: "pct" | "amount" = "pct"
): {
  subtotal: number;
  cost: number;
  discountAmount: number;
  postDiscount: number;
  tax: number;
  total: number;
  margin: number;
} {
  const subtotal = sections.reduce((s, sec) => s + sectionSubtotal(sec), 0);
  const cost = sections.reduce(
    (s, sec) => s + sec.items.reduce((c, li) => c + lineItemCost(li), 0),
    0
  );
  const discountAmount =
    discountType === "pct" ? round2(subtotal * (discount / 100)) : round2(discount);
  const postDiscount = Math.max(0, subtotal - discountAmount);
  const tax = round2(postDiscount * taxRate);
  const total = round2(postDiscount + tax);
  const margin = subtotal === 0 ? 0 : (subtotal - cost) / subtotal;
  return { subtotal: round2(subtotal), cost, discountAmount, postDiscount, tax, total, margin };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nextQuoteNumber(existing: Quote[]): string {
  const year = new Date().getFullYear();
  const yearPrefix = `Q-${year}-`;
  let max = 0;
  for (const q of existing) {
    if (q.number.startsWith(yearPrefix)) {
      const n = parseInt(q.number.split("-")[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${yearPrefix}${(max + 1).toString().padStart(4, "0")}`;
}

// Convert a flat seed quote (without sections) into a single-section
// builder shape on demand.
export function ensureSections(q: Quote): QuoteSection[] {
  if (q.sections && q.sections.length > 0) return q.sections;
  const items: BuilderLineItem[] = (q.items ?? []).map((it) => {
    const product = products.find((p) => p.id === it.productId);
    return {
      id: newId("li"),
      type: "product",
      vendor: product?.vendor,
      productId: it.productId,
      sku: product?.sku ?? "",
      description: product?.name ?? "Item",
      qty: it.qty,
      unitCost: product?.cost ?? 0,
      markup: product
        ? round2(((it.unitPrice - product.cost) / Math.max(1, product.cost)) * 100)
        : 0,
      unitPrice: it.unitPrice,
    };
  });
  return [{ id: newId("sec"), name: "Equipment & Installation", items }];
}

export const QUOTE_STATUS_ORDER: QuoteStatus[] = [
  "Draft",
  "Sent",
  "Approved",
  "Rejected",
  "Expired",
  "Converted",
];

export const STATUS_PROBABILITY: Record<QuoteStatus, number> = {
  Draft: 0.25,
  Sent: 0.6,
  Approved: 1,
  Rejected: 0,
  Expired: 0,
  Converted: 1,
};

export function weightedPipelineValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total * STATUS_PROBABILITY[q.status], 0);
}

export function totalValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total, 0);
}
