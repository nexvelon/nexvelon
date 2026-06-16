"use server";

// MOVE-1 — server actions for the universal Move/Assign flow + per-part history.
// Reads (history) are open to authenticated callers; moveStock is gated on the
// inventory:edit permission (Admin + ProjectManager) — operational stock ops.

import { revalidatePath } from "next/cache";
import {
  moveStock,
  listMovementsByProduct,
  type MoveDestination,
  type MoveStockResult,
} from "@/lib/api/stock-movements";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole, DbStockMovement } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

// DbRole (11) → app Role (7); mirrors the inventory action helper.
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

async function requireInventoryEdit(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "inventory", "edit")) {
    return "You don't have permission to move stock.";
  }
  return null;
}

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
    revalidatePath(`/inventory/${input.productId}`);
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}
