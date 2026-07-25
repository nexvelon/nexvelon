import "server-only";

// PROJ2-17 — cost codes (an org-level taxonomy) and the estimate-vs-actual cost
// breakdown by code. Cost codes CATEGORISE the rollup's numbers; they do not
// change them.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MAPPING (3b) — how estimated and actual attribute to a code/category:
//
//   ESTIMATED — per LINE ITEM. A line's effective code is its cost_code_id when
//   set (and active), else the DEFAULT code for its line_kind's category
//   (part → materials-primary, labour → labour-primary). So an UNCODED line is
//   never lost — it falls into a category by line_kind. Estimated cost per line
//   = quantity × unit_cost.
//
//   ACTUAL — per CATEGORY, from the rollup's canonical spent legs (no
//   per-transaction tagging in v1):
//     materials  (inventory_stock cost)  → 'materials'    category
//     labour     (labour_entries)        → 'labour'       category
//     sub_labour (sub bills)             → 'subcontractor'category
//     equipment / other                 → 0 (no actual source in v1)
//   Each category's actual is assigned to that category's PRIMARY code (its
//   lowest sort_order active code — the seeded MAT/LAB/SUB). Additional codes in
//   a category carry estimated but no actual, because the actual can't be split
//   without per-transaction codes. billed_cost (supplier bills) is the
//   supplementary memo leg and stays OUT of this breakdown, exactly as it stays
//   out of `spent`.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getJobById } from "@/lib/api/projects";
import type {
  DbCostCategory,
  DbCostCode,
  DbCostCodeInsert,
  DbCostCodeUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type CostCodeErrorCode = "duplicate_code" | "not_found" | "in_use";

export class CostCodeError extends Error {
  code: CostCodeErrorCode;
  constructor(code: CostCodeErrorCode, message: string) {
    super(message);
    this.name = "CostCodeError";
    this.code = code;
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listCostCodes(
  opts: { activeOnly?: boolean } = {}
): Promise<DbCostCode[]> {
  const supabase = await db();
  let q = supabase.from("cost_codes").select("*");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw new Error(`listCostCodes: ${error.message}`);
  return (data ?? []) as DbCostCode[];
}

export interface CreateCostCodeInput {
  code: string;
  name: string;
  category: DbCostCategory;
  sortOrder?: number;
}

function isUnique(msg: string): boolean {
  return msg.includes("cost_codes_code_key") || msg.includes("duplicate key value");
}

export async function createCostCode(input: CreateCostCodeInput): Promise<DbCostCode> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new CostCodeError("not_found", "A code is required.");
  if (!input.name.trim()) throw new CostCodeError("not_found", "A name is required.");
  const supabase = await db();
  const payload: DbCostCodeInsert = {
    code,
    name: input.name.trim(),
    category: input.category,
    sort_order: input.sortOrder ?? 50,
  };
  const { data, error } = await supabase
    .from("cost_codes")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    if (isUnique(error.message)) {
      throw new CostCodeError("duplicate_code", `A cost code "${code}" already exists.`);
    }
    throw new Error(`createCostCode: ${error.message}`);
  }
  return data as DbCostCode;
}

export async function updateCostCode(
  id: string,
  patch: { name?: string; category?: DbCostCategory; sortOrder?: number }
): Promise<DbCostCode> {
  const supabase = await db();
  const update: DbCostCodeUpdate = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from("cost_codes")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateCostCode: ${error.message}`);
  return data as DbCostCode;
}

export async function setCostCodeActive(id: string, isActive: boolean): Promise<DbCostCode> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("cost_codes")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setCostCodeActive: ${error.message}`);
  return data as DbCostCode;
}

/**
 * Delete a cost code — but ONLY when nothing references it. Prefer DEACTIVATE
 * (setCostCodeActive false) for a code that's been used: the SET NULL FK would
 * silently un-code historical line items, losing intent. A referenced code
 * throws 'in_use'.
 */
