// RECUR-1 — the pure recurring-billing arithmetic. No I/O, no server-only guard,
// so it is exhaustively unit-testable and shared by the generation engine, the
// server actions, and the UI. Dates are ISO "YYYY-MM-DD" strings (matching the DB
// `date` columns); month math uses date-fns `addMonths`, which CLAMPS the
// day-of-month (Jan 31 + 1 month → Feb 28/29).
//
// CRITICAL: every billing date is computed from the ANCHOR (start date) with a
// cycle count — NEVER iteratively from the previous billing date. Iterating drifts
// a month-end anchor off the end of the month (Jan 31 → Feb 28 → *Mar 28*), whereas
// addMonths(Jan 31, n) gives Feb 28 → Mar 31 → Apr 30, holding the anchor. All
// scheduling flows through `billingRuns`, which is anchor-based.

import { addMonths, addDays, subDays, parseISO, format, differenceInCalendarDays } from "date-fns";
import type {
  ServiceContractCadence,
  ServiceContractBillingTiming,
} from "@/lib/types/database";

const ISO = "yyyy-MM-dd";
const toISO = (d: Date): string => format(d, ISO);
const fromISO = (s: string): Date => parseISO(s);

/** Whole-months step for a cadence, or null for the day-based custom cadence. */
function cadenceMonths(cadence: ServiceContractCadence): number | null {
  switch (cadence) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semiannual":
      return 6;
    case "annual":
      return 12;
    case "custom":
      return null;
  }
}

/**
 * The ISO date `count` cadence steps from `anchorDate` (count may be negative).
 * ALWAYS call this from the ANCHOR with the cycle index — not iteratively — so
 * month-based cadences hold a month-end anchor (addMonths clamps + is computed
 * from the original day-of-month each time).
 */
export function advanceByCadence(
  anchorDate: string,
  cadence: ServiceContractCadence,
  customIntervalDays: number | null,
  count = 1
): string {
  const d = fromISO(anchorDate);
  const months = cadenceMonths(cadence);
  if (months === null) {
    if (!customIntervalDays || customIntervalDays <= 0) {
      throw new Error("custom cadence requires a positive customIntervalDays");
    }
    return toISO(addDays(d, customIntervalDays * count));
  }
  return toISO(addMonths(d, months * count));
}

/**
 * The FIRST billing date for a contract:
 *   • advance — the start date itself (bill at the period's start; typical for
 *     monitoring).
 *   • arrears — one cadence after the start (bill at the period's end).
 */
export function firstBillingDate(
  startDate: string,
  cadence: ServiceContractCadence,
  customIntervalDays: number | null,
  timing: ServiceContractBillingTiming
): string {
  return timing === "advance"
    ? startDate
    : advanceByCadence(startDate, cadence, customIntervalDays, 1);
}

export interface BillingRun {
  /** The date the invoice is issued/dated. */
  billingDate: string;
  /** The calendar span the invoice covers (inclusive). */
  periodStart: string;
  periodEnd: string;
}

/**
 * Every billing run due on or before `asOf`, anchor-computed so month-end holds.
 * This is the single source of truth for scheduling — the generation engine bills
 * each run whose period has not already been claimed, so a scheduler that missed
 * days simply finds several due runs and catches them all up.
 *
 *   advance: run at anchor date a(n) for n = 0,1,2,…; covers [a(n), a(n+1) − 1].
 *   arrears: run at a(n) for n = 1,2,3,…;            covers [a(n−1), a(n) − 1].
 *
 * where a(n) = advanceByCadence(startDate, …, n). Bounded by maxRuns so a
 * misconfigured contract cannot loop forever.
 */
export function billingRuns(
  startDate: string,
  cadence: ServiceContractCadence,
  customIntervalDays: number | null,
  timing: ServiceContractBillingTiming,
  asOf: string,
  maxRuns = 1000
): BillingRun[] {
  const runs: BillingRun[] = [];
  const startN = timing === "advance" ? 0 : 1;
  for (let n = startN; n - startN < maxRuns; n++) {
    const billingDate = advanceByCadence(startDate, cadence, customIntervalDays, n);
    if (billingDate > asOf) break;
    if (timing === "advance") {
      const nextDate = advanceByCadence(startDate, cadence, customIntervalDays, n + 1);
      runs.push({
        billingDate,
        periodStart: billingDate,
        periodEnd: toISO(subDays(fromISO(nextDate), 1)),
      });
    } else {
      const prevDate = advanceByCadence(startDate, cadence, customIntervalDays, n - 1);
      runs.push({
        billingDate,
        periodStart: prevDate,
        periodEnd: toISO(subDays(fromISO(billingDate), 1)),
      });
    }
  }
  return runs;
}

/**
 * The next billing date strictly AFTER `asOf` (the cursor to cache on the contract
 * for display + the "due" index). Null once the contract's end_date is passed.
 */
export function nextBillingDateAfter(
  startDate: string,
  cadence: ServiceContractCadence,
  customIntervalDays: number | null,
  timing: ServiceContractBillingTiming,
  asOf: string,
  endDate: string | null,
  maxRuns = 1000
): string | null {
  const startN = timing === "advance" ? 0 : 1;
  for (let n = startN; n - startN < maxRuns; n++) {
    const billingDate = advanceByCadence(startDate, cadence, customIntervalDays, n);
    if (billingDate > asOf) {
      if (endDate && billingDate > endDate) return null;
      return billingDate;
    }
  }
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Pro-rate a full-period amount for a partial span, used at mid-cycle cancellation.
 * `daysUsed` = (throughDate − periodStart + 1), clamped to [0, daysInPeriod];
 * result = amount × daysUsed / daysInPeriod. Inclusive day counting (a one-day
 * period bills one day). Returns 0 for a throughDate before the period.
 */
export function prorate(
  amount: number,
  periodStart: string,
  periodEnd: string,
  throughDate: string
): number {
  const daysInPeriod = differenceInCalendarDays(fromISO(periodEnd), fromISO(periodStart)) + 1;
  if (daysInPeriod <= 0) return 0;
  const usedRaw = differenceInCalendarDays(fromISO(throughDate), fromISO(periodStart)) + 1;
  const daysUsed = Math.max(0, Math.min(daysInPeriod, usedRaw));
  return round2((amount * daysUsed) / daysInPeriod);
}

/**
 * Monthly-equivalent of a per-period amount, for an honest MRR roll-up (§2.8):
 * monthly = amount; quarterly = /3; semiannual = /6; annual = /12; custom is
 * normalised by the average month length (365.25/12 ≈ 30.4375 days).
 */
export function monthlyEquivalent(
  amount: number,
  cadence: ServiceContractCadence,
  customIntervalDays: number | null
): number {
  switch (cadence) {
    case "monthly":
      return round2(amount);
    case "quarterly":
      return round2(amount / 3);
    case "semiannual":
      return round2(amount / 6);
    case "annual":
      return round2(amount / 12);
    case "custom":
      if (!customIntervalDays || customIntervalDays <= 0) return 0;
      return round2((amount * (365.25 / 12)) / customIntervalDays);
  }
}
