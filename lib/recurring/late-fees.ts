// RECUR-2 — the pure late-fee rule (2f). No I/O; exhaustively unit-tested.
//
// THE RULE
//   • Per contract, opt-in. A contract charges a late fee only if its terms say so
//     (mode ≠ 'none'). DEFAULT IS 'none' — there is NO hardcoded org-wide rate.
//     A quote-origin contract inherits the late-fee terms the client SIGNED (they
//     are printed on the quote and frozen in the signed snapshot); a fee the client
//     never agreed to is not one we charge.
//   • Eligible invoices: only recurring invoices a contract generated (linked via
//     service_contract_invoices), while open (sent / partially paid) and past due.
//     Late-fee invoices themselves are never eligible.
//   • Basis: the overdue invoice's OUTSTANDING balance (amount_due − payments) at
//     assessment. Fees are billed on their own invoice, so a fee is never part of a
//     later fee's basis — NO COMPOUNDING (simple interest only).
//   • Timing: after `graceDays` past the due date, one assessment per started
//     30-day block overdue ("per month or part month"):
//       block = floor((daysOverdue − graceDays − 1) / 30) + 1, when daysOverdue > graceDays
//     percent_monthly → each block charges balance × monthlyPct / 100.
//     flat            → a single charge, block 1 only.
//   • NEVER AUTOMATIC. The daily job PROPOSES a fee; a person approves (which
//     issues the fee invoice) or waives it. Nothing is charged unreviewed.
//
// LEGAL GUARD RAILS (not legal advice — flagged for Jay to confirm):
//   • Interest Act (Canada) s.4: interest stated at a rate for a period shorter
//     than a year must also state the annual equivalent, or recovery is capped at
//     5%/year. Every place a monthly rate is shown to a client also shows the
//     annual rate (annualEquivalentPct).
//   • Criminal Code s.347: the criminal interest rate is 35% APR (from
//     2025-01-01). Rates at or above it are refused here as a guard rail.
//   • Ontario consumer rules may add disclosure requirements for consumer clients.
//     Nothing here hardcodes a rate; Jay sets each contract's rate deliberately.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type LateFeeMode = "none" | "percent_monthly" | "flat";

export interface LateFeeTerms {
  mode: LateFeeMode;
  /** percent_monthly only — e.g. 2 = 2% per month. */
  monthlyPct?: number | null;
  /** flat only — dollars, charged once per overdue invoice. */
  flatAmount?: number | null;
  /** Days after the due date before any fee applies. Default 0. */
  graceDays?: number | null;
}

/** Guard rail: the Criminal Code s.347 criminal rate (APR), effective 2025-01-01. */
export const CRIMINAL_RATE_APR_PCT = 35;

/** Days per late-fee block ("per month or part month"). */
export const LATE_FEE_BLOCK_DAYS = 30;

export const NO_LATE_FEE: LateFeeTerms = { mode: "none", monthlyPct: null, flatAmount: null, graceDays: 0 };

export function normalizeLateFeeTerms(t: LateFeeTerms | undefined | null): LateFeeTerms {
  if (!t || t.mode === "none" || !t.mode) return { ...NO_LATE_FEE };
  return {
    mode: t.mode,
    monthlyPct: t.mode === "percent_monthly" ? Number(t.monthlyPct) : null,
    flatAmount: t.mode === "flat" ? round2(Number(t.flatAmount)) : null,
    graceDays: Math.max(0, Math.trunc(Number(t.graceDays ?? 0)) || 0),
  };
}

/** Nominal annual equivalent of a monthly rate (simple interest: × 12). */
export function annualEquivalentPct(monthlyPct: number): number {
  return round2(monthlyPct * 12);
}

