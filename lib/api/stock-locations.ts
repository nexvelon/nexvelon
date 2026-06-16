import "server-only";

// MOVE-1 — server-only stock-locations API (public.stock_locations, migration
// 0046). Warehouses + trucks (holder_name = the tech/sub a truck is assigned
// to). Cookie-aware server client (RLS); mutations gated by requireAdmin at the
// action layer (settings/stock-locations-actions.ts), mirroring manufacturers.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbStockLocation,
  DbStockLocationUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** Locations, active first, then warehouses before trucks, then by name. */
export async function listStockLocations(
  opts: { includeInactive?: boolean } = {}
): Promise<DbStockLocation[]> {
  const supabase = await db();
  let query = supabase.from("stock_locations").select("*");
  if (!opts.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query
    .order("is_active", { ascending: false })
    .order("location_type", { ascending: true }) // 'truck' < 'warehouse' alpha; fine
    .order("name", { ascending: true });
  if (error) throw new Error(`listStockLocations: ${error.message}`);
  return (data ?? []) as DbStockLocation[];
}

/** The default Main Warehouse (oldest warehouse). Null if none exist. */
export async function getDefaultWarehouse(): Promise<DbStockLocation | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("stock_locations")
    .select("*")
    .eq("location_type", "warehouse")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getDefaultWarehouse: ${error.message}`);
  return (data as DbStockLocation | null) ?? null;
}

export async function createStockLocation(input: {
  name: string;
  location_type: string;
  holder_name?: string | null;
}): Promise<DbStockLocation> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("stock_locations")
    .insert({
      name: input.name,
      location_type: input.location_type,
      holder_name: input.holder_name ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createStockLocation: ${error.message}`);
  return data as DbStockLocation;
}

export async function updateStockLocation(
  id: string,
  patch: DbStockLocationUpdate
): Promise<DbStockLocation> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("stock_locations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateStockLocation: ${error.message}`);
  return data as DbStockLocation;
}

/** Hard-delete a location. inventory_stock.current_location_id is ON DELETE
 *  SET NULL (0046), and movement history keeps its label snapshot — so this is
 *  non-corrupting. Callers should prefer deactivate for retiring a truck. */
export async function deleteStockLocation(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("stock_locations")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteStockLocation: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
