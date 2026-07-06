import "server-only";

// PROJ-1 — server-only projects API (public.projects + project_quotes +
// project_cost_centers, migration 0041). Cookie-aware server client (RLS),
// created_by/updated_by from the auth uid. The whole projects domain (tasks /
// schedule / materials / invoicing) layers on top of this spine later.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessProjectNumber, costCenterNumber } from "@/lib/format";
import { sectionSubtotal, round2 } from "@/lib/quote-helpers";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import type {
  DbProject,
  DbProjectCostCenter,
  DbJob,
  ProjectStatus,
} from "@/lib/types/database";
import type { Quote } from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
}

/** A list/detail row: the project + its client & site display names. */
export interface ProjectListRow extends DbProject {
  client_name: string | null;
  site_name: string | null;
  // POLISH-46 — true when the linked site has been soft-deleted (archived).
  site_deleted: boolean;
  // POLISH-57 — true when the parent client has been soft-deleted (archived).
  client_deleted: boolean;
}

export interface ProjectLinkedQuote {
  quote_id: string;
  number: string | null;
  role: string;
}

export interface ProjectDetail {
  project: DbProject;
  client_name: string | null;
  site_name: string | null;
  costCenters: DbProjectCostCenter[];
  quotes: ProjectLinkedQuote[];
}

// Join row shapes (Supabase nests the FK selects).
type ProjectJoinRow = DbProject & {
  client: { name: string; deleted_at: string | null } | null;
  site: { name: string; deleted_at: string | null } | null;
};
type ProjectQuoteJoinRow = {
  quote_id: string;
  role: string;
  quote: { number: string | null } | null;
};

function splitJoin(r: ProjectJoinRow): ProjectListRow {
  const { client, site, ...proj } = r;
  return {
    ...(proj as DbProject),
    client_name: client?.name ?? null,
    site_name: site?.name ?? null,
    site_deleted: !!site?.deleted_at,
    client_deleted: !!client?.deleted_at,
  };
}

