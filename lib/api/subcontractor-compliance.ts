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
  complianceState,
  daysUntilExpiry,
  REQUIRED_DOC_TYPES,
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

// ─── At-risk worklist (SUB-3) ────────────────────────────────────────────────
// The compliance-alerting surface: make expiring/missing compliance find the
// operator instead of them opening each subcontractor. Pure derivation over the
// SUB-2 table — no new columns, no stored status. Every state decision reuses
// the SUB-2 pure module (complianceState / daysUntilExpiry / REQUIRED_DOC_TYPES)
// so the worklist can never disagree with the detail page or the roster badge.

/**
 * Four-level risk severity, FINER than the roster summary's WorstState. SUB-2's
 * summary folds "missing required" into "expired" (both red); the worklist
 * separates them because a *missing* WSIB and a *lapsed* WSIB are different
 * operator actions (obtain vs renew). Ordering: expired > missing >
 * expiring_soon > ok — a missing WSIB is worse than one expiring next week, but
 * not worse than one already lapsed.
 */
export type ComplianceRiskWorst = "expired" | "missing" | "expiring_soon" | "ok";

export interface ComplianceRiskExpiredDoc {
  doc_type: DbComplianceDocType;
  title: string | null;
  expiry_date: string | null;
}

export interface ComplianceRiskExpiringDoc extends ComplianceRiskExpiredDoc {
  days_until: number;
}

export interface ComplianceRiskRow {
  subcontractor_id: string;
  subcontractor_name: string;
  trade: string | null;
  status: string;
  worst: ComplianceRiskWorst;
  expired_docs: ComplianceRiskExpiredDoc[];
  expiring_docs: ComplianceRiskExpiringDoc[];
  missing_required: DbComplianceDocType[];
  soonest_expiry: string | null;
}

export interface ComplianceRisk {
  asOf: string;
  counts: {
    expired: number;
    expiring_soon: number;
    missing_required: number;
    ok: number;
  };
  rows: ComplianceRiskRow[];
}

const RISK_RANK: Record<ComplianceRiskWorst, number> = {
  expired: 0,
  missing: 1,
  expiring_soon: 2,
  ok: 3,
};

interface RiskDoc {
  doc_type: DbComplianceDocType;
  title: string | null;
  expiry_date: string | null;
}

/** Build one at-risk row from a subcontractor's docs. Exported for unit tests. */
export function buildComplianceRiskRow(
  sub: { id: string; name: string; trade: string | null; status: string },
  docs: RiskDoc[],
  today: string
): ComplianceRiskRow {
  const expired_docs: ComplianceRiskExpiredDoc[] = [];
  const expiring_docs: ComplianceRiskExpiringDoc[] = [];
  let soonest: string | null = null;

  for (const d of docs) {
    const state = complianceState(d, today);
    if (state === "expired") {
      expired_docs.push({ doc_type: d.doc_type, title: d.title, expiry_date: d.expiry_date });
    } else if (state === "expiring_soon") {
      const days = daysUntilExpiry(d, today) ?? 0;
      expiring_docs.push({
        doc_type: d.doc_type,
        title: d.title,
        expiry_date: d.expiry_date,
        days_until: days,
      });
    }
    // Soonest FUTURE (non-past) expiry across all docs — the nearest renewal.
    const days = daysUntilExpiry(d, today);
    if (d.expiry_date && days != null && days >= 0) {
      if (soonest === null || d.expiry_date < soonest) soonest = d.expiry_date;
    }
  }

  // "Missing" = a required type with NO doc of that type at all. A required doc
  // that EXISTS but has lapsed is not missing — it's expired (it's in
  // expired_docs above), which outranks missing. This is the explicit
  // expired-vs-missing distinction the worklist depends on.
  const presentTypes = new Set(docs.map((d) => d.doc_type));
  const missing_required = REQUIRED_DOC_TYPES.filter((t) => !presentTypes.has(t));

  const worst: ComplianceRiskWorst =
    expired_docs.length > 0
      ? "expired"
      : missing_required.length > 0
        ? "missing"
        : expiring_docs.length > 0
          ? "expiring_soon"
          : "ok";

  return {
    subcontractor_id: sub.id,
    subcontractor_name: sub.name,
    trade: sub.trade,
    status: sub.status,
    worst,
    expired_docs,
    expiring_docs,
    missing_required,
    soonest_expiry: soonest,
  };
}

/**
 * The compliance at-risk worklist over ACTIVE subcontractors only. Inactive /
 * do_not_use subs are excluded entirely — they can't be assigned to work, so
 * their lapsed docs are noise, not signal. Counts are per-subcontractor by
 * worst-state (mutually exclusive buckets); `rows` lists only at-risk subs
 * (worst !== 'ok'), ordered expired → missing → expiring (soonest first).
 */
export async function getComplianceRisk(): Promise<ComplianceRisk> {
  const today = businessDateISO();
  const supabase = await db();

  const { data: subData, error: subErr } = await supabase
    .from("subcontractors")
    .select("id, name, trade, status")
    .eq("status", "active");
  if (subErr) throw new Error(`getComplianceRisk/subs: ${subErr.message}`);
  const subs = (subData ?? []) as {
    id: string;
    name: string;
    trade: string | null;
    status: string;
  }[];

  const counts = { expired: 0, expiring_soon: 0, missing_required: 0, ok: 0 };
  if (subs.length === 0) {
    return { asOf: today, counts, rows: [] };
  }

  const { data: docData, error: docErr } = await supabase
    .from("subcontractor_compliance_docs")
    .select("subcontractor_id, doc_type, title, expiry_date")
    .in(
      "subcontractor_id",
      subs.map((s) => s.id)
    );
  if (docErr) throw new Error(`getComplianceRisk/docs: ${docErr.message}`);

  const byId = new Map<string, RiskDoc[]>();
  for (const r of (docData ?? []) as (RiskDoc & { subcontractor_id: string })[]) {
    const list = byId.get(r.subcontractor_id) ?? [];
    list.push({ doc_type: r.doc_type, title: r.title, expiry_date: r.expiry_date });
    byId.set(r.subcontractor_id, list);
  }

  const rows: ComplianceRiskRow[] = [];
  for (const sub of subs) {
    const row = buildComplianceRiskRow(sub, byId.get(sub.id) ?? [], today);
    if (row.worst === "expired") counts.expired += 1;
    else if (row.worst === "missing") counts.missing_required += 1;
    else if (row.worst === "expiring_soon") counts.expiring_soon += 1;
    else counts.ok += 1;
    if (row.worst !== "ok") rows.push(row);
  }

  rows.sort(
    (a, b) =>
      RISK_RANK[a.worst] - RISK_RANK[b.worst] ||
      compareSoonest(a.soonest_expiry, b.soonest_expiry) ||
      a.subcontractor_name.localeCompare(b.subcontractor_name)
  );

  return { asOf: today, counts, rows };
}

/** Ascending by date; nulls (no upcoming expiry) sort last. */
function compareSoonest(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
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
