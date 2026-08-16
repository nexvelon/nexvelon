"use server";
import { can, requireAdmin } from "@/lib/permissions/resolve";

// MOVE-1 — server actions for the universal Move/Assign flow + per-part history.
// Reads (history) are open to authenticated callers; moveStock is gated on the
// inventory:edit permission (Admin + ProjectManager) — operational stock ops.

import { revalidatePath } from "next/cache";
import {
  moveStock,
  listMovementsByProduct,
  markDelivered,
  markInstalled,
  markLost,
  markReturned,
  markConsumed,
  getStockProject,
  adjustStockQuantity,
  deleteReceivedBatchRows,
  setBatchRowQuantity,
  deleteMovementById,
  deleteAllMovementsForProduct,
  type MoveDestination,
  type MoveStockResult,
  type CustodyResult,
  type AdjustResult,
  type BatchEditResult,
} from "@/lib/api/stock-movements";
import { getCurrentProfile } from "@/lib/auth/profile";
import { logActivity } from "@/lib/api/activity-log";
import { getProductRowById } from "@/lib/api/products";
import type {
  DbStockMovement,
  ActivityAction,
  ActivityChanges,
} from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

async function requireInventoryEdit(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !(await can("inventory", "edit"))) {
    return "You don't have permission to move stock.";
  }
  return null;
}

// AUD-2B — audit stock changes as ONE summary row per operation (never one per
// unit — a bulk move/adjust would otherwise flood the product's feed), rolled up
// to the product's Activity tab. The label names both the operation and the
// product, and survives the product's deletion. Best-effort (never blocks).
async function logStock(
  productId: string,
  action: ActivityAction,
  summary: string,
  changes: ActivityChanges = {}
): Promise<void> {
  let name: string | null = null;
  try {
    const p = await getProductRowById(productId);
    name = p ? p.name || p.sku : null;
  } catch {
    /* label is best-effort */
  }
  await logActivity("stock_movement", productId, action, changes, {
    parentType: "inventory",
    parentId: productId,
    entityLabel: name ? `${summary} · ${name}` : summary,
  });
}

// Canonical admin gate (mirrors techs-actions.ts) for the destructive
// hard-delete history actions below.
export async function listMovementsByProductAction(
  productId: string
): Promise<DbStockMovement[]> {
  return listMovementsByProduct(productId);
}

export async function moveStockAction(input: {
  productId: string;
  stockId: string;
  quantity: number;
  destination: MoveDestination;
  note?: string | null;
}): Promise<ActionResult<MoveStockResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await moveStock({
      stockId: input.stockId,
      quantity: input.quantity,
      destination: input.destination,
      note: input.note,
    });
    await logStock(input.productId, "create", `Moved ${input.quantity}`, {
      destination: { from: null, to: input.destination.kind },
      ...(input.note ? { note: { from: null, to: input.note } } : {}),
    });
    revalidatePath(`/inventory/${input.productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// ── CUSTODY-1 (Batch D3) — serialized-unit custody actions (gate inventory:edit)

function revalidateProduct(productId: string) {
  revalidatePath(`/inventory/${productId}`);
  revalidatePath("/inventory");
}

/** Resolve the project a unit sits on, for the delivery-proof upload target. */
export async function getStockProjectAction(
  stockId: string
): Promise<{ project_id: string; project_number: string } | null> {
  return getStockProject(stockId);
}

export async function markDeliveredAction(
  productId: string,
  stockId: string,
  opts: { proofAttachmentId?: string | null } = {}
): Promise<ActionResult<CustodyResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await markDelivered(stockId, opts);
    await logStock(productId, "update", "Marked delivered");
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function markInstalledAction(
  productId: string,
  stockId: string
): Promise<ActionResult<CustodyResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await markInstalled(stockId);
    await logStock(productId, "update", "Marked installed");
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function markLostAction(
  productId: string,
  stockId: string
): Promise<ActionResult<CustodyResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await markLost(stockId);
    await logStock(productId, "update", "Marked lost");
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function markReturnedAction(
  productId: string,
  stockId: string
): Promise<ActionResult<CustodyResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await markReturned(stockId);
    await logStock(productId, "update", "Marked returned");
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function markConsumedAction(
  productId: string,
  stockId: string
): Promise<ActionResult<CustodyResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await markConsumed(stockId);
    await logStock(productId, "update", "Marked consumed");
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// PART-FIX-1 — manual quantity adjustment with a reason (logged as 'adjustment').
export async function adjustStockQuantityAction(
  productId: string,
  stockId: string,
  newQty: number,
  reason: string
): Promise<ActionResult<AdjustResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await adjustStockQuantity(stockId, newQty, reason);
    await logStock(productId, "update", "Adjusted quantity", {
      quantity: { from: null, to: newQty },
      reason: { from: null, to: reason },
    });
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// FIX-BATCH-O — received-batch edit/delete (gate inventory:edit). One action
// destroys a set of rows (serial checklist / non-serialized reduce / whole-batch
// delete); the other reduces a single bulk row's quantity.
export async function deleteReceivedBatchRowsAction(
  productId: string,
  stockIds: string[]
): Promise<ActionResult<BatchEditResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await deleteReceivedBatchRows(productId, stockIds);
    await logStock(productId, "delete", `Deleted ${stockIds.length} received row(s)`);
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function setBatchRowQuantityAction(
  productId: string,
  stockId: string,
  newQty: number
): Promise<ActionResult<BatchEditResult>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const result = await setBatchRowQuantity(productId, stockId, newQty);
    await logStock(productId, "update", "Set batch quantity", {
      quantity: { from: null, to: newQty },
    });
    revalidateProduct(productId);
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// ── Admin hard-delete of movement history ─────────────────────────────────────
// Admin-gated. HARD delete of stock_movement rows; AUD-2B records the PURGE
// itself on the product's Activity tab (who cleared history, when) even though
// the deleted rows are gone. `productId` is the page to revalidate; for the
// per-row delete it must be passed so the part page re-syncs.
export async function deleteMovementByIdAction(
  id: string,
  productId?: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteMovementById(id);
    if (productId) {
      await logStock(productId, "delete", "Deleted a movement record");
      revalidateProduct(productId);
    }
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAllMovementsForProductAction(
  productId: string
): Promise<ActionResult<{ deleted: number }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteAllMovementsForProduct(productId);
    await logStock(productId, "delete", `Purged movement history (${deleted})`);
    revalidateProduct(productId);
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
