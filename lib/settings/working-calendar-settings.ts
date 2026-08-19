import "server-only";

// GANTT-CAL — the org working calendar, stored in the company_settings KV (no new
// table). Reused everywhere scheduling reasons about working days. Unset → the
// seeded default (Mon–Fri + Ontario statutory holidays), so the fix works out of
// the box; an Admin can override the whole config (working weekdays + holidays).

import { getSetting, setSetting } from "@/lib/api/company-settings";
import {
  DEFAULT_WORKING_CALENDAR,
  validateCalendarConfig,
  type WorkingCalendarConfig,
} from "@/lib/gantt/working-calendar";

export const WORKING_CALENDAR_KEY = "working_calendar";

/** The org calendar (validated), or the seeded default when unset/invalid. */
export async function getWorkingCalendar(): Promise<WorkingCalendarConfig> {
  const raw = await getSetting(WORKING_CALENDAR_KEY);
  if (!raw) return DEFAULT_WORKING_CALENDAR;
  try {
    return validateCalendarConfig(JSON.parse(raw)) ?? DEFAULT_WORKING_CALENDAR;
  } catch {
    return DEFAULT_WORKING_CALENDAR;
  }
}

/** True when the org has explicitly configured a calendar (vs. the seeded default). */
export async function hasConfiguredCalendar(): Promise<boolean> {
  return (await getSetting(WORKING_CALENDAR_KEY)) != null;
}

/** Save a validated calendar. Rejects nonsense (empty working week, bad dates). */
export async function setWorkingCalendar(config: unknown): Promise<WorkingCalendarConfig> {
  const clean = validateCalendarConfig(config);
  if (!clean) throw new Error("A working calendar needs at least one working weekday.");
  await setSetting(WORKING_CALENDAR_KEY, JSON.stringify(clean));
  return clean;
}
