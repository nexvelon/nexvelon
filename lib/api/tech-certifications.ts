import "server-only";

// SCHED-1 — technician certifications data layer (migration 0111). Mirrors
// lib/api/subcontractor-compliance.ts: thin CRUD; the actions layer owns the
// permission gate and the signed-URL file flow. Derived validity is NOT stored —
// callers compute it from expiry_date via lib/expiry-state (or the tech
// eligibility block).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { TECH_CERT_WARN_DAYS, techCertState } from "@/lib/scheduling/tech-cert-status";
import type {
  DbTechCertification,
  DbTechCertificationInsert,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export async function listTechCertifications(
  techId: string
): Promise<DbTechCertification[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_certifications")
    .select("*")
    .eq("tech_id", techId)
    .order("cert_type", { ascending: true });
  if (error) throw new Error(`listTechCertifications: ${error.message}`);
  return (data ?? []) as DbTechCertification[];
}

/** Certs for many techs at once (dispatch board cert summaries), keyed by tech_id. */
export async function getCertsByTech(
  techIds: string[]
): Promise<Record<string, DbTechCertification[]>> {
  const out: Record<string, DbTechCertification[]> = {};
  if (techIds.length === 0) return out;
  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_certifications")
    .select("*")
    .in("tech_id", techIds);
  if (error) throw new Error(`getCertsByTech: ${error.message}`);
  for (const c of (data ?? []) as DbTechCertification[]) {
    (out[c.tech_id] ??= []).push(c);
  }
  return out;
}

// DES-2 — cross-tech surfacing: every cert expired or expiring within `days`,
// with the tech name + derived state. Parallel to getBondAlerts /
// getComplianceRisk. Only dated certs can expire (no_expiry certs are excluded).
export interface ExpiringTechCert {
  id: string;
  tech_id: string;
  tech_name: string;
  cert_type: string;
  expiry_date: string; // non-null (undated certs can't expire)
  state: "expired" | "expiring_soon";
}

export async function getExpiringTechCerts(
  opts: { days?: number } = {}
): Promise<ExpiringTechCert[]> {
  const warnDays = opts.days ?? TECH_CERT_WARN_DAYS;
  const today = businessDateISO();
  // Cutoff = today + warnDays; anything with an expiry on/before it is expired
  // or expiring soon. Undated certs (expiry_date IS NULL) can never expire.
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + warnDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_certifications")
    .select("id, tech_id, cert_type, expiry_date, tech:techs(name)")
    .not("expiry_date", "is", null)
    .lte("expiry_date", cutoffIso)
    .order("expiry_date", { ascending: true });
  if (error) throw new Error(`getExpiringTechCerts: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    tech_id: string;
    cert_type: string;
    expiry_date: string;
    tech: { name: string } | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    tech_id: r.tech_id,
    tech_name: r.tech?.name ?? "—",
    cert_type: r.cert_type,
    expiry_date: r.expiry_date,
    state: techCertState({ cert_type: r.cert_type, expiry_date: r.expiry_date }, today, warnDays) === "expired"
      ? "expired"
      : "expiring_soon",
  }));
}

export interface CreateTechCertInput {
  techId: string;
  certType: string;
  certName?: string | null;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
  actorId: string | null;
}

export async function createTechCertification(
  input: CreateTechCertInput
): Promise<DbTechCertification> {
  if (!input.certType.trim()) throw new Error("A certification type is required.");
  const supabase = await db();
  const payload: DbTechCertificationInsert = {
    tech_id: input.techId,
    cert_type: input.certType.trim(),
    cert_name: input.certName ?? null,
    issuer: input.issuer ?? null,
    reference_number: input.referenceNumber ?? null,
    issued_date: input.issuedDate ?? null,
    expiry_date: input.expiryDate ?? null,
    attachment_id: input.attachmentId ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId,
    updated_by: input.actorId,
  };
  const { data, error } = await supabase
    .from("tech_certifications")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createTechCertification: ${error.message}`);
  return data as DbTechCertification;
}

export interface UpdateTechCertPatch {
  certType?: string;
  certName?: string | null;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

const CERT_PATCH_COLUMN: Record<keyof UpdateTechCertPatch, string> = {
  certType: "cert_type",
  certName: "cert_name",
  issuer: "issuer",
  referenceNumber: "reference_number",
  issuedDate: "issued_date",
  expiryDate: "expiry_date",
  notes: "notes",
};

export async function updateTechCertification(input: {
  id: string;
  patch: UpdateTechCertPatch;
  actorId: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(input.patch) as (keyof UpdateTechCertPatch)[]) {
    row[CERT_PATCH_COLUMN[key]] = input.patch[key];
  }
  if (Object.keys(row).length === 0) return; // empty diff — no write (§2.8)
  row.updated_by = input.actorId;
  const supabase = await db();
  const { error } = await supabase
    .from("tech_certifications")
    .update(row)
    .eq("id", input.id);
  if (error) throw new Error(`updateTechCertification: ${error.message}`);
}

export async function deleteTechCertification(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_certifications")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteTechCertification: ${error.message}`);
  return (data ?? []).length > 0;
}
