"use server";

// SUB-1 — subcontractors server actions. Mirrors app/(app)/vendors/actions.ts:
// uniform ActionResult, a require<resource> gate, empty-diff no-op on update.
// Mutations gate on hasPermission(role, "subcontractors", create|edit|delete);
// reads on "subcontractors","view".
//
// NOTE(audit): no activity logging — activity_log's entity_type CHECK doesn't
// include 'subcontractor' and widening it is out of SUB-1 scope. See
// lib/api/subcontractors.ts. Same honest gap FIN-2 flagged for invoices.

import { revalidatePath } from "next/cache";
import {
  listSubcontractors,
  listSubcontractorTrades,
  getSubcontractorById,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
  linkVendor,
  type SubcontractorListRow,
  type SubcontractorDetail,
  type SubcontractorFilters,
} from "@/lib/api/subcontractors";
import { getVendors } from "@/lib/api/vendors";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type {
  DbRole,
  DbSubcontractor,
  DbSubcontractorInsert,
  DbSubcontractorUpdate,
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

// DbRole (11) → app Role (7); mirrors the vendors/projects action helpers.
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

async function require(
  action: Action
): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "subcontractors", action)) {
    return {
      ok: false,
      error: "You don't have permission to manage subcontractors.",
    };
  }
  return { ok: true, actorId: me.id };
}

function validate(
  payload: DbSubcontractorInsert | DbSubcontractorUpdate
): { ok: false; error: string } | null {
  if ("name" in payload && (payload.name ?? "").trim() === "") {
    return { ok: false, error: "Subcontractor name is required." };
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { ok: false, error: "That email address doesn't look valid." };
  }
  if (
    payload.default_labour_rate != null &&
    Number(payload.default_labour_rate) < 0
  ) {
    return { ok: false, error: "Default labour rate can't be negative." };
  }
  return null;
}

// ─── Reads (view) ────────────────────────────────────────────────────────────

export async function listSubcontractorsAction(
  filters: SubcontractorFilters = {}
): Promise<ActionResult<{ rows: SubcontractorListRow[]; trades: string[] }>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const [rows, trades] = await Promise.all([
      listSubcontractors(filters),
      listSubcontractorTrades(),
    ]);
    return { ok: true, data: { rows, trades } };
  } catch (e) {
    return fail(e);
  }
}

export async function getSubcontractorAction(
  id: string
): Promise<ActionResult<SubcontractorDetail | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    if (!id) return { ok: false, error: "No subcontractor specified." };
    return { ok: true, data: await getSubcontractorById(id) };
  } catch (e) {
    return fail(e);
  }
}

/** Vendors for the "link vendor" picker. view-tier — just names. */
export async function listVendorOptionsAction(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const vendors = await getVendors();
    return {
      ok: true,
      data: vendors.map((v) => ({ id: v.id, name: v.name })),
    };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createSubcontractorAction(
  payload: DbSubcontractorInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("create");
    if (!gate.ok) return gate;
    const invalid = validate(payload);
    if (invalid) return invalid;
    const row = await createSubcontractor(payload, gate.actorId);
    revalidatePath("/subcontractors");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSubcontractorAction(
  id: string,
  patch: DbSubcontractorUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const invalid = validate(patch);
    if (invalid) return invalid;

    const before = await getSubcontractorById(id);
    if (!before) return { ok: false, error: "Subcontractor not found." };

    // Empty-diff no-op (§2.8): skip the write when nothing actually changed.
    const changed = Object.entries(patch).some(([k, v]) => {
      const cur = (before as unknown as Record<string, unknown>)[k];
      return v !== undefined && JSON.stringify(v) !== JSON.stringify(cur);
    });
    if (!changed) {
      return { ok: true, data: { id } };
    }

    const row = await updateSubcontractor(id, patch, gate.actorId);
    revalidatePath("/subcontractors");
    revalidatePath(`/subcontractors/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSubcontractorAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("delete");
    if (!gate.ok) return gate;
    const removed = await deleteSubcontractor(id);
    if (!removed) return { ok: false, error: "Subcontractor not found." };
    revalidatePath("/subcontractors");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function linkVendorAction(
  id: string,
  vendorId: string | null
): Promise<ActionResult<DbSubcontractor>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await linkVendor(id, vendorId, gate.actorId);
    revalidatePath("/subcontractors");
    revalidatePath(`/subcontractors/${id}`);
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}
