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
  updatePurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseOrderListRow,
  type PurchaseOrderWrite,
} from "@/lib/api/purchase-orders";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbRole } from "@/lib/types/database";

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
