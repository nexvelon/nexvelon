import "server-only";

// PROJ-1 — server-only projects API (public.projects + project_quotes +
// project_cost_centers, migration 0041). Cookie-aware server client (RLS),
// created_by/updated_by from the auth uid. The whole projects domain (tasks /
// schedule / materials / invoicing) layers on top of this spine later.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessProjectNumber, costCenterNumber } from "@/lib/format";
import { sectionSubtotal, round2 } from "@/lib/quote-helpers";
import type {
  DbProject,
  DbProjectCostCenter,
} from "@/lib/types/database";
import type { Quote } from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
}

/** A list/detail row: the project + its client & site display names. */
export interface ProjectListRow extends DbProject {
  client_name: string | null;
  site_name: string | null;
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
  client: { name: string } | null;
  site: { name: string } | null;
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
  };
}

export async function listProjects(): Promise<ProjectListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("*, client:clients(name), site:sites(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listProjects: ${error.message}`);
  return ((data ?? []) as ProjectJoinRow[]).map(splitJoin);
}

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  const supabase = await db();
  const { data: proj, error } = await supabase
    .from("projects")
    .select("*, client:clients(name), site:sites(name)")
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

/**
 * PROJ-1 — convert a quote into a real project: mint the P-number, insert the
 * project (opco inherited from the quote template), link the originating quote,
 * and seed one cost center per quote section (PJ-numbered). Returns the project.
 */
export async function createProjectFromQuote(quote: Quote): Promise<DbProject> {
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

  const { error: pqErr } = await supabase
    .from("project_quotes")
    .insert({ project_id: project.id, quote_id: quote.id, role: "original" });
  if (pqErr) throw new Error(`createProjectFromQuote/link: ${pqErr.message}`);

  const sections = quote.sections ?? [];
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
    }));
    const { error: ccErr } = await supabase
      .from("project_cost_centers")
      .insert(ccRows);
    if (ccErr)
      throw new Error(`createProjectFromQuote/costCenters: ${ccErr.message}`);
  }

  return project;
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
): Promise<DbProject> {
  const supabase = await db();

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

  // Seed cost centers CONTINUING the PJ sequence (after the current max).
  const sections = quote.sections ?? [];
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
    }));
    const { error: ccErr } = await supabase
      .from("project_cost_centers")
      .insert(ccRows);
    if (ccErr)
      throw new Error(`mergeQuoteIntoProject/costCenters: ${ccErr.message}`);
  }

  return project;
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
