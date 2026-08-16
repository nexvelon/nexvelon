// UIDG-9 — resolve the dashboard's selected range into a concrete window (+ its
// comparison window) for the widgets that follow the global range. One place, so
// the KPI overview and Top clients read an identical window, and `custom` (which
// had no entry UI before) resolves from user-entered dates instead of silently
// behaving like MTD.

import { rangeFor, comparisonRange, RANGE_LABEL, type RangeKey } from "@/lib/date-range";
import { parseISO, subDays, differenceInCalendarDays, format } from "date-fns";

export interface CustomDates {
  from?: string; // yyyy-mm-dd (from a <input type="date">)
  to?: string;
}

export interface ResolvedWindow {
  key: RangeKey;
  /** Short human label of the window, for widget headers. */
  label: string;
  from: string; // yyyy-mm-dd, inclusive
  to: string;
  compareFrom: string;
  compareTo: string;
  comparisonBasis: string;
  /** false only for an incomplete/invalid custom range — widgets skip fetching. */
  valid: boolean;
}

// Local calendar date (not UTC) — the end-of-day the user means is the local day,
// and it matches the yyyy-mm-dd strings the custom date inputs produce.
const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

export function resolveWindow(
  key: RangeKey,
  custom?: CustomDates,
  anchor: Date = new Date()
): ResolvedWindow {
  if (key === "custom") {
    const from = custom?.from ?? "";
    const to = custom?.to ?? "";
    const valid = !!from && !!to && from <= to;
    let compareFrom = "";
    let compareTo = "";
    if (valid) {
      // The equal-length window immediately preceding [from, to].
      const f = parseISO(from);
      const spanDays = differenceInCalendarDays(parseISO(to), f);
      const priorTo = subDays(f, 1);
      const priorFrom = subDays(priorTo, spanDays);
      compareFrom = format(priorFrom, "yyyy-MM-dd");
      compareTo = format(priorTo, "yyyy-MM-dd");
    }
    return {
      key,
      label: valid ? `${from} → ${to}` : "Custom",
      from,
      to,
      compareFrom,
      compareTo,
      comparisonBasis: "prev period",
      valid,
    };
  }

  const r = rangeFor(key, anchor);
  const c = comparisonRange(key, anchor);
  return {
    key,
    label: RANGE_LABEL[key],
    from: isoDate(r.start),
    to: isoDate(r.end),
    compareFrom: isoDate(c.start),
    compareTo: isoDate(c.end),
    comparisonBasis: c.basis,
    valid: true,
  };
}
