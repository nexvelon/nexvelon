// SUB-2 — compliance validity, DERIVED not stored. One client-safe module (no
// server-only import) so the UI, the API summary, and SUB-5/SUB-6's future
// hard-blocks all agree on what "expired" means — the same extract-a-pure-module
// move as lib/invoice-status.ts (FIN-2) and lib/aging-buckets.ts (FIN-6).
//
// A stored status would go stale silently the day a certificate lapses; for
// compliance that's the one failure you can't accept. So validity is always a
// function of (expiry_date, today).

import { daysBetween } from "@/lib/aging-buckets";
import type { DbComplianceDocType } from "@/lib/types/database";

/** A doc within this many days of expiring is flagged "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

/**
 * Doc types a currently-active subcontractor MUST hold a non-expired copy of.
 * This is the constant SUB-5 (agreements) and SUB-6 (assignments) will
 * hard-block against. Hard-coded in v1 — operator-editable lookup tables are a
 * later §7 concern.
 */
export const REQUIRED_DOC_TYPES: DbComplianceDocType[] = [
  "wsib_clearance",
  "liability_insurance",
];

export type ComplianceState =
  | "no_expiry" // permanent doc (expiry_date null)
  | "valid" // expires more than EXPIRING_SOON_DAYS out
  | "expiring_soon" // expires within the next EXPIRING_SOON_DAYS (inclusive)
  | "expired"; // expiry is in the past

/** Days until a doc expires; negative once past. null when it never expires. */
export function daysUntilExpiry(
  doc: { expiry_date: string | null },
  today: string
): number | null {
  if (!doc.expiry_date) return null;
  return daysBetween(today, doc.expiry_date);
}

export function complianceState(
  doc: { expiry_date: string | null },
  today: string
): ComplianceState {
  const days = daysUntilExpiry(doc, today);
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "valid";
}

/** A doc counts as "current" (satisfies a requirement) unless it's expired. */
export function isCurrent(
  doc: { expiry_date: string | null },
  today: string
): boolean {
  return complianceState(doc, today) !== "expired";
}

/** The overall risk level for a subcontractor's badge. */
export type WorstState = "expired" | "expiring_soon" | "ok";

export interface ComplianceSummary {
  expired: number;
  expiring_soon: number;
  valid: number; // valid + no_expiry (i.e. everything not expired/expiring)
  worst: WorstState;
  /** Required types with no current (non-expired) doc present. */
  missing_required: DbComplianceDocType[];
}

export function subcontractorComplianceSummary(
  docs: { doc_type: DbComplianceDocType; expiry_date: string | null }[],
  today: string
): ComplianceSummary {
  let expired = 0;
  let expiring = 0;
  let valid = 0;
  for (const d of docs) {
    const st = complianceState(d, today);
    if (st === "expired") expired += 1;
    else if (st === "expiring_soon") expiring += 1;
    else valid += 1; // valid or no_expiry
  }

  // A required type is satisfied only by a CURRENT (non-expired) doc of that
  // type — a required doc that has lapsed is treated as missing.
  const currentTypes = new Set(
    docs.filter((d) => isCurrent(d, today)).map((d) => d.doc_type)
  );
  const missing_required = REQUIRED_DOC_TYPES.filter(
    (t) => !currentTypes.has(t)
  );

  // Missing a required doc is a hard risk — surface it as "expired"-level so
  // the roster badge is red, not merely amber.
  const worst: WorstState =
    expired > 0 || missing_required.length > 0
      ? "expired"
      : expiring > 0
        ? "expiring_soon"
        : "ok";

  return { expired, expiring_soon: expiring, valid, worst, missing_required };
}

// ─── Presentation helpers (labels shared by UI surfaces) ─────────────────────

export const DOC_TYPE_LABEL: Record<DbComplianceDocType, string> = {
  wsib_clearance: "WSIB clearance",
  liability_insurance: "Liability insurance",
  auto_insurance: "Auto insurance",
  license: "Licence",
  qualification: "Qualification",
  agreement: "Agreement",
  other: "Other",
};

/** Doc types whose coverage_amount field is meaningful (insurance). */
export const COVERAGE_DOC_TYPES: DbComplianceDocType[] = [
  "liability_insurance",
  "auto_insurance",
];
