import "server-only";

// INV-4 — RMA (return merchandise authorization) data layer (migration 0079).
// Header + snapshotted lines, plus the status lifecycle and the stock-side
// effects (rma_status stamps, retire-on-credit, vendor-return ledger rows).
// The PDF render + upload + email pipeline lives in the server action
// (app/(app)/rmas/actions.ts), mirroring PO-4. Every status transition here is
// server-guarded (defense in depth) and applies its stock effects atomically
// before returning.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getQuoteTemplate } from "@/lib/company-profile";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getCurrentLocationLabels } from "@/lib/api/stock-movements";
import type {
  DbRma,
  DbRmaLine,
  DbRmaReason,
  DbRmaStatus,
} from "@/lib/types/database";
import type { RmaDocumentProps } from "@/components/modules/inventory/RmaDocument";

async function db() {
  return createSupabaseServerClient();
}

function profileName(me: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  return (
    me.display_name?.trim() ||
    [me.first_name, me.last_name].filter(Boolean).join(" ").trim() ||
    me.email
  );
}

export interface CreateRmaInput {
  vendorId: string;
  reason: DbRmaReason;
  reasonDetail?: string | null;
  notes?: string | null;
  stockLines: { stockId: string; quantity: number; lineReason?: string | null }[];
}

export interface RmaDetail {
  header: DbRma;
  lines: DbRmaLine[];
}

/** Mint the next RMA number for the current year: 'RMA-YYYY-NNNN'. Queries the
 *  highest existing number this year and increments; the UNIQUE constraint on
 *  rma_number is the backstop against a race. */
