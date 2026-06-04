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
  DbInventoryProductInsert,
  DbInventoryProductUpdate,
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

/**
 * Fetch the RAW catalog row (DbInventoryProduct) by id — the lossless source
 * for the detail page's display + edit form. getProductById() rolls up into
 * the aggregate Product (no tracking_mode / description / unit_of_measure / raw
 * cost columns), so the edit form needs this raw shape instead. Returns null
 * when the id doesn't match.
 */
export async function getProductRowById(
  id: string
): Promise<DbInventoryProduct | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProductRowById: ${error.message}`);
  return (data as DbInventoryProduct | null) ?? null;
}

// ----------------------------------------------------------------------------
// Catalog writes (INV-2b). These touch inventory_products only — stock units
// (inventory_stock) are managed separately (receiving lands in INV-2d).
// ----------------------------------------------------------------------------

/**
 * Create a catalog product. A freshly-created product has no stock units yet,
 * so it rolls up via toProduct(row, []) → stock 0, no avgCost/byLocation.
 */
export async function createProduct(
  input: DbInventoryProductInsert
): Promise<Product> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_products")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return toProduct(data as DbInventoryProduct, []);
}

/**
 * Update a catalog product. Stamps updated_at (the DB default only fires on
 * insert). Returns the re-rolled Product (with its current stock units).
 */
export async function updateProduct(
  id: string,
  patch: DbInventoryProductUpdate
): Promise<Product> {
  const supabase = await db();
  const { error } = await supabase
    .from("inventory_products")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`updateProduct: ${error.message}`);

  const updated = await getProductById(id);
  if (!updated) throw new Error("updateProduct: product not found after update");
  return updated;
}

/**
 * Hard-delete a catalog product. inventory_stock.product_id is ON DELETE
 * RESTRICT (0021), so a product with stock units cannot be deleted — Postgres
 * raises a foreign-key violation (SQLSTATE 23503). We surface a friendly
 * operator-facing message instead of the raw constraint error.
 */
export async function deleteProduct(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("inventory_products")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Cannot delete a product that still has stock units. Remove its stock first."
      );
    }
    throw new Error(`deleteProduct: ${error.message}`);
  }
}

/**
 * List every stock unit (all statuses) for a product, newest acquisition
 * first — backs the read-only units table on the detail page.
 */
export async function listStockForProduct(
  productId: string
): Promise<DbInventoryStock[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("*")
    .eq("product_id", productId)
    .order("acquired_at", { ascending: false });
  if (error) throw new Error(`listStockForProduct: ${error.message}`);
  return (data ?? []) as DbInventoryStock[];
}

/**
 * Bulk-insert catalog products (INV-2c). INSERT-only — no upsert/update-by-sku.
 * Rows whose sku already exists in the table, OR is duplicated earlier within
 * the same batch, are dropped and reported in `skipped` (the sku string). The
 * sku UNIQUE constraint (0021) is the backstop; the pre-check makes skips
 * explicit and keeps the insert from aborting the whole batch on a collision.
 */
export async function bulkCreateProducts(
  inputs: DbInventoryProductInsert[]
): Promise<{ created: number; skipped: string[] }> {
  if (inputs.length === 0) return { created: 0, skipped: [] };
  const supabase = await db();

  // 1) existing SKUs already in the catalog.
  const { data: existingRows, error: existErr } = await supabase
    .from("inventory_products")
    .select("sku");
  if (existErr) throw new Error(`bulkCreateProducts: ${existErr.message}`);
  const existing = new Set(
    (existingRows ?? []).map((r) => (r.sku as string).toLowerCase())
  );

  // 2) filter out existing + intra-batch duplicate SKUs.
  const seen = new Set<string>();
  const skipped: string[] = [];
  const toInsert: DbInventoryProductInsert[] = [];
  for (const row of inputs) {
    const key = row.sku.toLowerCase();
    if (existing.has(key) || seen.has(key)) {
      skipped.push(row.sku);
      continue;
    }
    seen.add(key);
    toInsert.push(row);
  }

  if (toInsert.length === 0) return { created: 0, skipped };

  // 3) insert the remainder.
  const { data: inserted, error: insErr } = await supabase
    .from("inventory_products")
    .insert(toInsert)
    .select("id");
  if (insErr) throw new Error(`bulkCreateProducts/insert: ${insErr.message}`);

  return { created: inserted?.length ?? 0, skipped };
}
