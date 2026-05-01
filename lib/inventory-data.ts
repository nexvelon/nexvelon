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

export const transfers: StockTransfer[] = [
  { id: "tr-1", number: "TR-2026-0041", from: "Main Warehouse", to: "Truck 1", itemCount: 12, status: "Received", date: "2026-04-22", initiatedById: "u-005" },
  { id: "tr-2", number: "TR-2026-0042", from: "Main Warehouse", to: "Truck 2", itemCount: 8, status: "Received", date: "2026-04-23", initiatedById: "u-005" },
  { id: "tr-3", number: "TR-2026-0043", from: "Branch — Mississauga", to: "Main Warehouse", itemCount: 24, status: "In Transit", date: "2026-04-28", initiatedById: "u-018", notes: "Returning Avigilon stock from Mississauga overflow" },
  { id: "tr-4", number: "TR-2026-0044", from: "Main Warehouse", to: "Truck 3", itemCount: 6, status: "In Transit", date: "2026-04-29", initiatedById: "u-004" },
  { id: "tr-5", number: "TR-2026-0045", from: "Truck 2", to: "Main Warehouse", itemCount: 3, status: "Draft", date: "2026-04-30", initiatedById: "u-005", notes: "Returning unused PG9914 sensors from Glenview survey" },
];

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

export const standalonePOs: StandalonePO[] = [
  {
    id: "po-stk-1",
    number: "PO-STK-0188",
    vendor: "ADI",
    date: "2026-04-08",
    expected: "2026-04-15",
    status: "Received",
    items: [
      { productId: "p-053", qty: 24, cost: 195 },
      { productId: "p-014", qty: 24, cost: 78 },
      { productId: "p-015", qty: 60, cost: 42 },
    ],
  },
  {
    id: "po-stk-2",
    number: "PO-STK-0189",
    vendor: "Anixter",
    date: "2026-04-12",
    expected: "2026-04-22",
    status: "Partially Received",
    items: [
      { productId: "p-057", qty: 12, cost: 685 },
      { productId: "p-058", qty: 4, cost: 945 },
    ],
  },
  {
    id: "po-stk-3",
    number: "PO-STK-0190",
    vendor: "CDW",
    date: "2026-04-22",
    expected: "2026-04-30",
    status: "Sent",
    items: [
      { productId: "p-073", qty: 4, cost: 1885 },
      { productId: "p-074", qty: 1, cost: 8425 },
    ],
  },
  {
    id: "po-stk-4",
    number: "PO-STK-0191",
    vendor: "Provo",
    date: "2026-04-25",
    expected: "2026-05-08",
    status: "Confirmed",
    items: [
      { productId: "p-077", qty: 2, cost: 985 },
      { productId: "p-079", qty: 12, cost: 215 },
      { productId: "p-080", qty: 24, cost: 65 },
    ],
  },
  {
    id: "po-stk-5",
    number: "PO-STK-0192",
    vendor: "Wesco",
    date: "2026-04-29",
    expected: "2026-05-09",
    status: "Draft",
    items: [
      { productId: "p-075", qty: 100, cost: 12.5 },
      { productId: "p-076", qty: 8, cost: 285 },
      { productId: "p-069", qty: 2, cost: 1250 },
    ],
  },
];

export function isOpenPO(status: string): boolean {
  return status !== "Received" && status !== "Closed";
}

// Note: 'addDays' and 'parseISO' are imported for downstream consumers (StockTab
// and the row drawer) — keep them re-exported via barrel-style usage.
export { addDays, parseISO };