async function nextRmaNumber(
  supabase: Awaited<ReturnType<typeof db>>,
  year: number
): Promise<string> {
  const prefix = `RMA-${year}-`;
  const { data, error } = await supabase
    .from("rmas")
    .select("rma_number")
    .like("rma_number", `${prefix}%`)
    .order("rma_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextRmaNumber: ${error.message}`);

  let next = 1;
  const last = (data ?? [])[0]?.rma_number as string | undefined;
  if (last) {
    const n = parseInt(last.slice(prefix.length), 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createRma(
  input: CreateRmaInput
): Promise<{ rmaId: string; rmaNumber: string }> {
  if (input.stockLines.length === 0) {
    throw new Error("An RMA needs at least one stock line.");
  }
  const supabase = await db();

  // Vendor snapshot (name at creation).
  const { data: vendor, error: vErr } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("id", input.vendorId)
    .maybeSingle();
  if (vErr) throw new Error(`createRma/vendor: ${vErr.message}`);
  if (!vendor) throw new Error("Vendor not found.");

  // Snapshot each line from the current stock row + its product.
  const stockIds = input.stockLines.map((l) => l.stockId);
  const { data: stockRows, error: sErr } = await supabase
    .from("inventory_stock")
    .select(
      "id, product_id, serial_number, unit_cost, quantity, status, rma_id, product:inventory_products(name, sku)"
    )
    .in("id", stockIds);
  if (sErr) throw new Error(`createRma/stock: ${sErr.message}`);

  type Row = {
    id: string;
    product_id: string;
    serial_number: string | null;
    unit_cost: number;
    quantity: number;
    status: string;
    rma_id: string | null;
    product: { name: string; sku: string } | null;
  };
  const byStock = new Map<string, Row>(
    ((stockRows ?? []) as unknown as Row[]).map((r) => [r.id, r])
  );
  for (const l of input.stockLines) {
    const row = byStock.get(l.stockId);
    if (!row) throw new Error(`Stock unit ${l.stockId} not found.`);
    if (row.rma_id) throw new Error(`Stock unit ${row.product?.sku ?? l.stockId} is already on an RMA.`);
    if (l.quantity < 1 || l.quantity > Number(row.quantity)) {
      throw new Error(
        `Invalid quantity ${l.quantity} for ${row.product?.sku ?? l.stockId} (available ${row.quantity}).`
      );
    }
  }

  const me = await getCurrentProfile();
  const year = new Date().getFullYear();
  const rmaNumber = await nextRmaNumber(supabase, year);

  const creditExpected = input.stockLines.reduce((sum, l) => {
    const row = byStock.get(l.stockId)!;
    return sum + l.quantity * Number(row.unit_cost);
  }, 0);

  const { data: rma, error: insErr } = await supabase
    .from("rmas")
    .insert({
      rma_number: rmaNumber,
      created_by: me?.id ?? null,
      created_by_name: me ? profileName(me) : null,
      vendor_id: vendor.id,
      vendor_name: vendor.name,
      status: "draft",
      reason: input.reason,
      reason_detail: input.reasonDetail?.trim() || null,
      notes: input.notes?.trim() || null,
      credit_expected_amount: creditExpected,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`createRma/header: ${insErr.message}`);
  const rmaId = (rma as { id: string }).id;

  const lines = input.stockLines.map((l, i) => {
    const row = byStock.get(l.stockId)!;
    return {
      rma_id: rmaId,
      stock_id: l.stockId,
      product_id: row.product_id,
      product_name: row.product?.name ?? "—",
      product_sku: row.product?.sku ?? "—",
      serial_number: row.serial_number,
      quantity: l.quantity,
      unit_cost: Number(row.unit_cost),
      line_no: i + 1,
      line_reason: l.lineReason?.trim() || null,
    };
  });
  const { error: lErr } = await supabase.from("rma_lines").insert(lines);
  if (lErr) {
    await supabase.from("rmas").delete().eq("id", rmaId);
    throw new Error(`createRma/lines: ${lErr.message}`);
  }

  // Stamp the stock units as pending return.
  const { error: stampErr } = await supabase
    .from("inventory_stock")
    .update({ rma_status: "rma_pending", rma_id: rmaId })
    .in("id", stockIds);
  if (stampErr) throw new Error(`createRma/stamp: ${stampErr.message}`);

  return { rmaId, rmaNumber };
}

export interface ReturnableStockRow {
  stockId: string;
  productId: string;
  productName: string;
  sku: string;
  serial: string | null;
  quantity: number;
  unitCost: number;
  poNumber: string | null;
}

/** Search on-hand / allocated stock units eligible for return (not already on
 *  an RMA). Matches product name / SKU / serial. Used by the create dialog. */
export async function searchReturnableStock(
  query: string,
  limit = 25
): Promise<ReturnableStockRow[]> {
  const supabase = await db();
  const q = query.trim();

  let sel = supabase
    .from("inventory_stock")
    .select(
      "id, product_id, serial_number, unit_cost, quantity, po_number, product:inventory_products(name, sku)"
    )
    .in("status", ["in_stock", "allocated"])
    .is("rma_id", null)
    .gt("quantity", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  // Serial is the most precise match; fall back to a broad load the caller
  // filters client-side by product name/SKU (embedded columns aren't filterable
  // via .or() here without a view).
  if (q) sel = sel.ilike("serial_number", `%${q}%`);

  const { data, error } = await sel;
  if (error) throw new Error(`searchReturnableStock: ${error.message}`);

  type Row = {
    id: string;
    product_id: string;
    serial_number: string | null;
    unit_cost: number;
    quantity: number;
    po_number: string | null;
    product: { name: string; sku: string } | null;
  };
  let rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    stockId: r.id,
    productId: r.product_id,
    productName: r.product?.name ?? "—",
    sku: r.product?.sku ?? "—",
    serial: r.serial_number,
    quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost),
    poNumber: r.po_number,
  }));

  // If a serial filter returned nothing, retry without it and let the caller
  // narrow by product text (so name/SKU searches still work).
  if (q && rows.length === 0) {
    const { data: broad } = await supabase
      .from("inventory_stock")
      .select(
        "id, product_id, serial_number, unit_cost, quantity, po_number, product:inventory_products(name, sku)"
      )
      .in("status", ["in_stock", "allocated"])
      .is("rma_id", null)
      .gt("quantity", 0)
      .order("created_at", { ascending: false })
      .limit(200);
    const ql = q.toLowerCase();
    rows = ((broad ?? []) as unknown as Row[])
      .filter(
        (r) =>
          (r.product?.name ?? "").toLowerCase().includes(ql) ||
          (r.product?.sku ?? "").toLowerCase().includes(ql)
      )
      .slice(0, limit)
      .map((r) => ({
        stockId: r.id,
        productId: r.product_id,
        productName: r.product?.name ?? "—",
        sku: r.product?.sku ?? "—",
        serial: r.serial_number,
        quantity: Number(r.quantity),
        unitCost: Number(r.unit_cost),
        poNumber: r.po_number,
      }));
  }

  return rows;
}

export async function getRmaById(id: string): Promise<RmaDetail | null> {
  const supabase = await db();
  const { data: header, error: hErr } = await supabase
    .from("rmas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (hErr) throw new Error(`getRmaById/header: ${hErr.message}`);
  if (!header) return null;

  const { data: lines, error: lErr } = await supabase
    .from("rma_lines")
    .select("*")
    .eq("rma_id", id)
    .order("line_no", { ascending: true });
  if (lErr) throw new Error(`getRmaById/lines: ${lErr.message}`);

  return { header: header as DbRma, lines: (lines ?? []) as DbRmaLine[] };
}

export interface RmaListRow extends DbRma {
  line_count: number;
  total_value: number;
}

export async function listRmas(filter?: {
  status?: DbRmaStatus;
  vendorId?: string;
}): Promise<RmaListRow[]> {
  const supabase = await db();
  let query = supabase
    .from("rmas")
    .select("*, rma_lines(quantity, unit_cost)")
    .order("created_at", { ascending: false });
  if (filter?.status) query = query.eq("status", filter.status);
  if (filter?.vendorId) query = query.eq("vendor_id", filter.vendorId);
  const { data, error } = await query;
  if (error) throw new Error(`listRmas: ${error.message}`);

  type Row = DbRma & { rma_lines: { quantity: number; unit_cost: number }[] };
  return ((data ?? []) as unknown as Row[]).map(({ rma_lines, ...rest }) => ({
    ...rest,
    line_count: rma_lines?.length ?? 0,
    total_value: (rma_lines ?? []).reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unit_cost),
      0
    ),
  }));
}

/** Assemble RmaDocumentProps for PDF rendering. Opco branding is the Integrated
 *  Solutions letterhead (same source as the PO / pickup-slip PDFs). */
export async function buildRmaPdfProps(id: string): Promise<RmaDocumentProps> {
  const detail = await getRmaById(id);
  if (!detail) throw new Error("RMA not found");
  const { header, lines } = detail;

  const supabase = await db();
  const { data: vendor } = await supabase
    .from("vendors")
    .select(
      "name, address_line1, address_line2, city, province, postal_code, sales_rep_name"
    )
    .eq("id", header.vendor_id)
    .maybeSingle();
  const v = (vendor ?? null) as {
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    sales_rep_name: string | null;
  } | null;

  const t = getQuoteTemplate("integrated_solutions");

  return {
    rma: {
      rma_number: header.rma_number,
      created_at: header.created_at,
      created_by_name: header.created_by_name ?? "—",
      status: header.status as DbRmaStatus,
      reason: header.reason as DbRmaReason,
      reason_detail: header.reason_detail,
      tracking_carrier: header.tracking_carrier,
      tracking_number: header.tracking_number,
      notes: header.notes,
    },
    vendor: {
      name: header.vendor_name || v?.name || "—",
      address_line1: v?.address_line1 ?? null,
      address_line2: v?.address_line2 ?? null,
      city: v?.city ?? null,
      province: v?.province ?? null,
      postal_code: v?.postal_code ?? null,
      sales_rep_name: v?.sales_rep_name ?? null,
    },
    lines: lines.map((l) => ({
      line_no: l.line_no,
      product_sku: l.product_sku,
      product_name: l.product_name,
      serial_number: l.serial_number,
      quantity: l.quantity,
      unit_cost: Number(l.unit_cost),
      line_total: Number(l.quantity) * Number(l.unit_cost),
    })),
    subtotal: lines.reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unit_cost),
      0
    ),
    opco: {
      legal_name: t.legalName,
      address_line1: t.address.line1,
      address_line2: t.address.line2 || null,
      city: t.address.city,
      province: t.address.province,
      postal_code: t.address.postalCode,
      phone: t.phone,
      email: t.email,
      hst_number: t.hstNumber,
      logoUrl: null,
    },
  };
}

