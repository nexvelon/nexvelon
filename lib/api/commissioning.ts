import "server-only";

// PROJ2-13 — commissioning runs + items + sign-off. A RUN is one sign-off event
// for a job; ITEMS are its checklist rows. A re-test after fixing deficiencies
// is a NEW run (duplicated from the previous one), so the history of the failed
// and passing runs is preserved rather than overwritten.
//
// signOffRun mirrors the SUB-5 issue pipeline: render a certificate PDF → upload
// to a private bucket → stamp status + signature. The PDF is BEST-EFFORT (§2.8):
// a render/upload failure returns a warning and never rolls back the sign-off —
// the signature is the legal event, the PDF is a rendering of it.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { logActivity } from "@/lib/api/activity-log";
import { jobLabel } from "@/lib/api/sub-agreements";
import { createDeficiency } from "@/lib/api/job-deficiencies";
import { renderCommissioningPdf } from "@/lib/pdf/render-commissioning";
import {
  uploadCommissioningPdf,
  signCommissioningPdf,
} from "@/lib/storage/commissioning-pdfs";
import { getQuoteTemplate } from "@/lib/company-profile";
import type { CommissioningCertificateProps } from "@/components/modules/projects/CommissioningCertificate";
import type {
  DbClientOpco,
  DbCommissioningItem,
  DbCommissioningItemInsert,
  DbCommissioningItemResult,
  DbCommissioningItemUpdate,
  DbCommissioningRun,
  DbCommissioningRunInsert,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type CommissioningErrorCode =
  | "not_found"
  | "items_pending"
  | "invalid_status"
  | "invalid_description";

export class CommissioningError extends Error {
  code: CommissioningErrorCode;
  constructor(code: CommissioningErrorCode, message: string) {
    super(message);
    this.name = "CommissioningError";
    this.code = code;
  }
}

export interface RunSummary {
  pass: number;
  fail: number;
  na: number;
  pending: number;
  total: number;
}

export interface CommissioningRunRow extends DbCommissioningRun {
  job_label: string | null;
  project_number: string | null;
  summary: RunSummary;
}

export interface CommissioningRunDetail extends CommissioningRunRow {
  items: DbCommissioningItem[];
}

function summarize(items: { result: DbCommissioningItemResult }[]): RunSummary {
  const s: RunSummary = { pass: 0, fail: 0, na: 0, pending: 0, total: items.length };
  for (const it of items) s[it.result] += 1;
  return s;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

type RunJoinRow = DbCommissioningRun & {
  job: { job_type: string; co_number: number | null; title: string } | null;
  project: { project_number: string | null } | null;
  items: { result: DbCommissioningItemResult }[] | null;
};

const RUN_SELECT =
  "*, job:project_jobs(job_type, co_number, title), project:projects(project_number), items:commissioning_items(result)";

export async function listRunsForJob(jobId: string): Promise<CommissioningRunRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("commissioning_runs")
    .select(RUN_SELECT)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listRunsForJob: ${error.message}`);
  return ((data ?? []) as unknown as RunJoinRow[]).map((r) => {
    const { job, project, items, ...run } = r;
    return {
      ...(run as DbCommissioningRun),
      job_label: jobLabel(job),
      project_number: project?.project_number ?? null,
      summary: summarize(items ?? []),
    };
  });
}

export async function getRunById(id: string): Promise<CommissioningRunDetail | null> {
  const supabase = await db();
  const { data: runData, error: runErr } = await supabase
    .from("commissioning_runs")
    .select(RUN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (runErr) throw new Error(`getRunById: ${runErr.message}`);
  if (!runData) return null;
  const r = runData as unknown as RunJoinRow;

  const { data: itemData, error: itemErr } = await supabase
    .from("commissioning_items")
    .select("*")
    .eq("run_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemErr) throw new Error(`getRunById/items: ${itemErr.message}`);
  const items = (itemData ?? []) as DbCommissioningItem[];

  const { job, project, ...run } = r;
  return {
    ...(run as DbCommissioningRun),
    job_label: jobLabel(job),
    project_number: project?.project_number ?? null,
    summary: summarize(items),
    items,
  };
}

// ─── Run mutations ───────────────────────────────────────────────────────────

export interface CreateRunInput {
  projectId: string;
  jobId: string;
  title?: string;
  performedBy?: string | null;
  performedAt?: string | null;
  /** Seed items by copying them from a previous run (a re-test). */
  duplicateFromRunId?: string | null;
  actorId?: string | null;
}

export async function createRun(input: CreateRunInput): Promise<DbCommissioningRun> {
  const supabase = await db();
  const payload: DbCommissioningRunInsert = {
    project_id: input.projectId,
    job_id: input.jobId,
    title: input.title?.trim() || "Commissioning",
    status: "in_progress",
    performed_by: input.performedBy ?? null,
    performed_at: input.performedAt ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("commissioning_runs")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createRun: ${error.message}`);
  const run = data as DbCommissioningRun;

  // Duplicate-from-previous: copy the checklist rows, resetting results.
  if (input.duplicateFromRunId) {
    const { data: prevItems, error: prevErr } = await supabase
      .from("commissioning_items")
      .select("category, description, expected_result, sort_order")
      .eq("run_id", input.duplicateFromRunId)
      .order("sort_order", { ascending: true });
    if (prevErr) throw new Error(`createRun/duplicate: ${prevErr.message}`);
    const rows = (prevItems ?? []) as {
      category: string | null;
      description: string;
      expected_result: string | null;
      sort_order: number;
    }[];
    if (rows.length > 0) {
      const inserts: DbCommissioningItemInsert[] = rows.map((it) => ({
        run_id: run.id,
        category: it.category,
        description: it.description,
        expected_result: it.expected_result,
        result: "pending",
        sort_order: it.sort_order,
      }));
      const { error: insErr } = await supabase.from("commissioning_items").insert(inserts);
      if (insErr) throw new Error(`createRun/duplicateInsert: ${insErr.message}`);
    }
  }

  return run;
}

