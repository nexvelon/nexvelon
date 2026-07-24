import "server-only";

// PROJ2-14 — warranty & handover on a project (job_id NULL) or a specific job.
// end_date is the truth; duration_months is a convenience — when a duration is
// given and no explicit end, end_date is COMPUTED (see addMonthsClamped). When
// both are given the explicit end wins and the duration is stored as entered
// (we don't silently "correct" the operator's numbers).
//
// Derived active/expiring/expired state uses the shared lib/expiry-state.ts with
// a 60-day warning window — a warranty renewal call at 30 days is already late.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { getJobById } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import { expiryState, WARRANTY_WARN_DAYS, type ExpiryState } from "@/lib/expiry-state";
import type {
  DbWarranty,
  DbWarrantyInsert,
  DbWarrantyScope,
  DbWarrantyUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type WarrantyErrorCode = "not_found" | "invalid_dates" | "job_mismatch";

export class WarrantyError extends Error {
  code: WarrantyErrorCode;
  constructor(code: WarrantyErrorCode, message: string) {
    super(message);
    this.name = "WarrantyError";
    this.code = code;
  }
}

/**
 * Add `months` to an ISO date (YYYY-MM-DD), clamping to the last valid day when
 * the target month is shorter — the conventional legal reading of "N months
 * from X". Jan 31 + 1 month → Feb 28 (or 29 in a leap year), NOT Mar 3.
 * Pure string/int math to stay timezone-safe.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const zeroBased = m - 1 + months;
  const targetYear = y + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12; // 0..11
  // Last day of the target month: day 0 of the NEXT month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(targetMonth + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

export interface WarrantyRow extends DbWarranty {
  job_label: string | null;
  state: ExpiryState;
}

type WarrantyJoinRow = DbWarranty & {
  job: { job_type: string; co_number: number | null; title: string } | null;
};

const WARRANTY_SELECT = "*, job:project_jobs(job_type, co_number, title)";

function toRow(r: WarrantyJoinRow, today: string): WarrantyRow {
  const { job, ...w } = r;
  return {
    ...(w as DbWarranty),
    job_label: jobLabel(job),
    state: expiryState(w.end_date, today, WARRANTY_WARN_DAYS),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listWarrantiesForProject(projectId: string): Promise<WarrantyRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("warranties")
    .select(WARRANTY_SELECT)
    .eq("project_id", projectId)
    .order("end_date", { ascending: true });
  if (error) throw new Error(`listWarrantiesForProject: ${error.message}`);
  const today = businessDateISO();
  return ((data ?? []) as unknown as WarrantyJoinRow[]).map((r) => toRow(r, today));
}

export async function listWarrantiesForJob(jobId: string): Promise<WarrantyRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("warranties")
    .select(WARRANTY_SELECT)
    .eq("job_id", jobId)
    .order("end_date", { ascending: true });
  if (error) throw new Error(`listWarrantiesForJob: ${error.message}`);
  const today = businessDateISO();
  return ((data ?? []) as unknown as WarrantyJoinRow[]).map((r) => toRow(r, today));
}

export interface WarrantyStatusRollup {
  active: number;
  expiring_soon: number;
  expired: number;
  total: number;
  soonest_expiry: string | null;
}

export async function getWarrantyStatusForProject(
  projectId: string
): Promise<WarrantyStatusRollup> {
  const rows = await listWarrantiesForProject(projectId);
  const roll: WarrantyStatusRollup = {
    active: 0,
    expiring_soon: 0,
    expired: 0,
    total: rows.length,
    soonest_expiry: null,
  };
  for (const w of rows) {
    if (w.state === "expired") roll.expired += 1;
    else if (w.state === "expiring_soon") roll.expiring_soon += 1;
    else roll.active += 1; // active / no_expiry (warranties always have an end)
    // soonest FUTURE expiry
    if (w.state !== "expired" && (roll.soonest_expiry === null || w.end_date < roll.soonest_expiry)) {
      roll.soonest_expiry = w.end_date;
    }
  }
  return roll;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateWarrantyInput {
  projectId: string;
  jobId?: string | null;
  scope?: DbWarrantyScope;
  description?: string | null;
  startDate: string;
  durationMonths?: number | null;
  endDate?: string | null;
  provider?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

/** Resolve the effective end date: explicit wins; else compute from months. */
function resolveEndDate(
  startDate: string,
  durationMonths: number | null | undefined,
  endDate: string | null | undefined
): string {
  if (endDate) return endDate;
  if (durationMonths && durationMonths > 0) return addMonthsClamped(startDate, durationMonths);
  throw new WarrantyError(
    "invalid_dates",
    "Provide either an end date or a duration in months."
  );
}

export async function createWarranty(input: CreateWarrantyInput): Promise<DbWarranty> {
  if (!input.startDate) {
    throw new WarrantyError("invalid_dates", "A start date is required.");
  }
  const endDate = resolveEndDate(input.startDate, input.durationMonths, input.endDate);
  if (endDate < input.startDate) {
    throw new WarrantyError("invalid_dates", "End date can't be before the start date.");
  }

  const supabase = await db();
  if (input.jobId) {
    const job = await getJobById(input.jobId);
    if (!job) throw new WarrantyError("not_found", "Job not found.");
    if (job.project_id !== input.projectId) {
      throw new WarrantyError("job_mismatch", "That job doesn't belong to this project.");
    }
  }

  const payload: DbWarrantyInsert = {
    project_id: input.projectId,
    job_id: input.jobId ?? null,
    scope: input.scope ?? "workmanship",
    description: input.description ?? null,
    start_date: input.startDate,
    // stored as ENTERED — we never silently correct the operator's duration.
    duration_months: input.durationMonths ?? null,
    end_date: endDate,
    provider: input.provider ?? null,
    reference_number: input.referenceNumber ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("warranties")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createWarranty: ${error.message}`);
  return data as DbWarranty;
}

export interface UpdateWarrantyPatch {
  scope?: DbWarrantyScope;
  description?: string | null;
  startDate?: string;
  durationMonths?: number | null;
  endDate?: string | null;
  provider?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
}

export async function updateWarranty(
  id: string,
  patch: UpdateWarrantyPatch,
  actorId: string | null
): Promise<DbWarranty> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("warranties")
    .select("start_date, end_date, duration_months")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateWarranty/load: ${cErr.message}`);
  if (!cur) throw new WarrantyError("not_found", "Warranty not found.");
  const before = cur as { start_date: string; end_date: string; duration_months: number | null };

  const update: DbWarrantyUpdate = {};
  if (patch.scope !== undefined) update.scope = patch.scope;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.durationMonths !== undefined) update.duration_months = patch.durationMonths;
  if (patch.provider !== undefined) update.provider = patch.provider;
  if (patch.referenceNumber !== undefined) update.reference_number = patch.referenceNumber;
  if (patch.notes !== undefined) update.notes = patch.notes;

  // Recompute end when it (or a driver of it) changes.
  const effStart = patch.startDate ?? before.start_date;
  if (patch.endDate !== undefined && patch.endDate) {
    update.end_date = patch.endDate;
  } else if (patch.endDate === null || patch.durationMonths !== undefined || patch.startDate !== undefined) {
    const months = patch.durationMonths !== undefined ? patch.durationMonths : before.duration_months;
    if (months && months > 0) update.end_date = addMonthsClamped(effStart, months);
  }

  const effEnd = update.end_date ?? before.end_date;
  if (effEnd < effStart) {
    throw new WarrantyError("invalid_dates", "End date can't be before the start date.");
  }

  const { data, error } = await supabase
    .from("warranties")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateWarranty: ${error.message}`);
  return data as DbWarranty;
}

export interface RecordHandoverInput {
  warrantyId: string;
  handoverDate: string;
  signedBy?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

export async function recordHandover(input: RecordHandoverInput): Promise<DbWarranty> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("warranties")
    .update({
      handover_date: input.handoverDate,
      handover_signed_by: input.signedBy ?? null,
      handover_notes: input.notes ?? null,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.warrantyId)
    .select("*")
    .single();
  if (error) throw new Error(`recordHandover: ${error.message}`);
  return data as DbWarranty;
}

export interface WarrantyAlert {
  warranty_id: string;
  project_id: string;
  project_number: string | null;
  project_title: string | null;
  scope: DbWarrantyScope;
  provider: string | null;
  end_date: string;
  state: "expiring_soon" | "expired";
}

/**
 * Warranties across ALL projects that are expiring soon or expired. Surfaced
 * as an INFORMATIONAL signal (a lapsing warranty on a completed project is a
 * renewal / monitoring-contract sales opportunity), not an alarm.
 */
export async function getExpiringWarranties(): Promise<WarrantyAlert[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("warranties")
    .select("id, project_id, scope, provider, end_date, project:projects(project_number, title)");
  if (error) throw new Error(`getExpiringWarranties: ${error.message}`);
  const today = businessDateISO();
  const out: WarrantyAlert[] = [];
  for (const r of (data ?? []) as unknown as (DbWarranty & {
    project: { project_number: string | null; title: string | null } | null;
  })[]) {
    const state = expiryState(r.end_date, today, WARRANTY_WARN_DAYS);
    if (state === "expiring_soon" || state === "expired") {
      out.push({
        warranty_id: r.id,
        project_id: r.project_id,
        project_number: r.project?.project_number ?? null,
        project_title: r.project?.title ?? null,
        scope: r.scope,
        provider: r.provider,
        end_date: r.end_date,
        state,
      });
    }
  }
  out.sort((a, b) => (a.end_date < b.end_date ? -1 : 1));
  return out;
}

export async function deleteWarranty(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("warranties")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteWarranty: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
