import "server-only";

// PROJ2-18 — WIP (work-in-progress) accounting. Percent-complete, earned
// revenue, and the over/under-billing position per job and project. Pure
// derivation over the rollup + invoices — NO new tables (§2.2: WIP is a report,
// never stored; it moves the instant a cost is logged or an invoice issued).
//
// ─────────────────────────────────────────────────────────────────────────────
// THE METHOD (2a–2e):
//
//   pct_complete = actual_cost / estimated_total_cost   (COST-TO-COST, the
//   construction standard), capped at 100% (an overrun is still 100% done, not
//   more). NULL when there's no estimate (estimated = 0) — undefined, NOT 100%.
//     actual_cost         = rollup spent (materials + labour + sub_labour)
//     estimated_total_cost = rollup variance.estimated.cost (live line items)
//
//   earned = contract × pct_complete            (contract from the 6b cost-center
//   sync; pre-tax). NULL when pct is null.
//
//   billed = Σ issued invoices' SUBTOTAL (PRE-TAX), so it matches earned's
//   pre-tax basis. NOTE: this is NOT the rollup's `invoiced` leg, which is
//   post-tax TOTAL — WIP queries subtotal directly (the same correction FIN-8's
//   P&L makes).
//
//   over_under = billed − earned      (SIGN CONVENTION, used everywhere)
//     > 0 → OVERBILLED   (billings in excess of earned — a LIABILITY; invoiced
//                         ahead of the work)
//     < 0 → UNDERBILLED  (earned in excess of billings — an ASSET; work done,
//                         not yet invoiced — your cash funding their job)
//
//   holdback is a MEMO (retained on billings to date), NOT folded into
//   over_under — WIP is a GROSS earning question; holdback is a payment-timing
//   overlay (FIN-9's stance). It never moves the position.
//
//   Project pct = Σ actual / Σ estimated (COST-WEIGHTED), NOT the average of job
//   pcts. Project earned = Σ per-job earned; project over_under = Σ per-job.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { getJobById } from "@/lib/api/projects";
import { ISSUED_STATUSES } from "@/lib/api/financials";
import { csvField } from "@/lib/aging-buckets";

async function db() {
  return createSupabaseServerClient();
}

export type WipPosition = "overbilled" | "underbilled" | "even" | "indeterminate";
export const WIP_METHOD = "cost_to_cost" as const;

export interface JobWip {
  job_id: string;
  title: string;
  job_type: string;
  co_number: number | null;
  contract: number;
  /** Cost legs (redactable to null for financials:view). */
  estimated_cost: number | null;
  actual_cost: number | null;
  pct_complete: number | null; // null = no estimate → undefined
  pct_complete_method: typeof WIP_METHOD;
  earned: number | null;
  billed: number; // pre-tax, always visible
  over_under: number | null; // billed − earned
  position: WipPosition;
  holdback_retained: number; // memo, visible
  remaining_to_bill: number; // contract − billed, visible
  remaining_cost: number | null; // estimated − actual (may be < 0 on overrun)
}

/** Σ issued-invoice subtotal (pre-tax) + holdback per job, for a project. */
async function invoiceAggByJob(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string
): Promise<Map<string | null, { billed: number; holdback: number }>> {
  const { data, error } = await supabase
    .from("invoices")
    .select("subtotal, holdback_amount, job_id, status")
    .eq("project_id", projectId)
    .in("status", ISSUED_STATUSES as unknown as string[]);
  if (error) throw new Error(`wip/invoices: ${error.message}`);
  const out = new Map<string | null, { billed: number; holdback: number }>();
  for (const r of (data ?? []) as {
    subtotal: number | null;
    holdback_amount: number | null;
    job_id: string | null;
  }[]) {
    const key = r.job_id ?? null;
    const cur = out.get(key) ?? { billed: 0, holdback: 0 };
    cur.billed = round2(cur.billed + Number(r.subtotal ?? 0));
    cur.holdback = round2(cur.holdback + Number(r.holdback_amount ?? 0));
    out.set(key, cur);
  }
  return out;
}

function computeJobWip(
  job: {
    job_id: string;
    title: string;
    job_type: string;
    co_number: number | null;
    contract: number;
    spent: number | null;
    variance: { estimated: { cost: number } } | null;
  },
  invoiced: { billed: number; holdback: number }
): JobWip {
  const contract = round2(Number(job.contract ?? 0));
  const estimated = round2(Number(job.variance?.estimated.cost ?? 0));
  const actual = round2(Number(job.spent ?? 0));
  const billed = round2(invoiced.billed);

  // Cost-to-cost, capped at 100%; null when there's no estimate to divide by.
  const pct = estimated > 0 ? Math.min(1, round2(actual / estimated)) : null;
  const earned = pct != null ? round2(contract * pct) : null;
  const overUnder = earned != null ? round2(billed - earned) : null;

  let position: WipPosition;
  if (overUnder == null) position = "indeterminate";
  else if (overUnder > 0.005) position = "overbilled";
  else if (overUnder < -0.005) position = "underbilled";
  else position = "even";

  return {
    job_id: job.job_id,
    title: job.title,
    job_type: job.job_type,
    co_number: job.co_number,
    contract,
    estimated_cost: estimated,
    actual_cost: actual,
    pct_complete: pct,
    pct_complete_method: WIP_METHOD,
    earned,
    billed,
    over_under: overUnder,
    position,
    holdback_retained: round2(invoiced.holdback),
    remaining_to_bill: round2(contract - billed),
    remaining_cost: round2(estimated - actual),
  };
}