export async function cancelRun(id: string, actorId: string | null): Promise<DbCommissioningRun> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("commissioning_runs")
    .update({ status: "cancelled", updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`cancelRun: ${error.message}`);
  return data as DbCommissioningRun;
}

// ─── Item mutations ──────────────────────────────────────────────────────────

export interface AddItemInput {
  runId: string;
  category?: string | null;
  description: string;
  expectedResult?: string | null;
}

export async function addItem(input: AddItemInput): Promise<DbCommissioningItem> {
  const description = (input.description ?? "").trim();
  if (!description) {
    throw new CommissioningError("invalid_description", "An item description is required.");
  }
  const supabase = await db();
  const { data: existing, error: exErr } = await supabase
    .from("commissioning_items")
    .select("sort_order")
    .eq("run_id", input.runId);
  if (exErr) throw new Error(`addItem/order: ${exErr.message}`);
  const rows = (existing ?? []) as { sort_order: number | null }[];
  const sort_order = rows.length === 0 ? 0 : Math.max(...rows.map((r) => Number(r.sort_order ?? 0))) + 1;

  const payload: DbCommissioningItemInsert = {
    run_id: input.runId,
    category: input.category ?? null,
    description,
    expected_result: input.expectedResult ?? null,
    result: "pending",
    sort_order,
  };
  const { data, error } = await supabase
    .from("commissioning_items")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`addItem: ${error.message}`);
  return data as DbCommissioningItem;
}

export async function updateItem(
  id: string,
  patch: DbCommissioningItemUpdate
): Promise<DbCommissioningItem> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("commissioning_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateItem: ${error.message}`);
  return data as DbCommissioningItem;
}

export async function setItemResult(
  id: string,
  result: DbCommissioningItemResult,
  actualNote?: string | null
): Promise<DbCommissioningItem> {
  const patch: DbCommissioningItemUpdate = { result };
  if (actualNote !== undefined) patch.actual_note = actualNote;
  return updateItem(id, patch);
}

export async function reorderItems(orderedIds: string[]): Promise<number> {
  const supabase = await db();
  let written = 0;
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await supabase
      .from("commissioning_items")
      .update({ sort_order: index })
      .eq("id", id);
    if (error) throw new Error(`reorderItems: ${error.message}`);
    written += 1;
  }
  return written;
}

