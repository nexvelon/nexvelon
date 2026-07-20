import "server-only";

// PROJ2-8 — move / reparent. The "converted to the wrong place" safety valve:
//   • moveChangeOrderToProject — move a C.O Job (and everything hanging off it)
//     to another SAME-client SAME-opco project; it takes the target's next
//     co_number.
//   • promoteChangeOrderToProject — a C.O becomes the Main Job of a brand-new
//     project on the same site/client/opco.
//   • moveProjectToSite — move a whole project to another site, including
//     cross-client (the ACTION layer gates that behind an explicit confirm).
//
// Sequential writes, reassign-before-anything-breaks ordering — supabase-js has
// no cross-statement transactions, so statements are ordered such that a
// partial failure never orphans a financial record (the 4d
// deleteChangeOrderJobAction pattern). Totals re-syncs and activity logs are
// best-effort (§2.8). Quotes are NEVER rewritten (§2.2 — historical documents);
// cost-center cc_numbers keep their original PJ prefix (§2.2 — historical).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getJobById,
  getProjectRow,
  getNextCoNumber,
  getMainJobForProject,
} from "@/lib/api/projects";
import { syncCostCenterAndJobTotals } from "@/lib/api/job-line-items";
import { logActivity } from "@/lib/api/activity-log";
import { businessProjectNumber } from "@/lib/format";
import type { DbAttachmentFolder, DbProject } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

// The default (scaffold-issued) C.O folder name — user-renamed folders never
// match and keep their names on a move.
const DEFAULT_CO_FOLDER_NAME = /^C\.O #\d+$/;

// ── Shared plumbing ──────────────────────────────────────────────────────────

/** Reassign the project_id on every financial record hanging off a job. */
async function reassignJobFinancials(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string,
  targetProjectId: string
): Promise<void> {
  const { error: ccErr } = await supabase
    .from("project_cost_centers")
    .update({ project_id: targetProjectId })
    .eq("job_id", jobId);
  if (ccErr) throw new Error(`jobMove/costCenters: ${ccErr.message}`);

  const { error: invErr } = await supabase
    .from("invoices")
    .update({ project_id: targetProjectId })
    .eq("job_id", jobId);
  if (invErr) throw new Error(`jobMove/invoices: ${invErr.message}`);

  const { error: poErr } = await supabase
    .from("purchase_orders")
    .update({ project_id: targetProjectId })
    .eq("job_id", jobId);
  if (poErr) throw new Error(`jobMove/purchaseOrders: ${poErr.message}`);
}

/**
 * Move a linked-quote row to the target project. Duplicate-tolerant: if the
 * quote is somehow already linked to the target (UNIQUE(project_id, quote_id)),
 * the stale source link is left in place rather than failing a move whose
 * financial reassignment already happened.
 */
async function moveProjectQuoteLink(
  supabase: Awaited<ReturnType<typeof db>>,
  input: {
    quoteId: string;
    sourceProjectId: string;
    targetProjectId: string;
    role: "change_order" | "original";
    newRole?: "original";
  }
): Promise<void> {
  const patch: Record<string, unknown> = { project_id: input.targetProjectId };
  if (input.newRole) patch.role = input.newRole;
  const { error } = await supabase
    .from("project_quotes")
    .update(patch)
    .eq("quote_id", input.quoteId)
    .eq("project_id", input.sourceProjectId)
    .eq("role", input.role);
  if (error) {
    if (error.code === "23505") {
      console.warn(
        "[job-move] quote already linked to target project; leaving source link:",
        input.quoteId
      );
      return;
    }
    throw new Error(`jobMove/projectQuotes: ${error.message}`);
  }
}

/** The job's C.O folder (kind='change_order'), if the tree was scaffolded. */
async function getChangeOrderFolder(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string
): Promise<DbAttachmentFolder | null> {
  const { data, error } = await supabase
    .from("attachment_folders")
    .select("*")
    .eq("job_id", jobId)
    .eq("kind", "change_order")
    .maybeSingle();
  if (error) throw new Error(`jobMove/coFolder: ${error.message}`);
  return (data as DbAttachmentFolder | null) ?? null;
}

/**
 * The target project's change_orders wrapper folder — created (with the
 * project_container above it if needed) when missing. Shape mirrors
 * scaffoldFoldersForNewProject; we can't call it directly because it also
 * scaffolds a main_job folder + 19 subfolders we don't want here.
 */
