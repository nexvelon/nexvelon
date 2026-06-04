import "server-only";

// ============================================================================
// Server-only inventory products API — INV-2a (Path A adapter).
//
// The inventory schema (migration 0021) is two-table specific-identification:
//   - inventory_products : catalog (sku / name / category / reference cost …)
//   - inventory_stock    : one row per physical unit / bulk lot, each carrying
//                          its own unit_cost (§2.4 specific-identification)
//
// The existing inventory UI (StockTab, stat cards, lib/inventory-data helpers)
// is built on the legacy aggregate `Product` shape. This module is the seam
// between the two: it reads both tables and ROLLS UP in-stock units into the
// `Product` contract so the UI lights up on real data with zero UI-type churn.
//
// IMPORTANT (§2.4): `avgCost` here is a DISPLAY-ONLY rollup of in-stock units.
// It is NOT a margin-costing input — margin uses the per-unit cost on the
// actual consumed inventory_stock row (lands in INV-4). The catalog
// `default_unit_cost` maps to Product.cost as a REFERENCE price, not an
// average.
//
// Auth posture mirrors lib/api/clients.ts: backed by the cookie-aware server
// client, so RLS on the inventory tables is enforced for the caller's session.
// ============================================================================

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbInventoryProduct,
  DbInventoryStock,
} from "@/lib/types/database";
import type {
  Product,
  ProductCategory,
  ProductManufacturer,
  Vendor,
  WarehouseLocation,
} from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
}

// Thin slice of inventory_stock needed for the aggregate rollup.
type StockSlice = Pick<
  DbInventoryStock,
  "product_id" | "quantity" | "unit_cost" | "location" | "acquired_at"
>;

/**
 * Map one catalog row + its in-stock units into the legacy aggregate Product
 * (Path A). `stock` / `avgCost` / `byLocation` / `lastReceived` are COMPUTED
 * from the stock rows — never stored. supabase-js returns numeric columns as
 * strings, so every numeric is coerced via Number().
 */
function toProduct(p: DbInventoryProduct, inStock: StockSlice[]): Product {
  const stock = inStock.reduce((n, r) => n + Number(r.quantity), 0);
  const totalCost = inStock.reduce(
    (n, r) => n + Number(r.unit_cost) * Number(r.quantity),
    0
  );
  // Display-only weighted rollup of the units currently on hand (§2.4).
  const avgCost = stock > 0 ? totalCost / stock : undefined;

  // Group units by location into the Product.byLocation shape. DB location is
  // free-text; the WarehouseLocation union is the UI vocabulary — cast, and
  // any location outside the union simply won't render in the breakdown UI.
  const byLocation: Partial<Record<WarehouseLocation, number>> = {};
  for (const r of inStock) {
    if (!r.location) continue;
    const loc = r.location as WarehouseLocation;
    byLocation[loc] = (byLocation[loc] ?? 0) + Number(r.quantity);
  }

  // Latest acquisition date among the in-stock units (ISO dates sort lexically).
  let lastReceived: string | undefined;
  for (const r of inStock) {
    if (r.acquired_at && (!lastReceived || r.acquired_at > lastReceived)) {
      lastReceived = r.acquired_at;
    }
  }

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    // DB columns are free-text; the unions are the dropdown vocabulary. The
    // DB is source of truth — cast rather than redefining the UI unions.
    manufacturer: (p.manufacturer ?? "") as ProductManufacturer,
    category: (p.category ?? "") as ProductCategory,
    vendor: (p.vendor ?? "") as Vendor,
    cost: p.default_unit_cost != null ? Number(p.default_unit_cost) : 0,
    price: p.list_price != null ? Number(p.list_price) : 0,
    stock,
    reorderPoint: p.reorder_point ?? 0,
    reorderQty: p.reorder_qty ?? undefined,
    avgCost, // display-only
    byLocation: Object.keys(byLocation).length > 0 ? byLocation : undefined,
    lastReceived,
  };
}

/**
 * Group a flat list of stock slices by product_id for the rollup join.
 */
function groupStockByProduct(rows: StockSlice[]): Map<string, StockSlice[]> {
  const map = new Map<string, StockSlice[]>();
  for (const r of rows) {
    const list = map.get(r.product_id);
    if (list) list.push(r);
    else map.set(r.product_id, [r]);
  }
  return map;
}

/**
 * List every catalog product, each rolled up with its in-stock units into the
 * aggregate Product shape. Two round-trips (catalog + in-stock rows) joined in
 * JS — same no-N+1 posture as getClients.
 */
export async function listProducts(): Promise<Product[]> {
  const supabase = await db();

  const { data: catalog, error: catErr } = await supabase
    .from("inventory_products")
    .select("*")
    .order("name", { ascending: true });
  if (catErr) throw new Error(`listProducts: ${catErr.message}`);
  if (!catalog || catalog.length === 0) return [];

  const { data: stock, error: stockErr } = await supabase
    .from("inventory_stock")
    .select("product_id, quantity, unit_cost, location, acquired_at")
    .eq("status", "in_stock");
  if (stockErr) throw new Error(`listProducts/stock: ${stockErr.message}`);

  const byProduct = groupStockByProduct((stock ?? []) as StockSlice[]);

  return (catalog as DbInventoryProduct[]).map((p) =>
    toProduct(p, byProduct.get(p.id) ?? [])
  );
}

/**
 * Fetch a single product by catalog id, rolled up with its in-stock units.
 * Returns null when the id doesn't match a catalog row.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const supabase = await db();

  const { data: product, error: prodErr } = await supabase
    .from("inventory_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (prodErr) throw new Error(`getProductById: ${prodErr.message}`);
  if (!product) return null;

  const { data: stock, error: stockErr } = await supabase
    .from("inventory_stock")
    .select("product_id, quantity, unit_cost, location, acquired_at")
    .eq("product_id", id)
    .eq("status", "in_stock");
  if (stockErr) throw new Error(`getProductById/stock: ${stockErr.message}`);

  return toProduct(product as DbInventoryProduct, (stock ?? []) as StockSlice[]);
}
