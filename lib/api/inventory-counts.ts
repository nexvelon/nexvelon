import "server-only";

// INV-9-2 (Part B) — cycle-count sessions. A count session snapshots the EXPECTED
// on-hand at a scope (a stock location and/or a product category), a counter
// enters a BLIND physical count per line, variances are reviewed, and applying
// the session posts the corrections through the existing adjustStockQuantity
// ledger primitive (so every correction lands on the append-only movement log
// with a reason, exactly like a manual adjustment).
//
// GRAIN: one line PER STOCK ROW (each carries stock_id). Specific-identification
// cost (every inventory_stock row owns its unit_cost) + a per-row apply primitive
// make this the honest grain — no invented allocation across lots, no guessed
// cost for "found" units. Serialized units are qty-1 rows; a bulk lot is one row.
//
// CRITICAL RULE: an UNCOUNTED line (counted_qty IS NULL) is SKIPPED on apply, not
// treated as "0 found". Only lines the counter actually entered are posted.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { adjustStockQuantity } from "@/lib/api/stock-movements";
import { businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import type {
  DbCountLine,
  DbCountLineInsert,
  DbCountSession,
  DbCountSessionStatus,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export class CountError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CountError";
    this.code = code;
  }
}

export interface CreateCountSessionInput {
  locationId?: string | null;
  categoryId?: string | null;
  countedBy?: string | null;
  notes?: string | null;
  actorId: string | null;
}

