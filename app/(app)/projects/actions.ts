"use server";

// PROJ-1 — projects server actions. Reads are RLS-gated (authenticated SELECT);
// mutations (convert + cost-center edits) require the quotes:convert permission,
// mirroring the existing quote→project convert gate.

import { revalidatePath } from "next/cache";
import {
  listProjects,
  getProjectById,
  createProjectFromQuote,
  listProjectsForClient,
  mergeQuoteIntoProject,
  addCostCenter,
  renameCostCenter,
  deleteCostCenter,
  getProjectStatus,
  setProjectStatus,
  getCostCenterById,
  getProjectRow,
  updateProjectFields,
  type ProjectListRow,
  type ProjectDetail,
  type MergeCandidate,
} from "@/lib/api/projects";
import { logActivity } from "@/lib/api/activity-log";
import { canTransition } from "@/lib/projects/status-transitions";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type {
  DbProjectCostCenter,
  DbRole,
  ProjectStatus,
} from "@/lib/types/database";
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

// PROJ2-1 — the NEW project-lifecycle gate. Uses the projects:edit permission
// (the resource already exists). Existing mutations stay on quotes:convert until
// PROJ2-3 migrates them. Returns the actor id on success so the action can stamp
// updated_by / actor_id without a second profile fetch.
async function requireProjectsEdit(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "edit")) {
    return { ok: false, error: "You don't have permission to edit projects." };
  }
  return { ok: true, actorId: me.id };
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
    // Best-effort audit (§2.8) — never block the mutation.
    try {
      await logActivity("project", project.id, "create", {
        project_number: { from: null, to: project.project_number },
        from_quote: { from: null, to: quote.id },
      });
    } catch (logErr) {
      console.error("[activity_log] project create log failed:", logErr);
    }
    revalidatePath("/projects");
    return {
      ok: true,
      data: { id: project.id, project_number: project.project_number },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function listProjectsForClientAction(
  clientId: string,
  opco: string
): Promise<MergeCandidate[]> {
  if (!clientId) return [];
  return listProjectsForClient(clientId, opco);
}

export async function mergeQuoteIntoProjectAction(
  quote: Quote,
  projectId: string
): Promise<ActionResult<{ id: string; project_number: string }>> {
  try {
    const denied = await requireConvert();
    if (denied) return { ok: false, error: denied };
    const project = await mergeQuoteIntoProject(quote, projectId);
    // Best-effort audit (§2.8).
    try {
      await logActivity("project", project.id, "update", {
        change_order_quote: { from: null, to: quote.id },
        cost_centers_added: { from: null, to: quote.sections?.length ?? 0 },
      });
    } catch (logErr) {
      console.error("[activity_log] project merge log failed:", logErr);
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${project.id}`);
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
    // Best-effort audit (§2.8).
    try {
      await logActivity("project", projectId, "update", {
        cost_center_added: { from: null, to: `${cc.cc_number} · ${cc.name}` },
      });
    } catch (logErr) {
      console.error("[activity_log] cost_center add log failed:", logErr);
    }
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
    // Capture the prior name BEFORE the rename for the audit diff.
    const before = await getCostCenterById(id).catch(() => null);
    const cc = await renameCostCenter(id, name.trim());
    // Best-effort audit (§2.8) — skip on an unchanged name (empty diff).
    if (before && before.name !== cc.name) {
      try {
        await logActivity("project", projectId, "update", {
          cost_center_name: { from: before.name, to: cc.name },
          cost_center: { from: null, to: cc.cc_number },
        });
      } catch (logErr) {
        console.error("[activity_log] cost_center rename log failed:", logErr);
      }
    }
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
    // Capture cc details BEFORE the delete for the audit trail.
    const before = await getCostCenterById(id).catch(() => null);
    const ok = await deleteCostCenter(id);
    if (!ok) return { ok: false, error: "Cost center not found." };
    // Best-effort audit (§2.8).
    if (before) {
      try {
        await logActivity("project", projectId, "update", {
          cost_center_deleted: {
            from: `${before.cc_number} · ${before.name}`,
            to: null,
          },
        });
      } catch (logErr) {
        console.error("[activity_log] cost_center delete log failed:", logErr);
      }
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// PROJ2-1 — the project lifecycle transition. NEW action gated on projects:edit
// (existing mutations stay on quotes:convert until PROJ2-3). Same transition
// rules for everyone — no admin bypass. Returns the spec's bare {ok} shape.
export async function updateProjectStatusAction(input: {
  projectId: string;
  newStatus: ProjectStatus;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    const current = await getProjectStatus(input.projectId);
    if (!current) return { ok: false, error: "not_found" };

    // No-op — same status. Succeed without an UPDATE or a log (§2.8).
    if (current.status === input.newStatus) return { ok: true };

    if (!canTransition(current.status, input.newStatus)) {
      return { ok: false, error: "invalid_transition" };
    }

    // PROJ2-2 — stamp actual_completion when a project first reaches
    // substantially_complete and it isn't already set. Folded into the same
    // UPDATE as the status change. Never cleared on a transition back (§2.2).
    const stampCompletion =
      input.newStatus === "substantially_complete" &&
      !current.actual_completion;
    const completionDate = stampCompletion
      ? new Date().toISOString().slice(0, 10)
      : undefined;

    await setProjectStatus(
      input.projectId,
      input.newStatus,
      gate.actorId,
      completionDate
    );

    // Best-effort audit (§2.8) — never fail the transition on a log error.
    try {
      const note = input.note?.trim();
      await logActivity("project", input.projectId, "update", {
        status: { from: current.status, to: input.newStatus },
        ...(completionDate
          ? { actual_completion: { from: null, to: completionDate } }
          : {}),
        ...(note ? { note: { from: null, to: note } } : {}),
      });
    } catch (logErr) {
      console.error("[activity_log] project status log failed:", logErr);
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// PROJ2-2 — edit the header-level project fields. Gated on projects:edit.
// Deliberately does NOT accept status (own action), project_number, client_id,
// site_id, opco, or originating_quote_id — those are snapshot/immutable here.
// Empty-diff is a no-op (§2.8); only changed fields are written + logged.
const EDITABLE_DATE_FIELDS = [
  "start_date",
  "target_completion",
] as const;

function isValidDate(v: string): boolean {
  // YYYY-MM-DD and a real calendar date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

export async function editProjectAction(input: {
  projectId: string;
  title?: string;
  description?: string | null;
  start_date?: string | null;
  target_completion?: string | null;
  pm_user_id?: string | null;
  lead_tech_id?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    // Validation.
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (t.length === 0 || t.length > 200) {
        return { ok: false, error: "invalid_title" };
      }
    }
    if (
      input.description !== undefined &&
      input.description !== null &&
      input.description.length > 2000
    ) {
      return { ok: false, error: "invalid_description" };
    }
    for (const f of EDITABLE_DATE_FIELDS) {
      const v = input[f];
      if (v !== undefined && v !== null && v !== "" && !isValidDate(v)) {
        return { ok: false, error: `invalid_${f}` };
      }
    }

    const current = await getProjectRow(input.projectId);
    if (!current) return { ok: false, error: "not_found" };

    // Build the diff — only provided fields whose value actually changed.
    // Title is trimmed; empty-string dates/ids normalize to null.
    const norm = (v: string | null | undefined): string | null =>
      v === undefined ? undefined! : v === "" ? null : v;

    const candidate: Record<string, string | null> = {};
    if (input.title !== undefined) candidate.title = input.title.trim();
    if (input.description !== undefined) candidate.description = norm(input.description);
    if (input.start_date !== undefined) candidate.start_date = norm(input.start_date);
    if (input.target_completion !== undefined)
      candidate.target_completion = norm(input.target_completion);
    if (input.pm_user_id !== undefined) candidate.pm_user_id = norm(input.pm_user_id);
    if (input.lead_tech_id !== undefined)
      candidate.lead_tech_id = norm(input.lead_tech_id);

    const diff: Record<string, string | null> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, to] of Object.entries(candidate)) {
      const from = (current as unknown as Record<string, unknown>)[k] ?? null;
      if ((from ?? null) !== (to ?? null)) {
        diff[k] = to;
        changes[k] = { from: from ?? null, to };
      }
    }

    // Empty diff — no write, no log (§2.8).
    if (Object.keys(diff).length === 0) return { ok: true };

    await updateProjectFields(input.projectId, diff, gate.actorId);

    // Best-effort audit (§2.8).
    try {
      await logActivity("project", input.projectId, "update", changes);
    } catch (logErr) {
      console.error("[activity_log] project edit log failed:", logErr);
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