export async function listProjects(): Promise<ProjectListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("*, client:clients(name,deleted_at), site:sites(name,deleted_at)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listProjects: ${error.message}`);
  return ((data ?? []) as ProjectJoinRow[]).map(splitJoin);
}

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  const supabase = await db();
  const { data: proj, error } = await supabase
    .from("projects")
    .select("*, client:clients(name,deleted_at), site:sites(name,deleted_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProjectById: ${error.message}`);
  if (!proj) return null;
  const row = splitJoin(proj as ProjectJoinRow);

  const [{ data: ccs, error: ccErr }, { data: pqs, error: pqErr }] =
    await Promise.all([
      supabase
        .from("project_cost_centers")
        .select("*")
        .eq("project_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("project_quotes")
        .select("quote_id, role, quote:quotes(number)")
        .eq("project_id", id)
        .order("created_at", { ascending: true }),
    ]);
  if (ccErr) throw new Error(`getProjectById/costCenters: ${ccErr.message}`);
  if (pqErr) throw new Error(`getProjectById/quotes: ${pqErr.message}`);

  // Supabase types the embedded to-one `quote` as an array in the query
  // inference; at runtime it's a single object. Cast via unknown + normalize.
  const quotes: ProjectLinkedQuote[] = (
    (pqs ?? []) as unknown as ProjectQuoteJoinRow[]
  ).map((q) => ({
    quote_id: q.quote_id,
    number: q.quote?.number ?? null,
    role: q.role,
  }));

  const { client_name, site_name, ...project } = row;
  return {
    project: project as DbProject,
    client_name,
    site_name,
    costCenters: (ccs ?? []) as DbProjectCostCenter[],
    quotes,
  };
}

// ── Jobs (PROJ2-4a) ──────────────────────────────────────────────────────────

/** All jobs for a project — Main Job first, then Change Orders by co_number. */
export async function listJobsForProject(projectId: string): Promise<DbJob[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_jobs")
    .select("*")
    .eq("project_id", projectId)
    // main_job sorts before change_order; then by sort_order, then co_number.
    .order("job_type", { ascending: true }) // 'change_order' < 'main_job' — reversed below
    .order("sort_order", { ascending: true })
    .order("co_number", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listJobsForProject: ${error.message}`);
  const rows = (data ?? []) as DbJob[];
  // Guarantee Main Job first regardless of text ordering of job_type.
  return rows.sort((a, b) => {
    if (a.job_type !== b.job_type) return a.job_type === "main_job" ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.co_number ?? 0) - (b.co_number ?? 0);
  });
}

export async function getJobById(jobId: string): Promise<DbJob | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`getJobById: ${error.message}`);
  return (data as DbJob | null) ?? null;
}

export async function getMainJobForProject(
  projectId: string
): Promise<DbJob | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("job_type", "main_job")
    .maybeSingle();
  if (error) throw new Error(`getMainJobForProject: ${error.message}`);
  return (data as DbJob | null) ?? null;
}

/** Next co_number for a project's Change Orders — max(co_number)+1, or 1. */
export async function getNextCoNumber(projectId: string): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_jobs")
    .select("co_number")
    .eq("project_id", projectId)
    .eq("job_type", "change_order")
    .order("co_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getNextCoNumber: ${error.message}`);
  const max = (data ?? [])[0]?.co_number as number | undefined;
  return (max ?? 0) + 1;
}

export async function createMainJob(input: {
  projectId: string;
  title: string;
  sourceQuoteId: string | null;
  contractValue: number;
  actorId: string | null;
}): Promise<DbJob> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_jobs")
    .insert({
      project_id: input.projectId,
      job_type: "main_job",
      co_number: null,
      title: input.title,
      source_quote_id: input.sourceQuoteId,
      contract_value: round2(input.contractValue),
      status: "active",
      sort_order: 0,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createMainJob: ${error.message}`);
  return data as DbJob;
}

export async function createChangeOrderJob(input: {
  projectId: string;
  title: string;
  sourceQuoteId: string;
  contractValue: number;
  actorId: string | null;
}): Promise<DbJob> {
  const supabase = await db();
  const coNumber = await getNextCoNumber(input.projectId);
  const { data, error } = await supabase
    .from("project_jobs")
    .insert({
      project_id: input.projectId,
      job_type: "change_order",
      co_number: coNumber,
      title: input.title,
      source_quote_id: input.sourceQuoteId,
      contract_value: round2(input.contractValue),
      status: "active",
      sort_order: coNumber,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createChangeOrderJob: ${error.message}`);
  return data as DbJob;
}

/** Reassign a cost center to a Job (used when CCs need to move to a C.O Job). */
export async function updateCostCenterJob(input: {
  costCenterId: string;
  jobId: string;
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("project_cost_centers")
    .update({ job_id: input.jobId })
    .eq("id", input.costCenterId);
  if (error) throw new Error(`updateCostCenterJob: ${error.message}`);
}

/**
 * PROJ-1 — convert a quote into a real project: mint the P-number, insert the
 * project (opco inherited from the quote template), link the originating quote,
 * and seed one cost center per quote section (PJ-numbered).
 * PROJ2-4a — also creates the Main Job and hangs every cost center off it.
 * Returns the project + its Main Job.
 */
export async function createProjectFromQuote(
  quote: Quote
): Promise<{ project: DbProject; mainJob: DbJob }> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectNumber = businessProjectNumber();

  const { data: proj, error } = await supabase
    .from("projects")
    .insert({
      project_number: projectNumber,
      opco: quote.templateSlug ?? "integrated_solutions",
      client_id: quote.clientId,
      site_id: quote.siteId || null,
      title: quote.name ?? null,
      status: "active",
      originating_quote_id: quote.id,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProjectFromQuote: ${error.message}`);
  const project = proj as DbProject;
  const actorId = user?.id ?? null;

  const { error: pqErr } = await supabase
    .from("project_quotes")
    .insert({ project_id: project.id, quote_id: quote.id, role: "original" });
  if (pqErr) throw new Error(`createProjectFromQuote/link: ${pqErr.message}`);

  // PROJ2-4a — the Main Job. contract_value = sum of the quote's section
  // subtotals (the same values seeded onto the cost centers below).
  const sections = quote.sections ?? [];
  const contractValue = round2(
    sections.reduce((sum, s) => sum + sectionSubtotal(s), 0)
  );
  const mainJob = await createMainJob({
    projectId: project.id,
    title: quote.name?.trim() || project.project_number,
    sourceQuoteId: quote.id,
    contractValue,
    actorId,
  });

  if (sections.length > 0) {
    const ccRows = sections.map((s, i) => ({
      project_id: project.id,
      cc_number: costCenterNumber(projectNumber, i + 1),
      name: s.name || `Cost center ${i + 1}`,
      sort_order: i,
      // PROJ-2: provenance — these centers came from the originating quote.
      source_quote_id: quote.id,
      // INVOICE-1: seed the contracted value from the quote section total; an
      // invoice draw later pulls a full or partial % of this.
      contract_value: round2(sectionSubtotal(s)),
      // PROJ2-4a — every original cost center hangs off the Main Job.
      job_id: mainJob.id,
    }));
    const { error: ccErr } = await supabase
      .from("project_cost_centers")
      .insert(ccRows);
    if (ccErr)
      throw new Error(`createProjectFromQuote/costCenters: ${ccErr.message}`);
  }

  return { project, mainJob };
}

/** PROJ-2 — projects a quote may be merged into: SAME client + SAME opco. */
export interface MergeCandidate {
  id: string;
  project_number: string;
  title: string | null;
  status: string;
}

export async function listProjectsForClient(
  clientId: string,
  opco: string
): Promise<MergeCandidate[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_number, title, status")
    .eq("client_id", clientId)
    .eq("opco", opco)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listProjectsForClient: ${error.message}`);
  return (data ?? []) as MergeCandidate[];
}

/**
 * PROJ-2 — merge a quote into an EXISTING project as a change order: link it
 * (role 'change_order') and seed its sections as ADDITIONAL cost centers that
 * CONTINUE the project's PJ sequence (never restart, never reuse). Rejects a
 * cross-client or cross-opco merge. Returns the project.
 */
export async function mergeQuoteIntoProject(
  quote: Quote,
  projectId: string
): Promise<{ project: DbProject; changeOrderJob: DbJob }> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(`mergeQuoteIntoProject: ${pErr.message}`);
  if (!proj) throw new Error("Project not found.");
  const project = proj as DbProject;

  // Guard: never merge across opco or client.
  if (project.opco !== (quote.templateSlug ?? "integrated_solutions")) {
    throw new Error(
      "This quote's entity (opco) doesn't match the project's — can't merge."
    );
  }
  if (project.client_id !== quote.clientId) {
    throw new Error(
      "This quote's client doesn't match the project's — can't merge."
    );
  }

  // Link as a change order (UNIQUE(project_id, quote_id) blocks a double-merge).
  const { error: linkErr } = await supabase.from("project_quotes").insert({
    project_id: project.id,
    quote_id: quote.id,
    role: "change_order",
  });
  if (linkErr) {
    if (linkErr.code === "23505") {
      throw new Error("This quote is already linked to that project.");
    }
    throw new Error(`mergeQuoteIntoProject/link: ${linkErr.message}`);
  }

  // PROJ2-4a — the change-order Job. contract_value = sum of the new sections.
  const sections = quote.sections ?? [];
  const coContractValue = round2(
    sections.reduce((sum, s) => sum + sectionSubtotal(s), 0)
  );
  const changeOrderJob = await createChangeOrderJob({
    projectId: project.id,
    title: quote.name?.trim() || `Change Order`,
    sourceQuoteId: quote.id,
    contractValue: coContractValue,
    actorId,
  });

  // Seed cost centers CONTINUING the PJ sequence (after the current max), each
  // hanging off the new C.O Job.
  if (sections.length > 0) {
    const { maxPj, maxSort } = await currentCostCenterMax(supabase, project.id);
    const ccRows = sections.map((s, i) => ({
      project_id: project.id,
      cc_number: costCenterNumber(project.project_number, maxPj + 1 + i),
      name: s.name || `Cost center ${maxPj + 1 + i}`,
      sort_order: maxSort + 1 + i,
      source_quote_id: quote.id,
      // INVOICE-1: seed the contracted value from the quote section total.
      contract_value: round2(sectionSubtotal(s)),
      // PROJ2-4a — cost centers from this change order hang off its C.O Job.
      job_id: changeOrderJob.id,
    }));
    const { error: ccErr } = await supabase
      .from("project_cost_centers")
      .insert(ccRows);
    if (ccErr)
      throw new Error(`mergeQuoteIntoProject/costCenters: ${ccErr.message}`);
  }

  return { project, changeOrderJob };
}

// Current highest PJ number + sort_order for a project's cost centers — the
// PJ sequence NEVER reuses a number, even across deletes (max parsed + N).
async function currentCostCenterMax(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string
): Promise<{ maxPj: number; maxSort: number }> {
  const { data, error } = await supabase
    .from("project_cost_centers")
    .select("cc_number, sort_order")
    .eq("project_id", projectId);
  if (error) throw new Error(`currentCostCenterMax: ${error.message}`);
  let maxPj = 0;
  let maxSort = -1;
  for (const r of (data ?? []) as { cc_number: string; sort_order: number }[]) {
    const m = /-PJ-(\d+)$/.exec(r.cc_number);
    if (m) maxPj = Math.max(maxPj, parseInt(m[1], 10));
    maxSort = Math.max(maxSort, Number(r.sort_order));
  }
  return { maxPj, maxSort };
}

async function nextCostCenterSlot(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string,
  projectNumber: string
): Promise<{ ccNumber: string; sortOrder: number }> {
  const { maxPj, maxSort } = await currentCostCenterMax(supabase, projectId);
  return {
    ccNumber: costCenterNumber(projectNumber, maxPj + 1),
    sortOrder: maxSort + 1,
  };
}

// PROJ2-1 — minimal status read/write for updateProjectStatusAction. The read
// returns id + status (+ actual_completion for the PROJ2-2 completion hook) so
// the action can validate the transition; the write stamps updated_by
// (updated_at is maintained by the set_updated_at trigger).
export async function getProjectStatus(
  id: string
): Promise<{
  id: string;
  status: ProjectStatus;
  actual_completion: string | null;
} | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id, status, actual_completion")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProjectStatus: ${error.message}`);
  return (
    (data as {
      id: string;
      status: ProjectStatus;
      actual_completion: string | null;
    } | null) ?? null
  );
}