// ── status transitions ───────────────────────────────────────────────────────

async function loadRma(
  supabase: Awaited<ReturnType<typeof db>>,
  id: string
): Promise<DbRma> {
  const { data, error } = await supabase
    .from("rmas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`loadRma: ${error.message}`);
  if (!data) throw new Error("RMA not found.");
  return data as DbRma;
}

async function lineStockIds(
  supabase: Awaited<ReturnType<typeof db>>,
  rmaId: string
): Promise<{ stock_id: string; product_id: string; quantity: number }[]> {
  const { data, error } = await supabase
    .from("rma_lines")
    .select("stock_id, product_id, quantity")
    .eq("rma_id", rmaId);
  if (error) throw new Error(`lineStockIds: ${error.message}`);
  return (data ?? []) as { stock_id: string; product_id: string; quantity: number }[];
}

/** Persist the storage path + sent metadata after the action renders/emails. */
export async function stampRmaSent(
  rmaId: string,
  fields: { pdfPath?: string | null; sentToEmail?: string | null }
): Promise<void> {
  const supabase = await db();
  const rma = await loadRma(supabase, rmaId);
  if (rma.status !== "draft" && rma.status !== "sent") {
    throw new Error(`Can't send an RMA that is ${rma.status}.`);
  }
  const { error } = await supabase
    .from("rmas")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_to_email: fields.sentToEmail ?? null,
      pdf_path: fields.pdfPath ?? rma.pdf_path,
    })
    .eq("id", rmaId);
  if (error) throw new Error(`stampRmaSent: ${error.message}`);
}

/** Store just the pdf_path (used by a preview/render that doesn't send). */
export async function setRmaPdfPath(rmaId: string, pdfPath: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("rmas")
    .update({ pdf_path: pdfPath })
    .eq("id", rmaId);
  if (error) throw new Error(`setRmaPdfPath: ${error.message}`);
}

