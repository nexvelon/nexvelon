"use server";

// PROJ-1 — projects server actions. PROJ2-3: gates now live on the projects:*
// resource — reads on projects:view, createProjectFromQuote on projects:create,
// merge + cost-center edits + status + header edits on projects:edit. (They
// previously shared quotes:convert, a carry-over from when these shipped with
// quote→project conversion.) The quote-side "Create Project" trigger keeps
// quotes:convert — that's a quotes permission.

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
  listJobsForProject,
  getJobById,
  createChangeOrderJob,
  updateJobFields,
  setJobStatus,
  reassignJobFinancialsToMainJob,
  deleteJobRow,
  type ProjectListRow,
  type ProjectDetail,
  type MergeCandidate,
} from "@/lib/api/projects";
import type { DbJob } from "@/lib/types/database";
import { logActivity } from "@/lib/api/activity-log";
import {
  scaffoldFoldersForNewProject,
  scaffoldFoldersForNewChangeOrder,
} from "@/lib/api/attachment-folders";
import { canTransition } from "@/lib/projects/status-transitions";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type {
  DbProjectCostCenter,
  DbRole,
  JobStatus,
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

// PROJ2-3 — project mutations now gate on the projects:* resource (was
// quotes:convert, a historical carry-over from when these actions shipped
// alongside quote→project conversion). All three helpers share one shape
// (returning the actor id on success so mutations can stamp updated_by without
// a second profile fetch). The quote-side "Create Project" trigger keeps
// quotes:convert — that's a quotes permission (see PROJ2-3b TODO).
async function requireProjectsView(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
    return { ok: false, error: "You don't have permission to view projects." };
  }
  return { ok: true, actorId: me.id };
}

async function requireProjectsCreate(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "create")) {
    return { ok: false, error: "You don't have permission to create projects." };
  }
  return { ok: true, actorId: me.id };
}

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
  // PROJ2-3 — reads gate on projects:view. Signature is a bare array, so denial
  // returns [] (no data leak) rather than an error object.
  if (!(await requireProjectsView()).ok) return [];
  return listProjects();
}

export async function getProjectByIdAction(
  id: string
): Promise<ProjectDetail | null> {
  if (!(await requireProjectsView()).ok) return null;
  return getProjectById(id);
}

// PROJ2-4a — jobs for a project (Main Job first, then Change Orders). Bare-array
// signature → [] on denial.
export async function listJobsForProjectAction(
  projectId: string
): Promise<DbJob[]> {
  if (!(await requireProjectsView()).ok) return [];
  return listJobsForProject(projectId);
}

