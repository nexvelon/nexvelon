import "server-only";

// PERF-1 — the unified job/project performance board. This is ASSEMBLY, not
// new computation: it reuses the PROJ2-6b variance block (Quoted/Estimated/
// Actual legs from getProjectCostRollup) + the PROJ2-18 WIP figures (earned,
// % complete, over/under-billing) + a single new forecast (lib/performance/
// forecast.ts). It recomputes NO cost leg and NO earned value — those numbers
// come straight from the existing engines, so they cannot move.
//
// Columns: Quoted (5th baseline) · Budgeted (= Estimated leg) · Actual · Earned
//          · Projected (forecast).
// Single ACTUAL cost basis = the rollup's canonical `spent` (inventory-materials
// + labour + sub_labour), i.e. `variance.actual.cost` = `wip.actual_cost`. The
// supplier `billed_cost` basis is deliberately NOT used, so Actual is
// single-valued.
//
// Honesty (§2.8): Sub appears actual-side only (quote/estimate don't classify
// sub → no fabricated budgeted-sub baseline); no Rev/Hr, GM/Hr, or Misc; labour
// Hours/Cost-Hr are actual-only (no line-level hour estimate exists).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getProjectWip, getJobWip } from "@/lib/api/wip";
import { sumLabourHoursForJob, sumLabourHoursForProject } from "@/lib/api/labour";
import {
  projectedCost,
  projectedProfit,
  projectedMarginPct,
} from "@/lib/performance/forecast";
import { round2 } from "@/lib/quote-helpers";
import type { VarianceLeg } from "@/lib/jobs/totals";

export interface PerfLeg {
  revenue: number | null;
  materials: number | null;
  labour: number | null;
  sub: number | null; // actual-side only; null on the budget baselines
  cost: number | null;
  profit: number | null;
  margin_pct: number | null;
}

export interface PerformanceBoard {
  scope: "job" | "project";
  contract: number;
  has_quoted: boolean;
  /** false when no cost estimate exists → % complete + Projected read "—". */
  has_estimate: boolean;
  quoted: PerfLeg | null; // 5th baseline; null when no frozen quote snapshot
  budgeted: PerfLeg; // = the Estimated leg
  actual: PerfLeg;
  earned: { revenue: number | null; pct_complete: number | null };
  projected: { revenue: number | null; cost: number | null; profit: number | null; margin_pct: number | null };
  labour: { hours: number | null; cost: number | null; cost_per_hour: number | null };
  billing: {
    billed: number | null;
    over_under: number | null; // billed − earned (WIP sign convention)
    un_posted: number | null; // earned not yet billed = max(0, earned − billed)
    retention: number; // holdback memo
    remaining_to_bill: number;
  };
}

function legFrom(v: VarianceLeg, showSub: boolean): PerfLeg {
  return {
    revenue: v.revenue,
    materials: v.materials,
    labour: v.labour,
    sub: showSub ? v.sub_labour : null,
    cost: v.cost,
    profit: round2(v.revenue - v.cost),
    margin_pct: v.margin_pct,
  };
}

interface WipLike {
  estimated_cost: number | null;
  actual_cost: number | null;
  pct_complete: number | null;
  earned: number | null;
  billed: number;
  over_under: number | null;
  holdback_retained: number;
  remaining_to_bill: number;
}

function assemble(input: {
  scope: "job" | "project";
  variance: {
    has_quoted_baseline: boolean;
    quoted: VarianceLeg;
    estimated: VarianceLeg;
    actual: VarianceLeg;
  };
  contract: number;
  wip: WipLike;
  labourHours: number;
}): PerformanceBoard {
  const { variance, contract, wip } = input;
  const hasQuoted = variance.has_quoted_baseline;
  const actual = legFrom(variance.actual, true);

  const hasEstimate = wip.estimated_cost != null && wip.estimated_cost > 0;
  const projCost =
    hasEstimate && wip.actual_cost != null
      ? projectedCost(wip.actual_cost, wip.estimated_cost as number)
      : null;
  const projProfit = projCost != null ? projectedProfit(contract, projCost) : null;

  const overUnder = wip.over_under;
  const labourCost = actual.labour;
  const costPerHour =
    labourCost != null && input.labourHours > 0
      ? round2(labourCost / input.labourHours)
      : null;

  return {
    scope: input.scope,
    contract,
    has_quoted: hasQuoted,
    has_estimate: hasEstimate,
    quoted: hasQuoted ? legFrom(variance.quoted, false) : null,
    budgeted: legFrom(variance.estimated, false),
    actual,
    earned: { revenue: wip.earned, pct_complete: wip.pct_complete },
    projected: {
      revenue: projCost != null ? contract : null,
      cost: projCost,
      profit: projProfit,
      margin_pct: projProfit != null ? projectedMarginPct(contract, projProfit) : null,
    },
    labour: { hours: input.labourHours, cost: labourCost, cost_per_hour: costPerHour },
    billing: {
      billed: wip.billed,
      over_under: overUnder,
      un_posted: overUnder != null ? Math.max(0, round2(-overUnder)) : null,
      retention: wip.holdback_retained,
      remaining_to_bill: wip.remaining_to_bill,
    },
  };
}

export async function getProjectPerformanceBoard(projectId: string): Promise<PerformanceBoard> {
  const [rollup, wip, labourHours] = await Promise.all([
    getProjectCostRollup(projectId),
    getProjectWip(projectId),
    sumLabourHoursForProject(projectId),
  ]);
  const variance = rollup.perProject.variance;
  if (!variance) throw new Error("getProjectPerformanceBoard: variance unavailable.");
  return assemble({
    scope: "project",
    variance,
    contract: rollup.perProject.contract,
    wip: wip.rollup,
    labourHours,
  });
}

export async function getJobPerformanceBoard(jobId: string): Promise<PerformanceBoard> {
  const supabase = await createSupabaseServerClient();
  const { data: jobRow, error } = await supabase
    .from("project_jobs")
    .select("project_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`getJobPerformanceBoard/job: ${error.message}`);
  const projectId = (jobRow as { project_id: string } | null)?.project_id;
  if (!projectId) throw new Error("Job not found.");

  const [rollup, wip, labourHours] = await Promise.all([
    getProjectCostRollup(projectId),
    getJobWip(jobId),
    sumLabourHoursForJob(jobId),
  ]);
  const jobEntry = rollup.byJob.find((j) => j.job_id === jobId);
  if (!jobEntry || !jobEntry.variance || !wip) {
    throw new Error("getJobPerformanceBoard: job rollup/WIP unavailable.");
  }
  return assemble({
    scope: "job",
    variance: jobEntry.variance,
    contract: jobEntry.contract,
    wip,
    labourHours,
  });
}
