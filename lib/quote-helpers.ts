import type {
  BuilderLineItem,
  Quote,
  QuoteSection,
  QuoteStatus,
} from "./types";
import { products } from "./mock-data/products";
import { defaultClassificationFor } from "./classifications";
import { businessQuoteNumber } from "./format";
import { isValidQuoteThemeSlug, type QuoteThemeSlug } from "@/lib/quote-themes";

export const DEFAULT_TAX_RATE = 0.13; // ON HST
export const DEFAULT_LABOR_RATE = 145;

export const DEFAULT_TERMS = `Parties
This Quote/Proposal and any resulting agreement are with Nexvelon Integrated Solutions Inc., which carries on business as "Nexvelon Global." All warranties, obligations, and liabilities are those of Nexvelon Integrated Solutions Inc.

Payment Terms
1. Any invoice not paid within the selected payment term accrues interest at 2.5% per month (30% per annum) from the due date until paid in full.
2. A surcharge of 2.4% plus applicable taxes applies to any payment made by credit card.
3. For all material orders, 70% of the total material cost is payable in advance; the remaining 30% is due immediately upon receipt of the material.
4. Once Nexvelon receives the ordered parts, the remaining 30% balance is due immediately. Nexvelon will send an email with photographs of the received items, which the Client accepts as proof of receipt for collecting the remaining balance.
5. If the Client elects to have parts delivered directly to site, the Client must pay 100% of those parts' cost in advance and is responsible for storing them securely and maintaining a sign-in/sign-out log of all parts removed by any person. This log is the reference for accountability if any items are missing or lost on site.

Site Attendance & Scheduling
6. If a deficiency has not been resolved, the site or work is not ready, or work cannot proceed for reasons outside Nexvelon's control, and a technician must return to site after a scheduled attendance, the Client will be billed for a full 8 hours per technician scheduled for that visit.
7. Nexvelon is not responsible for delays to its work caused by other trades or third parties. Where the work of others delays the project, the corresponding deadlines for Nexvelon's work are extended accordingly, and Nexvelon is not liable for any resulting delay. Where the project is compressed or rushed at the end as a result of such delays, Nexvelon cannot guarantee that the security system will be fully operational or complete by the original deadline.

Scope & Security Consulting
8. Nexvelon Integrated Solutions Inc. is not a security consultant and does not provide security consulting services. Nexvelon does not guarantee against, and assumes no liability for, cyber attacks or security breaches. A Client requiring security consulting must separately engage a qualified security consultant.

Design, Drawings & Device Placement
9. Shop drawings will be provided for all equipment and parts. Nexvelon is not a consultant; the rough-in, placement, and final locations of all security and intrusion devices are determined by and carried out per the consultant's instructions, whose decision is final. It is the consultant's responsibility to finalize device locations and placement. Nexvelon is not liable for any event or outcome arising from locations or placements made per the consultant's instructions.`;

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
    name: "",
    description: "",
    classification: "Materials",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
  };
}

export function miscLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "misc",
    name: "",
    description: "",
    classification: "Misc",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional, blank by default
  };
}

export function serviceLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "service",
    name: "",
    description: "",
    classification: "Warranty Cost",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional. Services
    // may have a 3rd-party provider; the user can fill vendor/SKU if so.
  };
}

export function laborLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "labor",
    name: "",
    description: "",
    classification: "Technician Labour",
    qty: 8, // hours
    unitCost: 87, // 145 × (1 − 0.40) cost rate per hour
    margin: 40,
    unitPrice: 145, // billing rate per hour
  };
}

// Parts and labour share one model now (QB-3): qty × unitPrice / unitCost.
export function lineItemTotal(li: BuilderLineItem): number {
  return li.qty * li.unitPrice;
}

export function lineItemCost(li: BuilderLineItem): number {
  return li.qty * li.unitCost;
}

