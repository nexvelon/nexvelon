import "server-only";

// REP-3 — labour utilization report. Per technician: booked hours vs available
// hours over a window, and the resulting utilization %. Built from the SCHED-3
// availability primitives (the same booked/available math the dispatch board
// uses), so the report can never disagree with the board.
//
// HONEST LIMITS (§2.8):
//   • NO billable-vs-nonbillable split — the system records no billable flag on
//     bookings, so any such column would be fabricated. Utilization here is
//     purely booked-vs-available.
//   • A tech with NO working hours set has UNKNOWN capacity → utilization null,
//     shown "—", and EXCLUDED from the overall denominator (never a fake 0).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  availableMinutesInWindow,
  bookedMinutesInWindow,
  utilizationPct,
  type WorkingHoursRow,
  type AbsenceRow,
} from "@/lib/scheduling/availability";

async function db() {
  return createSupabaseServerClient();
}

function toHours(minutes: number | null): number | null {
  return minutes == null ? null : Math.round((minutes / 60) * 10) / 10;
}

export interface LabourUtilTechRow {
  tech_id: string;
  tech: string;
  booked_hours: number;
  /** Null when the tech has no working hours set (capacity unknown). */
  available_hours: number | null;
  utilization_pct: number | null;
}

export interface LabourUtilizationReport {
  from: string;
  to: string;
  techs: LabourUtilTechRow[];
  overall: {
    booked: number;
    /** Σ available over techs with KNOWN hours only. */
    available: number;
    utilization_pct: number | null;
  };
}

export async function getLabourUtilizationReport(window: {
  from: string;
  to: string;
}): Promise<LabourUtilizationReport> {
  const supabase = await db();

  const { data: techData, error: tErr } = await supabase
    .from("techs")
    .select("id, name")
    .order("name", { ascending: true });
  if (tErr) throw new Error(`labourUtilization/techs: ${tErr.message}`);
  const techs = (techData ?? []) as { id: string; name: string }[];
  const techIds = techs.map((t) => t.id);

  const hoursByTech: Record<string, WorkingHoursRow[]> = {};
  const absByTech: Record<string, AbsenceRow[]> = {};
  const bookingsByTech: Record<string, { starts_at: string; ends_at: string; status: string }[]> = {};

  if (techIds.length > 0) {
    const [{ data: hoursData }, { data: absData }, { data: bookData, error: bErr }] =
      await Promise.all([
        supabase
          .from("tech_working_hours")
          .select("tech_id, day_of_week, start_time, end_time")
          .in("tech_id", techIds),
        supabase
          .from("tech_absences")
          .select("tech_id, starts_at, ends_at, status")
          .in("tech_id", techIds)
          .eq("status", "approved")
          .lt("starts_at", window.to)
          .gt("ends_at", window.from),
        supabase
          .from("schedule_assignments")
          .select("tech_id, starts_at, ends_at, status")
          .neq("status", "cancelled")
          .lt("starts_at", window.to)
          .gt("ends_at", window.from),
      ]);
    if (bErr) throw new Error(`labourUtilization/bookings: ${bErr.message}`);

    for (const h of (hoursData ?? []) as { tech_id: string; day_of_week: number; start_time: string; end_time: string }[]) {
      (hoursByTech[h.tech_id] ??= []).push({ day_of_week: h.day_of_week, start_time: h.start_time, end_time: h.end_time });
    }
    for (const a of (absData ?? []) as { tech_id: string; starts_at: string; ends_at: string; status: string }[]) {
      (absByTech[a.tech_id] ??= []).push({ starts_at: a.starts_at, ends_at: a.ends_at, status: a.status });
    }
    for (const b of (bookData ?? []) as { tech_id: string; starts_at: string; ends_at: string; status: string }[]) {
      (bookingsByTech[b.tech_id] ??= []).push({ starts_at: b.starts_at, ends_at: b.ends_at, status: b.status });
    }
  }

  let totalBooked = 0;
  let totalAvailable = 0;
  let anyHours = false;

  const rows: LabourUtilTechRow[] = techs.map((t) => {
    const available = availableMinutesInWindow(hoursByTech[t.id] ?? [], absByTech[t.id] ?? [], window.from, window.to);
    const booked = bookedMinutesInWindow(bookingsByTech[t.id] ?? [], window.from, window.to);
    // Only techs with KNOWN hours contribute to the overall denominator.
    if (available != null) {
      anyHours = true;
      totalBooked += booked;
      totalAvailable += available;
    }
    return {
      tech_id: t.id,
      tech: t.name,
      booked_hours: toHours(booked) ?? 0,
      available_hours: toHours(available),
      utilization_pct: utilizationPct(booked, available),
    };
  });

  return {
    from: window.from,
    to: window.to,
    techs: rows,
    overall: {
      booked: toHours(totalBooked) ?? 0,
      available: toHours(totalAvailable) ?? 0,
      utilization_pct: anyHours ? utilizationPct(totalBooked, totalAvailable) : null,
    },
  };
}
