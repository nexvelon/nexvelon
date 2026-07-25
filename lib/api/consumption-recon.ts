import "server-only";

// INV-9-2 (Part A) — consumption reconciliation. Planned material draw vs actual
// material draw for a job, at the DOLLAR level.
//
//   planned  — Σ over the job's part line items of quantity × unit_cost. This is
//              the rollup's Estimated materials leg (live line values), the same
//              number the variance block already derives.
//   actual   — the INV-9-0 materials leg: stock booked to the job's cost-centers
//              (in_stock / allocated / consumed, per the INV-9-0 matrix). Consumed
//              stock now STAYS booked (INV-9-0), so this is the real draw.
//   variance — actual − planned  (>0 over-consumed, <0 under-consumed).
//
// This is a thin derivation over getProjectCostRollup — NOT a re-implementation
// of the stock query. The rollup is the single source of truth for both legs
// (post-INV-9-0), so reconciliation can never drift from the cost numbers shown
// elsewhere on the job.
//
// LIMITATION (honest, surfaced via sku_level_available=false): part line items
// are FREE-TEXT (item_code, no product_id FK to the catalog), so a planned line
// cannot be joined to an inventory product. Reconciliation is therefore
// dollar-level only — "planned $X of material vs actual $Y" — never SKU-level
// ("part ABC: planned 10, drew 8"). Item-level reconciliation is a future item
// that needs product_id on job_line_items.

import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import type { JobVarianceBlock } from "@/lib/api/project-cost-rollup";
import { getJobById } from "@/lib/api/projects";
import { round2 } from "@/lib/quote-helpers";

export interface JobConsumptionReconciliation {
  job_id: string;
  planned_materials: number;
  planned_source: "estimated";
  actual_materials: number;
  variance: number; // actual − planned
  variance_pct: number | null; // null when nothing was planned
  sku_level_available: false;
}

export interface ProjectConsumptionReconciliation {
  project_id: string;
  planned_materials: number;
  actual_materials: number;
  variance: number;
  variance_pct: number | null;
  by_job: JobConsumptionReconciliation[];
  sku_level_available: false;
}

function reconFrom(jobId: string, v: JobVarianceBlock): JobConsumptionReconciliation {
  const planned = round2(v.estimated.materials);
  const actual = round2(v.actual.materials);
  const variance = round2(actual - planned);
  return {
    job_id: jobId,
    planned_materials: planned,
    planned_source: "estimated",
    actual_materials: actual,
    variance,
    variance_pct: planned > 0 ? round2((variance / planned) * 100) : null,
    sku_level_available: false,
  };
}

export async function getJobConsumptionReconciliation(
  jobId: string
): Promise<JobConsumptionReconciliation> {
  const job = await getJobById(jobId);
  if (!job) throw new Error("getJobConsumptionReconciliation: job not found");
  const rollup = await getProjectCostRollup(job.project_id);
  const jr = rollup.byJob.find((j) => j.job_id === jobId);
  if (!jr || !jr.variance) {
    throw new Error("getJobConsumptionReconciliation: job not in rollup");
  }
  return reconFrom(jobId, jr.variance);
}

export async function getProjectConsumptionReconciliation(
  projectId: string
): Promise<ProjectConsumptionReconciliation> {
  const rollup = await getProjectCostRollup(projectId);
  const by_job = rollup.byJob
    .filter((j) => j.variance != null)
    .map((j) => reconFrom(j.job_id, j.variance!));

  const pv = rollup.perProject.variance;
  const planned = round2(pv?.estimated.materials ?? 0);
  const actual = round2(pv?.actual.materials ?? rollup.perProject.materials);
  const variance = round2(actual - planned);
  return {
    project_id: projectId,
    planned_materials: planned,
    actual_materials: actual,
    variance,
    variance_pct: planned > 0 ? round2((variance / planned) * 100) : null,
    by_job,
    sku_level_available: false,
  };
}