export function recalcLineItem(li: BuilderLineItem): BuilderLineItem {
  const unitPrice =
    li.margin >= 100
      ? li.unitCost // guard against div-by-zero
      : round2(li.unitCost / (1 - li.margin / 100));
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
  const tax = roundCRA(postDiscount * taxRate);
  const total = round2(postDiscount + tax);
  // Margin reflects effective revenue after discount, not list subtotal
  const margin =
    postDiscount === 0 ? 0 : (postDiscount - cost) / postDiscount;
  return { subtotal: round2(subtotal), cost, discountAmount, postDiscount, tax, total, margin };
}

/**
 * CRA-compliant rounding: look at the 3rd decimal digit only.
 * ≥5 rounds up at the 2nd decimal; ≤4 rounds down.
 * Example: 12.345 → 12.35; 12.344 → 12.34
 */
function roundCRA(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const cents = Math.floor(abs * 100);
  const thirdDecimal = Math.floor(abs * 1000) % 10;
  const result = thirdDecimal >= 5 ? cents + 1 : cents;
  return (sign * result) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Quote number is now a Toronto-time timestamp YYMMDDHHMM (self-contained — no
// sequence lookup). The previous `existing: Quote[]` argument is no longer read,
// so the param is dropped; existing callers passing an arg (nextQuoteNumber(
// allQuotes)) still work — JS ignores the extra argument, so call sites + the
// useQuotesLoaded guard stay unchanged. The internal id (newId("q")) remains
// the unique key; minute-precision number collisions are tolerated.
export function nextQuoteNumber(): string {
  return businessQuoteNumber();
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
      name: "",
      description: product?.name ?? "Item",
      classification: defaultClassificationFor("product"),
      qty: it.qty,
      unitCost: product?.cost ?? 0,
      // Derive margin% = (price − cost) / price × 100 (QB-2 margin model)
      margin:
        product && it.unitPrice > 0
          ? round2(((it.unitPrice - product.cost) / it.unitPrice) * 100)
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

// ----------------------------------------------------------------------------
// Last-used theme persistence (Chunk F)
//
// Quotes carry their own themeSlug, but new quotes initialize from the last
// theme the operator picked across any quote. Stored under a single
// localStorage key; per-browser only (no DB persistence yet).
// ----------------------------------------------------------------------------

export const LAST_USED_THEME_KEY = "nexvelon:last-used-theme";

export function readLastUsedThemeSlug(): QuoteThemeSlug | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_USED_THEME_KEY);
    if (stored && isValidQuoteThemeSlug(stored)) return stored;
    return null;
  } catch {
    return null;
  }
}

export function writeLastUsedThemeSlug(slug: QuoteThemeSlug): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USED_THEME_KEY, slug);
  } catch {
    // swallow — localStorage may be unavailable in private mode
  }
}

// ----------------------------------------------------------------------------
// Take-off aggregation (QD-2 Phase 5a)
//
// The Drawings & Take-off schedule page renders a summary chip per line-item
// classification. takeoffGroups() flattens every section's items and groups
// them by classification, summing quantities. Pure / SSR-safe.
// ----------------------------------------------------------------------------

export interface TakeoffGroup {
  classification: string;
  totalQty: number;
  lineCount: number;
  items: BuilderLineItem[];
}

/**
 * Aggregate all line items across all sections, grouped by classification.
 * Used by the Drawings & Take-off page to render summary chips.
 * Pure / SSR-safe. Returns groups sorted by classification name (alphabetical).
 */
export function takeoffGroups(sections: QuoteSection[]): TakeoffGroup[] {
  const map = new Map<string, TakeoffGroup>();
  for (const section of sections) {
    for (const item of section.items) {
      const key = item.classification ?? "Unclassified";
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.qty;
        existing.lineCount += 1;
        existing.items.push(item);
      } else {
        map.set(key, {
          classification: key,
          totalQty: item.qty,
          lineCount: 1,
          items: [item],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.classification.localeCompare(b.classification)
  );
}