async function ensureChangeOrdersWrapper(
  supabase: Awaited<ReturnType<typeof db>>,
  project: Pick<DbProject, "id" | "site_id">,
  actorId: string | null
): Promise<string> {
  if (!project.site_id) throw new Error("jobMove/wrapper: project has no site");

  const { data: wrap, error: wErr } = await supabase
    .from("attachment_folders")
    .select("id")
    .eq("project_id", project.id)
    .eq("kind", "change_orders")
    .maybeSingle();
  if (wErr) throw new Error(`jobMove/wrapper: ${wErr.message}`);
  if (wrap) return (wrap as { id: string }).id;

  // Edge (shouldn't happen post-4b): no wrapper. Find-or-create the project
  // container, then the wrapper under it.
  let containerId: string;
  const { data: cont, error: cErr } = await supabase
    .from("attachment_folders")
    .select("id")
    .eq("project_id", project.id)
    .eq("kind", "project_container")
    .maybeSingle();
  if (cErr) throw new Error(`jobMove/container: ${cErr.message}`);
  if (cont) {
    containerId = (cont as { id: string }).id;
  } else {
    const { count } = await supabase
      .from("attachment_folders")
      .select("id", { count: "exact", head: true })
      .eq("site_id", project.site_id)
      .eq("kind", "project_container");
    const { data: newCont, error: ncErr } = await supabase
      .from("attachment_folders")
      .insert({
        site_id: project.site_id,
        project_id: project.id,
        job_id: null,
        parent_id: null,
        name: `Project ${(count ?? 0) + 1}`,
        slug: "project_container",
        kind: "project_container",
        is_system: true,
        sort_order: 0,
        created_by: actorId,
        updated_by: actorId,
      })
      .select("id")
      .single();
    if (ncErr) throw new Error(`jobMove/newContainer: ${ncErr.message}`);
    containerId = (newCont as { id: string }).id;
  }

  const { data: newWrap, error: nwErr } = await supabase
    .from("attachment_folders")
    .insert({
      site_id: project.site_id,
      project_id: project.id,
      job_id: null,
      parent_id: containerId,
      name: "Change Orders",
      slug: "change_orders",
      kind: "change_orders",
      is_system: true,
      sort_order: 1,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id")
    .single();
  if (nwErr) throw new Error(`jobMove/newWrapper: ${nwErr.message}`);
  return (newWrap as { id: string }).id;
}

/** Flat subtree stamp — every folder of this job (the C.O folder + all
 *  descendants carry job_id, per the 4b scaffold + createUserFolder). */
async function restampJobFolderTree(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string,
  patch: { project_id: string; site_id?: string }
): Promise<void> {
  const { error } = await supabase
    .from("attachment_folders")
    .update(patch)
    .eq("job_id", jobId);
  if (error) throw new Error(`jobMove/folderTree: ${error.message}`);
}

/** Best-effort totals re-sync for a job (recomputes job.contract_value from its
 *  cost centers + unattributed lines — the 6b spine). */
async function resyncJobTotals(jobId: string, actorId: string | null) {
  try {
    await syncCostCenterAndJobTotals({ jobId, costCenterIds: [], actorId });
  } catch (e) {
    console.warn("[job-move] totals re-sync failed for job", jobId, e);
  }
}

async function resyncSourceProjectTotals(
  sourceProjectId: string,
  actorId: string | null
) {
  try {
    const srcMain = await getMainJobForProject(sourceProjectId);
    if (srcMain) await resyncJobTotals(srcMain.id, actorId);
  } catch (e) {
    console.warn("[job-move] source project re-sync failed:", e);
  }
}

// ── 3a. Move a C.O to another project ────────────────────────────────────────

export type MoveChangeOrderResult =
  | { ok: true; newCoNumber: number; sourceProjectId: string }
  | { ok: false; error: string };

export async function moveChangeOrderToProject(input: {
  jobId: string;
  targetProjectId: string;
  actorId: string | null;
}): Promise<MoveChangeOrderResult> {
  const supabase = await db();

  const job = await getJobById(input.jobId);
  if (!job) return { ok: false, error: "not_found" };
  if (job.job_type !== "change_order")
    return { ok: false, error: "cannot_move_main_job" };
  if (job.project_id === input.targetProjectId)
    return { ok: false, error: "same_project" };

  const [source, target] = await Promise.all([
    getProjectRow(job.project_id),
    getProjectRow(input.targetProjectId),
  ]);
  if (!source || !target) return { ok: false, error: "not_found" };
  if (target.client_id !== source.client_id)
    return { ok: false, error: "cross_client" };
  if (target.opco !== source.opco) return { ok: false, error: "cross_opco" };

  // 1. The C.O renumbers into the target's sequence.
  const newCoNumber = await getNextCoNumber(input.targetProjectId);

  // 2. Move the job row itself (project_id + co_number in one statement — the
  //    (project_id, co_number) partial unique index sees the final pair).
  const { error: jobErr } = await supabase
    .from("project_jobs")
    .update({
      project_id: input.targetProjectId,
      co_number: newCoNumber,
      sort_order: newCoNumber,
      updated_by: input.actorId,
    })
    .eq("id", input.jobId);
  if (jobErr) throw new Error(`moveChangeOrder/job: ${jobErr.message}`);

  // 3–5. Cost centers, invoices, POs follow (all keyed by job_id, so they were
  // never detached — this just fixes their project attribution).
  await reassignJobFinancials(supabase, input.jobId, input.targetProjectId);

  // 6. The change_order quote link follows the job.
  if (job.source_quote_id) {
    await moveProjectQuoteLink(supabase, {
      quoteId: job.source_quote_id,
      sourceProjectId: job.project_id,
      targetProjectId: input.targetProjectId,
      role: "change_order",
    });
  }

  // 7. Folder subtree. Folders are site-rooted (site_id NOT NULL), so a target
  // project without a site can't host the tree — skip with a warning (the
  // financial move above stands; folders stay where they are).
  try {
    if (!target.site_id) {
      console.warn(
        "[job-move] target project has no site; folder subtree not moved for job",
        input.jobId
      );
    } else {
      const coFolder = await getChangeOrderFolder(supabase, input.jobId);
      if (coFolder) {
        const wrapperId = await ensureChangeOrdersWrapper(
          supabase,
          target,
          input.actorId
        );
        const isDefaultName = DEFAULT_CO_FOLDER_NAME.test(coFolder.name);
        const { error: cfErr } = await supabase
          .from("attachment_folders")
          .update({
            parent_id: wrapperId,
            project_id: input.targetProjectId,
            site_id: target.site_id,
            sort_order: newCoNumber,
            updated_by: input.actorId,
            // Rename ONLY the untouched default; user-renamed folders keep
            // their name (§2.2). slug tracks the number alongside.
            ...(isDefaultName
              ? { name: `C.O #${newCoNumber}`, slug: `co_${newCoNumber}` }
              : {}),
          })
          .eq("id", coFolder.id);
        if (cfErr) throw new Error(`moveChangeOrder/coFolder: ${cfErr.message}`);

        await restampJobFolderTree(supabase, input.jobId, {
          project_id: input.targetProjectId,
          site_id: target.site_id,
        });
      }
    }
  } catch (folderErr) {
    // Folder tree is presentation, not the financial spine — never unwind the
    // move over it (§2.8), but make the failure loud.
    console.error("[job-move] folder re-parent failed:", folderErr);
  }

  // 8. Recompute both financial spines.
  await resyncJobTotals(input.jobId, input.actorId);
  await resyncSourceProjectTotals(job.project_id, input.actorId);

  // 9. Best-effort log on both projects (§2.8).
  for (const pid of [job.project_id, input.targetProjectId]) {
    try {
      await logActivity("project", pid, "update", {
        job_moved: { from: job.project_id, to: input.targetProjectId },
        job_id: { from: null, to: input.jobId },
        co_number: { from: job.co_number, to: newCoNumber },
      });
    } catch (logErr) {
      console.error("[activity_log] job move log failed:", logErr);
    }
  }

  return { ok: true, newCoNumber, sourceProjectId: job.project_id };
}

// ── 3b. Promote a C.O to its own project ─────────────────────────────────────

export type PromoteChangeOrderResult =
  | { ok: true; newProjectId: string; sourceProjectId: string }
  | { ok: false; error: string };

export async function promoteChangeOrderToProject(input: {
  jobId: string;
  actorId: string | null;
}): Promise<PromoteChangeOrderResult> {
  const supabase = await db();

  const job = await getJobById(input.jobId);
  if (!job) return { ok: false, error: "not_found" };
  if (job.job_type !== "change_order")
    return { ok: false, error: "cannot_move_main_job" };

  const source = await getProjectRow(job.project_id);
  if (!source) return { ok: false, error: "not_found" };

  // 2. The new project — same site/client/opco as the source; the C.O's quote
  // becomes its originating quote.
  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .insert({
      project_number: businessProjectNumber(),
      opco: source.opco,
      client_id: source.client_id,
      site_id: source.site_id,
      title: job.title,
      status: "active",
      originating_quote_id: job.source_quote_id,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (pErr) throw new Error(`promoteChangeOrder/project: ${pErr.message}`);
  const newProject = proj as DbProject;

  // 3. Flip the job in ONE statement — job_type + co_number together satisfies
  // the co_number_shape CHECK; the new project has no main_job yet so the
  // partial unique index admits it.
  const { error: jobErr } = await supabase
    .from("project_jobs")
    .update({
      project_id: newProject.id,
      job_type: "main_job",
      co_number: null,
      sort_order: 0,
      updated_by: input.actorId,
    })
    .eq("id", input.jobId);
  if (jobErr) throw new Error(`promoteChangeOrder/job: ${jobErr.message}`);

  // 4. Financial records follow.
  await reassignJobFinancials(supabase, input.jobId, newProject.id);

  // 5. The quote link moves AND becomes the new project's original.
  if (job.source_quote_id) {
    await moveProjectQuoteLink(supabase, {
      quoteId: job.source_quote_id,
      sourceProjectId: job.project_id,
      targetProjectId: newProject.id,
      role: "change_order",
      newRole: "original",
    });
  }

  // 6. Folders: build ONLY the container + change_orders wrapper for the new
  // project, then reuse the job's existing folder subtree as its Main Job
  // folder — existing files keep their folders, nothing is duplicated.
  // (Deviation from the spec's "use scaffoldFoldersForNewProject": that helper
  // unconditionally creates a main_job folder + 19 subfolders, which is exactly
  // the duplication to avoid — so the container/wrapper are created manually in
  // the same shape.)
  try {
    if (!source.site_id) {
      console.warn(
        "[job-move] source project has no site; no folder tree to promote for job",
        input.jobId
      );
    } else {
      const coFolder = await getChangeOrderFolder(supabase, input.jobId);
      if (coFolder) {
        const wrapperId = await ensureChangeOrdersWrapper(
          supabase,
          newProject,
          input.actorId
        );
        // The wrapper's parent IS the new container.
        const wrapper = await supabase
          .from("attachment_folders")
          .select("parent_id")
          .eq("id", wrapperId)
          .maybeSingle();
        const containerId =
          (wrapper.data as { parent_id: string | null } | null)?.parent_id ??
          null;
        if (!containerId)
          throw new Error("promoteChangeOrder/folders: container not found");

        const isDefaultName = DEFAULT_CO_FOLDER_NAME.test(coFolder.name);
        const { error: cfErr } = await supabase
          .from("attachment_folders")
          .update({
            parent_id: containerId,
            project_id: newProject.id,
            kind: "main_job",
            slug: "main_job",
            sort_order: 0,
            updated_by: input.actorId,
            ...(isDefaultName ? { name: "Main Job" } : {}),
          })
          .eq("id", coFolder.id);
        if (cfErr)
          throw new Error(`promoteChangeOrder/coFolder: ${cfErr.message}`);

        // Same site, so only project_id needs restamping on the subtree.
        await restampJobFolderTree(supabase, input.jobId, {
          project_id: newProject.id,
        });
      }
    }
  } catch (folderErr) {
    console.error("[job-move] promote folder re-parent failed:", folderErr);
  }

  // 7. Recompute both financial spines.
  await resyncJobTotals(input.jobId, input.actorId);
  await resyncSourceProjectTotals(job.project_id, input.actorId);

  // 8. Best-effort log on both projects (§2.8).
  for (const pid of [job.project_id, newProject.id]) {
    try {
      await logActivity("project", pid, "update", {
        job_promoted: { from: job.project_id, to: newProject.id },
        job_id: { from: null, to: input.jobId },
        co_number: { from: job.co_number, to: null },
        new_project_number: { from: null, to: newProject.project_number },
      });
    } catch (logErr) {
      console.error("[activity_log] job promote log failed:", logErr);
    }
  }

  return { ok: true, newProjectId: newProject.id, sourceProjectId: job.project_id };
}

// ── 3c. Move a project to another site ───────────────────────────────────────

export interface MoveTargetSite {
  id: string;
  name: string;
  client_id: string;
  client_name: string | null;
}

/** Target-site read used by the action's cross-client confirm gate + the UI. */
export async function getSiteForMove(
  siteId: string
): Promise<MoveTargetSite | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, client_id, client:clients(name)")
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw new Error(`getSiteForMove: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    name: string;
    client_id: string;
    client: { name: string } | null;
  };
  return {
    id: row.id,
    name: row.name,
    client_id: row.client_id,
    client_name: row.client?.name ?? null,
  };
}

/** Active sites (all clients) for the project-move picker. */
export async function listSitesForProjectMove(): Promise<MoveTargetSite[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, client_id, client:clients(name)")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(`listSitesForProjectMove: ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    client_id: string;
    client: { name: string } | null;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    client_name: r.client?.name ?? null,
  }));
}

export type MoveProjectResult = { ok: true } | { ok: false; error: string };

export async function moveProjectToSite(input: {
  projectId: string;
  targetSiteId: string;
  actorId: string | null;
}): Promise<MoveProjectResult> {
  const supabase = await db();

  const project = await getProjectRow(input.projectId);
  if (!project) return { ok: false, error: "not_found" };
  if (project.site_id === input.targetSiteId)
    return { ok: false, error: "same_site" };

  const site = await getSiteForMove(input.targetSiteId);
  if (!site) return { ok: false, error: "not_found" };

  // 1. The project itself — site AND client follow the target site (cross-
  // client moves are allowed; the action layer required the explicit confirm).
  const { error: pErr } = await supabase
    .from("projects")
    .update({
      site_id: site.id,
      client_id: site.client_id,
      updated_by: input.actorId,
    })
    .eq("id", input.projectId);
  if (pErr) throw new Error(`moveProjectToSite/project: ${pErr.message}`);

  // 2. The whole folder tree re-roots to the new site (one flat statement —
  // every folder of the project carries project_id).
  const { error: fErr } = await supabase
    .from("attachment_folders")
    .update({ site_id: site.id })
    .eq("project_id", input.projectId);
  if (fErr) throw new Error(`moveProjectToSite/folders: ${fErr.message}`);

  // 3. Invoices carry their own site_id + client_id (0043) — both follow.
  const { error: iErr } = await supabase
    .from("invoices")
    .update({ site_id: site.id, client_id: site.client_id })
    .eq("project_id", input.projectId);
  if (iErr) throw new Error(`moveProjectToSite/invoices: ${iErr.message}`);

  // 4. quotes.intended_target_project_id rows survive by FK; linked quotes are
  // historical documents and are NEVER rewritten (§2.2).

  // 5. Best-effort log (§2.8).
  try {
    await logActivity("project", input.projectId, "update", {
      site_id: { from: project.site_id, to: site.id },
      ...(project.client_id !== site.client_id
        ? { client_id: { from: project.client_id, to: site.client_id } }
        : {}),
    });
  } catch (logErr) {
    console.error("[activity_log] project site move log failed:", logErr);
  }

  return { ok: true };
}

// ── Move-target listings for the UI ──────────────────────────────────────────

export interface JobMoveTarget {
  id: string;
  project_number: string;
  title: string | null;
  status: string;
  site_name: string | null;
  // What co_number the job would take there (for the confirm copy).
  next_co_number: number;
}

/** Same-client same-opco projects (any site) a C.O could move to — excludes the
 *  job's current project and cancelled projects. */
export async function listMoveTargetsForJob(
  jobId: string
): Promise<JobMoveTarget[]> {
  const job = await getJobById(jobId);
  if (!job) return [];
  const source = await getProjectRow(job.project_id);
  if (!source) return [];

  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_number, title, status, site:sites(name)")
    .eq("client_id", source.client_id)
    .eq("opco", source.opco)
    .neq("id", job.project_id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMoveTargetsForJob: ${error.message}`);
  const rows = ((data ?? []) as unknown as Array<{
    id: string;
    project_number: string;
    title: string | null;
    status: string;
    site: { name: string } | null;
  }>);

  // The co_number the job would take in each candidate — one query, grouped.
  const maxCoByProject = new Map<string, number>();
  if (rows.length > 0) {
    const { data: coData, error: coErr } = await supabase
      .from("project_jobs")
      .select("project_id, co_number")
      .in(
        "project_id",
        rows.map((r) => r.id)
      )
      .eq("job_type", "change_order");
    if (coErr) throw new Error(`listMoveTargetsForJob/cos: ${coErr.message}`);
    for (const c of (coData ?? []) as {
      project_id: string;
      co_number: number | null;
    }[]) {
      maxCoByProject.set(
        c.project_id,
        Math.max(maxCoByProject.get(c.project_id) ?? 0, c.co_number ?? 0)
      );
    }
  }

  return rows.map((r) => ({
    id: r.id,
    project_number: r.project_number,
    title: r.title,
    status: r.status,
    site_name: r.site?.name ?? null,
    next_co_number: (maxCoByProject.get(r.id) ?? 0) + 1,
  }));
}
