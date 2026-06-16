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
  addManualStock,
  bulkCreateProducts,
  consumeStock,
  createProduct,
  deleteProduct,
  deleteStockUnit,
  getInventoryReportData,
  getProductRowById,
  listProducts,
  listStockForProduct,
  receiveStock,
  returnUnitToStock,
  updateProduct,
  updateStockUnit,
  type AddManualStockInput,
  type InventoryReportData,
  type ReceiveStockInput,
} from "@/lib/api/products";
import { deleteReceivedPurchaseOrder } from "@/lib/api/purchase-orders";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { deleteAttachmentsForEntity } from "@/app/(app)/attachments/actions";
import { sendLowStockAlert } from "@/lib/auth/email";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type {
  DbInventoryProductInsert,
  DbInventoryProductUpdate,
  DbInventoryStock,
  DbInventoryStockUpdate,
  DbRole,
} from "@/lib/types/database";
import type { Product, Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// PARTS-1: DbRole (11) → app Role (7) for hasPermission; mirrors the
// vendors / PO / attachments action helpers.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

// INV-4: expose the real catalog to client components (the quote builder reads
// this so SKU search runs against live inventory instead of the empty mock
// array). Plain Product[] return — a thrown error rejects the promise and the
// caller falls back to an empty catalog.
export async function listProductsAction(): Promise<Product[]> {
  return listProducts();
}

// INV-6: lazy fetch of aggregated report data (valuation / aging / consumption).
// Computed server-side over real inventory_stock rows (§2.4-accurate).
// F-2: expose a product's stock units to the quote builder's pin picker.
export async function listStockForProductAction(
  productId: string
): Promise<ActionResult<DbInventoryStock[]>> {
  try {
    return { ok: true, data: await listStockForProduct(productId) };
  } catch (e) {
    return fail(e);
  }
}

// F-3b: commit (consume) qty from a pinned stock unit when a quote is
// committed/converted. productId is supplied by the caller (the quote line) for
// the activity log. Qty-aware consume/split lives in lib/api consumeStock.
export async function commitStockUnitAction(
  stockUnitId: string,
  productId: string,
  qty: number,
  ref: string
): Promise<ActionResult<{ consumedRowId: string }>> {
  try {
    const result = await consumeStock(stockUnitId, qty, { ref });
    await logActivity("inventory", productId, "update", {
      committed: { from: null, to: `${qty} → ${ref}` },
      stock_unit: { from: stockUnitId, to: result.consumedRowId },
    });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function getInventoryReportDataAction(): Promise<InventoryReportData> {
  return getInventoryReportData();
}

// INV-5: on-demand low-stock report. Computes stock<=reorderPoint inline over
// the catalog (same definition as the UI's lowStockCount) and emails the
// signed-in user. Not a data change — no logActivity.
export async function emailLowStockReportAction(): Promise<{
  sent: boolean;
  count: number;
  to?: string;
  reason?: string;
}> {
  try {
    const products = await listProducts();
    const low = products.filter((p) => p.stock <= p.reorderPoint);
    if (low.length === 0) {
      return { sent: false, count: 0, reason: "No items at or below their low-stock threshold" };
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const to = user?.email;
    if (!to) {
      return {
        sent: false,
        count: low.length,
        reason: "No email on your account",
      };
    }

    await sendLowStockAlert(
      to,
      low.map((p) => ({
        sku: p.sku,
        name: p.name,
        stock: p.stock,
        reorderPoint: p.reorderPoint,
      }))
    );
    return { sent: true, count: low.length, to };
  } catch (e) {
    return {
      sent: false,
      count: 0,
      reason: e instanceof Error ? e.message : "Failed to send report",
    };
  }
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
    // PARTS-1: gate deletion on the inventory:delete permission (UI gates the
    // button too; this is the authoritative server-side check).
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "inventory", "delete")) {
      return { ok: false, error: "You don't have permission to delete parts." };
    }
    // ATTACH-1: remove this product's attachments (objects + rows) first so
    // they don't orphan. Best-effort — a storage hiccup never blocks the
    // product delete.
    await deleteAttachmentsForEntity("product", id).catch(() => {});
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

// PART-DETAIL B2: admin-level gate for the new destructive/manual stock ops,
// reusing the same inventory:delete permission that gates product deletion.
async function requireInventoryAdmin(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "inventory", "delete")) {
    return "You don't have permission to manage stock.";
  }
  return null;
}

// PART-DETAIL B2 (item 14): manual stock-add — no PO required, date optional.
export async function addManualStockAction(
  productId: string,
  input: AddManualStockInput
): Promise<ActionResult<{ created: number; id: string }>> {
  try {
    const denied = await requireInventoryAdmin();
    if (denied) return { ok: false, error: denied };
    const result = await addManualStock(productId, input);
    await logActivity("inventory", productId, "update", {
      manual_stock_added: { from: null, to: result.id },
    });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// PART-DETAIL B2 (item 15): reverse an entire received PO. Gated admin-level;
// blocks when any unit has left stock (clear message), never partial-corrupts.
export async function deleteReceivedPurchaseOrderAction(
  poNumber: string,
  productId: string
): Promise<ActionResult<{ deletedRows: number; poNumber: string }>> {
  try {
    const denied = await requireInventoryAdmin();
    if (denied) return { ok: false, error: denied };
    const result = await deleteReceivedPurchaseOrder(poNumber);
    await logActivity("inventory", productId, "update", {
      receipt_reversed: { from: poNumber, to: null },
    });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    revalidatePath("/purchase-orders");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

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

// ── Site allocation (INV-3b) ───────────────────────────────────────────────

// ASSIGN-LOCK (item 16a): allocateUnitAction is REMOVED — a part can no longer
// be assigned directly to a site. Job / cost-center assignment lands with the
// movement ledger (Batch D). returnUnitAction is kept so historically
// site-allocated units can still be returned to stock.

export async function returnUnitAction(
  stockId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await returnUnitToStock(stockId);
    await logActivity("inventory", productId, "update", {
      returned: { from: "allocated", to: "in_stock" },
    });
    revalidatePath(`/inventory/${productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: { id: stockId } };
  } catch (e) {
    return fail(e);
  }
}
