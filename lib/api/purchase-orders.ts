import "server-only";

// PO-2 — server-only purchase-orders API (public.purchase_orders +
// purchase_order_lines, migration 0031). Mirrors the clients/vendors posture:
// cookie-aware server client (RLS enforced), created_by/updated_by from the auth
// uid. Lines are full-replaced on update — acceptable for DRAFT POs; the PO-4
// receiving flow (received_qty) will introduce non-destructive line handling.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessPONumber } from "@/lib/format";
import type {
  DbPurchaseOrder,
  DbPurchaseOrderInsert,
  DbPurchaseOrderLine,
  DbPurchaseOrderLineInsert,
  DbPurchaseOrderUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** A list row: the header + vendor name + computed total + line count. */
export interface PurchaseOrderListRow extends DbPurchaseOrder {
  vendor_name: string;
  total: number;
  line_count: number;
}

/** A line enriched with the product name (when product_id is set). */
export interface PurchaseOrderLineWithProduct extends DbPurchaseOrderLine {
  product_name: string | null;
  product_sku: string | null;
}

/** Detail: the header + vendor name + ordered enriched lines. */
export interface PurchaseOrderDetail {
  header: DbPurchaseOrder & { vendor_name: string };
  lines: PurchaseOrderLineWithProduct[];
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
  const productMap = new Map<string, { name: string; sku: string }>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("inventory_products")
      .select("id, name, sku")
      .in("id", productIds);
    for (const p of products ?? []) {
      productMap.set(p.id as string, {
        name: p.name as string,
        sku: p.sku as string,
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
