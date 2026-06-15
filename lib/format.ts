const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const num0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const pct1 = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Fixed business timezone for calendar-date derivation. Quote dates etc. must
// reflect the Toronto calendar day, never the server/browser's UTC day — after
// ~8pm Eastern, new Date().toISOString() is already tomorrow in UTC.
export const BUSINESS_TIMEZONE = "America/Toronto";

// en-CA in the business TZ yields YYYY-MM-DD directly.
const businessDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar date (YYYY-MM-DD) of `date` in America/Toronto. Use this instead
 * of `new Date().toISOString().slice(0,10)` for any stored/displayed calendar
 * date so it never rolls to the next day in the evening Eastern.
 */
export function businessDateISO(date: Date = new Date()): string {
  return businessDateFmt.format(date); // en-CA → "2026-06-08"
}

/**
 * `businessDateISO` offset by `days` calendar days, computed in the business TZ.
 * Builds the Toronto Y/M/D first (so the base day is correct), then adds days
 * via a UTC anchor to avoid DST hour drift, and re-reads the result. Returns
 * YYYY-MM-DD.
 */
export function businessDatePlusDaysISO(days: number, date: Date = new Date()): string {
  const base = businessDateISO(date); // "YYYY-MM-DD" in Toronto
  const [y, m, d] = base.split("-").map(Number);
  // Anchor at UTC noon so a +days shift never crosses a DST boundary into the
  // wrong calendar day; we only ever read Y/M/D back out.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return businessDateISO(anchor);
}

const businessStampFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // 00–23 (NOT hour12:false, which can emit "24")
});

/**
 * Timestamp-style quote number: "Q-" + YYMMDDHHMM in America/Toronto.
 * Self-contained — no sequence lookup. Built via formatToParts (never
 * toISOString) so it reflects the Toronto wall-clock. e.g. 2026-06-08 23:45
 * Toronto → "Q-2606082345". NUM-1: the "Q-" prefix marks the value as a quote
 * number; the timestamp logic/precision is unchanged. Only newly generated
 * numbers carry the prefix — existing quotes keep their stored numbers.
 */
export function businessQuoteNumber(date: Date = new Date()): string {
  const parts = businessStampFmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return (
    "Q-" + get("year") + get("month") + get("day") + get("hour") + get("minute")
  );
}

// Seconds-precision variant of the stamp formatter — used by businessPONumber
// so two POs minted in the same minute don't collide.
const businessStampSecFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Timestamp-style purchase-order number: "PO-"+YYMMDDHHMMSS in America/Toronto.
 * Mirrors businessQuoteNumber but with second precision for uniqueness.
 * e.g. 2026-06-08 23:45:07 Toronto → "PO-260608234507".
 */
export function businessPONumber(date: Date = new Date()): string {
  const parts = businessStampSecFmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return (
    "PO-" +
    get("year") +
    get("month") +
    get("day") +
    get("hour") +
    get("minute") +
    get("second")
  );
}

/**
 * PROJ-1 — timestamp-style project number: "P-"+YYMMDDHHMMSS in America/Toronto.
 * Same second-precision stamp as businessPONumber (uniqueness on convert).
 * e.g. 2026-06-08 23:45:07 Toronto → "P-260608234507".
 */
export function businessProjectNumber(date: Date = new Date()): string {
  const parts = businessStampSecFmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return (
    "P-" +
    get("year") +
    get("month") +
    get("day") +
    get("hour") +
    get("minute") +
    get("second")
  );
}

/**
 * PROJ-1 — a project's nested cost-center number: the project number + a
 * 2-digit PJ sequence, e.g. "P-260608234507-PJ-01".
 */
export function costCenterNumber(projectNumber: string, n: number): string {
  return `${projectNumber}-PJ-${String(n).padStart(2, "0")}`;
}

export function formatCurrency(n: number): string {
  return usd2.format(n);
}

export function formatCurrencyCompact(n: number): string {
  return usdCompact.format(n);
}

export function formatNumber(n: number): string {
  return num0.format(n);
}

export function formatPercent(ratio: number): string {
  return pct1.format(ratio);
}
