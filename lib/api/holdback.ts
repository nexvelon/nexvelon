import "server-only";

// FIN-9 — Ontario statutory holdback release. The 10% construction-lien
// holdback retained across a project's invoices becomes collectible 60 days
// after substantial completion; this manages that release as a tax-exempt
// invoice for the held principal.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE RELEASE INVOICE IS TAX-EXEMPT (the load-bearing accounting call).
// The 0043 money model charges HST on the FULL pre-tax subtotal at original
// billing, even while holding back 10% of that subtotal from amount_due. So the
// retained holdback is already-taxed PRINCIPAL — the client already got billed
// (and the company already remitted, on payment) the HST on it. The release
// invoice therefore charges NO further tax; re-taxing would collect HST on the
// same dollars twice. This flips the FIN-9 spec's "taxable on release"
// assumption, which was premised on tax having been DEFERRED — the audit shows
// it was not.
//
// THE 60-DAY CLOCK is a simplification: real Ontario Construction Act timing
// runs from PUBLICATION of the certificate of substantial completion. We don't
// model certificates, so v1 keys off projects.actual_completion (set when the
// project reaches substantially_complete). Bookkeeping aid, not legal advice.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { businessDateISO, businessDatePlusDaysISO } from "@/lib/format";
import { logActivity } from "@/lib/api/activity-log";
import { ISSUED_STATUSES } from "@/lib/api/financials";
import {
  createInvoiceForProject,
  addManualLine,
  setTaxExempt,
  setDueDate,
  issueInvoice,
} from "@/lib/api/invoices";
import type { DbHoldbackRelease } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** Ontario lien period, in days, after substantial completion. */
export const HOLDBACK_LIEN_DAYS = 60;
/** Net terms on a holdback-release invoice. */
const RELEASE_NET_DAYS = 30;

export type HoldbackErrorCode =
  | "not_found"
  | "not_substantially_complete"
  | "no_completion_date"
  | "no_holdback_retained"
  | "release_exists"
  | "not_yet_eligible"
  | "invalid_status"
  | "has_payments";

