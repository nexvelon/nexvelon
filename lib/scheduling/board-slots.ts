// SCHED-2 — the pure drop-target → booking-window computation, extracted so it's
// testable without rendering. A droppable cell is identified `tech::dayStr::hour`
// (dayStr = yyyy-MM-dd). A dropped job books a window starting at that day+hour;
// its length is the job's estimated_hours, or a default slot when it has none.

import type { DbScheduleJobType, DbScheduleAssignmentStatus } from "@/lib/types/database";
import type { BookingResult } from "@/lib/api/schedule-assignments";

/** Default booking length when a schedule_job has no estimated_hours. */
export const DEFAULT_SLOT_MINUTES = 120; // 2 hours

export interface DropTarget {
  techId: string;
  dayStr: string; // yyyy-MM-dd
  hour: number;
}

export function makeDroppableId(techId: string, dayStr: string, hour: number): string {
  return `${techId}::${dayStr}::${hour}`;
}

export function parseDroppableId(id: string): DropTarget | null {
  const parts = id.split("::");
  if (parts.length !== 3) return null;
  const [techId, dayStr, hourStr] = parts;
  const hour = Number.parseInt(hourStr, 10);
  if (!techId || !dayStr || !Number.isFinite(hour)) return null;
  return { techId, dayStr, hour };
}

/** Booking length in minutes: the job's estimated_hours, else the default slot. */
export function slotMinutes(estimatedHours: number | null | undefined): number {
  if (estimatedHours != null && estimatedHours > 0) return Math.round(estimatedHours * 60);
  return DEFAULT_SLOT_MINUTES;
}

/** Build the ISO booking window from a drop target + a duration (local wall-clock
 *  at the dropped hour). */
export function computeSlot(
  dayStr: string,
  hour: number,
  durationMinutes: number
): { startsAt: string; endsAt: string } {
  const start = new Date(`${dayStr}T${String(hour).padStart(2, "0")}:00:00`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// ── Shared board display vocab (real job_type / status, replacing the mock) ──

export const JOB_TYPE_COLOR: Record<DbScheduleJobType, { bg: string; text: string }> = {
  install: { bg: "#0B1B3B", text: "#FFFFFF" },
  service: { bg: "#475569", text: "#FFFFFF" },
  inspection: { bg: "#1E40AF", text: "#FFFFFF" },
  commissioning: { bg: "#C9A24B", text: "#0B1B3B" },
  other: { bg: "#334155", text: "#FFFFFF" },
};

export const PRIORITY_ACCENT: Record<string, string> = {
  low: "#94a3b8",
  normal: "#0ea5e9",
  high: "#f59e0b",
  urgent: "#dc2626",
};

// The user-facing message for a booking verdict — null on success (nothing to
// show). Keeps the drag handler's typed-error surfacing pure + testable.
export function bookingErrorMessage(r: BookingResult, techName: string): string | null {
  if (r.ok) return null;
  switch (r.error) {
    case "cert_block":
      return `Can't assign: ${techName} is missing ${r.reasons.join(" ")}`;
    case "tech_double_booked":
      return `Can't assign: ${techName} is already booked ${new Date(r.conflict.starts_at).toLocaleString()} → ${new Date(r.conflict.ends_at).toLocaleString()}`;
    case "invalid_window":
      return "Invalid time window.";
    default:
      return "Could not book (not found).";
  }
}

/** How a booking block reads by status. Cancelled bookings are excluded upstream. */
export function bookingStatusStyle(status: DbScheduleAssignmentStatus | string): {
  dashed: boolean;
  opacity: number;
  done: boolean;
} {
  switch (status) {
    case "tentative":
      return { dashed: true, opacity: 0.72, done: false };
    case "completed":
      return { dashed: false, opacity: 0.85, done: true };
    default: // confirmed
      return { dashed: false, opacity: 1, done: false };
  }
}
