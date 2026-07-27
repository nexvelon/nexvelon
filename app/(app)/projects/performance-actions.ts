"use server";

// PERF-1 — the performance board actions. Same double-gate as the PROJ2-6b
// Performance panel this board upgrades: projects:view to read at all, and
// financials:edit for the cost / margin / forecast figures. A projects:view
// holder without financials:edit gets a redacted board (cost legs, margins,
// Projected, Earned and labour dashed; contract + client-facing billing stay
// visible), exactly as the existing panel dashes its variance block.

import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import {
  getJobPerformanceBoard,
  getProjectPerformanceBoard,
  type PerformanceBoard,
  type PerfLeg,
} from "@/lib/api/performance-board";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

export interface PerformanceBoardResult {
  board: PerformanceBoard;
  canSeeFinancials: boolean;
}

const NULL_LEG: PerfLeg = {
  revenue: null, materials: null, labour: null, sub: null,
  cost: null, profit: null, margin_pct: null,
};

/** Dash every cost/margin/forecast figure; keep contract + client billing. */
function redactBoard(board: PerformanceBoard): PerformanceBoard {
  return {
    ...board,
    quoted: null,
    budgeted: NULL_LEG,
    actual: NULL_LEG,
    earned: { revenue: null, pct_complete: null },
    projected: { revenue: null, cost: null, profit: null, margin_pct: null },
    labour: { hours: null, cost: null, cost_per_hour: null },
    billing: {
      // Billed / remaining-to-bill / retention are client-facing billing figures
      // the project rollup keeps visible at view tier (PROJ2-4c); the earned-
      // derived over/under is cost-side, so it dashes.
      billed: board.billing.billed,
      over_under: null,
      un_posted: null,
      retention: board.billing.retention,
      remaining_to_bill: board.billing.remaining_to_bill,
    },
  };
}

async function gate(): Promise<
  { ok: true; canSeeFinancials: boolean } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
    return { ok: false, error: "You don't have permission to view projects." };
  }
  return { ok: true, canSeeFinancials: hasPermission(adaptRole(me.role), "financials", "edit") };
}

export async function getProjectPerformanceBoardAction(
  projectId: string
): Promise<ActionResult<PerformanceBoardResult>> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const full = await getProjectPerformanceBoard(projectId);
    return {
      ok: true,
      data: { board: g.canSeeFinancials ? full : redactBoard(full), canSeeFinancials: g.canSeeFinancials },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getJobPerformanceBoardAction(
  jobId: string
): Promise<ActionResult<PerformanceBoardResult>> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const full = await getJobPerformanceBoard(jobId);
    return {
      ok: true,
      data: { board: g.canSeeFinancials ? full : redactBoard(full), canSeeFinancials: g.canSeeFinancials },
    };
  } catch (e) {
    return fail(e);
  }
}