export async function deleteItem(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("commissioning_items")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteItem: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Raise a job_deficiency from a FAILED commissioning item and link them, so a
 * failed test flows straight into the punch list.
 */
export async function raiseDeficiencyFromItem(input: {
  itemId: string;
  actorId?: string | null;
}): Promise<{ deficiencyId: string }> {
  const supabase = await db();
  const { data: item, error } = await supabase
    .from("commissioning_items")
    .select("id, run_id, category, description, actual_note, deficiency_id")
    .eq("id", input.itemId)
    .maybeSingle();
  if (error) throw new Error(`raiseDeficiencyFromItem/item: ${error.message}`);
  if (!item) throw new CommissioningError("not_found", "Commissioning item not found.");
  const it = item as {
    run_id: string;
    category: string | null;
    description: string;
    actual_note: string | null;
    deficiency_id: string | null;
  };

  const { data: run, error: rErr } = await supabase
    .from("commissioning_runs")
    .select("project_id, job_id")
    .eq("id", it.run_id)
    .maybeSingle();
  if (rErr) throw new Error(`raiseDeficiencyFromItem/run: ${rErr.message}`);
  if (!run) throw new CommissioningError("not_found", "Commissioning run not found.");
  const r = run as { project_id: string; job_id: string };

  const def = await createDeficiency({
    projectId: r.project_id,
    jobId: r.job_id,
    title: `Commissioning failure: ${it.description}`.slice(0, 200),
    description: it.actual_note ?? null,
    location: it.category ?? null,
    severity: "major",
    raisedBy: "Commissioning",
    actorId: input.actorId ?? null,
  });

  const { error: linkErr } = await supabase
    .from("commissioning_items")
    .update({ deficiency_id: def.id })
    .eq("id", input.itemId);
  if (linkErr) throw new Error(`raiseDeficiencyFromItem/link: ${linkErr.message}`);

  return { deficiencyId: def.id };
}

// ─── Sign-off ────────────────────────────────────────────────────────────────

export interface SignOffInput {
  runId: string;
  signerName: string;
  signerTitle?: string | null;
  signatureData: string; // trimmed-PNG data URL
  witnessedBy?: string | null;
  actorId?: string | null;
}

export type SignOffResult =
  | { ok: true; run: DbCommissioningRun; pdfPath: string | null; warning?: string }
  | { ok: false; error: "items_pending"; pendingCount: number }
  | { ok: false; error: string };

const OPCO_SLUGS = new Set<DbClientOpco>(["integrated_solutions", "guardian"]);

async function buildCertificateProps(
  detail: CommissioningRunDetail
): Promise<CommissioningCertificateProps> {
  const supabase = await db();
  let opcoSlug: DbClientOpco = "integrated_solutions";
  const { data: proj } = await supabase
    .from("projects")
    .select("opco, project_number, title")
    .eq("id", detail.project_id)
    .maybeSingle();
  const p = proj as { opco?: string; project_number?: string | null; title?: string | null } | null;
  if (p?.opco && OPCO_SLUGS.has(p.opco as DbClientOpco)) opcoSlug = p.opco as DbClientOpco;
  const t = getQuoteTemplate(opcoSlug);

  const s = detail.summary;
  return {
    run: {
      title: detail.title,
      performed_by: detail.performed_by,
      performed_at: detail.performed_at,
      witnessed_by: detail.witnessed_by,
      signer_name: detail.signer_name,
      signer_title: detail.signer_title,
      signed_off_at: detail.signed_off_at,
      signature_data: detail.signature_data,
      notes: detail.notes,
    },
    project: {
      number: p?.project_number ?? detail.project_number,
      title: p?.title ?? null,
      job_label: detail.job_label,
    },
    items: detail.items.map((it) => ({
      category: it.category,
      description: it.description,
      expected_result: it.expected_result,
      result: it.result,
      actual_note: it.actual_note,
    })),
    summary: { pass: s.pass, fail: s.fail, na: s.na, total: s.total },
    opco: {
      legal_name: t.legalName,
      address_line1: t.address.line1,
      address_line2: t.address.line2 || null,
      city: t.address.city,
      province: t.address.province,
      postal_code: t.address.postalCode,
      phone: t.phone,
      email: t.email,
      hst_number: t.hstNumber,
    },
  };
}

export async function signOffRun(input: SignOffInput): Promise<SignOffResult> {
  const supabase = await db();
  const detail = await getRunById(input.runId);
  if (!detail) return { ok: false, error: "Commissioning run not found." };
  if (detail.status === "signed_off") {
    return { ok: false, error: "This run is already signed off." };
  }
  if (detail.status === "cancelled") {
    return { ok: false, error: "A cancelled run can't be signed off." };
  }

  // Every item must be resolved — no 'pending' results.
  if (detail.summary.pending > 0) {
    return { ok: false, error: "items_pending", pendingCount: detail.summary.pending };
  }

  const now = new Date().toISOString();

  // Stamp the signature FIRST (the legal sign-off event), then render the PDF
  // from the signed record. A PDF failure never unwinds the signature.
  const { data: signed, error: signErr } = await supabase
    .from("commissioning_runs")
    .update({
      status: "signed_off",
      signed_off_at: now,
      signed_off_by: input.actorId ?? null,
      signature_data: input.signatureData,
      signer_name: input.signerName.trim(),
      signer_title: input.signerTitle?.trim() || null,
      witnessed_by: input.witnessedBy?.trim() || detail.witnessed_by,
      performed_at: detail.performed_at ?? businessDateISO(),
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.runId)
    .select("*")
    .single();
  if (signErr) throw new Error(`signOffRun/stamp: ${signErr.message}`);
  const run = signed as DbCommissioningRun;

  // Best-effort certificate (§2.8).
  let pdfPath: string | null = null;
  let warning: string | undefined;
  try {
    const signedDetail = await getRunById(input.runId);
    const props = await buildCertificateProps(signedDetail!);
    const pdf = await renderCommissioningPdf(props);
    const up = await uploadCommissioningPdf(input.runId, pdf);
    pdfPath = up.path;
    await supabase
      .from("commissioning_runs")
      .update({ pdf_path: pdfPath })
      .eq("id", input.runId);
  } catch (e) {
    warning = `Signed off, but the certificate PDF failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    await logActivity("project", detail.project_id, "update", {
      commissioning_signed_off: { from: null, to: detail.title },
    });
  } catch {
    /* best-effort */
  }

  return { ok: true, run, pdfPath, warning };
}

/** A fresh signed URL to a run's certificate PDF (#311 pattern). */
export async function getCommissioningPdfUrl(runId: string): Promise<string | null> {
  const detail = await getRunById(runId);
  if (!detail?.pdf_path) return null;
  return signCommissioningPdf(detail.pdf_path);
}
