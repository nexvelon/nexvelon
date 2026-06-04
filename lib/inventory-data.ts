import { addDays, parseISO } from "date-fns";
import { products } from "./mock-data/products";
import { projects } from "./mock-data/projects";
import { users } from "./mock-data/users";
import { TODAY } from "./dashboard-data";
import type { Product, Vendor, WarehouseLocation } from "./types";

export const WAREHOUSE_LOCATIONS: WarehouseLocation[] = [
  "Main Warehouse",
  "Truck 1",
  "Truck 2",
  "Truck 3",
  "Branch — Mississauga",
];

// Deterministic split of total stock across locations.
function seed(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) % 100000;
  return h;
}

/**
 * B-3: real per-location stock counts from the product's actual byLocation map.
 * The synthetic seed-distribution fallback was removed — a product with no
 * in-stock units returns a real empty/zero breakdown, never fabricated numbers.
 *
 * @param locations  optional location set to project onto (each absent location
 *   reads 0, order preserved). When omitted, returns the raw byLocation counts.
 */
export function locationBreakdown(
  p: Product,
  locations?: string[]
): Record<string, number> {
  const counts = p.byLocation ?? {};
  if (!locations) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) {
      if (v != null) out[k] = v;
    }
    return out;
  }
  return locations.reduce(
    (acc, l) => {
      acc[l] = counts[l] ?? 0;
      return acc;
    },
    {} as Record<string, number>
  );
}

export function totalAllocated(productId: string): number {
  // Sum allocations across all projects for this product.
  let total = 0;
  for (const p of projects) {
    const projectAllocations = (() => {
      // Use the same logic as project-data.buildMaterials but inline-light
      // to avoid circular imports.
      const picks = products.filter((prod) => {
        if (prod.id !== productId) return false;
        return p.systemTypes.some((st) =>
          st === "Access Control"
            ? prod.category === "Access Control"
            : st === "CCTV"
              ? prod.category === "CCTV" || prod.category === "Video Surveillance"
              : st === "Intrusion"
                ? prod.category === "Intrusion"
                : st === "Intercom"
                  ? prod.category === "Intercom"
                  : false
        );
      });
      if (picks.length === 0) return 0;
      return Math.max(2, 3 + (seed(p.id + productId) % 18)) * 0.6;
    })();
    total += projectAllocations;
  }
  return Math.round(total);
}

export interface MovementRow {
  id: string;
  date: string;
  kind: "Receipt" | "Pick" | "Transfer" | "Return" | "Adjustment";
  qty: number;
  reference: string;
  user: string;
}

