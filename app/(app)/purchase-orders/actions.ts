"use server";

// PO-2 — purchase-orders server actions. Mirrors vendors/clients actions:
// uniform ActionResult, inventory-resource permission gate, best-effort activity
// logging with a computeChanges header diff on update.

import { revalidatePath } from "next/cache";
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
  receivePurchaseOrderLines,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseOrderListRow,
  type PurchaseOrderWrite,
  type ReceiptInput,
} from "@/lib/api/purchase-orders";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbPurchaseOrderStatus, DbRole } from "@/lib/types/database";

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

// DbRole (11) → mock Role (7) for hasPermission; mirrors quotes/new + vendors.
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

async function requireInventory(
  action: Action
): Promise<{ ok: false; error: string } | null> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "inventory", action)) {
    return {
      ok: false,
      error: "You don't have permission to manage purchase orders.",
    };
  }
  return null;
}

function validate(input: PurchaseOrderWrite): { ok: false; error: string } | null {
  const vendorId = (input.header as { vendor_id?: string }).vendor_id;
  if (!vendorId || vendorId.trim() === "") {
    return { ok: false, error: "A vendor is required." };
  }
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: "Add at least one line." };
  }
  for (const l of input.lines) {
    if (!Number.isFinite(l.quantity) || l.quantity < 1) {
      return { ok: false, error: "Every line needs a quantity of 1 or more." };
    }
    const hasDesc = (l.description ?? "").trim() !== "";
    if (!l.product_id && !hasDesc) {
      return { ok: false, error: "Every line needs a product or a description." };
    }
  }
  return null;
}

export async function listPurchaseOrdersAction(): Promise<
  ActionResult<PurchaseOrderListRow[]>
> {
  try {
    return { ok: true, data: await getPurchaseOrders() };
  } catch (e) {
    return fail(e);
  }
}

export async function getPurchaseOrderAction(
  id: string
): Promise<ActionResult<PurchaseOrderDetail>> {
  try {
    const detail = await getPurchaseOrderById(id);
    if (!detail) return { ok: false, error: "Purchase order not found" };
    return { ok: true, data: detail };
  } catch (e) {
    return fail(e);
  }
}

export async function createPurchaseOrderAction(
  input: PurchaseOrderWrite
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("create");
    if (denied) return denied;
    const invalid = validate(input);
    if (invalid) return invalid;

    const po = await createPurchaseOrder(input);
    await logActivity("purchase_order", po.id, "create", {});
    revalidatePath("/purchase-orders");
    return { ok: true, data: { id: po.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePurchaseOrderAction(
  id: string,
  input: PurchaseOrderWrite
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("edit");
    if (denied) return denied;
    const invalid = validate(input);
    if (invalid) return invalid;

    const before = await getPurchaseOrderById(id);
    if (!before) return { ok: false, error: "Purchase order not found" };

    const po = await updatePurchaseOrder(id, input);

    // Header-level diff only (lines are full-replaced; not diffed here).
    const changes = computeChanges(
      before.header as unknown as Record<string, unknown>,
      input.header as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("purchase_order", id, "update", changes);
    }

    revalidatePath("/purchase-orders");
    return { ok: true, data: { id: po.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePurchaseOrderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("delete");
    if (denied) return denied;

    const removed = await deletePurchaseOrder(id);
    if (!removed) return { ok: false, error: "Purchase order not found" };

    await logActivity("purchase_order", id, "delete", {});
    revalidatePath("/purchase-orders");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── PO-3: status transitions ────────────────────────────────────────────
// Shared core: edit-gate, load current status, run the (validated) transition
// via setPurchaseOrderStatus, log "prev→next", revalidate. The transition map
// in lib/api/purchase-orders.ts is the source of truth for legality; callers
// pass the target status (+ any extra precondition).
async function transitionStatus(
  id: string,
  next: DbPurchaseOrderStatus,
  opts: { adminOnly?: boolean; precheck?: (d: PurchaseOrderDetail) => string | null } = {}
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("edit");
    if (denied) return denied;
    if (opts.adminOnly) {
      const me = await getCurrentProfile();
      if (!me || me.role !== "Admin") {
        return { ok: false, error: "Only admins can reopen a purchase order." };
      }
    }

    const detail = await getPurchaseOrderById(id);
    if (!detail) return { ok: false, error: "Purchase order not found" };
    const prev = detail.header.status;

    if (opts.precheck) {
      const msg = opts.precheck(detail);
      if (msg) return { ok: false, error: msg };
    }

    await setPurchaseOrderStatus(id, next); // validates the transition map
    await logActivity("purchase_order", id, "update", {
      status: { from: prev, to: next },
    });
    revalidatePath("/purchase-orders");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/** draft → issued. Rejected when the PO has no lines. */
export async function issuePurchaseOrderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "issued", {
    precheck: (d) =>
      d.lines.length === 0 ? "Add at least one line before issuing." : null,
  });
}

/** → cancelled (from draft / issued / partially_received). */
export async function cancelPurchaseOrderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "cancelled");
}

/** → closed (from issued / partially_received / received). */
export async function closePurchaseOrderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "closed");
}

/** issued → draft. Admin only (reopen for re-editing). */
export async function reopenPurchaseOrderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "draft", { adminOnly: true });
}

/**
 * PO-4 — receive stock against PO lines. Gated by inventory "edit" (same posture
 * as the other PO mutations + receiveStock's callers). Only an issued or
 * partially_received PO can be received into.
 */
export async function receivePurchaseOrderAction(
  poId: string,
  receipts: ReceiptInput[]
): Promise<ActionResult<{ id: string; status: DbPurchaseOrderStatus }>> {
  try {
    const denied = await requireInventory("edit");
    if (denied) return denied;

    const detail = await getPurchaseOrderById(poId);
    if (!detail) return { ok: false, error: "Purchase order not found" };
    const status = detail.header.status;
    if (status !== "issued" && status !== "partially_received") {
      return {
        ok: false,
        error: `A ${status} purchase order can't be received into.`,
      };
    }

    const valid = receipts.filter((r) => Number(r.quantity) > 0);
    if (valid.length === 0) {
      return { ok: false, error: "Enter a quantity to receive on at least one line." };
    }

    const updated = await receivePurchaseOrderLines(poId, valid);

    const units = valid.reduce((s, r) => s + Number(r.quantity), 0);
    await logActivity("purchase_order", poId, "update", {
      received: {
        from: status,
        to: `${updated.status} (+${units} unit${units === 1 ? "" : "s"} across ${valid.length} line${valid.length === 1 ? "" : "s"})`,
      },
    });

    revalidatePath("/purchase-orders");
    revalidatePath("/inventory");
    return { ok: true, data: { id: poId, status: updated.status } };
  } catch (e) {
    return fail(e);
  }
}