// PROJ2-2 — the optional `actualCompletion` is folded into the SAME update as
// the status change (one round-trip). Callers pass it ONLY when transitioning
// into substantially_complete with a currently-null completion date; otherwise
// actual_completion is left untouched (§2.2 — never cleared once set).
export async function setProjectStatus(
  id: string,
  status: ProjectStatus,
  actorId: string | null,
  actualCompletion?: string
): Promise<void> {
  const supabase = await db();
  const patch: Record<string, unknown> = { status, updated_by: actorId };
  if (actualCompletion !== undefined) patch.actual_completion = actualCompletion;
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw new Error(`setProjectStatus: ${error.message}`);
}

// PROJ2-2 — raw project row for the edit diff.
export async function getProjectRow(id: string): Promise<DbProject | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProjectRow: ${error.message}`);
  return (data as DbProject | null) ?? null;
}

// PROJ2-2 — apply a validated field patch (already diffed by the action) and
// stamp updated_by. Only header-editable columns are ever passed in.
export async function updateProjectFields(
  id: string,
  patch: Record<string, unknown>,
  actorId: string | null
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("projects")
    .update({ ...patch, updated_by: actorId })
    .eq("id", id);
  if (error) throw new Error(`updateProjectFields: ${error.message}`);
}

// PROJ2-1 — lightweight cost-center read used for best-effort audit logging on
// rename/delete (captures the cc_number + prior name).
export async function getCostCenterById(
  id: string
): Promise<Pick<DbProjectCostCenter, "id" | "project_id" | "cc_number" | "name"> | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_cost_centers")
    .select("id, project_id, cc_number, name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCostCenterById: ${error.message}`);
  return (
    (data as Pick<
      DbProjectCostCenter,
      "id" | "project_id" | "cc_number" | "name"
    > | null) ?? null
  );
}

