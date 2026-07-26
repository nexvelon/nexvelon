import "server-only";

// SCHED-1 — the dispatch-board read assembly. ONE query set that returns
// everything the (SCHED-2) calendar/swimlane board renders: tech rows, the
// bookings inside a window, and the unscheduled backlog. Shaped to match the
// mock board's field expectations so SCHED-2's wiring is minimal.
//
// Read-only: assembles plan data. It never touches labour_entries / cost.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { expiryState } from "@/lib/expiry-state";
import { CERT_WARN_DAYS } from "@/lib/scheduling/tech-eligibility";
import {
  availableMinutesInWindow,
  bookedMinutesInWindow,
  utilizationPct,
  type AbsenceRow,
  type WorkingHoursRow,
} from "@/lib/scheduling/availability";
import type {
  DbAbsenceType,
  DbScheduleJobPriority,
  DbScheduleJobType,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export interface DispatchTechRow {
  id: string;
  name: string;
  is_active: boolean;
  cert_summary: { valid_types: string[]; expiring_count: number; expired_count: number };
  // SCHED-3 — the weekly template (for shading non-working areas) + window utilization.
  working_hours: { day_of_week: number; start_time: string; end_time: string }[];
  utilization_pct: number | null; // null when hours are unknown
}

export interface DispatchAbsenceRow {
  id: string;
  tech_id: string;
  absence_type: DbAbsenceType;
  starts_at: string;
  ends_at: string;
}

export interface DispatchBookingRow {
  id: string;
  schedule_job_id: string;
  tech_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  site_label: string | null;
  priority: DbScheduleJobPriority;
  job_type: DbScheduleJobType;
  // SCHED-4 — whether this booking has been converted to a labour cost entry.
  converted: boolean;
}

export interface DispatchUnscheduledRow {
  schedule_job_id: string;
  title: string;
  priority: DbScheduleJobPriority;
  job_type: DbScheduleJobType;
  required_certs: string[];
  site_label: string | null;
  estimated_hours: number | null;
  window_start: string | null;
  window_end: string | null;
}

export interface DispatchBoard {
  techs: DispatchTechRow[];
  bookings: DispatchBookingRow[];
  unscheduled: DispatchUnscheduledRow[];
  // SCHED-3 — approved absences overlapping the window (rendered as leave bands).
  absences: DispatchAbsenceRow[];
  // SCHED-3 — the honest stats SCHED-2 removed: techs on leave today, and
  // window utilization (null when no working hours are set anywhere).
  stats: { techs_out: number; utilization_pct: number | null };
  range: { from: string; to: string };
}

export async function getDispatchBoard(window: {
  from: string;
  to: string;
}): Promise<DispatchBoard> {
  const supabase = await db();
  const today = businessDateISO();

  // Techs (the rows) + their certs.
  const { data: techData, error: tErr } = await supabase
    .from("techs")
    .select("id, name, is_active")
    .order("name", { ascending: true });
  if (tErr) throw new Error(`getDispatchBoard/techs: ${tErr.message}`);
  const techs = (techData ?? []) as { id: string; name: string; is_active: boolean }[];
  const techIds = techs.map((t) => t.id);

  const certsByTech: Record<string, { cert_type: string; expiry_date: string | null }[]> = {};
  if (techIds.length > 0) {
    const { data: certData, error: cErr } = await supabase
      .from("tech_certifications")
      .select("tech_id, cert_type, expiry_date")
      .in("tech_id", techIds);
    if (cErr) throw new Error(`getDispatchBoard/certs: ${cErr.message}`);
    for (const c of (certData ?? []) as { tech_id: string; cert_type: string; expiry_date: string | null }[]) {
      (certsByTech[c.tech_id] ??= []).push({ cert_type: c.cert_type, expiry_date: c.expiry_date });
    }
  }

  // Bookings inside the window (active only).
  const { data: bookData, error: bErr } = await supabase
    .from("schedule_assignments")
    .select("id, schedule_job_id, tech_id, starts_at, ends_at, status, converted_labour_entry_id")
    .neq("status", "cancelled")
    .lt("starts_at", window.to)
    .gt("ends_at", window.from)
    .order("starts_at", { ascending: true });
  if (bErr) throw new Error(`getDispatchBoard/bookings: ${bErr.message}`);
  const bookings = (bookData ?? []) as {
    id: string; schedule_job_id: string; tech_id: string;
    starts_at: string; ends_at: string; status: string; converted_labour_entry_id: string | null;
  }[];

  // SCHED-3 — working hours (all techs) + approved absences overlapping the window.
  const hoursByTech: Record<string, WorkingHoursRow[]> = {};
  const approvedAbsByTech: Record<string, AbsenceRow[]> = {};
  const windowAbsences: DispatchAbsenceRow[] = [];
  if (techIds.length > 0) {
    const { data: hoursData } = await supabase
      .from("tech_working_hours")
      .select("tech_id, day_of_week, start_time, end_time")
      .in("tech_id", techIds);
    for (const h of (hoursData ?? []) as { tech_id: string; day_of_week: number; start_time: string; end_time: string }[]) {
      (hoursByTech[h.tech_id] ??= []).push({ day_of_week: h.day_of_week, start_time: h.start_time, end_time: h.end_time });
    }
    const { data: absData } = await supabase
      .from("tech_absences")
      .select("id, tech_id, absence_type, starts_at, ends_at, status")
      .in("tech_id", techIds)
      .eq("status", "approved")
      .lt("starts_at", window.to)
      .gt("ends_at", window.from);
    for (const a of (absData ?? []) as { id: string; tech_id: string; absence_type: DbAbsenceType; starts_at: string; ends_at: string; status: string }[]) {
      (approvedAbsByTech[a.tech_id] ??= []).push({ starts_at: a.starts_at, ends_at: a.ends_at, status: a.status });
      windowAbsences.push({ id: a.id, tech_id: a.tech_id, absence_type: a.absence_type, starts_at: a.starts_at, ends_at: a.ends_at });
    }
  }

  // Techs on leave TODAY (may be outside the viewed window).
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;
  let techsOut = 0;
  if (techIds.length > 0) {
    const { data: todayAbs } = await supabase
      .from("tech_absences")
      .select("tech_id")
      .in("tech_id", techIds)
      .eq("status", "approved")
      .lt("starts_at", todayEnd)
      .gt("ends_at", todayStart);
    techsOut = new Set(((todayAbs ?? []) as { tech_id: string }[]).map((a) => a.tech_id)).size;
  }

  // The schedule_jobs referenced by those bookings + the unscheduled backlog.
  const bookedJobIds = [...new Set(bookings.map((b) => b.schedule_job_id))];
  const jobById: Record<string, {
    id: string; title: string; priority: DbScheduleJobPriority; job_type: DbScheduleJobType; site_id: string | null;
  }> = {};
  if (bookedJobIds.length > 0) {
    const { data, error } = await supabase
      .from("schedule_jobs")
      .select("id, title, priority, job_type, site_id")
      .in("id", bookedJobIds);
    if (error) throw new Error(`getDispatchBoard/bookedJobs: ${error.message}`);
    for (const j of (data ?? []) as typeof jobById[string][]) jobById[j.id] = j;
  }

  const { data: unschedData, error: uErr } = await supabase
    .from("schedule_jobs")
    .select("id, title, priority, job_type, required_certs, site_id, location_text, estimated_hours, window_start, window_end")
    .eq("status", "unscheduled")
    .order("created_at", { ascending: false });
  if (uErr) throw new Error(`getDispatchBoard/unscheduled: ${uErr.message}`);
  const unschedJobs = (unschedData ?? []) as {
    id: string; title: string; priority: DbScheduleJobPriority; job_type: DbScheduleJobType;
    required_certs: string[]; site_id: string | null; location_text: string | null;
    estimated_hours: number | null; window_start: string | null; window_end: string | null;
  }[];

  // Site labels for every site referenced.
  const siteIds = [
    ...new Set([
      ...Object.values(jobById).map((j) => j.site_id),
      ...unschedJobs.map((j) => j.site_id),
    ].filter((s): s is string => !!s)),
  ];
  const siteName: Record<string, string> = {};
  if (siteIds.length > 0) {
    const { data } = await supabase.from("sites").select("id, name").in("id", siteIds);
    for (const s of (data ?? []) as { id: string; name: string }[]) siteName[s.id] = s.name;
  }
  const labelFor = (siteId: string | null, locationText: string | null): string | null =>
    (siteId && siteName[siteId]) || locationText || null;

  // Group window bookings by tech for per-tech utilization.
  const bookingsByTech: Record<string, { starts_at: string; ends_at: string; status: string }[]> = {};
  for (const b of bookings) (bookingsByTech[b.tech_id] ??= []).push(b);

  // Board-level utilization: Σ booked ÷ Σ available across techs with known hours.
  let totalBooked = 0;
  let totalAvailable = 0;
  let anyHours = false;

  const techRows = techs.map((t) => {
    const certs = certsByTech[t.id] ?? [];
    const valid_types: string[] = [];
    let expiring = 0;
    let expired = 0;
    for (const c of certs) {
      const state = expiryState(c.expiry_date, today, CERT_WARN_DAYS);
      if (state === "expired") expired += 1;
      else {
        if (!valid_types.includes(c.cert_type)) valid_types.push(c.cert_type);
        if (state === "expiring_soon") expiring += 1;
      }
    }
    const hours = hoursByTech[t.id] ?? [];
    const available = availableMinutesInWindow(hours, approvedAbsByTech[t.id] ?? [], window.from, window.to);
    const booked = bookedMinutesInWindow(bookingsByTech[t.id] ?? [], window.from, window.to);
    if (available != null) { anyHours = true; totalBooked += booked; totalAvailable += available; }
    return {
      id: t.id,
      name: t.name,
      is_active: t.is_active,
      cert_summary: { valid_types, expiring_count: expiring, expired_count: expired },
      working_hours: hours,
      utilization_pct: utilizationPct(booked, available),
    };
  });

  return {
    techs: techRows,
    bookings: bookings.map((b) => {
      const j = jobById[b.schedule_job_id];
      return {
        id: b.id,
        schedule_job_id: b.schedule_job_id,
        tech_id: b.tech_id,
        title: j?.title ?? "—",
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        status: b.status,
        site_label: j ? labelFor(j.site_id, null) : null,
        priority: j?.priority ?? "normal",
        job_type: j?.job_type ?? "service",
        converted: b.converted_labour_entry_id != null,
      };
    }),
    unscheduled: unschedJobs.map((j) => ({
      schedule_job_id: j.id,
      title: j.title,
      priority: j.priority,
      job_type: j.job_type,
      required_certs: j.required_certs,
      site_label: labelFor(j.site_id, j.location_text),
      estimated_hours: j.estimated_hours,
      window_start: j.window_start,
      window_end: j.window_end,
    })),
    absences: windowAbsences,
    stats: {
      techs_out: techsOut,
      utilization_pct: anyHours ? utilizationPct(totalBooked, totalAvailable) : null,
    },
    range: window,
  };
}
