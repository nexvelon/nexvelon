// SCHED-1 — the tech certification HARD BLOCK, the dispatch parallel to SUB-5/6's
// subcontractor compliance block (lib/subcontractors/eligibility.ts). A technician
// cannot be BOOKED to a schedule_job whose required panel certifications the tech
// doesn't currently hold as valid (non-expired).
//
// Client-safe pure module (no server-only import) so the UI can disable/explain
// with the SAME verdict the server enforces — but the server is the real gate.
// Cert validity derives from the shared lib/expiry-state vocabulary — one source
// of truth, never a stored flag.
//
// Blocks (at BOOKING):
//   • tech not active
//   • a required cert_type MISSING entirely
//   • a required cert_type held but every copy EXPIRED
// Does NOT block (warn only): a held cert EXPIRING soon; any non-required cert,
// whatever its state.
//
// NO OVERRIDE in v1 (mirrors SUB-5) — an admin bypass is a separate follow-up
// with its own audit trail.

import { expiryState } from "@/lib/expiry-state";

/** Certs warn 30 days out — matches the SUB-2 / bonds compliance window. */
export const CERT_WARN_DAYS = 30;

// Known panel/site cert types (v1 is free-ish text; these drive the picker +
// friendly labels). Kantech / Genetec / C-CURE are the §3 differentiators.
export const KNOWN_CERT_TYPES = [
  "kantech",
  "genetec",
  "c_cure",
  "avigilon",
  "esa",
  "working_at_heights",
  "cfaa",
  "ulc",
] as const;

const CERT_TYPE_LABEL: Record<string, string> = {
  kantech: "Kantech",
  genetec: "Genetec",
  c_cure: "C-CURE 9000",
  avigilon: "Avigilon ACC",
  esa: "ESA licence",
  working_at_heights: "Working at Heights",
  cfaa: "CFAA Fire Alarm",
  ulc: "ULC",
};

/** Human label for a cert_type: known map, else the raw type title-cased. */
export function certTypeLabel(certType: string): string {
  if (CERT_TYPE_LABEL[certType]) return CERT_TYPE_LABEL[certType];
  return certType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type TechEligibilityResult = { ok: true } | { ok: false; reasons: string[] };

/** A cert as far as eligibility cares: its type and expiry. */
export interface EligibilityCert {
  cert_type: string;
  expiry_date: string | null;
}

/** A tech as far as eligibility cares: whether it's active. */
export interface EligibilityTech {
  is_active: boolean;
}

/** A schedule_job as far as eligibility cares: the certs it requires. */
export interface EligibilityJob {
  required_certs: string[];
}

/**
 * Can this technician be BOOKED to this schedule_job right now? Returns the
 * human-readable blocking reasons when not. `today` (business date) is passed in
 * so the verdict is deterministic and testable. A required cert_type is
 * satisfied when the tech holds AT LEAST ONE cert of that type that is not
 * expired (expiring_soon still counts as valid — you still hold it today).
 */
export function isTechEligibleForJob(
  tech: EligibilityTech,
  techCerts: EligibilityCert[],
  job: EligibilityJob,
  today: string
): TechEligibilityResult {
  const reasons: string[] = [];

  if (!tech.is_active) {
    reasons.push("Technician is inactive.");
  }

  for (const req of job.required_certs) {
    const label = certTypeLabel(req);
    const held = techCerts.filter((c) => c.cert_type === req);
    if (held.length === 0) {
      reasons.push(`Missing ${label} certification.`);
      continue;
    }
    const anyValid = held.some(
      (c) => expiryState(c.expiry_date, today, CERT_WARN_DAYS) !== "expired"
    );
    if (!anyValid) {
      const latestExpiry = held
        .map((c) => c.expiry_date)
        .filter((e): e is string => !!e)
        .sort()
        .at(-1);
      reasons.push(
        latestExpiry
          ? `${label} certification expired on ${latestExpiry}.`
          : `${label} certification is expired.`
      );
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
