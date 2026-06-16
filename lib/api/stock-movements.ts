import "server-only";

// MOVE-1 — server-only stock-movements API (public.stock_movements, migration
// 0046). The ledger is APPEND-ONLY (RLS allows SELECT + INSERT only). Every
// move records a snapshot label of both endpoints so history reads correctly
// even after a location is later renamed or deleted.
//
// moveStock relocates a stock row between a stock_location (warehouse/truck) and
// a job (project cost-center). A partial move SPLITS the source row: the source
// keeps the remainder at its current position, and a NEW row (same unit_cost)
// is created at the destination. The whole-row case just repoints the row.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getDefaultWarehouse } from "@/lib/api/stock-locations";
import { isSerializedProduct } from "@/lib/inventory-serial";
import type {
  DbInventoryStock,
  DbStockMovement,
  DbStockMovementInsert,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

function profileName(p: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full || p.email;
}

/** The current user as { id, name } for stamping movements. */
async function currentMover(): Promise<{ id: string | null; name: string | null }> {
  const me = await getCurrentProfile();
  if (!me) return { id: null, name: null };
  return { id: me.id, name: profileName(me) };
}

/** Low-level append into the ledger. */
async function recordMovement(input: DbStockMovementInsert): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("stock_movements").insert(input);
  if (error) throw new Error(`recordMovement: ${error.message}`);
}

/**
 * MOVE-1 / CHANGE 5 — append an origin movement for a freshly-created stock row
 * (receive from a PO vendor, or manual add) into the default warehouse. Called
 * by receiveStock / addManualStock so each part's history starts at its origin.
 */
export async function recordOriginMovement(input: {
  productId: string;
  stockId: string;
  quantity: number;
  fromType: "vendor" | "manual";
  fromLabel: string;
  toLocationId: string;
  toLabel: string;
  note?: string | null;
}): Promise<void> {
  const mover = await currentMover();
  await recordMovement({
    product_id: input.productId,
    stock_id: input.stockId,
    quantity: input.quantity,
    from_type: input.fromType,
    from_id: null,
    from_label: input.fromLabel,
    to_type: "warehouse",
    to_id: input.toLocationId,
    to_label: input.toLabel,
    moved_by: mover.id,
    moved_by_name: mover.name,
    note: input.note ?? null,
  });
}

// ── Label resolution ─────────────────────────────────────────────────────────

function locationLabel(loc: {
  name: string;
  location_type: string;
  holder_name: string | null;
}): string {
  if (loc.location_type === "truck" && loc.holder_name?.trim()) {
    return `${loc.name} — ${loc.holder_name.trim()}`;
  }
  return loc.name;
}

type CcLabelRow = {
  id: string;
  cc_number: string;
  name: string;
  project: { project_number: string } | null;
};

function costCenterLabel(cc: CcLabelRow): string {
  const proj = cc.project?.project_number ?? cc.cc_number;
  return `${proj} — ${cc.name}`;
}

/**
 * Resolve a human label for each stock row's CURRENT position (warehouse/truck
 * or job cost-center), keyed by stock id. Rows with neither set are omitted.
 */
export async function getCurrentLocationLabels(
  rows: { id: string; current_location_id: string | null; current_cost_center_id: string | null }[]
): Promise<Record<string, string>> {
  const supabase = await db();
  const locIds = [
    ...new Set(rows.map((r) => r.current_location_id).filter((v): v is string => !!v)),
  ];
  const ccIds = [
    ...new Set(rows.map((r) => r.current_cost_center_id).filter((v): v is string => !!v)),
  ];

  const locById = new Map<string, string>();
  if (locIds.length > 0) {
    const { data } = await supabase
      .from("stock_locations")
      .select("id, name, location_type, holder_name")
      .in("id", locIds);
    for (const l of (data ?? []) as {
      id: string;
      name: string;
      location_type: string;
      holder_name: string | null;
    }[]) {
      locById.set(l.id, locationLabel(l));
    }
  }

  const ccById = new Map<string, string>();
  if (ccIds.length > 0) {
    const { data } = await supabase
      .from("project_cost_centers")
      .select("id, cc_number, name, project:projects(project_number)")
      .in("id", ccIds);
    for (const c of (data ?? []) as unknown as CcLabelRow[]) {
      ccById.set(c.id, costCenterLabel(c));
    }
  }

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.current_cost_center_id && ccById.has(r.current_cost_center_id)) {
      out[r.id] = ccById.get(r.current_cost_center_id)!;
    } else if (r.current_location_id && locById.has(r.current_location_id)) {
      out[r.id] = locById.get(r.current_location_id)!;
    }
  }
  return out;
}

