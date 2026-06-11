"use server";

// PO-1 — vendors server actions. Mirrors app/(app)/clients/actions.ts: uniform
// ActionResult, best-effort activity logging, computeChanges-driven update diff.
// Mutations are gated by hasPermission(role, "inventory", create|edit|delete).

import { revalidatePath } from "next/cache";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendors,
  updateVendor,
} from "@/lib/api/vendors";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type {
  DbRole,
  DbVendor,
  DbVendorInsert,
  DbVendorUpdate,
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

// DbRole (11 values) → mock Role (7) for hasPermission. Mirrors the mapping in
// app/(app)/quotes/new/page.tsx (values absent from the mock enum fold to the
// closest equivalent so the permission matrix resolves).
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

// Gate a mutation on inventory-resource permission. Returns null when allowed,
// or the uniform { ok:false } when not signed in / not permitted.
async function requireInventory(
  action: Action
): Promise<{ ok: false; error: string } | null> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "inventory", action)) {
    return { ok: false, error: "You don't have permission to manage vendors." };
  }
  return null;
}

function validateVendorPayload(
  payload: DbVendorInsert | DbVendorUpdate
): { ok: false; error: string } | null {
  if ("name" in payload && (payload.name ?? "").trim() === "") {
    return { ok: false, error: "Vendor name is required." };
  }
  return null;
}

/** Read helper for the client view to refresh after a mutation (no gate). */
export async function listVendorsAction(): Promise<ActionResult<DbVendor[]>> {
  try {
    return { ok: true, data: await getVendors() };
  } catch (e) {
    return fail(e);
  }
}

export async function createVendorAction(
  payload: DbVendorInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("create");
    if (denied) return denied;
    const invalid = validateVendorPayload(payload);
    if (invalid) return invalid;

    const row = await createVendor(payload);
    await logActivity("vendor", row.id, "create", {});
    revalidatePath("/vendors");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateVendorAction(
  id: string,
  payload: DbVendorUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("edit");
    if (denied) return denied;
    const invalid = validateVendorPayload(payload);
    if (invalid) return invalid;

    const before = await getVendorById(id);
    if (!before) return { ok: false, error: "Vendor not found" };

    const row = await updateVendor(id, payload);

    const changes = computeChanges(
      before as unknown as Record<string, unknown>,
      payload as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("vendor", id, "update", changes);
    }

    revalidatePath("/vendors");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteVendorAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("delete");
    if (denied) return denied;

    const removed = await deleteVendor(id);
    if (!removed) return { ok: false, error: "Vendor not found" };

    await logActivity("vendor", id, "delete", {});
    revalidatePath("/vendors");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
