"use server";

// PROJ-1 — projects server actions. Reads are RLS-gated (authenticated SELECT);
// mutations (convert + cost-center edits) require the quotes:convert permission,
// mirroring the existing quote→project convert gate.

import { revalidatePath } from "next/cache";
import {
  listProjects,
  getProjectById,
  createProjectFromQuote,
  addCostCenter,
  renameCostCenter,
  deleteCostCenter,
  type ProjectListRow,
  type ProjectDetail,
} from "@/lib/api/projects";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbProjectCostCenter, DbRole } from "@/lib/types/database";
import type { Quote, Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// DbRole (11) → app Role (7) for hasPermission; mirrors the inventory / vendors
// / attachments action helpers.
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

async function requireConvert(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "quotes", "convert")) {
    return "You don't have permission to manage projects.";
  }
  return null;
}

export async function listProjectsAction(): Promise<ProjectListRow[]> {
  return listProjects();
}

export async function getProjectByIdAction(
  id: string
): Promise<ProjectDetail | null> {
  return getProjectById(id);
}

export async function createProjectFromQuoteAction(
  quote: Quote
): Promise<ActionResult<{ id: string; project_number: string }>> {
  try {
    const denied = await requireConvert();
    if (denied) return { ok: false, error: denied };
    const project = await createProjectFromQuote(quote);
    revalidatePath("/projects");
    return {
      ok: true,
      data: { id: project.id, project_number: project.project_number },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function addCostCenterAction(
  projectId: string,
  name: string
): Promise<ActionResult<DbProjectCostCenter>> {
  try {
    const denied = await requireConvert();
    if (denied) return { ok: false, error: denied };
    if (!name.trim()) return { ok: false, error: "Cost center name is required." };
    const cc = await addCostCenter(projectId, name.trim());
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: cc };
  } catch (e) {
    return fail(e);
  }
}

export async function renameCostCenterAction(
  id: string,
  projectId: string,
  name: string
): Promise<ActionResult<DbProjectCostCenter>> {
  try {
    const denied = await requireConvert();
    if (denied) return { ok: false, error: denied };
    if (!name.trim()) return { ok: false, error: "Cost center name is required." };
    const cc = await renameCostCenter(id, name.trim());
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: cc };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCostCenterAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireConvert();
    if (denied) return { ok: false, error: denied };
    const ok = await deleteCostCenter(id);
    if (!ok) return { ok: false, error: "Cost center not found." };
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