// ── Move ─────────────────────────────────────────────────────────────────────

export type MoveDestination =
  | { kind: "location"; locationId: string }
  | { kind: "job"; costCenterId: string };

export interface MoveStockInput {
  stockId: string;
  quantity: number;
  destination: MoveDestination;
  note?: string | null;
}

export interface MoveStockResult {
  movedStockId: string;
  split: boolean;
  quantity: number;
  toLabel: string;
}

export async function moveStock(input: MoveStockInput): Promise<MoveStockResult> {
  const supabase = await db();

  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Move quantity must be greater than zero.");
  }

  // Source row.
  const { data: srcRow, error: srcErr } = await supabase
    .from("inventory_stock")
    .select("*")
    .eq("id", input.stockId)
    .maybeSingle();
  if (srcErr) throw new Error(`moveStock/source: ${srcErr.message}`);
  if (!srcRow) throw new Error("Stock row not found.");
  const src = srcRow as DbInventoryStock;

  if (src.status !== "in_stock") {
    throw new Error(
      `Can't move a ${src.status.replace("_", " ")} unit — only in-stock units can be moved.`
    );
  }
  if (qty > Number(src.quantity)) {
    throw new Error(
      `Can't move ${qty} — the source only has ${Number(src.quantity)}.`
    );
  }

  // Resolve the destination snapshot + the new current_* values.
  let toType: string;
  let toId: string;
  let toLabel: string;
  let nextLocationId: string | null = null;
  let nextCostCenterId: string | null = null;

  if (input.destination.kind === "location") {
    const { data: loc, error } = await supabase
      .from("stock_locations")
      .select("id, name, location_type, holder_name")
      .eq("id", input.destination.locationId)
      .maybeSingle();
    if (error) throw new Error(`moveStock/location: ${error.message}`);
    if (!loc) throw new Error("Destination location not found.");
    const l = loc as {
      id: string;
      name: string;
      location_type: string;
      holder_name: string | null;
    };
    toType = l.location_type; // 'warehouse' | 'truck'
    toId = l.id;
    toLabel = locationLabel(l);
    nextLocationId = l.id;
  } else {
    const { data: cc, error } = await supabase
      .from("project_cost_centers")
      .select("id, cc_number, name, project:projects(project_number)")
      .eq("id", input.destination.costCenterId)
      .maybeSingle();
    if (error) throw new Error(`moveStock/job: ${error.message}`);
    if (!cc) throw new Error("Destination cost-center not found.");
    const c = cc as unknown as CcLabelRow;
    toType = "job";
    toId = c.id;
    toLabel = costCenterLabel(c);
    nextCostCenterId = c.id;
  }

  // Resolve the source's current position for the "from" snapshot.
  const from = await resolveFrom(supabase, src);

  // Apply the move.
  let movedStockId: string;
  let split: boolean;
  if (qty === Number(src.quantity)) {
    // Whole-row move — just repoint it.
    const { error } = await supabase
      .from("inventory_stock")
      .update({
        current_location_id: nextLocationId,
        current_cost_center_id: nextCostCenterId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", src.id);
    if (error) throw new Error(`moveStock/repoint: ${error.message}`);
    movedStockId = src.id;
    split = false;
  } else {
    // Partial move — split: shrink the source, create a new row at the dest
    // carrying the same unit_cost (NEVER lose cost on a split).
    const remaining = Number(src.quantity) - qty;
    const { error: shrinkErr } = await supabase
      .from("inventory_stock")
      .update({ quantity: remaining, updated_at: new Date().toISOString() })
      .eq("id", src.id);
    if (shrinkErr) throw new Error(`moveStock/shrink: ${shrinkErr.message}`);

    const { data: created, error: insErr } = await supabase
      .from("inventory_stock")
      .insert({
        product_id: src.product_id,
        unit_cost: src.unit_cost,
        quantity: qty,
        serial_number: null,
        location: src.location,
        supplier: src.supplier,
        po_number: src.po_number,
        acquired_at: src.acquired_at,
        status: "in_stock",
        current_location_id: nextLocationId,
        current_cost_center_id: nextCostCenterId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`moveStock/split: ${insErr.message}`);
    movedStockId = (created as { id: string }).id;
    split = true;
  }

  const mover = await currentMover();
  await recordMovement({
    product_id: src.product_id,
    stock_id: movedStockId,
    quantity: qty,
    from_type: from.type,
    from_id: from.id,
    from_label: from.label,
    to_type: toType,
    to_id: toId,
    to_label: toLabel,
    moved_by: mover.id,
    moved_by_name: mover.name,
    note: input.note?.trim() || null,
  });

  return { movedStockId, split, quantity: qty, toLabel };
}

async function resolveFrom(
  supabase: Awaited<ReturnType<typeof db>>,
  src: DbInventoryStock
): Promise<{ type: string | null; id: string | null; label: string | null }> {
  if (src.current_cost_center_id) {
    const { data } = await supabase
      .from("project_cost_centers")
      .select("id, cc_number, name, project:projects(project_number)")
      .eq("id", src.current_cost_center_id)
      .maybeSingle();
    if (data) {
      const c = data as unknown as CcLabelRow;
      return { type: "job", id: c.id, label: costCenterLabel(c) };
    }
  }
  if (src.current_location_id) {
    const { data } = await supabase
      .from("stock_locations")
      .select("id, name, location_type, holder_name")
      .eq("id", src.current_location_id)
      .maybeSingle();
    if (data) {
      const l = data as {
        id: string;
        name: string;
        location_type: string;
        holder_name: string | null;
      };
      return { type: l.location_type, id: l.id, label: locationLabel(l) };
    }
  }
  return { type: null, id: null, label: null };
}

// ── History ──────────────────────────────────────────────────────────────────

export async function listMovementsByProduct(
  productId: string
): Promise<DbStockMovement[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMovementsByProduct: ${error.message}`);
  return (data ?? []) as DbStockMovement[];
}

// ── CUSTODY-1 (Batch D3) ─────────────────────────────────────────────────────
// Chain-of-custody for SERIALIZED units only. Each transition updates the unit
// AND appends a custody event into the same stock_movements timeline
// (to_type='custody', to_label=the new status, note=details, quantity 1).

type UnitWithProduct = DbInventoryStock & {
  product: { is_serialized: boolean; tracking_mode: string } | null;
};

async function loadSerializedUnit(
  supabase: Awaited<ReturnType<typeof db>>,
  stockId: string
): Promise<UnitWithProduct> {
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("*, product:inventory_products(is_serialized, tracking_mode)")
    .eq("id", stockId)
    .maybeSingle();
  if (error) throw new Error(`custody/load: ${error.message}`);
  if (!data) throw new Error("Stock unit not found.");
  const unit = data as UnitWithProduct;
  if (!unit.product || !isSerializedProduct(unit.product)) {
    throw new Error("Chain-of-custody applies to serialized parts only.");
  }
  return unit;
}

/** Append a custody event into the movement timeline, capturing the unit's
 *  current position as the "from" snapshot. */
async function appendCustodyEvent(
  supabase: Awaited<ReturnType<typeof db>>,
  unit: DbInventoryStock,
  statusLabel: string,
  note: string | null
): Promise<void> {
  const from = await resolveFrom(supabase, unit);
  const mover = await currentMover();
  await recordMovement({
    product_id: unit.product_id,
    stock_id: unit.id,
    quantity: 1,
    from_type: from.type,
    from_id: from.id,
    from_label: from.label,
    to_type: "custody",
    to_id: null,
    to_label: statusLabel,
    moved_by: mover.id,
    moved_by_name: mover.name,
    note,
  });
}

export interface CustodyResult {
  custody_status: string;
}

/** Mark a delivered-to-job unit as Delivered. Only valid when the unit is on a
 *  job (current_cost_center_id set). Proof is OPTIONAL — never blocks delivery. */
export async function markDelivered(
  stockId: string,
  opts: { proofAttachmentId?: string | null } = {}
): Promise<CustodyResult> {
  const supabase = await db();
  const unit = await loadSerializedUnit(supabase, stockId);
  if (!unit.current_cost_center_id) {
    throw new Error(
      "Assign the unit to a job (cost-center) before marking it delivered."
    );
  }
  const proofId = opts.proofAttachmentId ?? null;
  const patch: Record<string, unknown> = {
    custody_status: "delivered",
    delivered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (proofId) patch.custody_proof_attachment_id = proofId;

  const { error } = await supabase
    .from("inventory_stock")
    .update(patch)
    .eq("id", stockId);
  if (error) throw new Error(`markDelivered: ${error.message}`);

  await appendCustodyEvent(
    supabase,
    unit,
    "Delivered",
    proofId ? "signed proof attached" : "no proof attached"
  );
  return { custody_status: "delivered" };
}

export async function markInstalled(stockId: string): Promise<CustodyResult> {
  const supabase = await db();
  const unit = await loadSerializedUnit(supabase, stockId);
  const { error } = await supabase
    .from("inventory_stock")
    .update({
      custody_status: "installed",
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId);
  if (error) throw new Error(`markInstalled: ${error.message}`);
  await appendCustodyEvent(supabase, unit, "Installed", null);
  return { custody_status: "installed" };
}

/** Mark a unit Lost. Snapshots its CURRENT location/holder into
 *  last_known_label so responsibility is preserved, and retires it from stock. */
export async function markLost(stockId: string): Promise<CustodyResult> {
  const supabase = await db();
  const unit = await loadSerializedUnit(supabase, stockId);
  const from = await resolveFrom(supabase, unit);
  const lastKnown = from.label ?? unit.last_known_label ?? "unknown location";

  const { error } = await supabase
    .from("inventory_stock")
    .update({
      custody_status: "lost",
      lost_at: new Date().toISOString(),
      last_known_label: lastKnown,
      // Remove a lost unit from on-hand stock rollups.
      status: "retired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId);
  if (error) throw new Error(`markLost: ${error.message}`);
  await appendCustodyEvent(supabase, unit, "Lost", `last seen ${lastKnown}`);
  return { custody_status: "lost" };
}

/** Return a unit to the Main Warehouse (reusing moveStock for the location move)
 *  and reset custody to in_stock. */
export async function markReturned(stockId: string): Promise<CustodyResult> {
  const supabase = await db();
  const unit = await loadSerializedUnit(supabase, stockId);
  const warehouse = await getDefaultWarehouse();
  if (!warehouse) throw new Error("No Main Warehouse configured.");

  // moveStock logs the location move (→ Main Warehouse). Serialized rows are
  // quantity 1, so this is always a whole-unit move (no split).
  await moveStock({
    stockId,
    quantity: Number(unit.quantity),
    destination: { kind: "location", locationId: warehouse.id },
    note: "Marked returned",
  });

  const { error } = await supabase
    .from("inventory_stock")
    .update({
      custody_status: "in_stock",
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId);
  if (error) throw new Error(`markReturned: ${error.message}`);
  await appendCustodyEvent(supabase, unit, "Returned", "returned to Main Warehouse");
  return { custody_status: "in_stock" };
}

export async function markConsumed(stockId: string): Promise<CustodyResult> {
  const supabase = await db();
  const unit = await loadSerializedUnit(supabase, stockId);
  const { error } = await supabase
    .from("inventory_stock")
    .update({
      custody_status: "consumed",
      // Mirror into the existing status so consumed units leave on-hand rollups.
      status: "consumed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId);
  if (error) throw new Error(`markConsumed: ${error.message}`);
  await appendCustodyEvent(supabase, unit, "Consumed", null);
  return { custody_status: "consumed" };
}

/** Resolve the project a unit currently sits on (via its cost-center), for the
 *  delivery-proof upload target. Null when the unit isn't on a job. */
export async function getStockProject(
  stockId: string
): Promise<{ project_id: string; project_number: string } | null> {
  const supabase = await db();
  const { data: unit, error } = await supabase
    .from("inventory_stock")
    .select("current_cost_center_id")
    .eq("id", stockId)
    .maybeSingle();
  if (error) throw new Error(`getStockProject: ${error.message}`);
  const ccId = (unit as { current_cost_center_id: string | null } | null)
    ?.current_cost_center_id;
  if (!ccId) return null;

  const { data: cc, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("project:projects(id, project_number)")
    .eq("id", ccId)
    .maybeSingle();
  if (ccErr) throw new Error(`getStockProject/cc: ${ccErr.message}`);
  const proj = (cc as unknown as {
    project: { id: string; project_number: string } | null;
  } | null)?.project;
  if (!proj) return null;
  return { project_id: proj.id, project_number: proj.project_number };
}

// ── PART-FIX-1 — manual quantity adjustment ──────────────────────────────────
// Correct a stock row's on-hand with a required reason, logged to the ledger as
// an 'adjustment' (so it shows on the Movement History timeline). Serialized
// rows are qty 1 — only setting qty 0 (to retire the unit) is permitted, never
// an arbitrary increase.

export interface AdjustResult {
  quantity: number;
  delta: number;
}

export async function adjustStockQuantity(
  stockId: string,
  newQty: number,
  reason: string
): Promise<AdjustResult> {
  const supabase = await db();

  if (!Number.isFinite(newQty) || newQty < 0) {
    throw new Error("New quantity must be zero or greater.");
  }
  const trimmedReason = reason.trim();
  if (trimmedReason === "") throw new Error("A reason is required to adjust.");

  const { data: row, error } = await supabase
    .from("inventory_stock")
    .select(
      "*, product:inventory_products(is_serialized, tracking_mode)"
    )
    .eq("id", stockId)
    .maybeSingle();
  if (error) throw new Error(`adjustStockQuantity/load: ${error.message}`);
  if (!row) throw new Error("Stock row not found.");
  const unit = row as DbInventoryStock & {
    product: { is_serialized: boolean; tracking_mode: string } | null;
  };

  const oldQty = Number(unit.quantity);
  const serialized = unit.product ? isSerializedProduct(unit.product) : false;
  if (serialized && newQty !== 0 && newQty !== oldQty) {
    throw new Error(
      "A serialized unit is quantity 1 — you can only adjust it to 0 (retire it)."
    );
  }

  const delta = newQty - oldQty;
  if (delta === 0) throw new Error("New quantity matches the current quantity.");

  const update: Record<string, unknown> = {
    quantity: newQty,
    updated_at: new Date().toISOString(),
  };
  // A serialized unit set to 0 is effectively gone — retire it.
  if (serialized && newQty === 0) update.status = "retired";

  const { error: upErr } = await supabase
    .from("inventory_stock")
    .update(update)
    .eq("id", stockId);
  if (upErr) throw new Error(`adjustStockQuantity: ${upErr.message}`);

  const deltaStr = delta > 0 ? `+${delta}` : String(delta);
  const mover = await currentMover();
  await recordMovement({
    product_id: unit.product_id,
    stock_id: stockId,
    quantity: Math.abs(delta),
    from_type: "adjustment",
    from_id: null,
    from_label: `was ${oldQty}`,
    to_type: "adjustment",
    to_id: null,
    to_label: deltaStr,
    moved_by: mover.id,
    moved_by_name: mover.name,
    note: `${deltaStr} · ${trimmedReason}`,
  });

  return { quantity: newQty, delta };
}