export function movementHistory(p: Product, limit = 10): MovementRow[] {
  // Pre-Quotes cleanup (2026-05-11): without source users + projects we
  // can't derive a synthetic movement history. Without this guard, the
  // loop hits `users[NaN]` / `projects[NaN]` and crashes via
  // `tech.name.split(...)` or `proj.code`. Once the inventory module
  // wires to Supabase, movement rows come from a real ledger table and
  // this synthetic generator is retired.
  if (users.length === 0 || projects.length === 0) return [];

  const start = TODAY;
  const out: MovementRow[] = [];
  const kinds: MovementRow["kind"][] = ["Receipt", "Pick", "Transfer", "Pick", "Return", "Adjustment"];
  for (let i = 0; i < limit; i++) {
    const offset = -((seed(p.id + i) % 60) + 1);
    const date = addDays(start, offset);
    const kind = kinds[seed(p.id + i + "k") % kinds.length];
    const qty =
      kind === "Receipt"
        ? 3 + (seed(p.id + i + "q") % (p.reorderQty ?? 12))
        : -(1 + (seed(p.id + i + "q") % 6));
    const tech = users[seed(p.id + i + "u") % users.length];
    const proj = projects[seed(p.id + i + "p") % projects.length];
    const ref =
      kind === "Receipt"
        ? `PO-${proj.code}-${(seed(p.id + i + "r") % 99).toString().padStart(2, "0")}`
        : kind === "Transfer"
          ? `TR-${(seed(p.id + i + "tr") % 999).toString().padStart(4, "0")}`
          : `${proj.code} · ${proj.name.slice(0, 28)}`;
    out.push({
      id: `mv-${p.id}-${i}`,
      date: date.toISOString().slice(0, 10),
      kind,
      qty,
      reference: ref,
      user: tech.name.split(" ")[0],
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ────────────────────────────────────────────────────────────────────────────
// Transfers
// ────────────────────────────────────────────────────────────────────────────

export type TransferStatus = "Draft" | "In Transit" | "Received";

export interface StockTransfer {
  id: string;
  number: string;
  from: WarehouseLocation;
  to: WarehouseLocation;
  itemCount: number;
  status: TransferStatus;
  date: string;
  initiatedById: string;
  notes?: string;
}

// Pre-Quotes cleanup (2026-05-11): hardcoded transfers removed —
// referenced user IDs (u-004, u-005, u-018) that no longer exist after
// the mock-data wipe. Once inventory wires to Supabase the
// stock_transfers table feeds this.
export const transfers: StockTransfer[] = [];

// ────────────────────────────────────────────────────────────────────────────
// Vendor info
// ────────────────────────────────────────────────────────────────────────────

export interface VendorInfo {
  name: Vendor;
  accountNumber: string;
  rep: { name: string; email: string; phone: string };
  paymentTerms: "Net 15" | "Net 30" | "Net 45" | "Net 60";
  ytdSpend: number;
  poCount: number;
  avgLeadTimeDays: number;
}

// Pre-Quotes cleanup (2026-05-11): 5-entry hardcoded vendor
// directory removed. Each row had fictitious rep names + emails +
// phone numbers + YTD spend + PO counts that were rendering on
// Settings → Vendors. Real vendor records will live in a Supabase
// `vendors` table once the Vendors module ships (NEXVELON_ROADMAP
// .md item 7). The `Vendor` union type in lib/types.ts is kept
// because it still drives the supported-vendor dropdown in
// QuoteBuilder + StockTab filter — it'll lift to a lookup table
// per NEXVELON_PRINCIPLES.md §6 when Vendors is wired.
export const VENDOR_DIRECTORY: VendorInfo[] = [];

// ────────────────────────────────────────────────────────────────────────────
// Aggregated helpers
// ────────────────────────────────────────────────────────────────────────────

// INV-2a: these aggregate helpers now take the product list explicitly so the
// inventory page can feed them RSC-fetched real products (lib/api/products.ts)
// instead of the emptied mock array. Pure functions over the passed-in list.
export function totalStockValue(items: Product[]): number {
  return items.reduce((s, p) => s + p.stock * p.cost, 0);
}

export function lowStockCount(items: Product[]): number {
  return items.filter((p) => p.stock <= p.reorderPoint).length;
}

export interface InventoryStats {
  stockValue: number;
  skusTracked: number;
  lowStock: number;
  itemsAllocated: number;
  openPOs: number;
}

export function computeInventoryStats(
  items: Product[],
  openPOCount: number
): InventoryStats {
  const itemsAllocated = items.reduce((s, p) => s + totalAllocated(p.id), 0);
  return {
    stockValue: totalStockValue(items),
    skusTracked: items.length,
    lowStock: lowStockCount(items),
    itemsAllocated,
    openPOs: openPOCount,
  };
}

export function stockStatus(p: Product): "Out" | "Low" | "In Stock" | "Overstock" {
  if (p.stock === 0) return "Out";
  if (p.stock <= p.reorderPoint) return "Low";
  if (p.reorderQty && p.stock > (p.reorderQty + p.reorderPoint) * 1.5) return "Overstock";
  return "In Stock";
}

// Stand-alone (not project-linked) replenishment POs to round out the list.
export interface StandalonePO {
  id: string;
  number: string;
  vendor: Vendor;
  date: string;
  expected: string;
  status: "Draft" | "Sent" | "Confirmed" | "Partially Received" | "Received" | "Closed";
  items: { productId: string; qty: number; cost: number }[];
}

// Pre-Quotes cleanup (2026-05-11): hardcoded standalone POs removed —
// referenced product IDs (p-053, p-014, etc.) that no longer exist
// after the mock-data wipe. Once inventory wires to Supabase the
// purchase_orders table feeds this.
export const standalonePOs: StandalonePO[] = [];

export function isOpenPO(status: string): boolean {
  return status !== "Received" && status !== "Closed";
}

// Note: 'addDays' and 'parseISO' are imported for downstream consumers (StockTab
// and the row drawer) — keep them re-exported via barrel-style usage.
export { addDays, parseISO };
