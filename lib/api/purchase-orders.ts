import "server-only";

// PO-2 — server-only purchase-orders API (public.purchase_orders +
// purchase_order_lines, migration 0031). Mirrors the clients/vendors posture:
// cookie-aware server client (RLS enforced), created_by/updated_by from the auth
// uid. Lines are full-replaced on update — acceptable for DRAFT POs; the PO-4
// receiving flow (received_qty) will introduce non-destructive line handling.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessPONumber } from "@/lib/format";
import { receiveStock } from "@/lib/api/products";
import type {
  DbPurchaseOrder,
  DbPurchaseOrderInsert,
  DbPurchaseOrderLine,
  DbPurchaseOrderLineInsert,
  DbPurchaseOrderStatus,
  DbPurchaseOrderUpdate,
  InventoryTrackingMode,
} from "@/lib/types/database";

// PO-3 — allowed status transitions. partially_received / received are entered
// only by the PO-4 receiving flow (not here); from those states the workflow
// can still Close or Cancel. closed / cancelled are terminal. issued→draft is
// the admin reopen.
export const PO_STATUS_TRANSITIONS: Record<
  DbPurchaseOrderStatus,
  DbPurchaseOrderStatus[]
> = {
  // partially_received / received targets are entered ONLY by the PO-4
  // receiving flow (no manual UI button); the manual workflow exposes just
  // issue / cancel / close / admin-reopen.
  draft: ["issued", "cancelled"],
  issued: ["closed", "cancelled", "draft", "partially_received", "received"],
  partially_received: ["closed", "cancelled", "received"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

async function db() {
  return createSupabaseServerClient();
}

/** A list row: the header + vendor name + computed total + line count. */
export interface PurchaseOrderListRow extends DbPurchaseOrder {
  vendor_name: string;
  total: number;
  line_count: number;
}

/** A line enriched with the product name + tracking mode (when product_id set).
 *  product_tracking_mode drives the receive flow (serialized lines need serials). */
export interface PurchaseOrderLineWithProduct extends DbPurchaseOrderLine {
  product_name: string | null;
  product_sku: string | null;
  product_tracking_mode: InventoryTrackingMode | null;
}

/** Detail: the header + vendor name + ordered enriched lines. */
export interface PurchaseOrderDetail {
  header: DbPurchaseOrder & { vendor_name: string };
  lines: PurchaseOrderLineWithProduct[];
}

/** PARTS-2 — one PO that included a given product, with this product's line. */
export interface ProductPurchaseHistoryRow {
  po_id: string;
  po_number: string;
  vendor_name: string;
  status: DbPurchaseOrderStatus;
  order_date: string | null;
  created_at: string;
  quantity: number;
  unit_cost: number;
  received_qty: number;
}

// The header + lines payload used by create/update.
export interface PurchaseOrderWrite {
  header: DbPurchaseOrderInsert | DbPurchaseOrderUpdate;
  lines: Omit<DbPurchaseOrderLineInsert, "purchase_order_id">[];
}

function lineTotal(l: { quantity: number; unit_cost: number }): number {
  return Number(l.quantity) * Number(l.unit_cost);
}

/**
 * PARTS-2 — every PO that included `productId`, newest first, with this
 * product's ordered qty / unit cost / received qty on each. Reuses the
 * purchase_order_lines.product_id FK + its index (0031). Returns [] when the
 * part has never been on a PO.
 */
export async function getPurchaseOrdersByProduct(
  productId: string
): Promise<ProductPurchaseHistoryRow[]> {
  const supabase = await db();

  const { data: lines, error: lErr } = await supabase
    .from("purchase_order_lines")
    .select("purchase_order_id, quantity, unit_cost, received_qty")
    .eq("product_id", productId);
  if (lErr) throw new Error(`getPurchaseOrdersByProduct/lines: ${lErr.message}`);
  if (!lines || lines.length === 0) return [];

  const poIds = [...new Set(lines.map((l) => l.purchase_order_id as string))];
  const { data: pos, error: pErr } = await supabase
    .from("purchase_orders")
    .select("*")
    .in("id", poIds);
  if (pErr) throw new Error(`getPurchaseOrdersByProduct/pos: ${pErr.message}`);
  const headers = (pos ?? []) as DbPurchaseOrder[];
  const headerById = new Map(headers.map((h) => [h.id, h]));

  const vendorIds = [...new Set(headers.map((h) => h.vendor_id))];
  const { data: vendors, error: vErr } = await supabase
    .from("vendors")
    .select("id, name")
    .in("id", vendorIds);
  if (vErr) throw new Error(`getPurchaseOrdersByProduct/vendors: ${vErr.message}`);
  const vendorName = new Map(
    (vendors ?? []).map((v) => [v.id as string, v.name as string])
  );

  const rows: ProductPurchaseHistoryRow[] = [];
  for (const l of lines) {
    const h = headerById.get(l.purchase_order_id as string);
    if (!h) continue;
    rows.push({
      po_id: h.id,
      po_number: h.po_number,
      vendor_name: vendorName.get(h.vendor_id) ?? "—",
      status: h.status,
      order_date: h.order_date,
      created_at: h.created_at,
      quantity: Number(l.quantity),
      unit_cost: Number(l.unit_cost),
      received_qty: Number(l.received_qty),
    });
  }

  // Newest first by order date (fall back to created_at).
  rows.sort((a, b) =>
    (b.order_date ?? b.created_at).localeCompare(a.order_date ?? a.created_at)
  );
  return rows;
}

/**
 * List all POs, newest first, each with its vendor name, computed total
 * (Σ quantity × unit_cost), and line count. Three round-trips (POs + vendors +
 * lines) joined in JS — the no-N+1 posture used by getClients/listProducts.
 */
export async function getPurchaseOrders(): Promise<PurchaseOrderListRow[]> {
  const supabase = await db();

  const { data: pos, error: poErr } = await supabase
    .from("purchase_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (poErr) throw new Error(`getPurchaseOrders: ${poErr.message}`);
  const headers = (pos ?? []) as DbPurchaseOrder[];
  if (headers.length === 0) return [];

  const vendorIds = [...new Set(headers.map((p) => p.vendor_id))];
  const poIds = headers.map((p) => p.id);

  const [{ data: vendors, error: vErr }, { data: lines, error: lErr }] =
    await Promise.all([
      supabase.from("vendors").select("id, name").in("id", vendorIds),
      supabase
        .from("purchase_order_lines")
        .select("purchase_order_id, quantity, unit_cost")
        .in("purchase_order_id", poIds),
    ]);
  if (vErr) throw new Error(`getPurchaseOrders/vendors: ${vErr.message}`);
  if (lErr) throw new Error(`getPurchaseOrders/lines: ${lErr.message}`);

  const vendorName = new Map(
    (vendors ?? []).map((v) => [v.id as string, v.name as string])
  );
  const totals = new Map<string, { total: number; count: number }>();
  for (const l of lines ?? []) {
    const key = l.purchase_order_id as string;
    const prev = totals.get(key) ?? { total: 0, count: 0 };
    totals.set(key, {
      total: prev.total + lineTotal(l as { quantity: number; unit_cost: number }),
      count: prev.count + 1,
    });
  }

  return headers.map((h) => {
    const agg = totals.get(h.id) ?? { total: 0, count: 0 };
    return {
      ...h,
      vendor_name: vendorName.get(h.vendor_id) ?? "—",
      total: Math.round(agg.total * 100) / 100,
      line_count: agg.count,
    };
  });
}

/** One PO with its vendor name and ordered, product-enriched lines. */
export async function getPurchaseOrderById(
  id: string
): Promise<PurchaseOrderDetail | null> {
  const supabase = await db();

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (poErr) throw new Error(`getPurchaseOrderById: ${poErr.message}`);
  if (!po) return null;
  const header = po as DbPurchaseOrder;

  const [{ data: vendor }, { data: lineRows, error: lErr }] = await Promise.all([
    supabase.from("vendors").select("name").eq("id", header.vendor_id).maybeSingle(),
    supabase
      .from("purchase_order_lines")
      .select("*")
      .eq("purchase_order_id", id)
      .order("line_no", { ascending: true }),
  ]);
  if (lErr) throw new Error(`getPurchaseOrderById/lines: ${lErr.message}`);
  const lines = (lineRows ?? []) as DbPurchaseOrderLine[];

  const productIds = [
    ...new Set(lines.map((l) => l.product_id).filter((v): v is string => !!v)),
  ];
  const productMap = new Map<
    string,
    { name: string; sku: string; tracking_mode: InventoryTrackingMode }
  >();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("inventory_products")
      .select("id, name, sku, tracking_mode")
      .in("id", productIds);
    for (const p of products ?? []) {
      productMap.set(p.id as string, {
        name: p.name as string,
        sku: p.sku as string,
        tracking_mode: p.tracking_mode as InventoryTrackingMode,
      });
    }
  }

  return {
    header: { ...header, vendor_name: (vendor?.name as string) ?? "—" },
    lines: lines.map((l) => {
      const prod = l.product_id ? productMap.get(l.product_id) : undefined;
      return {
        ...l,
        product_name: prod?.name ?? null,
        product_sku: prod?.sku ?? null,
        product_tracking_mode: prod?.tracking_mode ?? null,
      };
    }),
  };
}

/** Create a draft PO: header (po_number minted, status defaults 'draft') + lines. */
export async function createPurchaseOrder(
  input: PurchaseOrderWrite
): Promise<DbPurchaseOrder> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? null;

  const headerInsert: DbPurchaseOrderInsert = {
    ...(input.header as DbPurchaseOrderInsert),
    po_number: businessPONumber(),
    created_by: uid,
    updated_by: uid,
  };

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert(headerInsert)
    .select("*")
    .single();
  if (poErr) throw new Error(`createPurchaseOrder: ${poErr.message}`);
  const header = po as DbPurchaseOrder;

  await insertLines(supabase, header.id, input.lines);
  return header;
}

/** Update a draft PO's header, then FULL-REPLACE its lines (delete + re-insert). */
export async function updatePurchaseOrder(
  id: string,
  input: PurchaseOrderWrite
): Promise<DbPurchaseOrder> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .update({
      ...(input.header as DbPurchaseOrderUpdate),
      updated_by: user?.id ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (poErr) throw new Error(`updatePurchaseOrder: ${poErr.message}`);

  // Full-replace lines — fine for DRAFT POs (no received_qty to preserve yet).
  const { error: delErr } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", id);
  if (delErr) throw new Error(`updatePurchaseOrder/clearLines: ${delErr.message}`);

  await insertLines(supabase, id, input.lines);
  return po as DbPurchaseOrder;
}

/**
 * PO-3 — transition a PO's status, validating against PO_STATUS_TRANSITIONS.
 * Loads the current status, rejects an illegal transition, then updates (the
 * updated_by uid + updated_at trigger fire as usual). Returns the new header.
 */
export async function setPurchaseOrderStatus(
  id: string,
  nextStatus: DbPurchaseOrderStatus
): Promise<DbPurchaseOrder> {
  const supabase = await db();

  const { data: current, error: loadErr } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new Error(`setPurchaseOrderStatus: ${loadErr.message}`);
  if (!current) throw new Error("Purchase order not found.");

  const from = current.status as DbPurchaseOrderStatus;
  if (from === nextStatus) {
    throw new Error(`Purchase order is already ${nextStatus}.`);
  }
  if (!PO_STATUS_TRANSITIONS[from].includes(nextStatus)) {
    throw new Error(`Cannot move a ${from} purchase order to ${nextStatus}.`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: nextStatus, updated_by: user?.id ?? null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setPurchaseOrderStatus: ${error.message}`);
  return data as DbPurchaseOrder;
}

// PO-4 — one receipt against one PO line.
export interface ReceiptInput {
  lineId: string;
  quantity: number;
  serials?: string[];
  location?: string | null;
  acquired_at?: string | null;
}

/**
 * PO-4 — receive stock against PO lines. The ONLY path that writes
 * received_qty. For each receipt (quantity > 0):
 *   - loads the line; rejects when quantity exceeds remaining, the line has no
 *     product_id (free-text lines aren't receivable), or a serialized product
 *     isn't given exactly `quantity` serials;
 *   - calls the existing receiveStock() once (PO unit_cost as the cost snapshot,
 *     supplier = vendor name, PO number stamped) — cost model untouched;
 *   - IMMEDIATELY increments received_qty (targeted UPDATE) so a retry can't
 *     double-receive.
 * Then advances status: all lines fully received → 'received'; some → it's
 * 'partially_received'. Returns the updated PO header.
 */
export async function receivePurchaseOrderLines(
  poId: string,
  receipts: ReceiptInput[]
): Promise<DbPurchaseOrder> {
  const supabase = await db();

  const { data: poRow, error: poErr } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", poId)
    .maybeSingle();
  if (poErr) throw new Error(`receivePurchaseOrderLines: ${poErr.message}`);
  if (!poRow) throw new Error("Purchase order not found.");
  const header = poRow as DbPurchaseOrder;

  const { data: vendor } = await supabase
    .from("vendors")
    .select("name")
    .eq("id", header.vendor_id)
    .maybeSingle();
  const supplier = (vendor?.name as string) ?? null;

  const { data: lineRows, error: lErr } = await supabase
    .from("purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", poId);
  if (lErr) throw new Error(`receivePurchaseOrderLines/lines: ${lErr.message}`);
  const lines = (lineRows ?? []) as DbPurchaseOrderLine[];
  const byId = new Map(lines.map((l) => [l.id, l]));

  // Tracking modes for the products being received (serialized needs serials).
  const receivedProductIds = [
    ...new Set(
      receipts
        .map((r) => byId.get(r.lineId)?.product_id)
        .filter((v): v is string => !!v)
    ),
  ];
  const trackingById = new Map<string, InventoryTrackingMode>();
  if (receivedProductIds.length > 0) {
    const { data: products } = await supabase
      .from("inventory_products")
      .select("id, tracking_mode")
      .in("id", receivedProductIds);
    for (const p of products ?? []) {
      trackingById.set(
        p.id as string,
        p.tracking_mode as InventoryTrackingMode
      );
    }
  }

  for (const r of receipts) {
    const qty = Number(r.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const line = byId.get(r.lineId);
    if (!line) throw new Error("A receipt references a line not on this PO.");
    if (!line.product_id) {
      throw new Error("Only catalog (product) lines can be received.");
    }
    const remaining = line.quantity - line.received_qty;
    if (qty > remaining) {
      throw new Error(
        `Cannot receive ${qty} — only ${remaining} remaining on that line.`
      );
    }

    const tracking = trackingById.get(line.product_id);
    const serials = (r.serials ?? [])
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (tracking === "serialized" && serials.length !== qty) {
      throw new Error(
        `Serialized line needs exactly ${qty} serial number${qty === 1 ? "" : "s"}.`
      );
    }

    await receiveStock(line.product_id, {
      quantity: qty,
      unit_cost: Number(line.unit_cost),
      supplier,
      poNumber: header.po_number,
      location: r.location ?? null,
      acquired_at: r.acquired_at ?? null,
      serials: tracking === "serialized" ? serials : undefined,
    });

    // Increment immediately so a retry can't double-receive this delta.
    const { error: upErr } = await supabase
      .from("purchase_order_lines")
      .update({ received_qty: line.received_qty + qty })
      .eq("id", line.id);
    if (upErr) {
      throw new Error(`receivePurchaseOrderLines/markReceived: ${upErr.message}`);
    }
    line.received_qty += qty; // keep the in-memory copy for the status recompute
  }

  // Advance status from the (now-updated) in-memory lines.
  const allReceived =
    lines.length > 0 && lines.every((l) => l.received_qty >= l.quantity);
  const anyReceived = lines.some((l) => l.received_qty > 0);
  const next: DbPurchaseOrderStatus | null = allReceived
    ? "received"
    : anyReceived
      ? "partially_received"
      : null;

  if (next && next !== header.status) {
    return setPurchaseOrderStatus(poId, next);
  }
  return header;
}

/** Delete a PO (lines cascade via FK). Returns true when a row was removed. */
export async function deletePurchaseOrder(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deletePurchaseOrder: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Insert lines (stamping purchase_order_id + sequential line_no). Skips when the
// caller supplied no lines.
async function insertLines(
  supabase: Awaited<ReturnType<typeof db>>,
  poId: string,
  lines: Omit<DbPurchaseOrderLineInsert, "purchase_order_id">[]
): Promise<void> {
  if (!lines || lines.length === 0) return;
  const rows: DbPurchaseOrderLineInsert[] = lines.map((l, i) => ({
    ...l,
    purchase_order_id: poId,
    line_no: l.line_no ?? i + 1,
  }));
  const { error } = await supabase.from("purchase_order_lines").insert(rows);
  if (error) throw new Error(`insertLines: ${error.message}`);
}
