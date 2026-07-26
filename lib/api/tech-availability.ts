import "server-only";

// SCHED-3 — tech availability data layer (migration 0112): the weekly working-
// hours template + time-off/absences with a lightweight approval workflow, and
// the utilization read. The block/warn verdict math lives in the pure
// lib/scheduling/availability module (shared with the UI + the booking guard).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  availableMinutesInWindow,
  bookedMinutesInWindow,
  utilizationPct,
  type AbsenceRow,
  type WorkingHoursRow,
} from "@/lib/scheduling/availability";
import type {
  DbAbsenceStatus,
  DbAbsenceType,
  DbTechAbsence,
  DbTechWorkingHours,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

// ── Working hours ─────────────────────────────────────────────────────────────

export async function getWorkingHours(techId: string): Promise<DbTechWorkingHours[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_working_hours")
    .select("*")
    .eq("tech_id", techId)
    .order("day_of_week", { ascending: true });
  if (error) throw new Error(`getWorkingHours: ${error.message}`);
  return (data ?? []) as DbTechWorkingHours[];
}

export interface WorkingHoursInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// Replace the tech's whole weekly template (delete + insert). Validates order +
// no duplicate day-of-week before writing.
export async function setWorkingHours(
  techId: string,
  rows: WorkingHoursInput[]
): Promise<void> {
  const seen = new Set<number>();
  for (const r of rows) {
    if (r.dayOfWeek < 0 || r.dayOfWeek > 6) throw new Error("Invalid day of week.");
    if (!(r.endTime > r.startTime)) throw new Error("End time must be after start time.");
    if (seen.has(r.dayOfWeek)) throw new Error("Only one window per day of week (v1).");
    seen.add(r.dayOfWeek);
  }
  const supabase = await db();
  const { error: delErr } = await supabase
    .from("tech_working_hours")
    .delete()
    .eq("tech_id", techId);
  if (delErr) throw new Error(`setWorkingHours/clear: ${delErr.message}`);
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("tech_working_hours").insert(
      rows.map((r) => ({
        tech_id: techId,
        day_of_week: r.dayOfWeek,
        start_time: r.startTime,
        end_time: r.endTime,
      }))
    );
    if (insErr) throw new Error(`setWorkingHours/insert: ${insErr.message}`);
  }
}

// ── Absences ──────────────────────────────────────────────────────────────────

export interface ListAbsencesFilter {
  techId?: string;
  from?: string; // ends_at >= from
  to?: string; // starts_at <= to
  status?: DbAbsenceStatus;
}

export async function listAbsences(filter: ListAbsencesFilter = {}): Promise<DbTechAbsence[]> {
  const supabase = await db();
  let q = supabase.from("tech_absences").select("*");
  if (filter.techId) q = q.eq("tech_id", filter.techId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.from) q = q.gte("ends_at", filter.from);
  if (filter.to) q = q.lte("starts_at", filter.to);
  const { data, error } = await q.order("starts_at", { ascending: false });
  if (error) throw new Error(`listAbsences: ${error.message}`);
  return (data ?? []) as DbTechAbsence[];
}

export async function requestAbsence(input: {
  techId: string;
  type?: DbAbsenceType;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  actorId: string | null;
}): Promise<DbTechAbsence> {
  if (!(input.endsAt > input.startsAt)) throw new Error("End must be after start.");
  const supabase = await db();
  const { data, error } = await supabase
    .from("tech_absences")
    .insert({
      tech_id: input.techId,
      absence_type: input.type ?? "time_off",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: "requested",
      reason: input.reason ?? null,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`requestAbsence: ${error.message}`);
  return data as DbTechAbsence;
}

// Approve / deny / cancel. Approving stamps approved_by/at; leaving 'approved'
// clears them (a denied/cancelled absence is not approved leave).
export async function setAbsenceStatus(input: {
  id: string;
  status: DbAbsenceStatus;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const patch: Record<string, unknown> = { status: input.status, updated_by: input.actorId };
  if (input.status === "approved") {
    patch.approved_by = input.actorId;
    patch.approved_at = new Date().toISOString();
  } else {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  const { error } = await supabase.from("tech_absences").update(patch).eq("id", input.id);
  if (error) throw new Error(`setAbsenceStatus: ${error.message}`);
}

// ── Utilization ───────────────────────────────────────────────────────────────

export async function getTechUtilization(
  techId: string,
  from: string,
  to: string
): Promise<number | null> {
  const supabase = await db();
  const [hoursRes, absRes, bookRes] = await Promise.all([
    supabase.from("tech_working_hours").select("day_of_week, start_time, end_time").eq("tech_id", techId),
    supabase.from("tech_absences").select("starts_at, ends_at, status").eq("tech_id", techId).eq("status", "approved"),
    supabase
      .from("schedule_assignments")
      .select("starts_at, ends_at, status")
      .eq("tech_id", techId)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .gt("ends_at", from),
  ]);
  const workingHours = (hoursRes.data ?? []) as WorkingHoursRow[];
  const absences = (absRes.data ?? []) as AbsenceRow[];
  const bookings = (bookRes.data ?? []) as { starts_at: string; ends_at: string; status: string }[];

  const available = availableMinutesInWindow(workingHours, absences, from, to);
  const booked = bookedMinutesInWindow(bookings, from, to);
  return utilizationPct(booked, available);
}
