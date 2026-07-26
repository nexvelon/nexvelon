// SCHED-3 — the pure availability logic, extracted client-safe (no server-only)
// so the UI and the server guard share ONE verdict, and it's testable without a
// DB. The API layer (lib/api/tech-availability.ts) fetches rows and calls these.
//
// BLOCK-vs-WARN matrix (the 2a decision):
//   • an APPROVED absence covering the WHOLE booking → 'on_leave' (BLOCK). A tech
//     on approved leave for the entire slot can't be booked.
//   • outside working hours, on a non-working day, or partially overlapping an
//     approved absence → 'off_hours' (WARN only). Dispatchers legitimately book
//     overtime / emergency call-outs, so this never blocks.
//   • hours UNKNOWN (no working_hours rows for the tech) → 'unknown': no warning
//     (we can't tell) and excluded from utilization — never a fake 0 or 24/7.
//   • within hours, no absence → 'available'.

export type AvailabilityVerdict = "available" | "off_hours" | "on_leave" | "unknown";

export interface AvailabilityCheck {
  within_hours: boolean | null; // null when hours unknown
  on_approved_absence: boolean; // true only on FULL coverage (the block case)
  verdict: AvailabilityVerdict;
}

export interface WorkingHoursRow {
  day_of_week: number;
  start_time: string; // 'HH:MM[:SS]'
  end_time: string;
}
export interface AbsenceRow {
  starts_at: string;
  ends_at: string;
  status: string;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function localMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function localDow(iso: string): number {
  return new Date(iso).getDay();
}

export function isTechAvailable(
  startsAt: string,
  endsAt: string,
  ctx: { workingHours: WorkingHoursRow[]; absences: AbsenceRow[] }
): AvailabilityCheck {
  const approved = ctx.absences.filter((a) => a.status === "approved");

  // Full coverage by an approved absence → BLOCK.
  const covered = approved.some((a) => a.starts_at <= startsAt && a.ends_at >= endsAt);
  if (covered) return { within_hours: null, on_approved_absence: true, verdict: "on_leave" };

  // Partial overlap with an approved absence contributes to the WARN.
  const overlaps = approved.some((a) => a.starts_at < endsAt && a.ends_at > startsAt);

  // Hours unknown → no warn, no block (can't judge).
  if (ctx.workingHours.length === 0) {
    return {
      within_hours: null,
      on_approved_absence: false,
      verdict: overlaps ? "off_hours" : "unknown",
    };
  }

  const wh = ctx.workingHours.find((w) => w.day_of_week === localDow(startsAt));
  let within = false;
  if (wh) {
    const s = localMinutes(startsAt);
    const e = localMinutes(endsAt);
    const sameDay = localDow(startsAt) === localDow(endsAt);
    within = sameDay && e > s && s >= timeToMinutes(wh.start_time) && e <= timeToMinutes(wh.end_time);
  }
  return {
    within_hours: within,
    on_approved_absence: false,
    verdict: within && !overlaps ? "available" : "off_hours",
  };
}

// ── Utilization ──────────────────────────────────────────────────────────────

/** Available working minutes across [from,to): the weekly template applied to
 *  each date, minus approved-absence overlap. Null when hours are unknown. */
export function availableMinutesInWindow(
  workingHours: WorkingHoursRow[],
  approvedAbsences: AbsenceRow[],
  from: string,
  to: string
): number | null {
  if (workingHours.length === 0) return null; // hours unknown
  const end = new Date(to).getTime();
  let total = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  // Bounded loop (a window is days, not years).
  for (let guard = 0; cursor.getTime() < end && guard < 400; guard++) {
    const wh = workingHours.find((w) => w.day_of_week === cursor.getDay());
    if (wh) {
      const wStart = new Date(cursor);
      const [sh, sm] = wh.start_time.split(":").map(Number);
      wStart.setHours(sh, sm || 0, 0, 0);
      const wEnd = new Date(cursor);
      const [eh, em] = wh.end_time.split(":").map(Number);
      wEnd.setHours(eh, em || 0, 0, 0);
      let dayMin = (wEnd.getTime() - wStart.getTime()) / 60_000;
      for (const a of approvedAbsences) {
        const ovStart = Math.max(wStart.getTime(), new Date(a.starts_at).getTime());
        const ovEnd = Math.min(wEnd.getTime(), new Date(a.ends_at).getTime());
        if (ovEnd > ovStart) dayMin -= (ovEnd - ovStart) / 60_000;
      }
      total += Math.max(0, dayMin);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/** Booked minutes across [from,to): the overlap portion of each non-cancelled booking. */
export function bookedMinutesInWindow(
  bookings: { starts_at: string; ends_at: string; status: string }[],
  from: string,
  to: string
): number {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  let total = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const ovStart = Math.max(f, new Date(b.starts_at).getTime());
    const ovEnd = Math.min(t, new Date(b.ends_at).getTime());
    if (ovEnd > ovStart) total += (ovEnd - ovStart) / 60_000;
  }
  return total;
}

/** Utilization %: booked ÷ available, capped 100. Null when hours are unknown or
 *  there's no available capacity (never a misleading 0). */
export function utilizationPct(
  bookedMinutes: number,
  availableMinutes: number | null
): number | null {
  if (availableMinutes == null || availableMinutes <= 0) return null;
  return Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100));
}
