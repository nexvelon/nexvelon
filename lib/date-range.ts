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
