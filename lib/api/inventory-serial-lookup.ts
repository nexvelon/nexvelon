import "server-only";

// INV-2 — global serial-number lookup for the command palette (and RMA /
// warranty scenarios). Given a partial serial, find the matching stock unit(s)
// and return enough context to jump straight to the unit on its product detail
// page: product identity, current location label, custody, and project context.
//
// Prefix match (ILIKE 'q%') so a field tech can type the first few characters.
// Serials live on inventory_stock.serial_number (0047); only serialized units
// have one, so the NOT NULL filter naturally scopes this to serialized stock.
//
// Location + project labels reuse the same shape as getCurrentLocationLabels /
// listStockAllocations: a row sits on EITHER a stock location (warehouse/truck)
// OR a project cost center, never both (MOVE-1, 0046).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { InventoryStockStatus } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export interface SerialLookupResult {
  stockId: string;
  serial: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  status: InventoryStockStatus; // in_stock | allocated | consumed | retired
  custodyStatus: string | null;
  currentLocation: {
    kind: "warehouse" | "truck" | "job" | "none";
    id: string | null;
    label: string;
  };
  project: {
    id: string;
    label: string;
    clientName: string;
  } | null;
  receivedAt: string | null;
  poNumber: string | null;
  lastMovementAt: string | null;
}

// Shape of one embedded stock row from the query below.
interface RawRow {
  id: string;
  product_id: string;
  serial_number: string | null;
  quantity: number;
  status: InventoryStockStatus;
  custody_status: string | null;
  po_number: string | null;
  acquired_at: string | null;
  last_known_label: string | null;
  current_location_id: string | null;
  current_cost_center_id: string | null;
  product: { name: string; sku: string } | null;
  location: {
    id: string;
    name: string;
    location_type: string; // 'warehouse' | 'truck'
    holder_name: string | null;
  } | null;
  cost_center: {
    id: string;
    cc_number: string;
    name: string;
    project: {
      id: string;
      project_number: string;
      title: string | null;
      client: { id: string; name: string } | null;
    } | null;
  } | null;
}

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

export async function lookupBySerial(
  query: string
): Promise<SerialLookupResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .select(
      `id, product_id, serial_number, quantity, status, custody_status,
       po_number, acquired_at, last_known_label,
       current_location_id, current_cost_center_id,
       product:inventory_products(name, sku),
       location:stock_locations(id, name, location_type, holder_name),
       cost_center:project_cost_centers(
         id, cc_number, name,
         project:projects(
           id, project_number, title,
           client:clients(id, name)
         )
       )`
    )
    .not("serial_number", "is", null)
    .ilike("serial_number", `${q}%`)
    .order("serial_number", { ascending: true })
    .limit(20);
  if (error) throw new Error(`lookupBySerial: ${error.message}`);

  const rows = (data ?? []) as unknown as RawRow[];
  if (rows.length === 0) return [];

  // Batch the "last movement" timestamp for the found units (limit 20 → one IN
  // query). stock_movements is append-only, so max(created_at) per stock_id is
  // the last time the unit moved / changed custody.
  const stockIds = rows.map((r) => r.id);
  const lastMovementByStock = new Map<string, string>();
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("stock_id, created_at")
    .in("stock_id", stockIds)
    .order("created_at", { ascending: false });
  for (const m of (moves ?? []) as {
    stock_id: string | null;
    created_at: string;
  }[]) {
    if (m.stock_id && !lastMovementByStock.has(m.stock_id)) {
      lastMovementByStock.set(m.stock_id, m.created_at);
    }
  }

  return rows.map((r) => {
    const cc = r.cost_center;
    const proj = cc?.project;
    const loc = r.location;

    let currentLocation: SerialLookupResult["currentLocation"];
    if (cc) {
      const label = `${proj?.project_number ?? cc.cc_number} — ${cc.name}`;
      currentLocation = { kind: "job", id: cc.id, label };
    } else if (loc) {
      const kind = loc.location_type === "truck" ? "truck" : "warehouse";
      currentLocation = { kind, id: loc.id, label: locationLabel(loc) };
    } else {
      currentLocation = {
        kind: "none",
        id: null,
        label: r.last_known_label?.trim() || "Unassigned",
      };
    }

    const project =
      proj != null
        ? {
            id: proj.id,
            label: proj.title?.trim() || proj.project_number,
            clientName: proj.client?.name ?? "—",
          }
        : null;

    return {
      stockId: r.id,
      serial: r.serial_number ?? "",
      productId: r.product_id,
      productName: r.product?.name ?? "—",
      productSku: r.product?.sku ?? "",
      quantity: Number(r.quantity) || 0,
      status: r.status,
      custodyStatus: r.custody_status,
      currentLocation,
      project,
      receivedAt: r.acquired_at,
      poNumber: r.po_number,
      lastMovementAt: lastMovementByStock.get(r.id) ?? null,
    };
  });
}
