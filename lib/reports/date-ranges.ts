// REP-5 — saved-report date parameters (2b). Pure + client-safe.
//
// A saved report stores its period as a SPEC, never as resolved dates:
//   { kind: "relative", preset: "last_month" }   ← resolved EVERY run
//   { kind: "fixed", from: "2026-01-01", to: "2026-03-31" }
//   { kind: "none" }                              ← report's own default / all time
// resolveRange(spec, runDate) turns a spec into concrete dates against the RUN
// DATE — the business date (America/Toronto) the run is for. "last_month" saved in
// March and run on Nov 1 reports October, because it is resolved on Nov 1. A
// schedule with frozen dates would email the same numbers forever; there is no way
// to store one here by accident, because a relative spec has no dates to freeze.
//
// "last_*" presets mean the last COMPLETE period strictly before the run date, so a
// run on the 1st reports the month that just closed (2c). "this_*" presets are
// period-to-date INCLUDING the run date.

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

export type RangeSpec =
  | { kind: "none" }
  | { kind: "relative"; preset: RangePreset }
  | { kind: "fixed"; from: string; to: string };

export type YearSpec =
  | { kind: "relative"; preset: "this_year" | "last_year" }
  | { kind: "fixed"; year: number };

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "yesterday", label: "Yesterday" },
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 complete days" },
  { value: "last_30_days", label: "Last 30 complete days" },
  { value: "last_month", label: "Last month" },
  { value: "this_month", label: "This month to date" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_quarter", label: "This quarter to date" },
  { value: "last_year", label: "Last year" },
  { value: "this_year", label: "This year to date" },
];

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = Object.fromEntries(
  RANGE_PRESETS.map((p) => [p.value, p.label])
) as Record<RangePreset, string>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parts(iso: string): [number, number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}
function iso(y: number, m: number, d: number): string {
  // m is 1-based; Date.UTC normalises overflow (e.g. day 0 = last day of prev month).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}
export function addDaysISO(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return iso(y, m, d + n);
}
function lastDayOfMonth(y: number, m: number): string {
  return iso(y, m + 1, 0);
}
function quarterStartMonth(m: number): number {
  return Math.floor((m - 1) / 3) * 3 + 1;
}

export interface ResolvedRange {
  from: string;
  to: string;
}

/** Resolve a range spec against the run date. `none` → null (the report's default). */
export function resolveRange(spec: RangeSpec | undefined | null, runDate: string): ResolvedRange | null {
  if (!ISO.test(runDate)) throw new Error(`Invalid run date: ${runDate}`);
  if (!spec || spec.kind === "none") return null;
  if (spec.kind === "fixed") return { from: spec.from, to: spec.to };
  const [y, m] = parts(runDate);
  switch (spec.preset) {
    case "today":
      return { from: runDate, to: runDate };
    case "yesterday": {
      const d = addDaysISO(runDate, -1);
      return { from: d, to: d };
    }
    case "last_7_days":
      return { from: addDaysISO(runDate, -7), to: addDaysISO(runDate, -1) };
    case "last_30_days":
      return { from: addDaysISO(runDate, -30), to: addDaysISO(runDate, -1) };
    case "this_month":
      return { from: iso(y, m, 1), to: runDate };
    case "last_month":
      return { from: iso(y, m - 1, 1), to: lastDayOfMonth(y, m - 1) };
    case "this_quarter":
      return { from: iso(y, quarterStartMonth(m), 1), to: runDate };
    case "last_quarter": {
      const qs = quarterStartMonth(m) - 3;
      return { from: iso(y, qs, 1), to: lastDayOfMonth(y, qs + 2) };
    }
    case "this_year":
      return { from: iso(y, 1, 1), to: runDate };
    case "last_year":
      return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31) };
  }
}

/** Resolve a reporting-year spec against the run date. */
export function resolveYear(spec: YearSpec | undefined | null, runDate: string): number {
  const y = Number(runDate.slice(0, 4));
  if (!spec) return y;
  if (spec.kind === "fixed") return spec.year;
  return spec.preset === "last_year" ? y - 1 : y;
}

/** Plain-language description of a range spec (lists, emails, activity rows). */
export function describeRange(spec: RangeSpec | undefined | null): string {
  if (!spec || spec.kind === "none") return "All time / report default";
  if (spec.kind === "fixed") return `${spec.from} to ${spec.to} (fixed dates)`;
  return RANGE_PRESET_LABEL[spec.preset] ?? spec.preset;
}

/** Null when valid, else the reason. */
export function validateRangeSpec(spec: RangeSpec | undefined | null): string | null {
  if (!spec || spec.kind === "none") return null;
  if (spec.kind === "fixed") {
    if (!ISO.test(spec.from ?? "") || !ISO.test(spec.to ?? "")) return "Choose both a start and an end date.";
    if (spec.from > spec.to) return "The start date is after the end date.";
    return null;
  }
  if (!RANGE_PRESET_LABEL[spec.preset]) return "Unknown date range.";
  return null;
}
