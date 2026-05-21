import type {
  BuilderLineItem,
  Quote,
  QuoteSection,
  QuoteStatus,
} from "./types";
import { products } from "./mock-data/products";
import { defaultClassificationFor } from "./classifications";
import { isValidQuoteThemeSlug, type QuoteThemeSlug } from "@/lib/quote-themes";

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
