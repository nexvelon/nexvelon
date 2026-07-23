import "server-only";

// SUB-5 — subcontractor agreements / work orders. Mirrors the PO issue pipeline
// (mint number → draft → issue: render PDF, upload to a private bucket, stamp
// status, best-effort email) but for a scoped-value labour agreement, and with
// the COMPLIANCE HARD BLOCK at issue time (canIssueWorkOrder — WSIB clearance +
// liability insurance must be current). The block is enforced HERE, server-side
// — the UI mirror is convenience only.
//
// Snapshot rule (§2.2): once issued, scope/value are immutable (updateAgreement
// refuses). The issued PDF is the durable record.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import { logActivity } from "@/lib/api/activity-log";
import { listComplianceDocs } from "@/lib/api/subcontractor-compliance";
import { getSubcontractorById } from "@/lib/api/subcontractors";
import { canIssueWorkOrder } from "@/lib/subcontractors/eligibility";
import { renderWorkOrderPdf } from "@/lib/pdf/render-work-order";
import {
  uploadWorkOrderPdf,
  signWorkOrderPdf,
} from "@/lib/storage/work-order-pdfs";
import { sendWorkOrderEmail } from "@/lib/auth/email";
import { getPoSenderFrom } from "@/lib/settings/po-sender";
import { getQuoteTemplate } from "@/lib/company-profile";
import type { WorkOrderDocumentProps } from "@/components/modules/subcontractors/WorkOrderDocument";
import type {
  DbClientOpco,
  DbSubAgreement,
  DbSubAgreementInsert,
  DbSubAgreementStatus,
  DbSubAgreementUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type AgreementErrorCode =
  | "not_found"
  | "not_editable"
  | "invalid_status"
  | "no_recipient";

export class AgreementError extends Error {
  code: AgreementErrorCode;
  constructor(code: AgreementErrorCode, message: string) {
    super(message);
    this.name = "AgreementError";
    this.code = code;
  }
}

export interface AgreementListRow extends DbSubAgreement {
  subcontractor_name: string | null;
  project_number: string | null;
  project_title: string | null;
  job_label: string | null;
}

export interface AgreementFilters {
  subcontractorId?: string;
  projectId?: string;
  jobId?: string;
  status?: string;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

type AgreementJoinRow = DbSubAgreement & {
  subcontractor: { name: string } | null;
  project: { project_number: string | null; title: string | null; opco: string } | null;
  job: { job_type: string; co_number: number | null; title: string } | null;
};

const AGREEMENT_SELECT =
  "*, subcontractor:subcontractors(name), project:projects(project_number, title, opco), job:project_jobs(job_type, co_number, title)";

/** "Main Job" / "CO #2 — Title" for a joined job row. */
export function jobLabel(
  job: { job_type: string; co_number: number | null; title: string } | null
): string | null {
  if (!job) return null;
  if (job.job_type === "main_job") return "Main Job";
  const co = job.co_number != null ? `CO #${job.co_number}` : "Change Order";
  return job.title ? `${co} — ${job.title}` : co;
}

function toRow(r: AgreementJoinRow): AgreementListRow {
  const { subcontractor, project, job, ...agreement } = r;
  return {
    ...(agreement as DbSubAgreement),
    subcontractor_name: subcontractor?.name ?? null,
    project_number: project?.project_number ?? null,
    project_title: project?.title ?? null,
    job_label: jobLabel(job),
  };
}

export async function listAgreements(
  filters: AgreementFilters = {}
): Promise<AgreementListRow[]> {
  const supabase = await db();
  let q = supabase.from("sub_agreements").select(AGREEMENT_SELECT);
  if (filters.subcontractorId) q = q.eq("subcontractor_id", filters.subcontractorId);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.jobId) q = q.eq("job_id", filters.jobId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`listAgreements: ${error.message}`);
  return ((data ?? []) as unknown as AgreementJoinRow[]).map(toRow);
}

export async function getAgreementById(id: string): Promise<AgreementListRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sub_agreements")
    .select(AGREEMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAgreementById: ${error.message}`);
  if (!data) return null;
  return toRow(data as unknown as AgreementJoinRow);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateAgreementInput {
  subcontractorId: string;
  projectId?: string | null;
  jobId?: string | null;
  title: string;
  scopeOfWork?: string | null;
  agreedValue?: number;
  startDate?: string | null;
  targetCompletion?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

async function mintAgreementNumber(): Promise<string> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("next_sub_agreement_number");
  if (error) throw new Error(`mintAgreementNumber: ${error.message}`);
  return String(data);
}

export async function createAgreement(
  input: CreateAgreementInput
): Promise<DbSubAgreement> {
  if (!input.title?.trim()) {
    throw new AgreementError("invalid_status", "A work-order title is required.");
  }
  if (input.jobId && !input.projectId) {
    throw new AgreementError("invalid_status", "A job-scoped work order needs a project too.");
  }
  const supabase = await db();
  const agreement_number = await mintAgreementNumber();
  const payload: DbSubAgreementInsert = {
    agreement_number,
    subcontractor_id: input.subcontractorId,
    project_id: input.projectId ?? null,
    job_id: input.jobId ?? null,
    title: input.title.trim(),
    scope_of_work: input.scopeOfWork ?? null,
    agreed_value: round2(input.agreedValue ?? 0),
    start_date: input.startDate ?? null,
    target_completion: input.targetCompletion ?? null,
    status: "draft",
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("sub_agreements")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createAgreement: ${error.message}`);
  return data as DbSubAgreement;
}

