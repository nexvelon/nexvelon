import "server-only";

// SUB-1 — server-only subcontractors API (public.subcontractors, migration
// 0095). Mirrors lib/api/vendors.ts: cookie-aware server client so RLS is
// enforced and created_by/updated_by attribute to the caller. Mutations are
// gated by hasPermission(role, "subcontractors", ...) at the action layer
// (app/(app)/subcontractors/actions.ts).
//
// A subcontractor is the PAYABLE BUSINESS ENTITY — not the 'Subcontractor' login
// persona. The optional vendor_id is the FIN-5 billing hop.
//
// NOTE(audit): unlike vendors, there is NO activity logging here. activity_log's
// entity_type CHECK is client/site/contact/inventory/vendor/purchase_order/
// attachment/pickup_slip/rma/project — 'subcontractor' is not permitted, and
// widening it is out of SUB-1's scope (a separate additive migration). Same
// honest gap FIN-2 flagged for invoices; wiring sub auditing is tracked as
// deferred.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbSubcontractor,
  DbSubcontractorInsert,
  DbSubcontractorUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type SubcontractorErrorCode = "duplicate_name" | "not_found";

export class SubcontractorError extends Error {
  code: SubcontractorErrorCode;
  constructor(code: SubcontractorErrorCode, message: string) {
    super(message);
    this.name = "SubcontractorError";
    this.code = code;
  }
}

/** A list row: the subcontractor + its linked vendor's name (when set). */
export interface SubcontractorListRow extends DbSubcontractor {
  vendor_name: string | null;
}

export interface SubcontractorFilters {
  status?: string;
  trade?: string;
  search?: string;
}

// The Postgres unique-violation code, surfaced as a typed duplicate_name error
// so the form can show a friendly message instead of a raw 23505.
function isUniqueViolation(message: string): boolean {
  return (
    message.includes("subcontractors_name_unique") ||
    message.includes("duplicate key value")
  );
}

type SubJoinRow = DbSubcontractor & { vendor: { name: string } | null };

const SUB_SELECT = "*, vendor:vendors(name)";

export async function listSubcontractors(
  filters: SubcontractorFilters = {}
): Promise<SubcontractorListRow[]> {
  const supabase = await db();
  let q = supabase.from("subcontractors").select(SUB_SELECT);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.trade) q = q.eq("trade", filters.trade);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw new Error(`listSubcontractors: ${error.message}`);

  const rows = ((data ?? []) as unknown as SubJoinRow[]).map((r) => {
    const { vendor, ...sub } = r;
    return { ...(sub as DbSubcontractor), vendor_name: vendor?.name ?? null };
  });

  // Text search is applied in JS (small dataset) across name / trade / contact.
  const search = filters.search?.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((r) =>
    `${r.name} ${r.trade ?? ""} ${r.contact_name ?? ""} ${r.email ?? ""}`
      .toLowerCase()
      .includes(search)
  );
}

/** Distinct non-null trades, for the list's trade filter. */
export async function listSubcontractorTrades(): Promise<string[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .select("trade")
    .not("trade", "is", null);
  if (error) throw new Error(`listSubcontractorTrades: ${error.message}`);
  const set = new Set<string>();
  for (const r of (data ?? []) as { trade: string | null }[]) {
    if (r.trade) set.add(r.trade);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface SubcontractorDetail extends DbSubcontractor {
  vendor_name: string | null;
}

export async function getSubcontractorById(
  id: string
): Promise<SubcontractorDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .select(SUB_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSubcontractorById: ${error.message}`);
  if (!data) return null;
  const { vendor, ...sub } = data as unknown as SubJoinRow;
  return { ...(sub as DbSubcontractor), vendor_name: vendor?.name ?? null };
}

export async function createSubcontractor(
  payload: DbSubcontractorInsert,
  actorId: string | null
): Promise<DbSubcontractor> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .insert({ ...payload, created_by: actorId, updated_by: actorId })
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error.message)) {
      throw new SubcontractorError(
        "duplicate_name",
        `A subcontractor named "${payload.name}" already exists.`
      );
    }
    throw new Error(`createSubcontractor: ${error.message}`);
  }
  return data as DbSubcontractor;
}

export async function updateSubcontractor(
  id: string,
  patch: DbSubcontractorUpdate,
  actorId: string | null
): Promise<DbSubcontractor> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .update({ ...patch, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error.message)) {
      throw new SubcontractorError(
        "duplicate_name",
        `Another subcontractor already uses that name.`
      );
    }
    throw new Error(`updateSubcontractor: ${error.message}`);
  }
  return data as DbSubcontractor;
}

/**
 * Hard-delete a subcontractor (mirrors vendors). No child tables reference it
 * yet; SUB-2/5/6 will add ON DELETE RESTRICT FKs that then block deletion of a
 * subcontractor with compliance docs / agreements / assignments.
 *
 * @returns true when a row was removed; false when the id didn't match.
 */
export async function deleteSubcontractor(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteSubcontractor: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Set or clear the vendor billing hop (FIN-5). */
export async function linkVendor(
  id: string,
  vendorId: string | null,
  actorId: string | null
): Promise<DbSubcontractor> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subcontractors")
    .update({ vendor_id: vendorId, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`linkVendor: ${error.message}`);
  return data as DbSubcontractor;
}
