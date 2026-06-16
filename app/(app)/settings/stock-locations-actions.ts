"use server";

// MOVE-1 — server actions for the managed stock-locations list. Mirrors
// manufacturers-actions.ts: reads open to authenticated callers, writes gated
// by requireAdmin (the canonical admin gate).

import { revalidatePath } from "next/cache";
import {
  listStockLocations,
  createStockLocation,
  updateStockLocation,
  deleteStockLocation,
} from "@/lib/api/stock-locations";
import { getCurrentProfile } from "@/lib/auth/profile";
import type {
  DbStockLocation,
  DbStockLocationUpdate,
} from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true };
}

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/inventory");
}

const VALID_TYPES = new Set(["warehouse", "truck"]);

export async function listStockLocationsAction(
  opts: { includeInactive?: boolean } = {}
): Promise<ActionResult<DbStockLocation[]>> {
  try {
    return { ok: true, data: await listStockLocations(opts) };
  } catch (e) {
    return fail(e);
  }
}

export async function createStockLocationAction(input: {
  name: string;
  location_type: string;
  holder_name?: string | null;
}): Promise<ActionResult<DbStockLocation>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const name = input.name.trim();
    if (name === "") return { ok: false, error: "Name is required." };
    const type = VALID_TYPES.has(input.location_type)
      ? input.location_type
      : "warehouse";
    const row = await createStockLocation({
      name,
      location_type: type,
      holder_name: type === "truck" ? input.holder_name?.trim() || null : null,
    });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateStockLocationAction(
  id: string,
  patch: DbStockLocationUpdate
): Promise<ActionResult<DbStockLocation>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const clean: DbStockLocationUpdate = { ...patch };
    if (clean.name !== undefined) {
      clean.name = clean.name.trim();
      if (clean.name === "") return { ok: false, error: "Name is required." };
    }
    if (clean.location_type !== undefined) {
      if (!VALID_TYPES.has(clean.location_type)) {
        return { ok: false, error: "Type must be warehouse or truck." };
      }
      // Clear the holder when it's not a truck.
      if (clean.location_type !== "truck") clean.holder_name = null;
    }
    if (clean.holder_name !== undefined && clean.holder_name !== null) {
      clean.holder_name = clean.holder_name.trim() || null;
    }
    const row = await updateStockLocation(id, clean);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStockLocationAction(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteStockLocation(id);
    revalidate();
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
