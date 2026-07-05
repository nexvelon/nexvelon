"use server";

// JC-1 — labour server actions for the project detail view. Reads are
// RLS-gated (authenticated SELECT). Writes are financial-sensitive, so they
// require the existing `financials` edit permission (Admin + Accountant) —
// mirroring invoices/actions.ts rather than minting a new gate.

import { revalidatePath } from "next/cache";
import {
  listLabourEntriesForProject,
  sumLabourCostByCostCenter,
  addLabourEntry,
  updateLabourEntry,
  deleteLabourEntry,
  type LabourEntryView,
} from "@/lib/api/labour";
import { listTechs } from "@/lib/api/techs";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbTech, DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

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

// DbRole (11) → app Role (7) for hasPermission; mirrors the invoices/projects
// action helpers.
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

// Financial-sensitive: only roles with `financials` edit (Admin, Accountant).
async function requireFinancials(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "financials", "edit")) {
    return "You don't have permission to edit labour.";
  }
  return null;
}

// PROJ2-3 — read gate for the labour LIST/read actions (previously open).
// Mutations keep the stricter requireFinancials; this only floors the reads at
// projects:view (every project-facing role has it, so no current viewer loses
// access — it just formalizes the boundary).
async function requireProjectsView(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
    return "You don't have permission to view projects.";
  }
  return null;
}

export interface ProjectLabour {
  entries: Record<string, LabourEntryView[]>;
  totals: Record<string, number>;
}

/** Entries (grouped by cost center) + per-cost-center totals in one round. */
export async function listLabourForProjectAction(
  projectId: string
): Promise<ActionResult<ProjectLabour>> {
  try {
    const denied = await requireProjectsView();
    if (denied) return { ok: false, error: denied };
    const [entries, totals] = await Promise.all([
      listLabourEntriesForProject(projectId),
      sumLabourCostByCostCenter(projectId),
    ]);
    return { ok: true, data: { entries, totals } };
  } catch (e) {
    return fail(e);
  }
}

/** Active techs only, for the Add Labour Select. */
export async function listActiveTechsAction(): Promise<ActionResult<DbTech[]>> {
  try {
    const denied = await requireProjectsView();
    if (denied) return { ok: false, error: denied };
    const all = await listTechs();
    return { ok: true, data: all.filter((t) => t.is_active) };
  } catch (e) {
    return fail(e);
  }
}

export async function addLabourEntryAction(
  projectId: string,
  input: {
    cost_center_id: string;
    tech_id?: string;
    hours: number;
    cost_rate?: number;
    worked_on?: string;
    note?: string | null;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireFinancials();
    if (gate) return { ok: false, error: gate };
    const row = await addLabourEntry(input);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLabourEntryAction(
  projectId: string,
  id: string,
  patch: {
    tech_id?: string | null;
    tech_name?: string;
    hours?: number;
    cost_rate?: number;
    worked_on?: string;
    note?: string | null;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireFinancials();
    if (gate) return { ok: false, error: gate };
    const row = await updateLabourEntry(id, patch);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLabourEntryAction(
  projectId: string,
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireFinancials();
    if (gate) return { ok: false, error: gate };
    const deleted = await deleteLabourEntry(id);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