export interface UpdateAgreementPatch {
  title?: string;
  scopeOfWork?: string | null;
  agreedValue?: number;
  projectId?: string | null;
  jobId?: string | null;
  startDate?: string | null;
  targetCompletion?: string | null;
  notes?: string | null;
}

/**
 * Edit a DRAFT work order. Once issued, scope/value are a snapshot (§2.2) — any
 * edit is refused with 'not_editable'. Status changes go through
 * setAgreementStatus / issueAgreement, not here.
 */
export async function updateAgreement(
  id: string,
  patch: UpdateAgreementPatch,
  actorId: string | null
): Promise<DbSubAgreement> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("sub_agreements")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateAgreement/load: ${cErr.message}`);
  if (!cur) throw new AgreementError("not_found", "Work order not found.");
  if ((cur as { status: string }).status !== "draft") {
    throw new AgreementError(
      "not_editable",
      "This work order has been issued and can no longer be edited."
    );
  }

  if (patch.jobId && patch.projectId === null) {
    throw new AgreementError("invalid_status", "A job-scoped work order needs a project too.");
  }

  const update: DbSubAgreementUpdate = { updated_by: actorId };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.scopeOfWork !== undefined) update.scope_of_work = patch.scopeOfWork;
  if (patch.agreedValue !== undefined) update.agreed_value = round2(patch.agreedValue);
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.jobId !== undefined) update.job_id = patch.jobId;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.targetCompletion !== undefined) update.target_completion = patch.targetCompletion;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await supabase
    .from("sub_agreements")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateAgreement: ${error.message}`);
  return data as DbSubAgreement;
}

// ─── PDF props ───────────────────────────────────────────────────────────────

const OPCO_SLUGS = new Set<DbClientOpco>(["integrated_solutions", "guardian"]);

