import "server-only";

// SCHED-1 — schedule_assignments (the time-windowed BOOKING) data layer.
// A booking places a tech on a schedule_job over a timestamptz window. Two hard
// guards, both enforced server-side:
//   • CERT BLOCK — the tech must hold every cert the job requires, valid today
//     (mirrors the SUB-5/6 compliance block; no override in v1).
//   • NO DOUBLE-BOOKING — the tech's active bookings may not overlap in time.
//     The DB EXCLUDE constraint is the real guarantee; we also pre-check for a
//     friendly message and map 23P01 to a typed error.
//
// SPRINT INVARIANT: a booking is a PLAN. Nothing here writes to labour_entries
// or any cost surface — the only booking→cost path is the explicit SCHED-4
// conversion.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { isTechEligibleForJob } from "@/lib/scheduling/tech-eligibility";
import { isTechAvailable } from "@/lib/scheduling/availability";
import type {
  DbScheduleAssignment,
  DbScheduleAssignmentStatus,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

// SCHED-3 — a successful booking may carry an availability WARNING (off-hours):
// the booking proceeds (dispatchers book overtime / call-outs) but the UI shows
// an amber note. Approved LEAVE covering the slot is a hard block below.
export type BookingWarning = "off_hours" | null;

export type BookingResult =
  | { ok: true; booking: DbScheduleAssignment; warning?: BookingWarning }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_window" }
  | { ok: false; error: "cert_block"; reasons: string[] }
  | { ok: false; error: "tech_double_booked"; conflict: { starts_at: string; ends_at: string } }
  | { ok: false; error: "tech_on_leave"; absence: { starts_at: string; ends_at: string } };

// SCHED-3 — the availability guard. Blocks only when an APPROVED absence covers
// the whole slot; off-hours is returned as a non-blocking warning. Hours unknown
// → no warning. Mirrors the pure isTechAvailable matrix.
async function availabilityGate(
  supabase: Awaited<ReturnType<typeof db>>,
  techId: string,
  startsAt: string,
  endsAt: string
): Promise<{ block: { starts_at: string; ends_at: string } | null; warn: boolean }> {
  const [hoursRes, absRes] = await Promise.all([
    supabase.from("tech_working_hours").select("day_of_week, start_time, end_time").eq("tech_id", techId),
    supabase
      .from("tech_absences")
      .select("starts_at, ends_at, status")
      .eq("tech_id", techId)
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt),
  ]);
  const absences = (absRes.data ?? []) as { starts_at: string; ends_at: string; status: string }[];
  const check = isTechAvailable(startsAt, endsAt, {
    workingHours: (hoursRes.data ?? []) as { day_of_week: number; start_time: string; end_time: string }[],
    absences,
  });
  if (check.verdict === "on_leave") {
    const covering = absences.find(
      (a) => a.status === "approved" && a.starts_at <= startsAt && a.ends_at >= endsAt
    );
    return {
      block: covering
        ? { starts_at: covering.starts_at, ends_at: covering.ends_at }
        : { starts_at: startsAt, ends_at: endsAt },
      warn: false,
    };
  }
  return { block: null, warn: check.verdict === "off_hours" };
}

interface TechRow {
  id: string;
  is_active: boolean;
}
interface JobRow {
  id: string;
  status: string;
  required_certs: string[];
}

async function loadTech(
  supabase: Awaited<ReturnType<typeof db>>,
  techId: string
): Promise<TechRow | null> {
  const { data } = await supabase
    .from("techs")
    .select("id, is_active")
    .eq("id", techId)
    .maybeSingle();
  return (data as TechRow | null) ?? null;
}