export async function createProjectFromQuoteAction(
  quote: Quote
): Promise<ActionResult<{ id: string; project_number: string }>> {
  try {
    const gate = await requireProjectsCreate();
    if (!gate.ok) return { ok: false, error: gate.error };
    const { project, mainJob } = await createProjectFromQuote(quote);

    // PROJ2-4b — scaffold the folder tree. Best-effort: a failure must NOT roll
    // back the conversion (the tree can be re-scaffolded later). Needs a site to
    // root the tree; skipped for a (rare) siteless project.
    let folderIds: {
      projectContainerId: string;
      mainJobFolderId: string;
      changeOrdersFolderId: string;
    } | null = null;
    if (project.site_id) {
      try {
        folderIds = await scaffoldFoldersForNewProject({
          projectId: project.id,
          siteId: project.site_id,
          mainJobId: mainJob.id,
          actorId: gate.actorId,
        });
      } catch (scaffoldErr) {
        console.error("[folders] project scaffold failed:", scaffoldErr);
      }
    }

    // Best-effort audit (§2.8) — never block the mutation.
    try {
      await logActivity("project", project.id, "create", {
        project_number: { from: null, to: project.project_number },
        from_quote: { from: null, to: quote.id },
        main_job: { from: null, to: mainJob.id },
        ...(folderIds
          ? { folder_root: { from: null, to: folderIds.projectContainerId } }
          : {}),
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
  if (!(await requireProjectsView()).ok) return [];
  if (!clientId) return [];
  return listProjectsForClient(clientId, opco);
}

export async function mergeQuoteIntoProjectAction(
  quote: Quote,
  projectId: string
): Promise<ActionResult<{ id: string; project_number: string }>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const { project, changeOrderJob } = await mergeQuoteIntoProject(
      quote,
      projectId
    );

    // PROJ2-4b — scaffold the C.O folder + its defaults. Best-effort.
    let coFolderId: string | null = null;
    if (project.site_id && changeOrderJob.co_number != null) {
      try {
        const r = await scaffoldFoldersForNewChangeOrder({
          projectId: project.id,
          jobId: changeOrderJob.id,
          coNumber: changeOrderJob.co_number,
          siteId: project.site_id,
          actorId: gate.actorId,
        });
        coFolderId = r.changeOrderFolderId;
      } catch (scaffoldErr) {
        console.error("[folders] change-order scaffold failed:", scaffoldErr);
      }
    }

    // Best-effort audit (§2.8).
    try {
      await logActivity("project", project.id, "update", {
        change_order_quote: { from: null, to: quote.id },
        change_order_job: { from: null, to: changeOrderJob.id },
        co_number: { from: null, to: changeOrderJob.co_number },
        cost_centers_added: { from: null, to: quote.sections?.length ?? 0 },
        ...(coFolderId ? { co_folder: { from: null, to: coFolderId } } : {}),
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
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
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
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
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
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
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

// ── Jobs CRUD (PROJ2-4d) ─────────────────────────────────────────────────────

// 5a — edit a Job's header (title / contract_value). Mirrors editProjectAction:
// projects:edit gate, per-field validation, empty-diff no-op (§2.8), best-effort
// activity log, revalidate the project + this job page.
export async function editJobAction(input: {
  jobId: string;
  title?: string;
  contract_value?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    if (input.title !== undefined) {
      const t = input.title.trim();
      if (t.length === 0 || t.length > 200) {
        return { ok: false, error: "invalid_title" };
      }
    }
    if (
      input.contract_value !== undefined &&
      (!Number.isFinite(input.contract_value) || input.contract_value < 0)
    ) {
      return { ok: false, error: "invalid_contract_value" };
    }

    const current = await getJobById(input.jobId);
    if (!current) return { ok: false, error: "not_found" };

    // Build the diff — only provided fields whose value actually changed.
    const diff: { title?: string; contract_value?: number } = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (input.title !== undefined) {
      const to = input.title.trim();
      if (to !== current.title) {
        diff.title = to;
        changes.title = { from: current.title, to };
      }
    }
    if (input.contract_value !== undefined) {
      const to = Math.round(input.contract_value * 100) / 100;
      const from = Number(current.contract_value);
      if (to !== from) {
        diff.contract_value = to;
        changes.contract_value = { from, to };
      }
    }

    // Empty diff — no write, no log (§2.8).
    if (Object.keys(diff).length === 0) return { ok: true };

    await updateJobFields(input.jobId, diff, gate.actorId);

    // Best-effort audit (§2.8) — logged on the parent project entity, with the
    // job_id in the payload (there is no 'job' ActivityEntityType).
    try {
      await logActivity("project", current.project_id, "update", {
        job_id: { from: null, to: input.jobId },
        ...changes,
      });
    } catch (logErr) {
      console.error("[activity_log] job edit log failed:", logErr);
    }

    revalidatePath(`/projects/${current.project_id}`);
    revalidatePath(`/projects/${current.project_id}/jobs/${input.jobId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 5b — change a Job's lifecycle status. Mirrors updateProjectStatusAction: shared
// state machine (JobStatus === ProjectStatus), no-op on same status, transition
// validated server-side, best-effort log, revalidate project + job pages.
export async function updateJobStatusAction(input: {
  jobId: string;
  newStatus: JobStatus;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    const current = await getJobById(input.jobId);
    if (!current) return { ok: false, error: "not_found" };

    // No-op — same status. Succeed without an UPDATE or a log (§2.8).
    if (current.status === input.newStatus) return { ok: true };

    if (!canTransition(current.status, input.newStatus)) {
      return { ok: false, error: "invalid_transition" };
    }

    await setJobStatus(input.jobId, input.newStatus, gate.actorId);

    // Best-effort audit (§2.8) — on the parent project, job_id in the payload.
    try {
      const note = input.note?.trim();
      await logActivity("project", current.project_id, "update", {
        job_id: { from: null, to: input.jobId },
        status: { from: current.status, to: input.newStatus },
        ...(note ? { note: { from: null, to: note } } : {}),
      });
    } catch (logErr) {
      console.error("[activity_log] job status log failed:", logErr);
    }

    revalidatePath(`/projects/${current.project_id}`);
    revalidatePath(`/projects/${current.project_id}/jobs/${input.jobId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 5c — delete a Change Order Job. Main Jobs are never deletable. All financial
// records (cost centers, invoices, POs) are reassigned to the Main Job FIRST
// (invoices.job_id is ON DELETE RESTRICT, so this is mandatory, not tidy), the
// Main Job contract_value is recomputed, THEN the C.O row is hard-deleted
// (project_jobs has no deleted_at). project_quotes rows are untouched — the C.O
// quote linkage stays as historical record (the deleted row's source_quote_id
// FK is SET NULL, but we don't delete project_quotes at all).
export async function deleteChangeOrderJobAction(input: {
  jobId: string;
}): Promise<
  | {
      ok: true;
      data: {
        reassignedCostCenters: number;
        reassignedInvoices: number;
        reassignedPurchaseOrders: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    const job = await getJobById(input.jobId);
    if (!job) return { ok: false, error: "not_found" };
    if (job.job_type === "main_job") {
      return { ok: false, error: "cannot_delete_main_job" };
    }

    // Reassign every downstream financial record to the Main Job + recompute the
    // Main Job contract_value (steps 1–5), then hard-delete the now-unreferenced
    // C.O row (step 6).
    const counts = await reassignJobFinancialsToMainJob(
      input.jobId,
      job.project_id
    );
    await deleteJobRow(input.jobId);

    // Best-effort audit (§2.8) — a 'delete' event on the parent project.
    try {
      await logActivity("project", job.project_id, "delete", {
        deleted_job_id: { from: input.jobId, to: null },
        co_number: { from: job.co_number, to: null },
        main_job_id: { from: null, to: counts.mainJobId },
        reassigned_cost_centers: {
          from: null,
          to: counts.reassignedCostCenters,
        },
        reassigned_invoices: { from: null, to: counts.reassignedInvoices },
        reassigned_purchase_orders: {
          from: null,
          to: counts.reassignedPurchaseOrders,
        },
      });
    } catch (logErr) {
      console.error("[activity_log] job delete log failed:", logErr);
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${job.project_id}`);
    return {
      ok: true,
      data: {
        reassignedCostCenters: counts.reassignedCostCenters,
        reassignedInvoices: counts.reassignedInvoices,
        reassignedPurchaseOrders: counts.reassignedPurchaseOrders,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 5d — add a Change Order Job manually (no source quote). For scope discovered
// during install that didn't originate from a quote. co_number auto-assigned;
// contract_value defaults 0; source_quote_id NULL. Scaffolds the C.O folder tree
// (best-effort). Best-effort 'create' log.
export async function addChangeOrderJobAction(input: {
  projectId: string;
  title: string;
  contractValue?: number;
}): Promise<
  { ok: true; data: { jobId: string } } | { ok: false; error: string }
> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };

    const title = input.title?.trim() ?? "";
    if (title.length === 0 || title.length > 200) {
      return { ok: false, error: "invalid_title" };
    }
    const contractValue = input.contractValue ?? 0;
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      return { ok: false, error: "invalid_contract_value" };
    }

    // createChangeOrderJob assigns the next co_number internally.
    const job = await createChangeOrderJob({
      projectId: input.projectId,
      title,
      sourceQuoteId: null,
      contractValue,
      actorId: gate.actorId,
    });

    // Scaffold the C.O folder subtree (best-effort — needs the project's site).
    try {
      const project = await getProjectRow(input.projectId);
      if (project?.site_id && job.co_number != null) {
        await scaffoldFoldersForNewChangeOrder({
          projectId: input.projectId,
          jobId: job.id,
          coNumber: job.co_number,
          siteId: project.site_id,
          actorId: gate.actorId,
        });
      }
    } catch (scaffoldErr) {
      console.error("[folders] manual C.O scaffold failed:", scaffoldErr);
    }

    // Best-effort audit (§2.8).
    try {
      await logActivity("project", input.projectId, "create", {
        job_id: { from: null, to: job.id },
        co_number: { from: null, to: job.co_number },
        source: { from: null, to: "manual" },
      });
    } catch (logErr) {
      console.error("[activity_log] manual C.O create log failed:", logErr);
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, data: { jobId: job.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
