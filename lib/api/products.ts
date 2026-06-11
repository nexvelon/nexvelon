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
  DbInventoryStockInsert,
  DbInventoryStockUpdate,
} from "@/lib/types/database";
import type {
  Product,
  ProductCategory,
  ProductManufacturer,
  Vendor,
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
  // free-text and locations are operator-managed, so this is keyed by the raw
  // location string — every location (incl. 'Default' / operator-added) is kept
  // so it can render in the breakdown + filter (B-3).
  const byLocation: Record<string, number> = {};
  for (const r of inStock) {
    if (!r.location) continue;
    byLocation[r.location] = (byLocation[r.location] ?? 0) + Number(r.quantity);
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
    searchAliases: p.search_aliases ?? [],
    notifyAddons: p.notify_addons ?? false,
    addons: p.addons ?? [],
    upc: p.upc ?? undefined,
    masterPartNumber: p.master_part_number ?? undefined,
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
): Promise<{ created: number; createdIds: string[]; skipped: string[] }> {
  if (inputs.length === 0) return { created: 0, createdIds: [], skipped: [] };
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

  if (toInsert.length === 0) return { created: 0, createdIds: [], skipped };

  // 3) insert the remainder.
  const { data: inserted, error: insErr } = await supabase
    .from("inventory_products")
    .insert(toInsert)
    .select("id");
  if (insErr) throw new Error(`bulkCreateProducts/insert: ${insErr.message}`);

  const createdIds = (inserted ?? []).map((r) => r.id as string);
  return { created: createdIds.length, createdIds, skipped };
}

// ----------------------------------------------------------------------------
// Stock units (INV-2d). Receiving creates inventory_stock rows; unit lifecycle
// flips status / deletes. The 'allocated' status is owned by site allocation
// (INV-3) — it is never set here.
// ----------------------------------------------------------------------------

export type ReceiveStockInput = {
  quantity: number;
  unit_cost: number;
  location?: string | null;
  supplier?: string | null;
  poNumber?: string; // C-2a: optional PO #, stamped on every row of the receipt
  acquired_at?: string | null; // defaults to today (UTC date)
  serials?: string[]; // serialized only; mapped 1:1 to the first N units
};

/**
 * Receive stock against a product. The product's tracking_mode decides the
 * shape:
 *   - SERIALIZED → `quantity` rows, each quantity:1, serial_number from
 *     serials[i] (or null past the end of the list).
 *   - BULK / NON_SERIALIZED → ONE row with quantity:N, serial_number null (each
 *     receipt is its own row, so distinct costs stay separate per §2.4).
 * All received rows enter as status 'in_stock' and carry the receipt's PO #
 * (if any). acquired_at defaults to today.
 */
export async function receiveStock(
  productId: string,
  input: ReceiveStockInput
): Promise<{ created: number }> {
  if (!Number.isFinite(input.quantity) || input.quantity < 1) {
    throw new Error("receiveStock: quantity must be a positive integer.");
  }
  if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) {
    throw new Error("receiveStock: unit cost must be zero or greater.");
  }

  const product = await getProductRowById(productId);
  if (!product) throw new Error("receiveStock: product not found.");

  const supabase = await db();
  const acquired = input.acquired_at ?? new Date().toISOString().slice(0, 10);
  const base = {
    product_id: productId,
    unit_cost: input.unit_cost,
    location: input.location ?? null,
    supplier: input.supplier ?? null,
    po_number: input.poNumber?.trim() || null,
    status: "in_stock" as const,
    acquired_at: acquired,
  };

  let toInsert: DbInventoryStockInsert[];
  if (
    product.tracking_mode === "bulk" ||
    product.tracking_mode === "non_serialized"
  ) {
    toInsert = [{ ...base, serial_number: null, quantity: input.quantity }];
  } else {
    const serials = input.serials ?? [];
    toInsert = Array.from({ length: input.quantity }, (_, i) => ({
      ...base,
      serial_number: serials[i]?.trim() || null,
      quantity: 1,
    }));
  }

  const { data, error } = await supabase
    .from("inventory_stock")
    .insert(toInsert)
    .select("id");
  if (error) throw new Error(`receiveStock: ${error.message}`);
  return { created: data?.length ?? 0 };
}