export async function deleteCostCode(id: string): Promise<boolean> {
  const supabase = await db();
  const { count, error: cErr } = await supabase
    .from("job_line_items")
    .select("id", { count: "exact", head: true })
    .eq("cost_code_id", id);
  if (cErr) throw new Error(`deleteCostCode/refcheck: ${cErr.message}`);
  if ((count ?? 0) > 0) {
    throw new CostCodeError(
      "in_use",
      "This cost code is used by line items — deactivate it instead of deleting."
    );
  }
  const { data, error } = await supabase
    .from("cost_codes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteCostCode: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Breakdown by code ───────────────────────────────────────────────────────

export interface CostCodeBreakdownRow {
  code: string;
  name: string;
  category: DbCostCategory;
  estimated: number;
  actual: number;
  /** actual − estimated (positive = over the estimate). */
  variance: number;
}

export interface CostCodeBreakdown {
  rows: CostCodeBreakdownRow[];
  totals: { estimated: number; actual: number; variance: number };
}

/** part → materials, labour → labour. The proto-category from line_kind (3a). */
function categoryForLineKind(lineKind: string): DbCostCategory {
  return lineKind === "labour" ? "labour" : "materials";
}

/**
 * Estimate-vs-actual by code for a job (jobId) or a whole project (projectId).
 * Reuses the rollup for actuals and the line items for estimated (see the
 * mapping note at the top of this file).
 */
export async function getCostBreakdownByCode(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<CostCodeBreakdown> {
  const supabase = await db();
  const codes = await listCostCodes({ activeOnly: false });

  // The PRIMARY (representative) code per category — lowest sort_order active.
  const primaryByCategory = new Map<DbCostCategory, DbCostCode>();
  for (const c of [...codes].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!c.is_active) continue;
    if (!primaryByCategory.has(c.category)) primaryByCategory.set(c.category, c);
  }
  const codeById = new Map(codes.map((c) => [c.id, c]));

  // Resolve the scope: a single job, or every job in the project.
  let jobIds: string[];
  let projectId: string;
  if (scope.jobId) {
    const job = await getJobById(scope.jobId);
    if (!job) return { rows: [], totals: { estimated: 0, actual: 0, variance: 0 } };
    jobIds = [scope.jobId];
    projectId = job.project_id;
  } else if (scope.projectId) {
    projectId = scope.projectId;
    const { data, error } = await supabase
      .from("project_jobs")
      .select("id")
      .eq("project_id", projectId);
    if (error) throw new Error(`getCostBreakdownByCode/jobs: ${error.message}`);
    jobIds = ((data ?? []) as { id: string }[]).map((j) => j.id);
  } else {
    return { rows: [], totals: { estimated: 0, actual: 0, variance: 0 } };
  }

  // ESTIMATED — per line item, keyed by effective code.
  const estimatedByCode = new Map<string, number>();
  if (jobIds.length > 0) {
    const { data: liData, error: liErr } = await supabase
      .from("job_line_items")
      .select("line_kind, quantity, unit_cost, cost_code_id")
      .in("job_id", jobIds);
    if (liErr) throw new Error(`getCostBreakdownByCode/lines: ${liErr.message}`);
    for (const l of (liData ?? []) as {
      line_kind: string;
      quantity: number | null;
      unit_cost: number | null;
      cost_code_id: string | null;
    }[]) {
      const cost = round2(Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0));
      const coded = l.cost_code_id ? codeById.get(l.cost_code_id) : undefined;
      const effective =
        coded && coded.is_active
          ? coded
          : primaryByCategory.get(categoryForLineKind(l.line_kind));
      if (!effective) continue;
      estimatedByCode.set(
        effective.code,
        round2((estimatedByCode.get(effective.code) ?? 0) + cost)
      );
    }
  }

  // ACTUAL — per category, from the rollup's spent legs → each category primary.
  const rollup = await getProjectCostRollup(projectId);
  let materials = 0;
  let labour = 0;
  let subLabour = 0;
  if (scope.jobId) {
    const j = rollup.byJob.find((r) => r.job_id === scope.jobId);
    materials = Number(j?.materials ?? 0);
    labour = Number(j?.labour ?? 0);
    subLabour = Number(j?.sub_labour ?? 0);
  } else {
    materials = Number(rollup.perProject.materials ?? 0);
    labour = Number(rollup.perProject.labour ?? 0);
    subLabour = Number(rollup.perProject.sub_labour ?? 0);
  }
  const actualByCategory: Record<DbCostCategory, number> = {
    materials: round2(materials),
    labour: round2(labour),
    subcontractor: round2(subLabour),
    equipment: 0,
    other: 0,
  };
  const actualByCode = new Map<string, number>();
  for (const [category, amount] of Object.entries(actualByCategory) as [DbCostCategory, number][]) {
    if (amount === 0) continue;
    const primary = primaryByCategory.get(category);
    if (primary) actualByCode.set(primary.code, round2((actualByCode.get(primary.code) ?? 0) + amount));
  }

  // Merge into rows — any code with estimated OR actual activity.
  const activeCodes = new Set([...estimatedByCode.keys(), ...actualByCode.keys()]);
  const byCode = new Map(codes.map((c) => [c.code, c]));
  const rows: CostCodeBreakdownRow[] = [...activeCodes]
    .map((code) => {
      const c = byCode.get(code);
      const estimated = round2(estimatedByCode.get(code) ?? 0);
      const actual = round2(actualByCode.get(code) ?? 0);
      return {
        code,
        name: c?.name ?? code,
        category: c?.category ?? "other",
        estimated,
        actual,
        variance: round2(actual - estimated),
      };
    })
    .sort((a, b) => {
      const sa = byCode.get(a.code)?.sort_order ?? 99;
      const sb = byCode.get(b.code)?.sort_order ?? 99;
      return sa - sb || a.code.localeCompare(b.code);
    });

  const totals = rows.reduce(
    (acc, r) => ({
      estimated: round2(acc.estimated + r.estimated),
      actual: round2(acc.actual + r.actual),
      variance: round2(acc.variance + r.variance),
    }),
    { estimated: 0, actual: 0, variance: 0 }
  );

  return { rows, totals };
}
