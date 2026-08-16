// CLEAN-1 — the date-range utility, extracted from the retired lib/dashboard-data
// mock. Real data borrows only these range helpers; the mock KPI builders are
// gone. The anchor now defaults to the REAL current date — the old frozen
// `new Date("2026-04-30")` demo anchor is not carried over (callers already pass
// `new Date()`).

export type RangeKey = "today" | "7d" | "mtd" | "qtd" | "ytd" | "custom";

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7d",
  mtd: "MTD",
  qtd: "QTD",
  ytd: "YTD",
  custom: "Custom",
};

export interface Range {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

/**
 * The [start, end] window for a range key plus the immediately-preceding window
 * of equal span (for period-over-period deltas). `anchor` defaults to today.
 */
export function rangeFor(key: RangeKey, anchor: Date = new Date()): Range {
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  let start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  switch (key) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "mtd":
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      break;
    case "qtd": {
      const q = Math.floor(anchor.getMonth() / 3);
      start = new Date(anchor.getFullYear(), q * 3, 1);
      break;
    }
    case "ytd":
      start = new Date(anchor.getFullYear(), 0, 1);
      break;
    case "custom":
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      break;
  }

  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  return { start, end, prevStart, prevEnd };
}

// UIDG-6B — the LIKE-FOR-LIKE prior-period window for a range, for a
// period-over-period delta. Two conventions, by range kind:
//
//   • Rolling ranges (today / 7d / custom) → the equal-length window immediately
//     preceding the current one. That is exactly rangeFor's prev*, so we reuse it.
//   • Calendar-anchored ranges (mtd / qtd / ytd) → the SAME elapsed portion at the
//     START of the previous calendar period. Comparing 16 days of this month
//     against the full 31 of last month is a false comparison (the dashboard would
//     lie); instead we take days 1..16 of last month. If the current elapsed span
//     overshoots a shorter prior period (e.g. MTD on Mar 31 vs February), it clamps
//     to that period's last day.
//
// `basis` is the human label the UI shows so a delta is never "+12% against what?".
export interface ComparisonWindow {
  start: Date;
  end: Date;
  basis: string;
}

const COMPARISON_BASIS: Record<RangeKey, string> = {
  today: "yesterday",
  "7d": "prev 7 days",
  mtd: "same days last month",
  qtd: "same period last quarter",
  ytd: "same period last year",
  custom: "prev period",
};

export function comparisonRange(
  key: RangeKey,
  anchor: Date = new Date()
): ComparisonWindow {
  const cur = rangeFor(key, anchor);
  const basis = COMPARISON_BASIS[key];

  if (key === "mtd" || key === "qtd" || key === "ytd") {
    const start = priorPeriodStart(key, anchor);
    // The prior period's last moment = just before the current period starts.
    const priorPeriodEndMs = cur.start.getTime() - 1;
    const span = cur.end.getTime() - cur.start.getTime();
    const end = new Date(Math.min(start.getTime() + span, priorPeriodEndMs));
    return { start, end, basis };
  }

  // Rolling ranges — the immediately-preceding equal-length window.
  return { start: cur.prevStart, end: cur.prevEnd, basis };
}

function priorPeriodStart(
  key: "mtd" | "qtd" | "ytd",
  anchor: Date
): Date {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (key === "mtd") return new Date(y, m - 1, 1);
  if (key === "ytd") return new Date(y - 1, 0, 1);
  // qtd — first day of the previous quarter (JS normalises a negative month to
  // the prior year, so Q1 → Oct 1 of last year).
  const q = Math.floor(m / 3);
  return new Date(y, (q - 1) * 3, 1);
}