/** Patch a stock unit (status flips, etc.). Stamps updated_at. */
export async function updateStockUnit(
  id: string,
  patch: DbInventoryStockUpdate
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("inventory_stock")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`updateStockUnit: ${error.message}`);
}

/** Hard-delete a stock unit. */
export async function deleteStockUnit(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("inventory_stock")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteStockUnit: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Site allocation (INV-3b). Whole-row allocation only — a unit/lot is either
// fully allocated to a site or not (partial-bulk deferred). Each transition is
// guarded by the current status so a double-allocate / double-return no-ops at
// the DB level rather than corrupting state.
// ----------------------------------------------------------------------------

/**
 * Allocate an in-stock unit/lot to a site: status -> 'allocated', site_id set.
 * Guarded WHERE status='in_stock' — a row that isn't in stock won't flip
 * (returns a "not available" error so the caller can surface it).
 */
export async function allocateUnitToSite(
  stockId: string,
  siteId: string
): Promise<void> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .update({
      status: "allocated",
      site_id: siteId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId)
    .eq("status", "in_stock")
    .select("id");
  if (error) throw new Error(`allocateUnitToSite: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "This unit is no longer in stock and can't be allocated. Refresh and try again."
    );
  }
}

/**
 * Return an allocated unit/lot to stock: status -> 'in_stock', site_id NULL.
 * Guarded WHERE status='allocated'.
 */
export async function returnUnitToStock(stockId: string): Promise<void> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .update({
      status: "in_stock",
      site_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId)
    .eq("status", "allocated")
    .select("id");
  if (error) throw new Error(`returnUnitToStock: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "This unit is not currently allocated. Refresh and try again."
    );
  }
}

/**
 * F-3b: consume `qty` from an in-stock unit/lot (quote commit). Qty-aware:
 *   - status must be 'in_stock' (else "no longer available").
 *   - qty > unit.quantity → error ("insufficient stock"); never over-consume.
 *   - qty === quantity → flip the row to 'consumed' (+ traceability note).
 *   - qty <  quantity → SPLIT: reduce the source lot by qty, insert a new
 *     'consumed' row of qty carrying the same cost/location/po/supplier/date.
 * Returns the consumed row id (the source row when full-consume, the new split
 * row when partial). `ref` (e.g. the quote #) is appended to notes for trace.
 */
export async function consumeStock(
  stockUnitId: string,
  qty: number,
  opts: { ref?: string } = {}
): Promise<{ consumedRowId: string }> {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error("consumeStock: qty must be a positive integer.");
  }
  const supabase = await db();

  const { data: unit, error: loadErr } = await supabase
    .from("inventory_stock")
    .select("*")
    .eq("id", stockUnitId)
    .maybeSingle();
  if (loadErr) throw new Error(`consumeStock: ${loadErr.message}`);
  if (!unit) throw new Error("consumeStock: stock unit not found.");

  const u = unit as DbInventoryStock;
  if (u.status !== "in_stock") {
    throw new Error("This unit is no longer available to commit.");
  }
  if (qty > u.quantity) {
    throw new Error(
      `Insufficient stock: only ${u.quantity} available (needed ${qty}).`
    );
  }

  const note = opts.ref ? `Committed to ${opts.ref}` : "Committed";
  const stamp = new Date().toISOString();

  if (qty === u.quantity) {
    // Full consume — flip the row in place.
    const mergedNotes = u.notes ? `${u.notes}\n${note}` : note;
    const { error } = await supabase
      .from("inventory_stock")
      .update({ status: "consumed", notes: mergedNotes, updated_at: stamp })
      .eq("id", stockUnitId)
      .eq("status", "in_stock");
    if (error) throw new Error(`consumeStock: ${error.message}`);
    return { consumedRowId: stockUnitId };
  }

  // Partial — reduce the source lot, then insert a discrete consumed row.
  const { data: dec, error: decErr } = await supabase
    .from("inventory_stock")
    .update({ quantity: u.quantity - qty, updated_at: stamp })
    .eq("id", stockUnitId)
    .eq("status", "in_stock")
    .select("id");
  if (decErr) throw new Error(`consumeStock/reduce: ${decErr.message}`);
  if (!dec || dec.length === 0) {
    throw new Error("This unit is no longer available to commit.");
  }

  const consumedRow: DbInventoryStockInsert = {
    product_id: u.product_id,
    unit_cost: u.unit_cost,
    serial_number: null,
    quantity: qty,
    location: u.location,
    supplier: u.supplier,
    po_number: u.po_number,
    acquired_at: u.acquired_at,
    status: "consumed",
    notes: note,
  };
  const { data: ins, error: insErr } = await supabase
    .from("inventory_stock")
    .insert(consumedRow)
    .select("id")
    .single();
  if (insErr) throw new Error(`consumeStock/insert: ${insErr.message}`);
  return { consumedRowId: (ins as { id: string }).id };
}