// Snapshot the expected on-hand and open a session. Scope = a location and/or a
// category; both null = every physically-located in_stock row. Rows deployed to
// a job (current_cost_center_id set) are NEVER counted here — a cycle count is a
// warehouse/truck stock-take, not a job audit.
export async function createCountSession(
  input: CreateCountSessionInput
): Promise<DbCountSession> {
  const supabase = await db();

  const { data: refData, error: refErr } = await supabase.rpc("next_count_reference");
  if (refErr) throw new Error(`createCountSession/ref: ${refErr.message}`);
  const reference = refData as string;

  // Candidate physical stock at the scope.
  let stockQuery = supabase
    .from("inventory_stock")
    .select("id, product_id, quantity, unit_cost, serial_number, current_location_id, current_cost_center_id, status")
    .eq("status", "in_stock")
    .is("current_cost_center_id", null);
  if (input.locationId) stockQuery = stockQuery.eq("current_location_id", input.locationId);
  const { data: stockData, error: sErr } = await stockQuery;
  if (sErr) throw new Error(`createCountSession/stock: ${sErr.message}`);
  let rows = (stockData ?? []) as {
    id: string;
    product_id: string;
    quantity: number | null;
    unit_cost: number | null;
    serial_number: string | null;
    current_location_id: string | null;
  }[];
  // Only physically-located rows (defensive — in_stock rows should have a location).
  rows = rows.filter((r) => r.current_location_id != null);

  // Product metadata (name/sku/category) for snapshotting + the category filter.
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const productById = new Map<
    string,
    { name: string; sku: string; category_id: string | null }
  >();
  if (productIds.length > 0) {
    const { data: prodData, error: pErr } = await supabase
      .from("inventory_products")
      .select("id, name, sku, category_id")
      .in("id", productIds);
    if (pErr) throw new Error(`createCountSession/products: ${pErr.message}`);
    for (const p of (prodData ?? []) as {
      id: string;
      name: string;
      sku: string;
      category_id: string | null;
    }[]) {
      productById.set(p.id, { name: p.name, sku: p.sku, category_id: p.category_id });
    }
  }
  if (input.categoryId) {
    rows = rows.filter(
      (r) => productById.get(r.product_id)?.category_id === input.categoryId
    );
  }

  // Insert the session.
  const { data: sessData, error: insErr } = await supabase
    .from("inventory_count_sessions")
    .insert({
      reference,
      location_id: input.locationId ?? null,
      category_id: input.categoryId ?? null,
      status: "open",
      counted_by: input.countedBy ?? null,
      notes: input.notes ?? null,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (insErr) throw new Error(`createCountSession/session: ${insErr.message}`);
  const session = sessData as DbCountSession;

  // Snapshot expected — one line per stock row.
  if (rows.length > 0) {
    const lines: DbCountLineInsert[] = rows.map((r) => {
      const p = productById.get(r.product_id);
      return {
        session_id: session.id,
        product_id: r.product_id,
        stock_id: r.id,
        product_label: p?.name ?? null,
        sku_snapshot: p?.sku ?? null,
        serial_snapshot: r.serial_number,
        unit_cost_snapshot: r.unit_cost,
        expected_qty: Number(r.quantity ?? 0),
        counted_qty: null,
      };
    });
    const { error: lErr } = await supabase.from("inventory_count_lines").insert(lines);
    if (lErr) throw new Error(`createCountSession/lines: ${lErr.message}`);
  }

  return session;
}

export async function listCountSessions(): Promise<DbCountSession[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_count_sessions")
    .select("*")
    .order("opened_at", { ascending: false });
  if (error) throw new Error(`listCountSessions: ${error.message}`);
  return (data ?? []) as DbCountSession[];
}

export async function getCountSession(
  sessionId: string
): Promise<{ session: DbCountSession; lines: DbCountLine[] } | null> {
  const supabase = await db();
  const { data: s, error: sErr } = await supabase
    .from("inventory_count_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) throw new Error(`getCountSession: ${sErr.message}`);
  if (!s) return null;
  const { data: lines, error: lErr } = await supabase
    .from("inventory_count_lines")
    .select("*")
    .eq("session_id", sessionId)
    .order("product_label", { ascending: true });
  if (lErr) throw new Error(`getCountSession/lines: ${lErr.message}`);
  return { session: s as DbCountSession, lines: (lines ?? []) as DbCountLine[] };
}

async function loadSession(
  supabase: Awaited<ReturnType<typeof db>>,
  sessionId: string
): Promise<DbCountSession> {
  const { data, error } = await supabase
    .from("inventory_count_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`loadSession: ${error.message}`);
  if (!data) throw new CountError("not_found", "Count session not found.");
  return data as DbCountSession;
}

function assertStatus(session: DbCountSession, allowed: DbCountSessionStatus[]) {
  if (!allowed.includes(session.status)) {
    throw new CountError(
      "bad_status",
      `Can't do that on a ${session.status} count session.`
    );
  }
}

// Enter a blind physical count for one line. Moves the session open → counting.
export async function enterCount(input: {
  lineId: string;
  countedQty: number | null;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  if (input.countedQty != null && (!Number.isFinite(input.countedQty) || input.countedQty < 0)) {
    throw new CountError("invalid_qty", "Counted quantity must be zero or greater.");
  }

  const { data: line, error: lErr } = await supabase
    .from("inventory_count_lines")
    .select("id, session_id")
    .eq("id", input.lineId)
    .maybeSingle();
  if (lErr) throw new Error(`enterCount/line: ${lErr.message}`);
  if (!line) throw new CountError("not_found", "Count line not found.");

  const session = await loadSession(supabase, (line as { session_id: string }).session_id);
  assertStatus(session, ["open", "counting"]);

  const { error: upErr } = await supabase
    .from("inventory_count_lines")
    .update({ counted_qty: input.countedQty })
    .eq("id", input.lineId);
  if (upErr) throw new Error(`enterCount: ${upErr.message}`);

  if (session.status === "open") {
    await supabase
      .from("inventory_count_sessions")
      .update({ status: "counting", updated_by: input.actorId })
      .eq("id", session.id);
  }
}

// Stamp variance on every counted line and move the session to 'review'.
export async function submitForReview(
  sessionId: string,
  actorId: string | null
): Promise<void> {
  const supabase = await db();
  const session = await loadSession(supabase, sessionId);
  assertStatus(session, ["open", "counting"]);

  const { data: lines, error } = await supabase
    .from("inventory_count_lines")
    .select("id, expected_qty, counted_qty, unit_cost_snapshot")
    .eq("session_id", sessionId);
  if (error) throw new Error(`submitForReview/lines: ${error.message}`);

  for (const l of (lines ?? []) as {
    id: string;
    expected_qty: number;
    counted_qty: number | null;
    unit_cost_snapshot: number | null;
  }[]) {
    if (l.counted_qty == null) continue; // uncounted — leave variance null
    const vQty = round2(Number(l.counted_qty) - Number(l.expected_qty));
    const vVal = round2(vQty * Number(l.unit_cost_snapshot ?? 0));
    await supabase
      .from("inventory_count_lines")
      .update({ variance_qty: vQty, variance_value: vVal })
      .eq("id", l.id);
  }

  await supabase
    .from("inventory_count_sessions")
    .update({ status: "review", updated_by: actorId })
    .eq("id", sessionId);
}

export interface ApplyCountResult {
  applied: number; // lines whose correction posted (incl. no-op zero-variance)
  adjusted: number; // lines that actually moved stock
  skipped_uncounted: number; // counted_qty null → never touched
  failed: number; // adjustment threw (recorded, did not abort)
}

// Apply the count: post an adjustment for each COUNTED line whose count differs
// from expected, bringing that stock row to the counted qty. Best-effort (§2.8):
// a single line's failure is logged and recorded, never aborts the rest.
export async function applyCount(input: {
  sessionId: string;
  actorId: string | null;
}): Promise<ApplyCountResult> {
  const supabase = await db();
  const session = await loadSession(supabase, input.sessionId);
  assertStatus(session, ["review"]);

  const { data: lineData, error } = await supabase
    .from("inventory_count_lines")
    .select("id, stock_id, expected_qty, counted_qty, unit_cost_snapshot")
    .eq("session_id", input.sessionId);
  if (error) throw new Error(`applyCount/lines: ${error.message}`);
  const lines = (lineData ?? []) as {
    id: string;
    stock_id: string | null;
    expected_qty: number;
    counted_qty: number | null;
    unit_cost_snapshot: number | null;
  }[];

  const result: ApplyCountResult = {
    applied: 0,
    adjusted: 0,
    skipped_uncounted: 0,
    failed: 0,
  };

  for (const l of lines) {
    // THE critical rule: an uncounted line is not "0 found" — skip it entirely.
    if (l.counted_qty == null) {
      result.skipped_uncounted += 1;
      continue;
    }
    const counted = Number(l.counted_qty);
    const vQty = round2(counted - Number(l.expected_qty));
    const vVal = round2(vQty * Number(l.unit_cost_snapshot ?? 0));

    if (vQty === 0 || !l.stock_id) {
      // Nothing to correct (matches expected, or no row to adjust) — reconciled.
      await supabase
        .from("inventory_count_lines")
        .update({ variance_qty: vQty, variance_value: vVal, applied: true })
        .eq("id", l.id);
      result.applied += 1;
      continue;
    }

    try {
      await adjustStockQuantity(l.stock_id, counted, `Cycle count ${session.reference}`);
      await supabase
        .from("inventory_count_lines")
        .update({ variance_qty: vQty, variance_value: vVal, applied: true })
        .eq("id", l.id);
      result.applied += 1;
      result.adjusted += 1;
    } catch (e) {
      console.warn(`[inventory-counts] apply failed for line ${l.id}:`, e);
      await supabase
        .from("inventory_count_lines")
        .update({ variance_qty: vQty, variance_value: vVal, applied: false })
        .eq("id", l.id);
      result.failed += 1;
    }
  }

  // Session is 'applied' even on a partial apply — the record reflects what ran.
  await supabase
    .from("inventory_count_sessions")
    .update({
      status: "applied",
      applied_at: businessDateISO(),
      applied_by: input.actorId,
      updated_by: input.actorId,
    })
    .eq("id", input.sessionId);

  return result;
}

// Cancel a session — no stock is touched.
export async function cancelCount(
  sessionId: string,
  actorId: string | null
): Promise<void> {
  const supabase = await db();
  const session = await loadSession(supabase, sessionId);
  assertStatus(session, ["open", "counting", "review"]);
  await supabase
    .from("inventory_count_sessions")
    .update({ status: "cancelled", updated_by: actorId })
    .eq("id", sessionId);
}

export interface CountVarianceSummary {
  total_lines: number;
  counted_lines: number;
  uncounted_lines: number;
  net_variance_qty: number;
  net_variance_value: number;
  over_lines: number; // counted > expected
  short_lines: number; // counted < expected
}

export async function getCountVarianceSummary(
  sessionId: string
): Promise<CountVarianceSummary> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_count_lines")
    .select("expected_qty, counted_qty, unit_cost_snapshot")
    .eq("session_id", sessionId);
  if (error) throw new Error(`getCountVarianceSummary: ${error.message}`);
  const lines = (data ?? []) as {
    expected_qty: number;
    counted_qty: number | null;
    unit_cost_snapshot: number | null;
  }[];

  const summary: CountVarianceSummary = {
    total_lines: lines.length,
    counted_lines: 0,
    uncounted_lines: 0,
    net_variance_qty: 0,
    net_variance_value: 0,
    over_lines: 0,
    short_lines: 0,
  };
  for (const l of lines) {
    if (l.counted_qty == null) {
      summary.uncounted_lines += 1;
      continue;
    }
    summary.counted_lines += 1;
    const vQty = round2(Number(l.counted_qty) - Number(l.expected_qty));
    summary.net_variance_qty = round2(summary.net_variance_qty + vQty);
    summary.net_variance_value = round2(
      summary.net_variance_value + vQty * Number(l.unit_cost_snapshot ?? 0)
    );
    if (vQty > 0) summary.over_lines += 1;
    else if (vQty < 0) summary.short_lines += 1;
  }
  return summary;
}
