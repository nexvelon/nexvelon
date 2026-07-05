import "server-only";

// INV-3 — pickup-slip data layer (migration 0078). A pickup slip is a signed
// artifact for stock issued warehouse → truck (or → a tech/sub). Header +
// snapshotted lines are written here; the PDF render + upload live in the
// server action (mirroring PO-4). Lines snapshot product name/sku/serial at
// creation so a later rename/delete never rewrites an issued slip.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getQuoteTemplate } from "@/lib/company-profile";
import type {
  DbPickupSlip,
  DbPickupSlipLine,
  PickupSlipRecipientType,
} from "@/lib/types/database";
import type { PickupSlipDocumentProps } from "@/components/modules/inventory/PickupSlipDocument";

async function db() {
  return createSupabaseServerClient();
}

export interface CreatePickupSlipInput {
  recipientType: PickupSlipRecipientType;
  recipientId?: string | null;
  recipientName: string;
  notes?: string | null;
  issuedById?: string | null;
  issuedByName?: string | null;
  stockAssignments: { stockId: string; quantity: number; movementId?: string | null }[];
}

export interface PickupSlipDetail {
  header: DbPickupSlip;
  lines: DbPickupSlipLine[];
}

/**
 * Mint the next slip number for the current year: 'PS-YYYY-NNNN'. Queries the
 * highest existing number this year and increments; the UNIQUE constraint on
 * slip_number is the backstop against a race.
 */
async function nextSlipNumber(
  supabase: Awaited<ReturnType<typeof db>>,
  year: number
): Promise<string> {
  const prefix = `PS-${year}-`;
  const { data, error } = await supabase
    .from("pickup_slips")
    .select("slip_number")
    .like("slip_number", `${prefix}%`)
    .order("slip_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextSlipNumber: ${error.message}`);

  let next = 1;
  const last = (data ?? [])[0]?.slip_number as string | undefined;
  if (last) {
    const n = parseInt(last.slice(prefix.length), 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createPickupSlip(
  input: CreatePickupSlipInput
): Promise<{ slipId: string; slipNumber: string }> {
  if (input.stockAssignments.length === 0) {
    throw new Error("A pickup slip needs at least one stock line.");
  }
  const supabase = await db();

  // Snapshot each assignment from the current stock row + its product.
  const stockIds = input.stockAssignments.map((a) => a.stockId);
  const { data: stockRows, error: stockErr } = await supabase
    .from("inventory_stock")
    .select(
      "id, product_id, serial_number, product:inventory_products(name, sku)"
    )
    .in("id", stockIds);
  if (stockErr) throw new Error(`createPickupSlip/stock: ${stockErr.message}`);

  type Row = {
    id: string;
    product_id: string;
    serial_number: string | null;
    product: { name: string; sku: string } | null;
  };
  const byStock = new Map<string, Row>(
    ((stockRows ?? []) as unknown as Row[]).map((r) => [r.id, r])
  );
  for (const id of stockIds) {
    if (!byStock.has(id)) throw new Error(`Stock unit ${id} not found.`);
  }

  const year = new Date().getFullYear();
  const slipNumber = await nextSlipNumber(supabase, year);

  const { data: slip, error: insErr } = await supabase
    .from("pickup_slips")
    .insert({
      slip_number: slipNumber,
      issued_by: input.issuedById ?? null,
      issued_by_name: input.issuedByName ?? null,
      recipient_type: input.recipientType,
      recipient_id: input.recipientId ?? null,
      recipient_name: input.recipientName,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`createPickupSlip/header: ${insErr.message}`);
  const slipId = (slip as { id: string }).id;

  const lines = input.stockAssignments.map((a, i) => {
    const row = byStock.get(a.stockId)!;
    return {
      pickup_slip_id: slipId,
      stock_id: a.stockId,
      product_id: row.product_id,
      product_name: row.product?.name ?? "—",
      product_sku: row.product?.sku ?? "—",
      serial_number: row.serial_number,
      quantity: a.quantity,
      line_no: i + 1,
      movement_id: a.movementId ?? null,
    };
  });
  const { error: lineErr } = await supabase
    .from("pickup_slip_lines")
    .insert(lines);
  if (lineErr) {
    // Roll back the orphaned header so a failed line insert never leaves a
    // slip with no lines (best-effort; header delete cascades nothing yet).
    await supabase.from("pickup_slips").delete().eq("id", slipId);
    throw new Error(`createPickupSlip/lines: ${lineErr.message}`);
  }

  return { slipId, slipNumber };
}

export async function getPickupSlipById(
  id: string
): Promise<PickupSlipDetail | null> {
  const supabase = await db();
  const { data: header, error: hErr } = await supabase
    .from("pickup_slips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (hErr) throw new Error(`getPickupSlipById/header: ${hErr.message}`);
  if (!header) return null;

  const { data: lines, error: lErr } = await supabase
    .from("pickup_slip_lines")
    .select("*")
    .eq("pickup_slip_id", id)
    .order("line_no", { ascending: true });
  if (lErr) throw new Error(`getPickupSlipById/lines: ${lErr.message}`);

  return {
    header: header as DbPickupSlip,
    lines: (lines ?? []) as DbPickupSlipLine[],
  };
}

/** Assemble PickupSlipDocumentProps for PDF rendering. Opco branding is the
 *  Integrated Solutions letterhead (same source as the PO PDF). */
export async function buildPickupSlipPdfProps(
  id: string
): Promise<PickupSlipDocumentProps> {
  const detail = await getPickupSlipById(id);
  if (!detail) throw new Error("Pickup slip not found");
  const { header, lines } = detail;

  const t = getQuoteTemplate("integrated_solutions");
  const opco: PickupSlipDocumentProps["opco"] = {
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
  };

  return {
    slip: {
      slip_number: header.slip_number,
      issued_at: header.issued_at,
      issued_by_name: header.issued_by_name ?? "—",
      recipient_type: (header.recipient_type as PickupSlipRecipientType) ?? "truck",
      recipient_name: header.recipient_name,
      signature_data_url: header.signature_data_url,
      signature_captured_at: header.signature_captured_at,
      notes: header.notes,
    },
    lines: lines.map((l) => ({
      line_no: l.line_no,
      product_sku: l.product_sku,
      product_name: l.product_name,
      serial_number: l.serial_number,
      quantity: l.quantity,
    })),
    opco,
  };
}

export async function attachSignatureToPickupSlip(input: {
  slipId: string;
  signatureDataUrl: string;
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("pickup_slips")
    .update({
      signature_data_url: input.signatureDataUrl,
      signature_captured_at: new Date().toISOString(),
    })
    .eq("id", input.slipId);
  if (error) throw new Error(`attachSignatureToPickupSlip: ${error.message}`);
}

/** Persist the storage path of a rendered slip PDF. */
export async function setPickupSlipPdfPath(
  slipId: string,
  pdfPath: string
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("pickup_slips")
    .update({ pdf_path: pdfPath })
    .eq("id", slipId);
  if (error) throw new Error(`setPickupSlipPdfPath: ${error.message}`);
}

/** Optional: recent pickup slips for a recipient (e.g. a truck panel). */
export async function listPickupSlipsForRecipient(input: {
  recipientType: PickupSlipRecipientType;
  recipientId: string;
}): Promise<DbPickupSlip[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("pickup_slips")
    .select("*")
    .eq("recipient_type", input.recipientType)
    .eq("recipient_id", input.recipientId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(`listPickupSlipsForRecipient: ${error.message}`);
  return (data ?? []) as DbPickupSlip[];
}