// ----------------------------------------------------------------------------
// Reports (INV-6). Aggregated server-side over the REAL inventory_stock rows so
// valuation/aging honor specific-identification (§2.4) — each unit's own
// unit_cost, NOT the avg-cost Product rollup.
// ----------------------------------------------------------------------------

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+" | "Unknown";

export interface InventoryReportData {
  totalValuation: number;
  valuationByCategory: { category: string; value: number; units: number }[];
  aging: { bucket: AgingBucket; units: number; value: number }[];
  /** Turnover PROXY — units/value marked consumed|retired in the last 90 days. */
  consumption90d: { value: number; units: number };
}

// Supabase embeds a to-one relationship as an object, but the generated types
// can widen it to an array — normalize either shape to the category string.
function embeddedCategory(embedded: unknown): string {
  let row = embedded;
  if (Array.isArray(row)) row = row[0];
  const cat = (row as { category?: string | null } | null | undefined)?.category;
  return cat && cat.trim() !== "" ? cat : "Uncategorized";
}

export async function getInventoryReportData(): Promise<InventoryReportData> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .select(
      "unit_cost, quantity, status, acquired_at, updated_at, inventory_products(category)"
    );
  if (error) throw new Error(`getInventoryReportData: ${error.message}`);

  const rows = data ?? [];
  const now = Date.now();
  const DAY = 86_400_000;
  const ninetyDaysAgo = now - 90 * DAY;

  // ── Valuation by category (in_stock only) ──
  const catMap = new Map<string, { value: number; units: number }>();
  let totalValuation = 0;

  // ── Aging (in_stock only) ──
  const agingOrder: AgingBucket[] = ["0-30", "31-60", "61-90", "90+", "Unknown"];
  const agingMap = new Map<AgingBucket, { units: number; value: number }>(
    agingOrder.map((b) => [b, { units: 0, value: 0 }])
  );

  // ── Consumption (90d) proxy ──
  let consumptionValue = 0;
  let consumptionUnits = 0;

  for (const r of rows) {
    const qty = Number(r.quantity);
    const lineValue = Number(r.unit_cost) * qty;

    if (r.status === "in_stock") {
      const category = embeddedCategory(r.inventory_products);
      const c = catMap.get(category) ?? { value: 0, units: 0 };
      c.value += lineValue;
      c.units += qty;
      catMap.set(category, c);
      totalValuation += lineValue;

      let bucket: AgingBucket;
      if (!r.acquired_at) {
        bucket = "Unknown";
      } else {
        const days = Math.floor((now - new Date(r.acquired_at).getTime()) / DAY);
        bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
      }
      const a = agingMap.get(bucket)!;
      a.units += qty;
      a.value += lineValue;
    } else if (r.status === "consumed" || r.status === "retired") {
      if (r.updated_at && new Date(r.updated_at).getTime() >= ninetyDaysAgo) {
        consumptionValue += lineValue;
        consumptionUnits += qty;
      }
    }
  }

  const valuationByCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, value: v.value, units: v.units }))
    .sort((a, b) => b.value - a.value);

  const aging = agingOrder.map((bucket) => ({
    bucket,
    units: agingMap.get(bucket)!.units,
    value: agingMap.get(bucket)!.value,
  }));

  return {
    totalValuation,
    valuationByCategory,
    aging,
    consumption90d: { value: consumptionValue, units: consumptionUnits },
  };
}
