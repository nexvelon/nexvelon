// SUB-5 — the compliance HARD BLOCK. This is where SUB-2's REQUIRED_DOC_TYPES
// stops being a roster badge and becomes a gate: a work order cannot be ISSUED
// to a subcontractor whose required compliance (WSIB clearance, liability
// insurance) is missing or expired.
//
// Client-safe pure module (no server-only import) so the UI can disable the
// Issue button with the SAME verdict the server enforces — but the server is
// the real gate (never trust the UI). Every state decision reuses the SUB-2
// pure module (complianceState / REQUIRED_DOC_TYPES / DOC_TYPE_LABEL) — one
// source of truth, no re-derivation.
//
// Blocks (at ISSUE, not at draft):
//   • sub not active (inactive / do-not-use)
//   • a required doc type MISSING entirely
//   • a required doc type present but EXPIRED
// Does NOT block (warn only): expiring_soon; and any non-required doc, whatever
// its state.
//
// NO OVERRIDE in v1 — an admin bypass is a separate follow-up with its own
// audit trail.

import {
  complianceState,
  REQUIRED_DOC_TYPES,
  DOC_TYPE_LABEL,
} from "@/lib/subcontractors/compliance-status";
import type { DbComplianceDocType } from "@/lib/types/database";

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

/** A doc as far as eligibility cares: its type, and its expiry. */
export interface EligibilityDoc {
  doc_type: DbComplianceDocType;
  expiry_date: string | null;
}

/** A subcontractor as far as eligibility cares: its status. */
export interface EligibilitySubject {
  status: string;
}

/**
 * Can a work order be ISSUED to this subcontractor right now? Returns the
 * human-readable blocking reasons when not. `today` is passed in (business date)
 * so the verdict is deterministic and testable.
 */
export function canIssueWorkOrder(
  sub: EligibilitySubject,
  complianceDocs: EligibilityDoc[],
  today: string
): EligibilityResult {
  const reasons: string[] = [];

  if (sub.status !== "active") {
    reasons.push("Subcontractor is inactive or marked do-not-use.");
  }

  for (const type of REQUIRED_DOC_TYPES) {
    const label = DOC_TYPE_LABEL[type];
    const ofType = complianceDocs.filter((d) => d.doc_type === type);
    if (ofType.length === 0) {
      reasons.push(`Missing ${label}.`);
      continue;
    }
    // Satisfied if ANY doc of the type is currently non-expired. If every copy
    // is expired, report the most-recent expiry as the reason.
    const anyCurrent = ofType.some(
      (d) => complianceState(d, today) !== "expired"
    );
    if (!anyCurrent) {
      const latestExpiry = ofType
        .map((d) => d.expiry_date)
        .filter((e): e is string => !!e)
        .sort()
        .at(-1);
      reasons.push(
        latestExpiry
          ? `${label} expired on ${latestExpiry}.`
          : `${label} is expired.`
      );
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