/** Null when valid, else a plain-language reason. */
export function validateLateFeeTerms(t: LateFeeTerms | undefined | null): string | null {
  if (!t || t.mode === "none" || !t.mode) return null;
  const grace = Number(t.graceDays ?? 0);
  if (!Number.isInteger(grace) || grace < 0) return "Late-fee grace days must be a whole number, 0 or more.";
  if (t.mode === "percent_monthly") {
    const pct = Number(t.monthlyPct);
    if (!Number.isFinite(pct) || pct <= 0) return "Enter a monthly late-fee rate above 0%.";
    if (annualEquivalentPct(pct) >= CRIMINAL_RATE_APR_PCT) {
      return `A ${pct}% monthly rate is ${annualEquivalentPct(pct)}% a year — at or above the ${CRIMINAL_RATE_APR_PCT}% criminal interest rate. Use a lower rate.`;
    }
    return null;
  }
  if (t.mode === "flat") {
    const amt = Number(t.flatAmount);
    if (!Number.isFinite(amt) || amt <= 0) return "Enter a flat late fee above $0.";
    return null;
  }
  return "Unknown late-fee type.";
}

/** The client-facing sentence for the terms (portal, PDF, contract detail). */
export function describeLateFeeTerms(t: LateFeeTerms | undefined | null): string {
  const n = normalizeLateFeeTerms(t);
  if (n.mode === "none") return "No late-payment charge.";
  const grace = n.graceDays ? ` more than ${n.graceDays} day${n.graceDays === 1 ? "" : "s"}` : "";
  if (n.mode === "flat") {
    return `A one-time late-payment charge of $${(n.flatAmount ?? 0).toFixed(2)} applies to any invoice paid${grace} after its due date.`;
  }
  const pct = n.monthlyPct ?? 0;
  return `Overdue balances${grace ? ` outstanding${grace} past the due date` : ""} are charged interest of ${pct}% per month (${annualEquivalentPct(pct)}% per year), simple interest, for each month or part month overdue.`;
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `dueDate` to `asOf` (both YYYY-MM-DD). Negative if not yet due. */
export function daysOverdue(dueDate: string, asOf: string): number {
  const a = Date.UTC(+asOf.slice(0, 4), +asOf.slice(5, 7) - 1, +asOf.slice(8, 10));
  const d = Date.UTC(+dueDate.slice(0, 4), +dueDate.slice(5, 7) - 1, +dueDate.slice(8, 10));
  return Math.round((a - d) / MS_PER_DAY);
}

/** The current late-fee block (1-based), or 0 while within the due date + grace. */
export function lateFeeBlock(daysLate: number, graceDays: number): number {
  if (daysLate <= graceDays) return 0;
  return Math.floor((daysLate - graceDays - 1) / LATE_FEE_BLOCK_DAYS) + 1;
}

/** The fee for one block on an outstanding balance. 0 when nothing is owed. */
export function lateFeeForBlock(t: LateFeeTerms, balance: number, block: number): number {
  const n = normalizeLateFeeTerms(t);
  if (n.mode === "none" || block < 1 || !(balance > 0.005)) return 0;
  if (n.mode === "flat") return block === 1 ? round2(n.flatAmount ?? 0) : 0;
  return round2((balance * (n.monthlyPct ?? 0)) / 100);
}

export interface LateFeeProposal {
  block: number;
  daysOverdue: number;
  basisBalance: number;
  amount: number;
}

/**
 * Every late-fee block that is due as of `asOf` and not yet assessed, for one
 * overdue invoice. Catch-up safe: a job that missed days proposes each missed
 * block once (the DB's UNIQUE(invoice, block) is the backstop). Flat fees only
 * ever produce block 1.
 */
export function dueLateFeeProposals(
  t: LateFeeTerms,
  inv: { dueDate: string | null; balance: number },
  asOf: string,
  alreadyAssessed: ReadonlySet<number>
): LateFeeProposal[] {
  const n = normalizeLateFeeTerms(t);
  if (n.mode === "none" || !inv.dueDate || !(inv.balance > 0.005)) return [];
  const late = daysOverdue(inv.dueDate, asOf);
  const current = lateFeeBlock(late, n.graceDays ?? 0);
  if (current < 1) return [];
  const last = n.mode === "flat" ? 1 : current;
  const out: LateFeeProposal[] = [];
  for (let b = 1; b <= last; b++) {
    if (alreadyAssessed.has(b)) continue;
    const amount = lateFeeForBlock(n, inv.balance, b);
    if (amount > 0) out.push({ block: b, daysOverdue: late, basisBalance: round2(inv.balance), amount });
  }
  return out;
}
