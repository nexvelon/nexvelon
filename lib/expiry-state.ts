// PROJ2-14/19 — the ONE date→state vocabulary, DERIVED not stored. Client-safe
// (no server-only import) so every surface agrees on what "expiring" and
// "expired" mean. Extracted from SUB-2's compliance-status logic so warranties,
// bonds and subcontractor compliance all speak the same language with a
// per-caller warning window (SUB-2/bonds = 30 days; warranties = 60).
//
// A stored expiry flag would go stale the day the clock ticks past the end
// date, so the state is always a function of (end_date, today, warnDays).

import { daysBetween } from "@/lib/aging-buckets";

export type ExpiryState =
  | "no_expiry" // no end date — never expires
  | "active" // more than warnDays out
  | "expiring_soon" // within the next warnDays (inclusive)
  | "expired"; // end date is in the past

/** Days until `endDate`; negative once past. null when there is no end date. */
export function daysUntil(endDate: string | null, today: string): number | null {
  if (!endDate) return null;
  return daysBetween(today, endDate);
}

/**
 * The derived state of a period ending on `endDate`, given `today` and how many
 * days ahead counts as "expiring soon". Ending TODAY (0 days) is expiring_soon,
 * not expired — you still have the day.
 */
export function expiryState(
  endDate: string | null,
  today: string,
  warnDays: number
): ExpiryState {
  const days = daysUntil(endDate, today);
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= warnDays) return "expiring_soon";
  return "active";
}

/** Warning windows. Bonds match SUB-2's 30-day compliance window; a warranty
 *  wants longer notice — a renewal call at 30 days is already late, so 60. */
export const BOND_WARN_DAYS = 30;
export const WARRANTY_WARN_DAYS = 60;
