import "server-only";

// PROJ2-21 — margin snapshots: a frozen point-in-time capture of a job's (or
// project's) quoted/estimated/actual/margin numbers, so forecast drift is
// visible over the job's life.
//
// IMMUTABILITY (§2.2): a snapshot is written once and never updated — there is
// no update path in this module, and the table has no updated_at. A later change
// to the live rollup does NOT alter an existing snapshot; that permanence is the
// whole point (you can see how the forecast MOVED). A mistaken snapshot can be
// deleted, but never edited.
//
// NO AUTO-SNAPSHOTS in v1. Snapshots are taken explicitly (the "Take snapshot"
// action + a reason) — we deliberately don't auto-capture on approval / status
// change, to avoid surprise rows. Auto-triggers are a later opt-in.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getCostBreakdownByCode } from "@/lib/api/cost-codes";
import type { DbMarginSnapshot, DbMarginSnapshotInsert } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export interface TakeSnapshotInput {
  projectId: string;
  jobId?: string | null;
  reason?: string | null;
  actorId?: string | null;
}

/**
 * Read the live rollup + the cost breakdown and FREEZE every number into a
 * margin_snapshots row. `margin` is contract − actual_cost (contract basis, so
 * margin_pct = margin / contract) — consistent with the rollup's own margin,
 * not the revenue-based variance margin.
 */
export async function takeSnapshot(input: TakeSnapshotInput): Promise<DbMarginSnapshot> {
  const rollup = await getProjectCostRollup(input.projectId);

  let contract = 0, actualCost = 0, actualRevenue = 0, quotedCost = 0, estimatedCost = 0;
  if (input.jobId) {
    const j = rollup.byJob.find((r) => r.job_id === input.jobId);
    contract = Number(j?.contract ?? 0);
    actualCost = Number(j?.spent ?? 0);
    actualRevenue = Number(j?.invoiced ?? 0);
    quotedCost = Number(j?.variance?.quoted.cost ?? 0);
    estimatedCost = Number(j?.variance?.estimated.cost ?? 0);
  } else {
    const p = rollup.perProject;
    contract = Number(p.contract ?? 0);
    actualCost = Number(p.spent ?? 0);
    actualRevenue = Number(p.invoiced ?? 0);
    quotedCost = Number(p.variance?.quoted.cost ?? 0);
    estimatedCost = Number(p.variance?.estimated.cost ?? 0);
  }

  const margin = round2(contract - actualCost);
  const marginPct = contract > 0 ? round2((margin / contract) * 100) : null;

  const breakdown = await getCostBreakdownByCode(
    input.jobId ? { jobId: input.jobId } : { projectId: input.projectId }
  );
  const byCode: Record<string, { estimated: number; actual: number }> = {};
  for (const r of breakdown.rows) {
    byCode[r.code] = { estimated: r.estimated, actual: r.actual };
  }

  const supabase = await db();
  const payload: DbMarginSnapshotInsert = {
    project_id: input.projectId,
    job_id: input.jobId ?? null,
    reason: input.reason ?? null,
    contract: round2(contract),
    quoted_cost: round2(quotedCost),
    estimated_cost: round2(estimatedCost),
    actual_cost: round2(actualCost),
    actual_revenue: round2(actualRevenue),
    margin,
    margin_pct: marginPct,
    by_code: byCode,
    taken_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("margin_snapshots")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`takeSnapshot: ${error.message}`);
  return data as DbMarginSnapshot;
}

/** Snapshots for a job (jobId) or a whole project (projectId), newest first. */
export async function listSnapshots(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<DbMarginSnapshot[]> {
  const supabase = await db();
  let q = supabase.from("margin_snapshots").select("*");
  if (scope.jobId) q = q.eq("job_id", scope.jobId);
  else if (scope.projectId) q = q.eq("project_id", scope.projectId).is("job_id", null);
  else return [];
  const { data, error } = await q.order("snapshot_at", { ascending: false });
  if (error) throw new Error(`listSnapshots: ${error.message}`);
  return (data ?? []) as DbMarginSnapshot[];
}

export interface SnapshotTrendPoint {
  snapshot_at: string;
  reason: string | null;
  margin: number;
  margin_pct: number | null;
  actual_cost: number;
  contract: number;
}

/** The chronological (oldest-first) series for a drift chart. */
export async function getSnapshotTrend(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<SnapshotTrendPoint[]> {
  const snaps = await listSnapshots(scope);
  return snaps
    .map((s) => ({
      snapshot_at: s.snapshot_at,
      reason: s.reason,
      margin: Number(s.margin),
      margin_pct: s.margin_pct != null ? Number(s.margin_pct) : null,
      actual_cost: Number(s.actual_cost),
      contract: Number(s.contract),
    }))
    .sort((a, b) => (a.snapshot_at < b.snapshot_at ? -1 : 1));
}

/** Delete a mistaken snapshot. There is intentionally NO update/edit path. */
export async function deleteSnapshot(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("margin_snapshots")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteSnapshot: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
