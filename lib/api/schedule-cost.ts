import "server-only";

// SCHED-4 — THE COST SEAM. The single, deliberate, manual path from a booking
// (a PLAN) to cost. Nothing auto-converts; completeBooking does NOT create
// labour. A booking converts AT MOST ONCE, and the conversion is fully traceable
// (the labour_entry carries a "From booking <SVC ref>" note and the booking
// carries converted_labour_entry_id).
//
// DOUBLE-FEED GUARD (SCHED-4 audit 2b):
//   • status must be 'completed'                → 'not_completed'
//   • converted_labour_entry_id must be NULL    → 'already_converted'
//   • the link is set with an `IS NULL` guard so a raced second convert can't
//     create a second labour_entry (it's deleted + reported already_converted).
// This is symmetric with the site-log boundary: only ONE canonical cost path.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { recordScheduleAudit } from "@/lib/api/schedule-audit";

async function db() {
  return createSupabaseServerClient();
}

export type ConvertResult =
  | { ok: true; labourEntryId: string; hours: number; amount: number; costCenterId: string }
  | { ok: false; error: "not_found" | "not_completed" | "already_converted" | "no_cost_center" | "no_rate" };

// Resolve the cost center a booking's job labour lands on: booking → schedule_job
// → project_job → its cost centers (first by sort_order). Standalone service
// calls (no project_job_id) or jobs with no cost center → null (honest limit).
async function resolveCostCenterId(
  supabase: Awaited<ReturnType<typeof db>>,
  projectJobId: string | null
): Promise<string | null> {
  if (!projectJobId) return null;
  const { data } = await supabase
    .from("project_cost_centers")
    .select("id")
    .eq("job_id", projectJobId)
    .order("sort_order", { ascending: true })
    .limit(1);
  const row = ((data ?? []) as { id: string }[])[0];
  return row?.id ?? null;
}

export async function convertBookingToLabour(input: {
  assignmentId: string;
  hours?: number;
  actorId: string | null;
}): Promise<ConvertResult> {
  const supabase = await db();

  const { data: bRow } = await supabase
    .from("schedule_assignments")
    .select("id, schedule_job_id, tech_id, starts_at, ends_at, status, converted_labour_entry_id")
    .eq("id", input.assignmentId)
    .maybeSingle();
  if (!bRow) return { ok: false, error: "not_found" };
  const booking = bRow as {
    id: string; schedule_job_id: string; tech_id: string;
    starts_at: string; ends_at: string; status: string;
    converted_labour_entry_id: string | null;
  };
  if (booking.status !== "completed") return { ok: false, error: "not_completed" };
  if (booking.converted_labour_entry_id) return { ok: false, error: "already_converted" };

  const { data: jRow } = await supabase
    .from("schedule_jobs")
    .select("id, reference, project_job_id")
    .eq("id", booking.schedule_job_id)
    .maybeSingle();
  const job = jRow as { id: string; reference: string; project_job_id: string | null } | null;
  const costCenterId = await resolveCostCenterId(supabase, job?.project_job_id ?? null);
  if (!costCenterId) return { ok: false, error: "no_cost_center" };

  const { data: tRow } = await supabase
    .from("techs")
    .select("id, name, default_cost_rate")
    .eq("id", booking.tech_id)
    .maybeSingle();
  const tech = tRow as { id: string; name: string; default_cost_rate: number | null } | null;
  if (!tech) return { ok: false, error: "not_found" };
  if (tech.default_cost_rate == null) return { ok: false, error: "no_rate" };
  const rate = Number(tech.default_cost_rate);

  const hours =
    input.hours != null && input.hours > 0
      ? round2(input.hours)
      : round2((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000);
  const amount = round2(hours * rate);
  const workedOn = booking.starts_at.slice(0, 10);
  const note = `From booking ${job?.reference ?? "(service job)"}`;

  // Insert labour, THEN link with an IS-NULL guard. Ordering matters: if a raced
  // convert already linked, the guarded update touches 0 rows and we delete the
  // labour we just made — never a second cost entry.
  const { data: labRow, error: labErr } = await supabase
    .from("labour_entries")
    .insert({
      cost_center_id: costCenterId,
      tech_id: tech.id,
      tech_name: tech.name,
      hours,
      cost_rate: rate,
      amount,
      worked_on: workedOn,
      note,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id")
    .single();
  if (labErr) throw new Error(`convertBookingToLabour/labour: ${labErr.message}`);
  const labourEntryId = (labRow as { id: string }).id;

  const { data: linked, error: linkErr } = await supabase
    .from("schedule_assignments")
    .update({ converted_labour_entry_id: labourEntryId, updated_by: input.actorId })
    .eq("id", input.assignmentId)
    .is("converted_labour_entry_id", null)
    .select("id");
  if (linkErr) throw new Error(`convertBookingToLabour/link: ${linkErr.message}`);
  if (((linked ?? []) as unknown[]).length === 0) {
    // Raced — a concurrent convert already linked. Roll back our labour_entry.
    await supabase.from("labour_entries").delete().eq("id", labourEntryId);
    return { ok: false, error: "already_converted" };
  }

  await recordScheduleAudit({
    schedule_assignment_id: booking.id,
    schedule_job_id: booking.schedule_job_id,
    tech_id: booking.tech_id,
    action: "converted_to_labour",
    detail: { hours, amount, cost_center_id: costCenterId, labour_entry_id: labourEntryId },
    actor_id: input.actorId,
  });

  return { ok: true, labourEntryId, hours, amount, costCenterId };
}

export type UnconvertResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_converted" };

// Reverse a mistaken conversion: delete the linked labour_entry (the FK SET NULL
// frees the link) and clear it explicitly, then audit. There is no
// further-processing guard because labour_entries are not individually
// invoiced/locked — they feed cost only as a rollup sum, so deletion is safe.
export async function unconvertBooking(input: {
  assignmentId: string;
  actorId: string | null;
}): Promise<UnconvertResult> {
  const supabase = await db();
  const { data: bRow } = await supabase
    .from("schedule_assignments")
    .select("id, schedule_job_id, tech_id, converted_labour_entry_id")
    .eq("id", input.assignmentId)
    .maybeSingle();
  if (!bRow) return { ok: false, error: "not_found" };
  const booking = bRow as {
    id: string; schedule_job_id: string; tech_id: string; converted_labour_entry_id: string | null;
  };
  if (!booking.converted_labour_entry_id) return { ok: false, error: "not_converted" };

  await supabase.from("labour_entries").delete().eq("id", booking.converted_labour_entry_id);
  await supabase
    .from("schedule_assignments")
    .update({ converted_labour_entry_id: null, updated_by: input.actorId })
    .eq("id", input.assignmentId);

  await recordScheduleAudit({
    schedule_assignment_id: booking.id,
    schedule_job_id: booking.schedule_job_id,
    tech_id: booking.tech_id,
    action: "unconverted",
    detail: { labour_entry_id: booking.converted_labour_entry_id },
    actor_id: input.actorId,
  });
  return { ok: true };
}