async function loadJob(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string
): Promise<JobRow | null> {
  const { data } = await supabase
    .from("schedule_jobs")
    .select("id, status, required_certs")
    .eq("id", jobId)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

// Cert eligibility gate for a (tech, job) pair. Returns null when eligible, or a
// typed cert_block result with reasons.
async function certGate(
  supabase: Awaited<ReturnType<typeof db>>,
  tech: TechRow,
  job: JobRow
): Promise<{ ok: false; error: "cert_block"; reasons: string[] } | null> {
  const { data: certs } = await supabase
    .from("tech_certifications")
    .select("cert_type, expiry_date")
    .eq("tech_id", tech.id);
  const verdict = isTechEligibleForJob(
    { is_active: tech.is_active },
    ((certs ?? []) as { cert_type: string; expiry_date: string | null }[]).map((c) => ({
      cert_type: c.cert_type,
      expiry_date: c.expiry_date,
    })),
    { required_certs: job.required_certs },
    businessDateISO()
  );
  if (verdict.ok) return null;
  return { ok: false, error: "cert_block", reasons: verdict.reasons };
}

// The tech's earliest active booking overlapping [startsAt, endsAt), excluding
// `excludeId` (for a move). Overlap = existing.start < new.end AND existing.end
// > new.start. Cancelled bookings never conflict.
async function findOverlap(
  supabase: Awaited<ReturnType<typeof db>>,
  techId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string
): Promise<{ starts_at: string; ends_at: string } | null> {
  let q = supabase
    .from("schedule_assignments")
    .select("id, starts_at, ends_at")
    .eq("tech_id", techId)
    .neq("status", "cancelled")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.order("starts_at", { ascending: true }).limit(1);
  const row = ((data ?? []) as { starts_at: string; ends_at: string }[])[0];
  return row ? { starts_at: row.starts_at, ends_at: row.ends_at } : null;
}

function isExclusionViolation(error: { code?: string } | null): boolean {
  return error?.code === "23P01"; // exclusion_violation (the no-overlap EXCLUDE)
}

export interface CreateBookingInput {
  scheduleJobId: string;
  techId: string;
  startsAt: string;
  endsAt: string;
  status?: DbScheduleAssignmentStatus;
  jobAssignmentId?: string | null;
  notes?: string | null;
  actorId: string | null;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const supabase = await db();
  if (!(input.endsAt > input.startsAt)) return { ok: false, error: "invalid_window" };

  const job = await loadJob(supabase, input.scheduleJobId);
  if (!job) return { ok: false, error: "not_found" };
  const tech = await loadTech(supabase, input.techId);
  if (!tech) return { ok: false, error: "not_found" };

  const certBlock = await certGate(supabase, tech, job);
  if (certBlock) return certBlock;

  // SCHED-3 — approved leave covering the slot BLOCKS; off-hours only warns.
  const avail = await availabilityGate(supabase, input.techId, input.startsAt, input.endsAt);
  if (avail.block) return { ok: false, error: "tech_on_leave", absence: avail.block };

  const conflict = await findOverlap(supabase, input.techId, input.startsAt, input.endsAt);
  if (conflict) return { ok: false, error: "tech_double_booked", conflict };

  const { data, error } = await supabase
    .from("schedule_assignments")
    .insert({
      schedule_job_id: input.scheduleJobId,
      tech_id: input.techId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: input.status ?? "confirmed",
      job_assignment_id: input.jobAssignmentId ?? null,
      notes: input.notes ?? null,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) {
    // The DB EXCLUDE constraint is the real guarantee if the pre-check raced.
    if (isExclusionViolation(error)) {
      const c = await findOverlap(supabase, input.techId, input.startsAt, input.endsAt);
      return { ok: false, error: "tech_double_booked", conflict: c ?? { starts_at: input.startsAt, ends_at: input.endsAt } };
    }
    throw new Error(`createBooking: ${error.message}`);
  }

  // A booked job is scheduled.
  if (job.status === "unscheduled") {
    await supabase
      .from("schedule_jobs")
      .update({ status: "scheduled", updated_by: input.actorId })
      .eq("id", input.scheduleJobId);
  }
  return { ok: true, booking: data as DbScheduleAssignment, warning: avail.warn ? "off_hours" : null };
}

export interface MoveBookingInput {
  id: string;
  startsAt: string;
  endsAt: string;
  techId?: string; // reassign to a different tech
  actorId: string | null;
}

export async function moveBooking(input: MoveBookingInput): Promise<BookingResult> {
  const supabase = await db();
  if (!(input.endsAt > input.startsAt)) return { ok: false, error: "invalid_window" };

  const { data: existing } = await supabase
    .from("schedule_assignments")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };
  const cur = existing as DbScheduleAssignment;
  const techId = input.techId ?? cur.tech_id;

  // Re-run the cert gate against the (possibly new) tech + the job.
  const job = await loadJob(supabase, cur.schedule_job_id);
  if (!job) return { ok: false, error: "not_found" };
  const tech = await loadTech(supabase, techId);
  if (!tech) return { ok: false, error: "not_found" };
  const certBlock = await certGate(supabase, tech, job);
  if (certBlock) return certBlock;

  const avail = await availabilityGate(supabase, techId, input.startsAt, input.endsAt);
  if (avail.block) return { ok: false, error: "tech_on_leave", absence: avail.block };

  const conflict = await findOverlap(supabase, techId, input.startsAt, input.endsAt, input.id);
  if (conflict) return { ok: false, error: "tech_double_booked", conflict };

  const { data, error } = await supabase
    .from("schedule_assignments")
    .update({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      tech_id: techId,
      updated_by: input.actorId,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) {
    if (isExclusionViolation(error)) {
      const c = await findOverlap(supabase, techId, input.startsAt, input.endsAt, input.id);
      return { ok: false, error: "tech_double_booked", conflict: c ?? { starts_at: input.startsAt, ends_at: input.endsAt } };
    }
    throw new Error(`moveBooking: ${error.message}`);
  }
  return { ok: true, booking: data as DbScheduleAssignment, warning: avail.warn ? "off_hours" : null };
}

// Cancel frees the slot (excluded from the no-overlap constraint). If it was the
// job's last active booking, the job returns to 'unscheduled'.
export async function cancelBooking(input: {
  id: string;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const { data: existing } = await supabase
    .from("schedule_assignments")
    .select("schedule_job_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!existing) throw new Error("Booking not found.");
  const jobId = (existing as { schedule_job_id: string }).schedule_job_id;

  const { error } = await supabase
    .from("schedule_assignments")
    .update({ status: "cancelled", updated_by: input.actorId })
    .eq("id", input.id);
  if (error) throw new Error(`cancelBooking: ${error.message}`);

  const { data: remaining } = await supabase
    .from("schedule_assignments")
    .select("id")
    .eq("schedule_job_id", jobId)
    .neq("status", "cancelled")
    .limit(1);
  if (((remaining ?? []) as unknown[]).length === 0) {
    await supabase
      .from("schedule_jobs")
      .update({ status: "unscheduled", updated_by: input.actorId })
      .eq("id", jobId)
      .neq("status", "completed")
      .neq("status", "cancelled");
  }
}

export async function completeBooking(input: {
  id: string;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("schedule_assignments")
    .update({ status: "completed", updated_by: input.actorId })
    .eq("id", input.id);
  if (error) throw new Error(`completeBooking: ${error.message}`);
}

export async function listBookingsForTech(
  techId: string,
  window: { from: string; to: string }
): Promise<DbScheduleAssignment[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_assignments")
    .select("*")
    .eq("tech_id", techId)
    .neq("status", "cancelled")
    .lt("starts_at", window.to)
    .gt("ends_at", window.from)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`listBookingsForTech: ${error.message}`);
  return (data ?? []) as DbScheduleAssignment[];
}
