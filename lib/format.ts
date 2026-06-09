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