export async function getJobWip(jobId: string): Promise<JobWip | null> {
  const job = await getJobById(jobId);
  if (!job) return null;
  const supabase = await db();
  const rollup = await getProjectCostRollup(job.project_id);
  const entry = rollup.byJob.find((j) => j.job_id === jobId);
  if (!entry) return null;
  const agg = await invoiceAggByJob(supabase, job.project_id);
  return computeJobWip(entry, agg.get(jobId) ?? { billed: 0, holdback: 0 });
}

export interface ProjectWip {
  project_id: string;
  jobs: JobWip[];
  rollup: {
    contract: number;
    estimated_cost: number;
    actual_cost: number;
    /** Cost-WEIGHTED: Σ actual / Σ estimated (not the mean of job pcts). */
    pct_complete: number | null;
    earned: number;
    billed: number;
    over_under: number;
    position: WipPosition;
    holdback_retained: number;
    remaining_to_bill: number;
    /** Jobs with no estimate — their earned can't be computed. */
    indeterminate_jobs: number;
  };
}

function sumProject(jobs: JobWip[]): ProjectWip["rollup"] {
  const contract = round2(jobs.reduce((s, j) => s + j.contract, 0));
  const estimated = round2(jobs.reduce((s, j) => s + Number(j.estimated_cost ?? 0), 0));
  const actual = round2(jobs.reduce((s, j) => s + Number(j.actual_cost ?? 0), 0));
  const billed = round2(jobs.reduce((s, j) => s + j.billed, 0));
  const earned = round2(jobs.reduce((s, j) => s + Number(j.earned ?? 0), 0));
  const holdback = round2(jobs.reduce((s, j) => s + j.holdback_retained, 0));
  const overUnder = round2(billed - earned);
  const pct = estimated > 0 ? Math.min(1, round2(actual / estimated)) : null;
  let position: WipPosition;
  if (overUnder > 0.005) position = "overbilled";
  else if (overUnder < -0.005) position = "underbilled";
  else position = "even";
  return {
    contract,
    estimated_cost: estimated,
    actual_cost: actual,
    pct_complete: pct,
    earned,
    billed,
    over_under: overUnder,
    position,
    holdback_retained: holdback,
    remaining_to_bill: round2(contract - billed),
    indeterminate_jobs: jobs.filter((j) => j.pct_complete == null).length,
  };
}

export async function getProjectWip(projectId: string): Promise<ProjectWip> {
  const supabase = await db();
  const rollup = await getProjectCostRollup(projectId);
  const agg = await invoiceAggByJob(supabase, projectId);
  const jobs = rollup.byJob.map((entry) =>
    computeJobWip(entry, agg.get(entry.job_id) ?? { billed: 0, holdback: 0 })
  );
  return { project_id: projectId, jobs, rollup: sumProject(jobs) };
}

export interface WipPortfolioRow {
  project_id: string;
  number: string | null;
  title: string | null;
  status: string;
  contract: number;
  estimated_cost: number;
  actual_cost: number;
  pct_complete: number | null;
  earned: number;
  billed: number;
  over_under: number;
  position: WipPosition;
}

export interface WipPortfolio {
  rows: WipPortfolioRow[];
  totals: { overbilled: number; underbilled: number; net: number };
}

const PROJECT_ACTIVE_STATUSES = ["active", "on_hold", "substantially_complete"] as const;

/** One row per active project — for the "am I financing their jobs" dashboard. */
export async function getWipPortfolio(): Promise<WipPortfolio> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_number, title, status")
    .in("status", PROJECT_ACTIVE_STATUSES as unknown as string[]);
  if (error) throw new Error(`getWipPortfolio: ${error.message}`);
  const projects = (data ?? []) as {
    id: string;
    project_number: string | null;
    title: string | null;
    status: string;
  }[];

  const rows: WipPortfolioRow[] = [];
  let overbilled = 0;
  let underbilled = 0;
  for (const p of projects) {
    const wip = await getProjectWip(p.id);
    const r = wip.rollup;
    rows.push({
      project_id: p.id,
      number: p.project_number,
      title: p.title,
      status: p.status,
      contract: r.contract,
      estimated_cost: r.estimated_cost,
      actual_cost: r.actual_cost,
      pct_complete: r.pct_complete,
      earned: r.earned,
      billed: r.billed,
      over_under: r.over_under,
      position: r.position,
    });
    if (r.over_under > 0) overbilled = round2(overbilled + r.over_under);
    else if (r.over_under < 0) underbilled = round2(underbilled + r.over_under);
  }
  // Most-underbilled first (largest asset / cash you're owed at the top).
  rows.sort((a, b) => a.over_under - b.over_under);
  return {
    rows,
    totals: { overbilled, underbilled, net: round2(overbilled + underbilled) },
  };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export const WIP_CSV_HEADER = [
  "Project",
  "Title",
  "Status",
  "Contract",
  "Estimated cost",
  "Actual cost",
  "% complete",
  "Earned",
  "Billed",
  "Over/(under) billed",
  "Position",
];

export function buildWipCsv(portfolio: WipPortfolio): string {
  const out = [WIP_CSV_HEADER.map(csvField).join(",")];
  for (const r of portfolio.rows) {
    out.push(
      [
        csvField(r.number),
        csvField(r.title),
        csvField(r.status),
        csvField(r.contract.toFixed(2)),
        csvField(r.estimated_cost.toFixed(2)),
        csvField(r.actual_cost.toFixed(2)),
        csvField(r.pct_complete == null ? "" : (r.pct_complete * 100).toFixed(1)),
        csvField(r.earned.toFixed(2)),
        csvField(r.billed.toFixed(2)),
        csvField(r.over_under.toFixed(2)),
        csvField(r.position),
      ].join(",")
    );
  }
  return out.join("\r\n");
}
