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
