// MAIL-2 — client-safe email-address config: keys, defaults, labels, the pure
// per-opco resolver and the pure validators. NO "server-only", NO DB import, so
// this can be imported by the client Settings pane. The server-only resolver
// that reads company_settings lives in ./addresses (which re-exports this).

import type { DbClientOpco } from "@/lib/types/database";

// company_settings keys.
export const EMAIL_ADDRESS_KEYS = {
  clientFrom: "email_client_from",
  clientBcc: "email_client_bcc",
  internalFrom: "email_internal_from",
  inquiries: "email_inquiries",
  clientsSitesInfo: "email_clients_sites_info",
  ordersIntegratedSolutions: "email_orders_integrated_solutions",
  ordersGuardian: "email_orders_guardian",
} as const;

export type EmailAddressField = keyof typeof EMAIL_ADDRESS_KEYS;

// Safe defaults (2d). clientFrom/clientBcc/inquiries/clientsSitesInfo preserve
// the MAIL-1 behavior; the two order addresses are the per-opco values Jay chose.
export const EMAIL_ADDRESS_DEFAULTS: Record<EmailAddressField, string> = {
  clientFrom: "quotes@nexvelonglobal.com",
  clientBcc: "quotes@nexvelonglobal.com",
  internalFrom: "Nexvelon <noreply@nexvelonglobal.com>",
  inquiries: "inquiries@nexvelonglobal.com",
  clientsSitesInfo: "ClientsAndSitesInfo@nexvelonglobal.com",
  ordersIntegratedSolutions: "NISorders@nexvelonglobal.com",
  ordersGuardian: "NGorders@nexvelonglobal.com",
};

export type ResolvedEmailAddresses = Record<EmailAddressField, string>;

/** Human-readable label for each field — used by the Settings pane and the
 *  audit trail so a change reads plainly ("Client quotes are sent from"). */
export const EMAIL_ADDRESS_LABELS: Record<EmailAddressField, string> = {
  clientFrom: "Client quotes & documents are sent from this address",
  clientBcc: "A copy of every client email goes here",
  internalFrom: "System emails (sign-in codes, password resets, internal alerts) come from",
  inquiries: "Client onboarding & general inquiries address",
  clientsSitesInfo: "Second recipient of onboarding submissions",
  ordersIntegratedSolutions: "Purchase orders for Integrated Solutions come from this address",
  ordersGuardian: "Purchase orders for Guardian come from this address",
};

/** The per-opco purchase-order address (§2.6). A PO's opco is resolved from its
 *  project; a standalone PO with no project has no opco signal and defaults to
 *  Integrated Solutions (the primary company + the pre-MAIL-2 behavior) — a
 *  deliberate, documented default, never a silent guess between the two. */
export function orderAddressForOpco(
  addrs: ResolvedEmailAddresses,
  opco: DbClientOpco
): string {
  return opco === "guardian" ? addrs.ordersGuardian : addrs.ordersIntegratedSolutions;
}

// ── Validation (shared by the Settings action + pane) ────────────────────────

/** Extract the bare email from a value that may be "Name <email>" or "email". */
export function extractEmail(value: string): string | null {
  const m = value.match(/<([^>]+)>/);
  const email = (m ? m[1] : value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function isValidEmailSetting(value: string): boolean {
  return extractEmail(value) !== null;
}

/** True when the address is on nexvelonglobal.com — anything else will fail at
 *  Resend (unverified domain), so the UI warns (does not block). */
export function isOnSendingDomain(value: string): boolean {
  const email = extractEmail(value);
  return !!email && email.toLowerCase().endsWith("@nexvelonglobal.com");
}
