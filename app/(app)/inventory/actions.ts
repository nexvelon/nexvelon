"use server";

// INV-2b — server actions for product catalog CRUD. Mirrors the
// clients/actions.ts shape: uniform ActionResult so client callers can toast
// failures without unwrapping thrown errors across the network.
//
// INV-3a — activity logging wired in. Best-effort (logActivity swallows its
// own errors) so a log write never blocks the mutation. entity_type is
// "inventory"; entity_id is the product id (stock-unit ops log against their
// product). Updates use the clients pattern: before-fetch + computeChanges +
// empty-diff skip.

import { revalidatePath } from "next/cache";
import {
  bulkCreateProducts,
  createProduct,
  deleteProduct,
  deleteStockUnit,
  getProductRowById,
  receiveStock,
  updateProduct,
  updateStockUnit,
  type ReceiveStockInput,
} from "@/lib/api/products";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
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
    await logActivity("inventory", product.id, "create", {});
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
    // Fetch the row BEFORE mutating so we can compute the diff (ACT-1 pattern).
    const before = await getProductRowById(id);
    if (!before) return { ok: false, error: "Product not found" };

    const product = await updateProduct(id, patch);

    const changes = computeChanges(
      before as unknown as Record<string, unknown>,
      patch as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("inventory", id, "update", changes);
    }

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
    await logActivity("inventory", id, "delete", {});
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
    const { created, createdIds, skipped } = await bulkCreateProducts(rows);
    for (const id of createdIds) {
      await logActivity("inventory", id, "create", {
        via: { from: null, to: "import" },
      });
    }
    revalidatePath("/inventory");
    // Keep the public shape { created, skipped } — createdIds is internal.
    return { ok: true, data: { created, skipped } };
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
    await logActivity("inventory", productId, "update", {
      received: { from: null, to: result.created },
    });
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
    await logActivity("inventory", productId, "update", {
      unit: { from: null, to: unitId },
      ...Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, { from: null, to: v ?? null }])
      ),
    });
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
    await logActivity("inventory", productId, "update", {
      unit_removed: { from: unitId, to: null },
    });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: { id: unitId } };
  } catch (e) {
    return fail(e);
  }
}
