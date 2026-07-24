import "server-only";

// PROJ2-19 — bonds & insurance on a project. `status` is an OPERATIONAL state
// (active / released / cancelled / expired-by-decision) that a person sets;
// the DERIVED expiry `state` (lib/expiry-state.ts, 30-day window) is computed
// from expiry_date. THEY ARE DISTINCT: a bond left status='active' whose
// expiry_date has passed is exactly the alarm — "your performance bond lapsed
// on a live project". We never auto-flip status on expiry; getBondAlerts()
// surfaces the mismatch.
//
// Certificate files attach via the shared signed-URL flow with
// entity_type='project_bond' (ENTITY_RESOURCE → 'projects'); no new table.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { expiryState, BOND_WARN_DAYS, type ExpiryState } from "@/lib/expiry-state";
import type {
  DbBondStatus,
  DbBondType,
  DbProjectBond,
  DbProjectBondInsert,
  DbProjectBondUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type BondErrorCode = "not_found" | "invalid_dates";

export class BondError extends Error {
  code: BondErrorCode;
  constructor(code: BondErrorCode, message: string) {
    super(message);
    this.name = "BondError";
    this.code = code;
  }
}

export interface BondRow extends DbProjectBond {
  attachment_filename: string | null;
  /** Derived from expiry_date — SEPARATE from `status`. */
  state: ExpiryState;
}

type BondJoinRow = DbProjectBond & {
  attachment: { filename: string } | null;
};

const BOND_SELECT = "*, attachment:attachments(filename)";

function toRow(r: BondJoinRow, today: string): BondRow {
  const { attachment, ...b } = r;
  return {
    ...(b as DbProjectBond),
    attachment_filename: attachment?.filename ?? null,
    state: expiryState(b.expiry_date, today, BOND_WARN_DAYS),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listBondsForProject(projectId: string): Promise<BondRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_bonds")
    .select(BOND_SELECT)
    .eq("project_id", projectId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listBondsForProject: ${error.message}`);
  const today = businessDateISO();
  return ((data ?? []) as unknown as BondJoinRow[]).map((r) => toRow(r, today));
}

export interface BondAlert {
  bond_id: string;
  project_id: string;
  project_number: string | null;
  project_title: string | null;
  bond_type: DbBondType;
  provider: string | null;
  expiry_date: string | null;
  state: "expiring_soon" | "expired";
}

/**
 * Bonds across ALL projects whose derived state is expiring_soon or expired
 * WHILE status='active'. Released / cancelled bonds are EXCLUDED even if past
 * expiry — the status/derived-state distinction: a released bond past its date
 * is closed business, not an alarm.
 */
export async function getBondAlerts(): Promise<BondAlert[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_bonds")
    .select("id, project_id, bond_type, provider, expiry_date, status, project:projects(project_number, title)")
    .eq("status", "active")
    .not("expiry_date", "is", null);
  if (error) throw new Error(`getBondAlerts: ${error.message}`);

  const today = businessDateISO();
  const out: BondAlert[] = [];
  for (const r of (data ?? []) as unknown as (DbProjectBond & {
    project: { project_number: string | null; title: string | null } | null;
  })[]) {
    const state = expiryState(r.expiry_date, today, BOND_WARN_DAYS);
    if (state === "expiring_soon" || state === "expired") {
      out.push({
        bond_id: r.id,
        project_id: r.project_id,
        project_number: r.project?.project_number ?? null,
        project_title: r.project?.title ?? null,
        bond_type: r.bond_type,
        provider: r.provider,
        expiry_date: r.expiry_date,
        state,
      });
    }
  }
  // Expired first, then soonest expiry.
  out.sort((a, b) => {
    if (a.state !== b.state) return a.state === "expired" ? -1 : 1;
    return (a.expiry_date ?? "") < (b.expiry_date ?? "") ? -1 : 1;
  });
  return out;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateBondInput {
  projectId: string;
  bondType: DbBondType;
  provider?: string | null;
  policyNumber?: string | null;
  coverageAmount?: number | null;
  premiumAmount?: number | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

function assertDateOrder(effective?: string | null, expiry?: string | null): void {
  if (effective && expiry && expiry < effective) {
    throw new BondError("invalid_dates", "Expiry date can't be before the effective date.");
  }
}

export async function createBond(input: CreateBondInput): Promise<DbProjectBond> {
  assertDateOrder(input.effectiveDate, input.expiryDate);
  const supabase = await db();
  const payload: DbProjectBondInsert = {
    project_id: input.projectId,
    bond_type: input.bondType,
    provider: input.provider ?? null,
    policy_number: input.policyNumber ?? null,
    coverage_amount: input.coverageAmount ?? null,
    premium_amount: input.premiumAmount ?? null,
    effective_date: input.effectiveDate ?? null,
    expiry_date: input.expiryDate ?? null,
    status: "active",
    attachment_id: input.attachmentId ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("project_bonds")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createBond: ${error.message}`);
  return data as DbProjectBond;
}

export interface UpdateBondPatch {
  bondType?: DbBondType;
  provider?: string | null;
  policyNumber?: string | null;
  coverageAmount?: number | null;
  premiumAmount?: number | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
}

export async function updateBond(
  id: string,
  patch: UpdateBondPatch,
  actorId: string | null
): Promise<DbProjectBond> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("project_bonds")
    .select("effective_date, expiry_date")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateBond/load: ${cErr.message}`);
  if (!cur) throw new BondError("not_found", "Bond not found.");
  const before = cur as { effective_date: string | null; expiry_date: string | null };

  assertDateOrder(
    patch.effectiveDate !== undefined ? patch.effectiveDate : before.effective_date,
    patch.expiryDate !== undefined ? patch.expiryDate : before.expiry_date
  );

  const update: DbProjectBondUpdate = {};
  if (patch.bondType !== undefined) update.bond_type = patch.bondType;
  if (patch.provider !== undefined) update.provider = patch.provider;
  if (patch.policyNumber !== undefined) update.policy_number = patch.policyNumber;
  if (patch.coverageAmount !== undefined) update.coverage_amount = patch.coverageAmount;
  if (patch.premiumAmount !== undefined) update.premium_amount = patch.premiumAmount;
  if (patch.effectiveDate !== undefined) update.effective_date = patch.effectiveDate;
  if (patch.expiryDate !== undefined) update.expiry_date = patch.expiryDate;
  if (patch.attachmentId !== undefined) update.attachment_id = patch.attachmentId;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await supabase
    .from("project_bonds")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateBond: ${error.message}`);
  return data as DbProjectBond;
}

export async function setBondStatus(
  id: string,
  status: DbBondStatus,
  actorId: string | null
): Promise<DbProjectBond> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_bonds")
    .update({ status, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setBondStatus: ${error.message}`);
  return data as DbProjectBond;
}

/** Delete a bond. Returns the linked attachment_id for blob cleanup (like SUB-2). */
export async function deleteBond(id: string): Promise<{ removed: boolean; attachmentId: string | null }> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_bonds")
    .delete()
    .eq("id", id)
    .select("id, attachment_id");
  if (error) throw new Error(`deleteBond: ${error.message}`);
  const row = (data ?? [])[0] as { attachment_id: string | null } | undefined;
  return { removed: !!row, attachmentId: row?.attachment_id ?? null };
}
