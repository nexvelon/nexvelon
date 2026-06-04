"use server";

// INV-2b — server actions for product catalog CRUD. Mirrors the
// clients/actions.ts shape: uniform ActionResult so client callers can toast
// failures without unwrapping thrown errors across the network.
//
// Activity logging is intentionally NOT wired here yet — the
// ActivityEntityType "inventory" member + logActivity calls land in INV-3.
// The // TODO INV-3 markers below mark exactly where each call will go.

import { revalidatePath } from "next/cache";
import {
  bulkCreateProducts,
  createProduct,
  deleteProduct,
  deleteStockUnit,
  receiveStock,
  updateProduct,
  updateStockUnit,
  type ReceiveStockInput,
} from "@/lib/api/products";
import type {
  DbInventoryProductInsert,
  DbInventoryProductUpdate,
  DbInventoryStockUpdate,
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

export async function createProductAction(
  input: DbInventoryProductInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const product = await createProduct(input);
    // TODO INV-3: logActivity("inventory", product.id, "create", {});
    revalidatePath("/inventory");
    return { ok: true, data: { id: product.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProductAction(
  id: string,
  patch: DbInventoryProductUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const product = await updateProduct(id, patch);
    // TODO INV-3: logActivity("inventory", id, "update", computeChanges(before, patch));
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${id}`);
    return { ok: true, data: { id: product.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProductAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteProduct(id);
    // TODO INV-3: logActivity("inventory", id, "delete", {});
    revalidatePath("/inventory");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function importProductsAction(
  rows: DbInventoryProductInsert[]
): Promise<ActionResult<{ created: number; skipped: string[] }>> {
  try {
    const result = await bulkCreateProducts(rows);
    // TODO INV-3: logActivity("inventory", <each created id>, "create", {});
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// ── Stock units (INV-2d) ───────────────────────────────────────────────────

export async function receiveStockAction(
  productId: string,
  input: ReceiveStockInput
): Promise<ActionResult<{ created: number }>> {
  try {
    const result = await receiveStock(productId, input);
    // TODO INV-3: logActivity("inventory", productId, "update", { received: ... });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function updateStockUnitAction(
  unitId: string,
  productId: string,
  patch: DbInventoryStockUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    await updateStockUnit(unitId, patch);
    // TODO INV-3: logActivity("inventory", productId, "update", { unit: unitId, ...patch });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: { id: unitId } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStockUnitAction(
  unitId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteStockUnit(unitId);
    // TODO INV-3: logActivity("inventory", productId, "update", { removedUnit: unitId });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: { id: unitId } };
  } catch (e) {
    return fail(e);
  }
}
