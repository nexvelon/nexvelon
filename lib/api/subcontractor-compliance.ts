import "server-only";

// SUB-2 — server-only API for subcontractor compliance docs
// (public.subcontractor_compliance_docs, migration 0096). The file itself rides
// the shared attachments signed-URL flow; this table holds the compliance
// metadata (type, issuer, dates, coverage) and a soft link to the attachment.
//
// Validity is NEVER stored — see lib/subcontractors/compliance-status.ts. This
// module returns raw docs; callers derive state.
//
// NOTE(audit): no activity logging — activity_log's entity_type CHECK has no
// 'subcontractor'. Same honest gap SUB-1 flagged; widening it is out of scope.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import {
  subcontractorComplianceSummary,
  type ComplianceSummary,
} from "@/lib/subcontractors/compliance-status";
import type {
  DbComplianceDocType,
  DbSubcontractorComplianceDoc,
  DbSubcontractorComplianceDocInsert,
  DbSubcontractorComplianceDocUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type ComplianceErrorCode = "invalid_dates" | "not_found";

export class ComplianceError extends Error {
  code: ComplianceErrorCode;
  constructor(code: ComplianceErrorCode, message: string) {
    super(message);
    this.name = "ComplianceError";
    this.code = code;
  }
}

export interface ComplianceDocRow extends DbSubcontractorComplianceDoc {
  attachment_filename: string | null;
}

const DOC_SELECT = "*, attachment:attachments(filename)";

/** Docs for a subcontractor, soonest-to-expire first, undated last. */
export async function listComplianceDocs(
  subcontractorId: string
): Promise<ComplianceDocRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractor_compliance_docs")
    .select(DOC_SELECT)
    .eq("subcontractor_id", subcontractorId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listComplianceDocs: ${error.message}`);

  return ((data ?? []) as unknown as (DbSubcontractorComplianceDoc & {
    attachment: { filename: string } | null;
  })[]).map((r) => {
    const { attachment, ...doc } = r;
    return {
      ...(doc as DbSubcontractorComplianceDoc),
      attachment_filename: attachment?.filename ?? null,
    };
  });
}

/** Derived compliance summary for one subcontractor (badge + missing-required). */
export async function getComplianceSummary(
  subcontractorId: string
): Promise<ComplianceSummary> {
  const docs = await listComplianceDocs(subcontractorId);
  return subcontractorComplianceSummary(docs, businessDateISO());
}

/**
 * Per-subcontractor summaries for a set of ids in ONE query — for the roster's
 * compliance column (avoids N round-trips).
 */
export async function getComplianceSummariesForSubs(
  subIds: string[]
): Promise<Map<string, ComplianceSummary>> {
  const out = new Map<string, ComplianceSummary>();
  if (subIds.length === 0) return out;
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractor_compliance_docs")
    .select("subcontractor_id, doc_type, expiry_date")
    .in("subcontractor_id", subIds);
  if (error) throw new Error(`getComplianceSummariesForSubs: ${error.message}`);

  const byId = new Map<
    string,
    { doc_type: DbComplianceDocType; expiry_date: string | null }[]
  >();
  for (const r of (data ?? []) as {
    subcontractor_id: string;
    doc_type: DbComplianceDocType;
    expiry_date: string | null;
  }[]) {
    const list = byId.get(r.subcontractor_id) ?? [];
    list.push({ doc_type: r.doc_type, expiry_date: r.expiry_date });
    byId.set(r.subcontractor_id, list);
  }

  const today = businessDateISO();
  for (const id of subIds) {
    out.set(id, subcontractorComplianceSummary(byId.get(id) ?? [], today));
  }
  return out;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function assertDateOrder(
  issued: string | null | undefined,
  expiry: string | null | undefined
): void {
  if (issued && expiry && expiry < issued) {
    throw new ComplianceError(
      "invalid_dates",
      "Expiry date can't be before the issue date."
    );
  }
}

export interface CreateComplianceDocInput {
  subcontractorId: string;
  docType: DbComplianceDocType;
  title?: string | null;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  coverageAmount?: number | null;
  attachmentId?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

export async function createComplianceDoc(
  input: CreateComplianceDocInput
): Promise<DbSubcontractorComplianceDoc> {
  assertDateOrder(input.issuedDate, input.expiryDate);
  const supabase = await db();
  const payload: DbSubcontractorComplianceDocInsert = {
    subcontractor_id: input.subcontractorId,
    doc_type: input.docType,
    title: input.title ?? null,
    issuer: input.issuer ?? null,
    reference_number: input.referenceNumber ?? null,
    issued_date: input.issuedDate ?? null,
    expiry_date: input.expiryDate ?? null,
    coverage_amount: input.coverageAmount ?? null,
    attachment_id: input.attachmentId ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("subcontractor_compliance_docs")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createComplianceDoc: ${error.message}`);
  return data as DbSubcontractorComplianceDoc;
}

export async function updateComplianceDoc(
  id: string,
  patch: DbSubcontractorComplianceDocUpdate,
  actorId: string | null
): Promise<DbSubcontractorComplianceDoc> {
  const supabase = await db();

  const { data: cur, error: cErr } = await supabase
    .from("subcontractor_compliance_docs")
    .select("issued_date, expiry_date")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateComplianceDoc/load: ${cErr.message}`);
  if (!cur) throw new ComplianceError("not_found", "Document not found.");
  const before = cur as { issued_date: string | null; expiry_date: string | null };

  // Validate against the effective post-patch dates.
  assertDateOrder(
    patch.issued_date !== undefined ? patch.issued_date : before.issued_date,
    patch.expiry_date !== undefined ? patch.expiry_date : before.expiry_date
  );

  const { data, error } = await supabase
    .from("subcontractor_compliance_docs")
    .update({ ...patch, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateComplianceDoc: ${error.message}`);
  return data as DbSubcontractorComplianceDoc;
}

/**
 * Delete a compliance doc. Returns the linked attachment_id (if any) so the
 * action layer can also remove the attachment row + storage object via the
 * shared deleteAttachment path — no orphaned blobs.
 */
export async function deleteComplianceDoc(
  id: string
): Promise<{ removed: boolean; attachmentId: string | null }> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractor_compliance_docs")
    .delete()
    .eq("id", id)
    .select("id, attachment_id");
  if (error) throw new Error(`deleteComplianceDoc: ${error.message}`);
  const row = (data ?? [])[0] as { attachment_id: string | null } | undefined;
  return {
    removed: !!row,
    attachmentId: row?.attachment_id ?? null,
  };
}
