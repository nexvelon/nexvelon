// REP-5 — the scheduled-report permission model (2e). Pure, so every rule is
// unit-tested. The server resolves each person into a Principal (their profile
// status + role + EFFECTIVE permission set, i.e. role default + per-user overrides,
// the same merge the server gates enforce) and hands it here.
//
// THE MODEL
//   1. No unattended identity of its own. A scheduled run has no logged-in user,
//      so it never runs "as the system". It is generated on behalf of TWO people
//      at once: the OWNER (the person who scheduled it) and EACH RECIPIENT.
//   2. Both must be able to run the report themselves, AT RUN TIME. "Can run" =
//      Active account AND reports:view AND the report's own gate (e.g.
//      financials:edit for WIP). Checked against BOTH the role matrix and the
//      effective set, so neither a stale role nor a stale override can widen it —
//      a deny override removes access; a grant can't exceed what the role
//      matrix + override set jointly allow.
//   3. Field-level redaction (SEC-1) uses the INTERSECTION of the owner's and the
//      recipient's field gates. A recipient never receives a field they couldn't
//      see themselves, and an owner can never broadcast a field they can't see.
//   4. Sending to OTHER people is a distribution act: the owner must hold
//      reports:create (Admin by default; grantable per user). Anyone with
//      reports:view may schedule a report to themselves.
//   5. Recipients are Nexvelon USERS only — never free-typed addresses. A raw
//      email has no permission identity, so it is exactly the leak this model
//      exists to prevent.
//   6. Re-evaluated on EVERY run. If the owner later loses access or is
//      deactivated, the run is NOT generated — the schedule pauses itself and the
//      failure is recorded and shown. If a recipient loses access, that recipient
//      is skipped (recorded with the reason) and the others still receive it.

import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { REPORT_CATALOG, type SavedReportKey } from "@/lib/reports/catalog";

export interface Principal {
  id: string;
  name: string;
  email: string | null;
  /** profiles.status — only "Active" may receive or own a running schedule. */
  status: string;
  /** App role (already adapted from the DB role). */
  role: Role;
  /** Effective "resource:action" keys (role default + grants − denies). */
  effective: ReadonlySet<string>;
}

/** The SEC-1 field gates, resolved for a principal (fail-closed). */
export interface ReportFieldGates {
  inventoryCost: boolean;
  quoteMargin: boolean;
  quoteInternal: boolean;
}

export const NO_FIELD_GATES: ReportFieldGates = { inventoryCost: false, quoteMargin: false, quoteInternal: false };

export function holds(p: Principal, resource: Resource, action: Action): boolean {
  return (
    p.status === "Active" &&
    hasPermission(p.role, resource, action) &&
    p.effective.has(`${resource}:${action}`)
  );
}

export function canRunReport(p: Principal, key: SavedReportKey): boolean {
  const g = REPORT_CATALOG[key].gate;
  return holds(p, "reports", "view") && holds(p, g.resource, g.action);
}

export function canDistribute(p: Principal): boolean {
  return holds(p, "reports", "create");
}

export function fieldGatesFor(p: Principal): ReportFieldGates {
  return {
    inventoryCost: holds(p, "inventory", "viewCost"),
    quoteMargin: holds(p, "quotes", "viewMargin"),
    quoteInternal: holds(p, "quotes", "viewInternal"),
  };
}

export function intersectGates(a: ReportFieldGates, b: ReportFieldGates): ReportFieldGates {
  return {
    inventoryCost: a.inventoryCost && b.inventoryCost,
    quoteMargin: a.quoteMargin && b.quoteMargin,
    quoteInternal: a.quoteInternal && b.quoteInternal,
  };
}

/** A stable key so recipients with identical gates share one generated dataset. */
export function gatesSignature(g: ReportFieldGates): string {
  return `${+g.inventoryCost}${+g.quoteMargin}${+g.quoteInternal}`;
}

export type SkipReason = "inactive" | "no_permission" | "no_email" | "owner_cannot_distribute";

export const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  inactive: "Account isn't active.",
  no_permission: "Doesn't have permission to run this report.",
  no_email: "No email address on their account.",
  owner_cannot_distribute: "The owner isn't allowed to send reports to other people (reports:create).",
};

export interface RecipientDecision {
  principal: Principal;
  allowed: boolean;
  reason?: SkipReason;
  /** Owner ∩ recipient field gates — what this recipient's copy is generated with. */
  gates: ReportFieldGates;
}

export interface DeliveryPlan {
  ownerOk: boolean;
  ownerReason?: string;
  recipients: RecipientDecision[];
}

export function planDelivery(input: {
  owner: Principal | null;
  recipients: Principal[];
  reportKey: SavedReportKey;
}): DeliveryPlan {
  const { owner, recipients, reportKey } = input;
  if (!owner) {
    return { ownerOk: false, ownerReason: "The person who scheduled this report no longer exists.", recipients: [] };
  }
  if (owner.status !== "Active") {
    return {
      ownerOk: false,
      ownerReason: `${owner.name}'s account isn't active, so their scheduled reports are paused.`,
      recipients: [],
    };
  }
  if (!canRunReport(owner, reportKey)) {
    return {
      ownerOk: false,
      ownerReason: `${owner.name} no longer has permission to run ${REPORT_CATALOG[reportKey].title}, so the schedule is paused.`,
      recipients: [],
    };
  }
  const ownerGates = fieldGatesFor(owner);
  const distribute = canDistribute(owner);
  const decisions = recipients.map((r): RecipientDecision => {
    const gates = intersectGates(ownerGates, fieldGatesFor(r));
    if (r.status !== "Active") return { principal: r, allowed: false, reason: "inactive", gates };
    if (!r.email) return { principal: r, allowed: false, reason: "no_email", gates };
    if (r.id !== owner.id && !distribute) {
      return { principal: r, allowed: false, reason: "owner_cannot_distribute", gates };
    }
    if (!canRunReport(r, reportKey)) return { principal: r, allowed: false, reason: "no_permission", gates };
    return { principal: r, allowed: true, gates };
  });
  return { ownerOk: true, recipients: decisions };
}
