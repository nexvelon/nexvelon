import "server-only";

// INV-9-1 — vendor performance metrics for the vendor detail page. One read that
// derives, from data we already keep, a supplier scorecard:
//
//   ytd_spend / spend_by_month  — Σ vendor_bills.subtotal (PRE-TAX, mirroring
//        FIN-5 / the rollup's billed_cost basis) for the selected year. Void
//        bills never count.
//   fill_rate                   — Σ received_qty / Σ quantity over the vendor's
//        RECEIVABLE (catalog) PO lines on actually-ordered POs.
//   price_variance              — billed subtotal vs the PO's expected line value
//        (qty × unit_cost), matched by vendor_bills.purchase_order_id → the PO.
//   top_parts                   — the vendor's catalog lines ranked by ordered
//        value (qty × unit_cost). PO-derived, since bills are header-level (no
//        line detail), so this is "what we buy most from them", all-time.
//   on_time / avg_lead_time     — need a RECEIPT DATE, added in migration 0109
//        (last_received_at per line, fully_received_at per PO). Computed only over
//        POs received AFTER 0109 shipped; `metrics_since` is the earliest such
//        receipt so the UI can scope the claim honestly.
//
// HONESTY (same stance as INV-9-0): any metric with no dated/derivable data
// returns NULL — never a fabricated 0% or 100%. The UI shows "Not enough data
// yet" for a null. Historical POs received before 0109 have no receipt date and
// are simply absent from on-time / lead-time (no backfill, no invented dates).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";

async function db() {
  return createSupabaseServerClient();
}

// PO statuses that represent an order actually placed with the vendor (draft is
// not yet ordered; cancelled never shipped). Fill-rate / PO counts use these.
const ORDERED_STATUSES = new Set([
  "issued",
  "partially_received",
  "received",
  "closed",
]);

export interface VendorMetrics {
  vendor_id: string;
  year: number;
  ytd_spend: number;
  spend_by_month: { month: number; amount: number }[]; // month 1..12
  po_count: number; // ordered POs, all-time
  bill_count: number; // non-void bills in the selected year
  on_time: { received_pos: number; on_time_pos: number; pct: number | null };
  avg_lead_time_days: number | null;
  fill_rate: { ordered: number; received: number; pct: number | null };
  price_variance: { pct: number | null; amount: number; matched_pos: number };
  top_parts: { product_id: string; name: string; qty: number; spend: number }[];
  metrics_since: string | null; // earliest dated receipt, or null when none yet
}

// Earliest of an accumulating (nullable) date and a concrete one.
function minDate(acc: string | null, next: string): string {
  return acc != null && acc <= next ? acc : next;
}

