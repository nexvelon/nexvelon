// REP-5 — report schedule arithmetic (2c). Pure, no I/O.
//
// THE RULE. A schedule produces dated OCCURRENCES (run dates, America/Toronto
// business days). The daily cron (the existing Vercel-cron pattern, ~01:00
// Toronto) delivers every occurrence on or before today that has not been
// recorded yet. Each occurrence resolves its relative date range against ITS OWN
// run date — so a monthly schedule on day 1 with "Last month" reports the month
// that just closed, even if the run is late (a missed Nov 1 run caught up on Nov 3
// still reports October).
//
// CATCH-UP (follows the RECUR-1 generator: occurrences are computed from the
// anchor, never iteratively, and a recorded run is never repeated — the DB's
// UNIQUE(schedule_id, run_date) is the backstop):
//   • Period reports (a date range or year): every missed occurrence is delivered,
//     newest MAX_CATCH_UP of them; any older ones are recorded as skipped so the
//     gap is visible rather than silent.
//   • Point-in-time reports (balances "as of now", e.g. AR aging): a balance can't
//     be re-reported as of a past date, so only the LATEST missed occurrence is
//     delivered (labelled late); the older ones are recorded as skipped,
//     "superseded".

export type ReportCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface ScheduleSpec {
  cadence: ReportCadence;
  /** weekly: 0 = Sunday … 6 = Saturday. */
  dayOfWeek?: number | null;
  /** monthly / quarterly: 1–28 (29–31 would skip short months). Quarterly runs in
   *  Jan / Apr / Jul / Oct. */
  dayOfMonth?: number | null;
  /** First date the schedule may run (inclusive). */
  startDate: string;
}

export const CADENCE_OPTIONS: { value: ReportCadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly (Jan, Apr, Jul, Oct)" },
];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The range preset that matches a cadence — "the period that just closed". */
export const DEFAULT_PRESET_FOR_CADENCE = {
  daily: "yesterday",
  weekly: "last_7_days",
  monthly: "last_month",
  quarterly: "last_quarter",
} as const;

export const MAX_CATCH_UP = 6;
/** Safety bound on enumeration (a decade of daily runs). */
const MAX_SCAN = 4000;

const DAY_MS = 86_400_000;
function toDay(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
}
function fromDay(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function validateSchedule(s: ScheduleSpec): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate ?? "")) return "Choose the date the schedule starts.";
  if (s.cadence === "weekly") {
    if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek! < 0 || s.dayOfWeek! > 6) return "Choose a day of the week.";
  } else if (s.cadence === "monthly" || s.cadence === "quarterly") {
    if (!Number.isInteger(s.dayOfMonth) || s.dayOfMonth! < 1 || s.dayOfMonth! > 28) {
      return "Choose a day of the month from 1 to 28 (later days don't exist in every month).";
    }
  } else if (s.cadence !== "daily") {
    return "Choose how often it runs.";
  }
  return null;
}

/** Every occurrence from the start date through `asOf` (inclusive), oldest first. */
export function occurrences(s: ScheduleSpec, asOf: string): string[] {
  const out: string[] = [];
  const start = toDay(s.startDate);
  const end = toDay(asOf);
  if (end < start) return out;
  switch (s.cadence) {
    case "daily":
      for (let d = start; d <= end && out.length < MAX_SCAN; d++) out.push(fromDay(d));
      return out;
    case "weekly": {
      const dow = new Date(start * DAY_MS).getUTCDay();
      let d = start + ((Number(s.dayOfWeek) - dow + 7) % 7);
      for (; d <= end && out.length < MAX_SCAN; d += 7) out.push(fromDay(d));
      return out;
    }
    case "monthly":
    case "quarterly": {
      const dom = Number(s.dayOfMonth);
      let y = Number(s.startDate.slice(0, 4));
      let m = Number(s.startDate.slice(5, 7)); // 1-based
      const step = s.cadence === "monthly" ? 1 : 3;
      if (s.cadence === "quarterly") {
        // Advance to the first quarter-start month (1,4,7,10) on/after the start month.
        while ((m - 1) % 3 !== 0) {
          m++;
          if (m > 12) {
            m = 1;
            y++;
          }
        }
      }
      for (let i = 0; i < MAX_SCAN; i++) {
        const date = new Date(Date.UTC(y, m - 1, dom)).toISOString().slice(0, 10);
        const n = toDay(date);
        if (n > end) break;
        if (n >= start) out.push(date);
        m += step;
        while (m > 12) {
          m -= 12;
          y++;
        }
      }
      return out;
    }
  }
}

/** The next occurrence strictly after `after`, for display. */
export function nextOccurrence(s: ScheduleSpec, after: string): string | null {
  const horizon = fromDay(toDay(after) + 400);
  return occurrences(s, horizon).find((d) => d > after) ?? null;
}

export interface DuePlan {
  /** Occurrences to generate + deliver now, oldest first. */
  deliver: string[];
  /** Occurrences to record as skipped (never emailed), with why. */
  skip: { runDate: string; reason: string }[];
}

/**
 * What a run as of `asOf` should do for one schedule. `recorded` holds every
 * occurrence already recorded (delivered, failed, or skipped) — those are never
 * touched again. `pointInTime` collapses a backlog to its latest occurrence.
 */
export function planDueRuns(
  s: ScheduleSpec,
  asOf: string,
  recorded: ReadonlySet<string>,
  opts: { pointInTime: boolean; maxCatchUp?: number }
): DuePlan {
  const max = opts.maxCatchUp ?? MAX_CATCH_UP;
  const missing = occurrences(s, asOf).filter((d) => !recorded.has(d));
  if (missing.length === 0) return { deliver: [], skip: [] };
  if (opts.pointInTime) {
    const latest = missing[missing.length - 1];
    return {
      deliver: [latest],
      skip: missing.slice(0, -1).map((runDate) => ({
        runDate,
        reason: `Superseded — balances can only be reported as of now; delivered once for ${latest}.`,
      })),
    };
  }
  const deliver = missing.slice(-max);
  const skip = missing.slice(0, Math.max(0, missing.length - max)).map((runDate) => ({
    runDate,
    reason: `Missed and older than the last ${max} runs — not caught up automatically.`,
  }));
  return { deliver, skip };
}

export function describeSchedule(s: Pick<ScheduleSpec, "cadence" | "dayOfWeek" | "dayOfMonth">): string {
  switch (s.cadence) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${WEEKDAYS[Number(s.dayOfWeek)] ?? "week"}`;
    case "monthly":
      return `Monthly on day ${s.dayOfMonth}`;
    case "quarterly":
      return `Quarterly on day ${s.dayOfMonth} of Jan, Apr, Jul and Oct`;
  }
}