// PROJ2-2 — everything the real project header renders. Raw rollup numbers are
// returned; the caller (ProjectHeader) decides financials visibility per
// permission (redaction is NOT this helper's job).
export interface ProjectHeaderData {
  project: DbProject;
  client_name: string;
  site_name: string | null;
  rollup: {
    contract: number;
    billedPct: number;
    materials: number;
    labour: number;
    spent: number;
    margin: number | null;
  };
  change_order_count: number;
}

export async function getProjectHeaderData(
  projectId: string
): Promise<ProjectHeaderData | null> {
  const detail = await getProjectById(projectId);
  if (!detail) return null;
  const rollup = await getProjectCostRollup(projectId);
  const p = rollup.perProject;
  return {
    project: detail.project,
    client_name: detail.client_name ?? "—",
    site_name: detail.site_name,
    rollup: {
      contract: p.contract,
      billedPct: p.billed_pct ?? 0,
      materials: p.materials,
      labour: p.labour ?? 0,
      spent: p.spent ?? 0,
      margin: p.margin,
    },
    change_order_count: detail.quotes.filter((q) => q.role === "change_order")
      .length,
  };
}

export async function addCostCenter(
  projectId: string,
  name: string
): Promise<DbProjectCostCenter> {
  const supabase = await db();
  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("project_number")
    .eq("id", projectId)
    .single();
  if (pErr) throw new Error(`addCostCenter/project: ${pErr.message}`);
  const { ccNumber, sortOrder } = await nextCostCenterSlot(
    supabase,
    projectId,
    (proj as { project_number: string }).project_number
  );
  const { data, error } = await supabase
    .from("project_cost_centers")
    .insert({
      project_id: projectId,
      cc_number: ccNumber,
      name,
      sort_order: sortOrder,
    })
    .select("*")
    .single();
  if (error) throw new Error(`addCostCenter: ${error.message}`);
  return data as DbProjectCostCenter;
}

export async function renameCostCenter(
  id: string,
  name: string
): Promise<DbProjectCostCenter> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_cost_centers")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`renameCostCenter: ${error.message}`);
  return data as DbProjectCostCenter;
}

export async function deleteCostCenter(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_cost_centers")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteCostCenter: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
