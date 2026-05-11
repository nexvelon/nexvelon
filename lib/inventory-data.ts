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

export function locationBreakdown(p: Product): Record<WarehouseLocation, number> {
  if (p.byLocation) {
    return WAREHOUSE_LOCATIONS.reduce((acc, l) => {
      acc[l] = p.byLocation?.[l] ?? 0;
      return acc;
    }, {} as Record<WarehouseLocation, number>);
  }
  const out: Record<WarehouseLocation, number> = {
    "Main Warehouse": 0,
    "Truck 1": 0,
    "Truck 2": 0,
    "Truck 3": 0,
    "Branch — Mississauga": 0,
  };
  let remaining = p.stock;
  // Bias toward Main Warehouse, sprinkle the rest.
  const biases = [0.62, 0.08, 0.08, 0.07, 0.15];
  WAREHOUSE_LOCATIONS.forEach((loc, idx) => {
    const noise = (seed(p.id + loc) % 5) - 2;
    const portion = Math.max(0, Math.round(p.stock * biases[idx]) + noise);
    out[loc] = idx === WAREHOUSE_LOCATIONS.length - 1 ? remaining : Math.min(portion, remaining);
    remaining -= out[loc];
  });
  if (remaining > 0) out["Main Warehouse"] += remaining;
  return out;
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

export const VENDOR_DIRECTORY: VendorInfo[] = [
  {
    name: "ADI",
    accountNumber: "ADI-0084-NXVL",
    rep: { name: "Tom Halloway", email: "thalloway@adiglobal.ca", phone: "(905) 555-0712" },
    paymentTerms: "Net 30",
    ytdSpend: 248_400,
    poCount: 41,
    avgLeadTimeDays: 4,
  },
  {
    name: "Anixter",
    accountNumber: "ANIX-2261-NEX",
    rep: { name: "Sandra Whittaker", email: "swhittaker@anixter.com", phone: "(416) 555-0820" },
    paymentTerms: "Net 45",
    ytdSpend: 312_800,
    poCount: 28,
    avgLeadTimeDays: 7,
  },
  {
    name: "Wesco",
    accountNumber: "WES-7714-NV",
    rep: { name: "Reginald Coombs", email: "rcoombs@wesco.com", phone: "(905) 555-0915" },
    paymentTerms: "Net 30",
    ytdSpend: 184_650,
    poCount: 22,
    avgLeadTimeDays: 6,
  },
  {
    name: "CDW",
    accountNumber: "CDW-0042-CAN",
    rep: { name: "Priscilla Devereaux", email: "priscid@cdw.com", phone: "(905) 555-1100" },
    paymentTerms: "Net 30",
    ytdSpend: 142_200,
    poCount: 18,
    avgLeadTimeDays: 3,
  },
  {
    name: "Provo",
    accountNumber: "PROVO-0188",
    rep: { name: "Lars Wittenberg", email: "lars.w@provo.ca", phone: "(905) 555-1224" },
    paymentTerms: "Net 30",
    ytdSpend: 38_900,
    poCount: 6,
    avgLeadTimeDays: 5,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Aggregated helpers
// ────────────────────────────────────────────────────────────────────────────

export function totalStockValue(): number {
  return products.reduce((s, p) => s + p.stock * p.cost, 0);
}

export function lowStockCount(): number {
  return products.filter((p) => p.stock <= p.reorderPoint).length;
}

export interface InventoryStats {
  stockValue: number;
  skusTracked: number;
  lowStock: number;
  itemsAllocated: number;
  openPOs: number;
}

export function computeInventoryStats(openPOCount: number): InventoryStats {
  const itemsAllocated = products.reduce((s, p) => s + totalAllocated(p.id), 0);
  return {
    stockValue: totalStockValue(),
    skusTracked: products.length,
    lowStock: lowStockCount(),
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