function daysBetween(fromISODate: string, toISODate: string): number {
  const a = Date.parse(`${fromISODate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISODate.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export async function getVendorMetrics(
  vendorId: string,
  opts: { year?: number } = {}
): Promise<VendorMetrics> {
  const supabase = await db();
  const year = opts.year ?? new Date().getFullYear();

  // ── Bills (all-time, non-void). Year scoping + PO matching done in JS. ──
  const { data: billData, error: bErr } = await supabase
    .from("vendor_bills")
    .select("subtotal, bill_date, status, purchase_order_id")
    .eq("vendor_id", vendorId)
    .neq("status", "void");
  if (bErr) throw new Error(`getVendorMetrics/bills: ${bErr.message}`);
  const bills = (billData ?? []) as {
    subtotal: number | null;
    bill_date: string | null;
    purchase_order_id: string | null;
  }[];

  let ytdSpend = 0;
  let billCount = 0;
  const monthly = new Array(12).fill(0) as number[];
  const billedByPo: Record<string, number> = {};
  for (const b of bills) {
    const amt = Number(b.subtotal ?? 0);
    if (b.bill_date && b.bill_date.slice(0, 4) === String(year)) {
      ytdSpend = round2(ytdSpend + amt);
      billCount += 1;
      const m = Number(b.bill_date.slice(5, 7)); // 01..12
      if (m >= 1 && m <= 12) monthly[m - 1] = round2(monthly[m - 1] + amt);
    }
    if (b.purchase_order_id) {
      billedByPo[b.purchase_order_id] = round2(
        (billedByPo[b.purchase_order_id] ?? 0) + amt
      );
    }
  }

  // ── Purchase orders for this vendor. ──
  const { data: poData, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, status, issued_at, expected_date, fully_received_at")
    .eq("vendor_id", vendorId);
  if (poErr) throw new Error(`getVendorMetrics/pos: ${poErr.message}`);
  const pos = (poData ?? []) as {
    id: string;
    status: string;
    issued_at: string | null;
    expected_date: string | null;
    fully_received_at: string | null;
  }[];
  const orderedPos = pos.filter((p) => ORDERED_STATUSES.has(p.status));

  // On-time + lead time — only over POs with a stamped receipt date (0109+).
  let receivedPos = 0;
  let onTimePos = 0;
  let leadSum = 0;
  let leadN = 0;
  let earliestReceipt: string | null = null;
  for (const p of pos) {
    if (p.fully_received_at) {
      earliestReceipt = minDate(earliestReceipt, p.fully_received_at);
      if (p.expected_date) {
        receivedPos += 1;
        if (p.fully_received_at <= p.expected_date) onTimePos += 1;
      }
      if (p.issued_at) {
        leadSum += daysBetween(p.issued_at, p.fully_received_at);
        leadN += 1;
      }
    }
  }

  // ── PO lines — fill rate, price-variance expected, top parts. ──
  const poIds = pos.map((p) => p.id);
  const orderedPoIds = new Set(orderedPos.map((p) => p.id));
  let fillOrdered = 0;
  let fillReceived = 0;
  const expectedByPo: Record<string, number> = {};
  const partAgg = new Map<string, { qty: number; spend: number }>();
  if (poIds.length > 0) {
    const { data: lineData, error: lErr } = await supabase
      .from("purchase_order_lines")
      .select("purchase_order_id, product_id, quantity, unit_cost, received_qty, last_received_at")
      .in("purchase_order_id", poIds);
    if (lErr) throw new Error(`getVendorMetrics/lines: ${lErr.message}`);
    const lines = (lineData ?? []) as {
      purchase_order_id: string;
      product_id: string | null;
      quantity: number | null;
      unit_cost: number | null;
      received_qty: number | null;
      last_received_at: string | null;
    }[];
    for (const l of lines) {
      const qty = Number(l.quantity ?? 0);
      const cost = Number(l.unit_cost ?? 0);
      const recv = Number(l.received_qty ?? 0);
      const lineValue = round2(qty * cost);
      // Expected PO value (all lines, matched against bills for variance).
      expectedByPo[l.purchase_order_id] = round2(
        (expectedByPo[l.purchase_order_id] ?? 0) + lineValue
      );
      // Fill rate: receivable (catalog) lines on actually-ordered POs only.
      if (l.product_id && orderedPoIds.has(l.purchase_order_id)) {
        fillOrdered += qty;
        fillReceived += recv;
        const agg = partAgg.get(l.product_id) ?? { qty: 0, spend: 0 };
        agg.qty += qty;
        agg.spend = round2(agg.spend + lineValue);
        partAgg.set(l.product_id, agg);
      }
      // A line receipt date also seeds metrics_since (covers partially-received
      // POs that haven't stamped a header fully_received_at yet).
      if (l.last_received_at) {
        earliestReceipt = minDate(earliestReceipt, l.last_received_at);
      }
    }
  }

  // Price variance: for POs that have at least one bill, Σ(billed − expected).
  let varAmount = 0;
  let varExpected = 0;
  let matchedPos = 0;
  for (const poId of Object.keys(billedByPo)) {
    if (!(poId in expectedByPo)) continue; // bill's PO isn't this vendor's (defensive)
    const billed = billedByPo[poId];
    const expected = expectedByPo[poId];
    varAmount = round2(varAmount + (billed - expected));
    varExpected = round2(varExpected + expected);
    matchedPos += 1;
  }

  // Top parts by ordered value.
  const productIds = [...partAgg.keys()];
  const nameById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: prodData, error: pErr } = await supabase
      .from("inventory_products")
      .select("id, name")
      .in("id", productIds);
    if (pErr) throw new Error(`getVendorMetrics/products: ${pErr.message}`);
    for (const p of (prodData ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name);
    }
  }
  const topParts = productIds
    .map((id) => ({
      product_id: id,
      name: nameById.get(id) ?? "—",
      qty: partAgg.get(id)!.qty,
      spend: partAgg.get(id)!.spend,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  return {
    vendor_id: vendorId,
    year,
    ytd_spend: ytdSpend,
    spend_by_month: monthly.map((amount, i) => ({ month: i + 1, amount })),
    po_count: orderedPos.length,
    bill_count: billCount,
    on_time: {
      received_pos: receivedPos,
      on_time_pos: onTimePos,
      pct: receivedPos > 0 ? round2((onTimePos / receivedPos) * 100) : null,
    },
    avg_lead_time_days: leadN > 0 ? Math.round((leadSum / leadN) * 10) / 10 : null,
    fill_rate: {
      ordered: fillOrdered,
      received: fillReceived,
      pct: fillOrdered > 0 ? round2((fillReceived / fillOrdered) * 100) : null,
    },
    price_variance: {
      amount: varAmount,
      pct: varExpected > 0 ? round2((varAmount / varExpected) * 100) : null,
      matched_pos: matchedPos,
    },
    top_parts: topParts,
    metrics_since: earliestReceipt,
  };
}

// INV-9-1 — the calendar years in which this vendor has non-void bills, newest
// first, for the Performance year selector. Always includes the current year so
// the selector is never empty.
export async function getVendorMetricYears(vendorId: string): Promise<number[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("bill_date, status")
    .eq("vendor_id", vendorId)
    .neq("status", "void");
  if (error) throw new Error(`getVendorMetricYears: ${error.message}`);
  const years = new Set<number>([new Date().getFullYear()]);
  for (const r of (data ?? []) as { bill_date: string | null }[]) {
    if (r.bill_date) {
      const y = Number(r.bill_date.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
  }
  return [...years].sort((a, b) => b - a);
}