export async function buildWorkOrderPdfProps(
  agreementId: string
): Promise<WorkOrderDocumentProps> {
  const agreement = await getAgreementById(agreementId);
  if (!agreement) throw new Error("Work order not found");
  const sub = await getSubcontractorById(agreement.subcontractor_id);

  // opco from the project; fall back to Integrated Solutions when unscoped.
  let opcoSlug: DbClientOpco = "integrated_solutions";
  if (agreement.project_id) {
    const supabase = await db();
    const { data } = await supabase
      .from("projects")
      .select("opco")
      .eq("id", agreement.project_id)
      .maybeSingle();
    const raw = (data as { opco?: string } | null)?.opco;
    if (raw && OPCO_SLUGS.has(raw as DbClientOpco)) opcoSlug = raw as DbClientOpco;
  }
  const t = getQuoteTemplate(opcoSlug);

  return {
    wo: {
      agreement_number: agreement.agreement_number,
      title: agreement.title,
      scope_of_work: agreement.scope_of_work,
      agreed_value: Number(agreement.agreed_value),
      start_date: agreement.start_date,
      target_completion: agreement.target_completion,
      issued_date: agreement.issued_at ?? businessDateISO(),
      status: agreement.status,
      notes: agreement.notes,
    },
    subcontractor: {
      name: sub?.name ?? agreement.subcontractor_name ?? "—",
      contact_name: sub?.contact_name ?? null,
      email: sub?.email ?? null,
      address_line1: sub?.address_line1 ?? null,
      address_line2: sub?.address_line2 ?? null,
      city: sub?.city ?? null,
      province: sub?.province ?? null,
      postal_code: sub?.postal_code ?? null,
      country: sub?.country ?? null,
    },
    project: agreement.project_id
      ? {
          number: agreement.project_number,
          title: agreement.project_title,
          job_label: agreement.job_label,
        }
      : null,
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

// ─── Issue (the compliance hard block) ───────────────────────────────────────

export type IssueAgreementResult =
  | { ok: true; agreement: DbSubAgreement; pdfPath: string | null; warning?: string }
  | { ok: false; error: "compliance_block"; reasons: string[] }
  | { ok: false; error: string };

export interface IssueAgreementInput {
  id: string;
  sendEmail: boolean;
  actorId?: string | null;
}

/**
 * Draft → issued. THE hard block: a work order cannot be issued to a
 * subcontractor whose required compliance is missing/expired (canIssueWorkOrder,
 * enforced here regardless of the UI). Then render + upload the PDF, stamp the
 * status, and — best-effort per §2.8 — email the sub. A failed email/upload is a
 * warning, never a rollback of the issue.
 */
export async function issueAgreement(
  input: IssueAgreementInput
): Promise<IssueAgreementResult> {
  const supabase = await db();

  const agreement = await getAgreementById(input.id);
  if (!agreement) return { ok: false, error: "Work order not found." };
  if (agreement.status !== "draft") {
    return { ok: false, error: "Only a draft work order can be issued." };
  }

  const sub = await getSubcontractorById(agreement.subcontractor_id);
  if (!sub) return { ok: false, error: "Subcontractor not found." };

  // THE HARD BLOCK — server-side, non-negotiable, no override in v1.
  const docs = await listComplianceDocs(agreement.subcontractor_id);
  const eligibility = canIssueWorkOrder(
    { status: sub.status },
    docs.map((d) => ({ doc_type: d.doc_type, expiry_date: d.expiry_date })),
    businessDateISO()
  );
  if (!eligibility.ok) {
    return { ok: false, error: "compliance_block", reasons: eligibility.reasons };
  }

  const recipient = sub.email;
  const now = new Date().toISOString();

  // Best-effort artifacts (mirror the PO issue pipeline).
  const bestEffortErrors: string[] = [];
  let pdfPath: string | null = null;
  try {
    const props = await buildWorkOrderPdfProps(input.id);
    const pdf = await renderWorkOrderPdf(props);
    try {
      const up = await uploadWorkOrderPdf(input.id, agreement.agreement_number, pdf);
      pdfPath = up.path;
    } catch (err) {
      bestEffortErrors.push(`PDF upload failed: ${msg(err)}`);
    }

    if (input.sendEmail) {
      if (!recipient) {
        bestEffortErrors.push(
          "No email on file for this subcontractor — not sent."
        );
      } else {
        try {
          const from = await getPoSenderFrom();
          await sendWorkOrderEmail({
            to: recipient,
            from,
            agreementNumber: agreement.agreement_number,
            subcontractorName: sub.name,
            contactName: sub.contact_name,
            opcoLegalName: (props.opco.legal_name),
            pdfBuffer: pdf,
            pdfFilename: `WorkOrder_${agreement.agreement_number}.pdf`,
          });
        } catch (err) {
          bestEffortErrors.push(`Email send failed: ${msg(err)}`);
        }
      }
    }
  } catch (err) {
    bestEffortErrors.push(`PDF render failed: ${msg(err)}`);
  }

  // The atomic commit: flip to issued + stamp. Happens even if PDF/email failed
  // (§2.8) — the operator can re-render later; the issue itself stands.
  const emailedTo =
    input.sendEmail && recipient && !bestEffortErrors.some((e) => e.startsWith("Email"))
      ? recipient
      : null;
  const { data: updated, error: upErr } = await supabase
    .from("sub_agreements")
    .update({
      status: "issued" as DbSubAgreementStatus,
      issued_at: now,
      issued_by: input.actorId ?? null,
      sent_to_email: emailedTo,
      pdf_path: pdfPath,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (upErr) throw new Error(`issueAgreement/status: ${upErr.message}`);

  if (agreement.project_id) {
    await logActivity("project", agreement.project_id, "update", {
      work_order_issued: { from: null, to: agreement.agreement_number },
    });
  }

  return {
    ok: true,
    agreement: updated as DbSubAgreement,
    pdfPath,
    warning: bestEffortErrors.length ? bestEffortErrors.join("; ") : undefined,
  };
}

// ─── Status transitions ──────────────────────────────────────────────────────

// issued → in_progress → completed; anything not-terminal → cancelled.
const STATUS_TRANSITIONS: Record<DbSubAgreementStatus, DbSubAgreementStatus[]> = {
  draft: ["cancelled"], // draft is issued via issueAgreement, or cancelled
  issued: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export interface SetAgreementStatusInput {
  id: string;
  status: DbSubAgreementStatus;
  actorId?: string | null;
}

export async function setAgreementStatus(
  input: SetAgreementStatusInput
): Promise<DbSubAgreement> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("sub_agreements")
    .select("id, status")
    .eq("id", input.id)
    .maybeSingle();
  if (cErr) throw new Error(`setAgreementStatus/load: ${cErr.message}`);
  if (!cur) throw new AgreementError("not_found", "Work order not found.");
  const from = (cur as { status: DbSubAgreementStatus }).status;

  if (from === input.status) {
    throw new AgreementError("invalid_status", "The work order is already in that state.");
  }
  if (!STATUS_TRANSITIONS[from].includes(input.status)) {
    throw new AgreementError(
      "invalid_status",
      `A ${from} work order can't move to ${input.status}.`
    );
  }

  const { data, error } = await supabase
    .from("sub_agreements")
    .update({ status: input.status, updated_by: input.actorId ?? null })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`setAgreementStatus: ${error.message}`);
  return data as DbSubAgreement;
}

/** A fresh signed URL to the issued work-order PDF (#311 pattern). */
export async function getAgreementPdfUrl(id: string): Promise<string | null> {
  const agreement = await getAgreementById(id);
  if (!agreement?.pdf_path) return null;
  return signWorkOrderPdf(agreement.pdf_path);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
