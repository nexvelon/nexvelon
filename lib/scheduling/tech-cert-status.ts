// DES-2 — derived certification status for the management panel + cross-tech
// surfacing. Pure + client-safe: reuses the shared lib/expiry-state vocabulary
// (never a stored flag), the same one the SCHED-1 dispatch block, SUB-2
// compliance and warranties/bonds all speak.
//
// The hard-block (lib/scheduling/tech-eligibility.ts) is EXPIRED-only: an
// expired required cert blocks dispatch; expiring_soon still counts as held.
// This module's warn window (60d) is only for the informational panel/surfacing
// — a renewal call at 30 days is already tight for a licence, so warn at 60.

import { expiryState, type ExpiryState } from "@/lib/expiry-state";

/** Panel/surfacing renewal-lead window. The block itself is expired-only. */
export const TECH_CERT_WARN_DAYS = 60;

export interface CertLike {
  cert_type: string;
  expiry_date: string | null;
}

/** The derived state of one cert (valid = active / expiring_soon / expired / no_expiry). */
export function techCertState(
  cert: CertLike,
  today: string,
  warnDays: number = TECH_CERT_WARN_DAYS
): ExpiryState {
  return expiryState(cert.expiry_date, today, warnDays);
}

export interface CertStatusCounts {
  valid: number; // "active" — comfortably in date
  expiring_soon: number; // within warnDays
  expired: number;
  no_expiry: number;
  /** expired + expiring_soon — the count worth surfacing. */
  at_risk: number;
}

/** Roll a set of certs up into counts by derived state. */
export function certStatusCounts(
  certs: CertLike[],
  today: string,
  warnDays: number = TECH_CERT_WARN_DAYS
): CertStatusCounts {
  const counts: CertStatusCounts = { valid: 0, expiring_soon: 0, expired: 0, no_expiry: 0, at_risk: 0 };
  for (const c of certs) {
    const state = techCertState(c, today, warnDays);
    if (state === "active") counts.valid += 1;
    else if (state === "expiring_soon") counts.expiring_soon += 1;
    else if (state === "expired") counts.expired += 1;
    else counts.no_expiry += 1;
  }
  counts.at_risk = counts.expired + counts.expiring_soon;
  return counts;
}