export class HoldbackError extends Error {
  code: HoldbackErrorCode;
  constructor(code: HoldbackErrorCode, message: string) {
    super(message);
    this.name = "HoldbackError";
    this.code = code;
  }
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  return Math.floor(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
}

// ─── Retained holdback (derived, §2.2) ───────────────────────────────────────

/** Σ holdback_amount across the project's issued invoices (release invoices
 * carry none and are excluded defensively). */
async function retainedHoldback(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .select("holdback_amount, is_holdback_release, status")
    .eq("project_id", projectId)
    .in("status", ISSUED_STATUSES);
  if (error) throw new Error(`retainedHoldback: ${error.message}`);
  let total = 0;
  for (const r of (data ?? []) as {
    holdback_amount: number | null;
    is_holdback_release: boolean;
  }[]) {
    if (r.is_holdback_release) continue;
    total = round2(total + Number(r.holdback_amount ?? 0));
  }
  return total;
}

// ─── Status read ─────────────────────────────────────────────────────────────

export interface ProjectHoldbackStatus {
  project_id: string;
  retained: number;
  substantial_completion_date: string | null;
  eligible_release_date: string | null;
  days_until_eligible: number | null;
  is_eligible: boolean;
  release: DbHoldbackRelease | null;
}

export async function getProjectHoldbackStatus(
  projectId: string
): Promise<ProjectHoldbackStatus> {
  const supabase = await db();

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id, status, actual_completion")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(`getProjectHoldbackStatus/project: ${pErr.message}`);
  if (!proj) throw new HoldbackError("not_found", "Project not found.");
  const project = proj as {
    status: string;
    actual_completion: string | null;
  };

  const retained = await retainedHoldback(supabase, projectId);

  // The live (non-void) release record, if one exists.
  const { data: relRows, error: rErr } = await supabase
    .from("holdback_releases")
    .select("*")
    .eq("project_id", projectId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1);
  if (rErr) throw new Error(`getProjectHoldbackStatus/release: ${rErr.message}`);
  const release = ((relRows ?? []) as DbHoldbackRelease[])[0] ?? null;

  const scDate = project.actual_completion;
  const eligibleDate = scDate ? addDaysIso(scDate, HOLDBACK_LIEN_DAYS) : null;
  const today = businessDateISO();
  const daysUntil = eligibleDate ? daysBetweenIso(today, eligibleDate) : null;
  const isEligible = eligibleDate != null && today >= eligibleDate;

  return {
    project_id: projectId,
    retained,
    substantial_completion_date: scDate,
    eligible_release_date: eligibleDate,
    days_until_eligible: daysUntil,
    is_eligible: isEligible,
    release,
  };
}

// ─── Set up the release record ───────────────────────────────────────────────

export interface CreateHoldbackReleaseInput {
  projectId: string;
  actorId?: string | null;
}

export async function createHoldbackRelease(
  input: CreateHoldbackReleaseInput
): Promise<DbHoldbackRelease> {
  const supabase = await db();

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id, status, actual_completion")
    .eq("id", input.projectId)
    .maybeSingle();
  if (pErr) throw new Error(`createHoldbackRelease/project: ${pErr.message}`);
  if (!proj) throw new HoldbackError("not_found", "Project not found.");
  const project = proj as { status: string; actual_completion: string | null };

  if (
    project.status !== "substantially_complete" &&
    project.status !== "closed"
  ) {
    throw new HoldbackError(
      "not_substantially_complete",
      "The project must reach Substantially Complete before its holdback can be released."
    );
  }
  if (!project.actual_completion) {
    throw new HoldbackError(
      "no_completion_date",
      "This project has no completion date to run the 60-day clock from."
    );
  }

  const retained = await retainedHoldback(supabase, input.projectId);
  if (!(retained > 0)) {
    throw new HoldbackError(
      "no_holdback_retained",
      "No holdback has been retained on this project's invoices."
    );
  }

  // Reject a second live release (also enforced by the DB unique index).
  const { data: existing, error: eErr } = await supabase
    .from("holdback_releases")
    .select("id")
    .eq("project_id", input.projectId)
    .neq("status", "void")
    .limit(1);
  if (eErr) throw new Error(`createHoldbackRelease/existing: ${eErr.message}`);
  if ((existing ?? []).length > 0) {
    throw new HoldbackError(
      "release_exists",
      "This project already has a holdback release."
    );
  }

  const eligibleDate = addDaysIso(project.actual_completion, HOLDBACK_LIEN_DAYS);
  const status = businessDateISO() >= eligibleDate ? "eligible" : "pending";

  const { data, error } = await supabase
    .from("holdback_releases")
    .insert({
      project_id: input.projectId,
      amount: retained,
      substantial_completion_date: project.actual_completion,
      eligible_release_date: eligibleDate,
      status,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createHoldbackRelease: ${error.message}`);

  await logActivity("project", input.projectId, "update", {
    holdback_release_setup: { from: null, to: retained },
  });

  return data as DbHoldbackRelease;
}

// ─── Release (generate the invoice) ──────────────────────────────────────────

export interface ReleaseHoldbackResult {
  release: DbHoldbackRelease;
  invoice_id: string;
}

export async function releaseHoldback(input: {
  releaseId: string;
  actorId?: string | null;
}): Promise<ReleaseHoldbackResult> {
  const supabase = await db();

  const { data: relRow, error: rErr } = await supabase
    .from("holdback_releases")
    .select("*")
    .eq("id", input.releaseId)
    .maybeSingle();
  if (rErr) throw new Error(`releaseHoldback/load: ${rErr.message}`);
  if (!relRow) throw new HoldbackError("not_found", "Release record not found.");
  const release = relRow as DbHoldbackRelease;

  if (release.status === "released") {
    throw new HoldbackError("invalid_status", "This holdback has already been released.");
  }
  if (release.status === "void") {
    throw new HoldbackError("invalid_status", "This release record is void.");
  }
  // Re-check eligibility server-side against today — never trust a stale
  // 'eligible' status that was written before the clock actually ran out.
  if (businessDateISO() < release.eligible_release_date) {
    throw new HoldbackError(
      "not_yet_eligible",
      `Holdback isn't releasable until ${release.eligible_release_date} (the 60-day lien period).`
    );
  }

  // Generate the release invoice: reuse the normal invoice machinery so it
  // flows through AR / payments / aging / statements unchanged.
  const draft = await createInvoiceForProject(release.project_id);
  // Mark it, exempt it (already-taxed principal), one line for the held sum.
  await supabase
    .from("invoices")
    .update({ is_holdback_release: true })
    .eq("id", draft.id);
  await setTaxExempt(draft.id, true);
  await addManualLine(draft.id, {
    description: "Holdback release — statutory holdback (Ontario Construction Act)",
    quantity: 1,
    unit_price: round2(Number(release.amount)),
  });
  const issued = await issueInvoice(draft.id);
  await setDueDate(issued.id, businessDatePlusDaysISO(RELEASE_NET_DAYS));

  const today = businessDateISO();
  const { data: updated, error: uErr } = await supabase
    .from("holdback_releases")
    .update({
      status: "released",
      released_at: today,
      release_invoice_id: issued.id,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.releaseId)
    .select("*")
    .single();
  if (uErr) throw new Error(`releaseHoldback/update: ${uErr.message}`);

  await logActivity("project", release.project_id, "update", {
    holdback_released: { from: null, to: Number(release.amount) },
  });

  return { release: updated as DbHoldbackRelease, invoice_id: issued.id };
}

// ─── Void ────────────────────────────────────────────────────────────────────

export async function voidHoldbackRelease(input: {
  releaseId: string;
  actorId?: string | null;
}): Promise<DbHoldbackRelease> {
  const supabase = await db();

  const { data: relRow, error: rErr } = await supabase
    .from("holdback_releases")
    .select("*")
    .eq("id", input.releaseId)
    .maybeSingle();
  if (rErr) throw new Error(`voidHoldbackRelease/load: ${rErr.message}`);
  if (!relRow) throw new HoldbackError("not_found", "Release record not found.");
  const release = relRow as DbHoldbackRelease;

  // If a release invoice exists, it may only be unwound while unpaid.
  if (release.release_invoice_id) {
    const { data: pays, error: pErr } = await supabase
      .from("invoice_payments")
      .select("id")
      .eq("invoice_id", release.release_invoice_id)
      .limit(1);
    if (pErr) throw new Error(`voidHoldbackRelease/payments: ${pErr.message}`);
    if ((pays ?? []).length > 0) {
      throw new HoldbackError(
        "has_payments",
        "The release invoice has payments — remove them before voiding."
      );
    }
    // Void the paired invoice too.
    await supabase
      .from("invoices")
      .update({ status: "void" })
      .eq("id", release.release_invoice_id);
  }

  const { data: updated, error: uErr } = await supabase
    .from("holdback_releases")
    .update({ status: "void", updated_by: input.actorId ?? null })
    .eq("id", input.releaseId)
    .select("*")
    .single();
  if (uErr) throw new Error(`voidHoldbackRelease/update: ${uErr.message}`);

  await logActivity("project", release.project_id, "update", {
    holdback_release_voided: { from: Number(release.amount), to: null },
  });

  return updated as DbHoldbackRelease;
}

// ─── Portfolio (the "money I can now collect" worklist) ──────────────────────

export interface HoldbackWorklistRow {
  project_id: string;
  project_number: string | null;
  title: string | null;
  opco: string;
  retained: number;
  substantial_completion_date: string | null;
  eligible_release_date: string | null;
  is_eligible: boolean;
  release_status: string | null;
}

/** Every project that has retained holdback OR a live release record. */
export async function getHoldbackWorklist(): Promise<HoldbackWorklistRow[]> {
  const supabase = await db();

  // Projects with any holdback on an issued, non-release invoice.
  const { data: invData, error: iErr } = await supabase
    .from("invoices")
    .select("project_id, holdback_amount, is_holdback_release, status")
    .in("status", ISSUED_STATUSES);
  if (iErr) throw new Error(`getHoldbackWorklist/invoices: ${iErr.message}`);

  const retainedByProject = new Map<string, number>();
  for (const r of (invData ?? []) as {
    project_id: string | null;
    holdback_amount: number | null;
    is_holdback_release: boolean;
  }[]) {
    if (!r.project_id || r.is_holdback_release) continue;
    const amt = Number(r.holdback_amount ?? 0);
    if (amt <= 0) continue;
    retainedByProject.set(
      r.project_id,
      round2((retainedByProject.get(r.project_id) ?? 0) + amt)
    );
  }
  if (retainedByProject.size === 0) return [];

  const ids = [...retainedByProject.keys()];
  const [{ data: projData, error: pErr }, { data: relData, error: rErr }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, project_number, title, opco, actual_completion")
        .in("id", ids),
      supabase
        .from("holdback_releases")
        .select("project_id, eligible_release_date, status")
        .in("project_id", ids)
        .neq("status", "void"),
    ]);
  if (pErr) throw new Error(`getHoldbackWorklist/projects: ${pErr.message}`);
  if (rErr) throw new Error(`getHoldbackWorklist/releases: ${rErr.message}`);

  const releaseByProject = new Map(
    ((relData ?? []) as {
      project_id: string;
      eligible_release_date: string;
      status: string;
    }[]).map((r) => [r.project_id, r])
  );
  const today = businessDateISO();

  const rows: HoldbackWorklistRow[] = ((projData ?? []) as {
    id: string;
    project_number: string | null;
    title: string | null;
    opco: string;
    actual_completion: string | null;
  }[]).map((p) => {
    const release = releaseByProject.get(p.id) ?? null;
    const eligibleDate =
      release?.eligible_release_date ??
      (p.actual_completion ? addDaysIso(p.actual_completion, HOLDBACK_LIEN_DAYS) : null);
    return {
      project_id: p.id,
      project_number: p.project_number,
      title: p.title,
      opco: p.opco,
      retained: retainedByProject.get(p.id) ?? 0,
      substantial_completion_date: p.actual_completion,
      eligible_release_date: eligibleDate,
      is_eligible: eligibleDate != null && today >= eligibleDate,
      release_status: release?.status ?? null,
    };
  });

  // Eligible-and-unreleased first (the actionable ones), then by retained desc.
  return rows.sort((a, b) => {
    const aReady = a.is_eligible && a.release_status !== "released" ? 1 : 0;
    const bReady = b.is_eligible && b.release_status !== "released" ? 1 : 0;
    if (aReady !== bReady) return bReady - aReady;
    return b.retained - a.retained;
  });
}