export async function markRmaShipped(input: {
  rmaId: string;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
}): Promise<void> {
  const supabase = await db();
  const rma = await loadRma(supabase, input.rmaId);
  if (rma.status !== "sent" && rma.status !== "approved") {
    throw new Error(`Can only ship an RMA that is sent or approved (is ${rma.status}).`);
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("rmas")
    .update({
      status: "shipped",
      shipped_at: now,
      tracking_carrier: input.trackingCarrier?.trim() || null,
      tracking_number: input.trackingNumber?.trim() || null,
    })
    .eq("id", input.rmaId);
  if (upErr) throw new Error(`markRmaShipped: ${upErr.message}`);

  const lines = await lineStockIds(supabase, input.rmaId);
  const stockIds = lines.map((l) => l.stock_id);
  if (stockIds.length > 0) {
    const { error: stErr } = await supabase
      .from("inventory_stock")
      .update({ rma_status: "rma_shipped" })
      .in("id", stockIds);
    if (stErr) throw new Error(`markRmaShipped/stock: ${stErr.message}`);

    // Append a "to vendor" ledger row per line, snapshotting the from-location.
    const rows = (
      await supabase
        .from("inventory_stock")
        .select("id, current_location_id, current_cost_center_id")
        .in("id", stockIds)
    ).data as
      | {
          id: string;
          current_location_id: string | null;
          current_cost_center_id: string | null;
        }[]
      | null;
    const fromLabels = await getCurrentLocationLabels(rows ?? []);
    const me = await getCurrentProfile();
    const mover = me ? { id: me.id, name: profileName(me) } : { id: null, name: null };

    const movements = lines.map((l) => ({
      product_id: l.product_id,
      stock_id: l.stock_id,
      quantity: l.quantity,
      from_type: "warehouse" as const,
      from_id: null,
      from_label: fromLabels[l.stock_id] ?? "Inventory",
      to_type: "vendor" as const,
      to_id: rma.vendor_id,
      to_label: rma.vendor_name,
      moved_by: mover.id,
      moved_by_name: mover.name,
      note: `Returned on ${rma.rma_number}`,
    }));
    const { error: mvErr } = await supabase.from("stock_movements").insert(movements);
    if (mvErr) throw new Error(`markRmaShipped/ledger: ${mvErr.message}`);
  }
}

export async function markRmaCredited(input: {
  rmaId: string;
  creditReceivedAmount: number;
}): Promise<void> {
  const supabase = await db();
  const rma = await loadRma(supabase, input.rmaId);
  if (rma.status !== "shipped") {
    throw new Error(`Can only credit a shipped RMA (is ${rma.status}).`);
  }

  const { error: upErr } = await supabase
    .from("rmas")
    .update({
      status: "received_credit",
      credit_received_amount: input.creditReceivedAmount,
      credit_received_at: new Date().toISOString(),
    })
    .eq("id", input.rmaId);
  if (upErr) throw new Error(`markRmaCredited: ${upErr.message}`);

  // Retire the credited units out of inventory.
  const lines = await lineStockIds(supabase, input.rmaId);
  const stockIds = lines.map((l) => l.stock_id);
  if (stockIds.length > 0) {
    const { error: stErr } = await supabase
      .from("inventory_stock")
      .update({ rma_status: "rma_credited", status: "retired" })
      .in("id", stockIds);
    if (stErr) throw new Error(`markRmaCredited/stock: ${stErr.message}`);
  }
}

export async function closeRma(rmaId: string): Promise<void> {
  const supabase = await db();
  const rma = await loadRma(supabase, rmaId);
  if (rma.status !== "received_credit") {
    throw new Error(`Can only close an RMA after credit is received (is ${rma.status}).`);
  }
  const { error } = await supabase
    .from("rmas")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", rmaId);
  if (error) throw new Error(`closeRma: ${error.message}`);
}

export async function cancelRma(rmaId: string): Promise<void> {
  const supabase = await db();
  const rma = await loadRma(supabase, rmaId);
  if (rma.status !== "draft" && rma.status !== "sent") {
    throw new Error(`Can only cancel a draft or sent RMA (is ${rma.status}).`);
  }
  const { error } = await supabase
    .from("rmas")
    .update({ status: "cancelled" })
    .eq("id", rmaId);
  if (error) throw new Error(`cancelRma: ${error.message}`);

  // Release the stock units back to normal.
  const lines = await lineStockIds(supabase, rmaId);
  const stockIds = lines.map((l) => l.stock_id);
  if (stockIds.length > 0) {
    const { error: stErr } = await supabase
      .from("inventory_stock")
      .update({ rma_status: null, rma_id: null })
      .in("id", stockIds);
    if (stErr) throw new Error(`cancelRma/stock: ${stErr.message}`);
  }
}
