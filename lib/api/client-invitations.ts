import "server-only";

// POLISH-3 — public client-onboarding invitations (public.client_invitations,
// migration 0056). Everything here runs through the SERVICE-ROLE admin client:
// the public /invite/<token> pages are UNAUTHENTICATED, so the cookie client
// would be the anon role and couldn't insert a client/site. Security comes from
// the unguessable token (every call is scoped by `.eq("token", token)`) plus
// the submitted_at lock — never from the caller's session. Reads/writes also
// work regardless of whether migration 0056's RLS has been applied yet.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSetting,
  getTierTexts,
  getTierDiscretionDisclaimer,
  TIER_DISCLAIMER,
  DEFAULT_TERMS_KEY,
  DEFAULT_TERMS_GUARDIAN_KEY,
  type TierLevel,
} from "@/lib/api/company-settings";
import { DEFAULT_TERMS, DEFAULT_TERMS_GUARDIAN } from "@/lib/quote-helpers";
import { businessDateTime } from "@/lib/format";
import { paymentPolicyText } from "@/lib/payment-policy-text";
import {
  uploadSignaturePng,
  uploadSignedPdf,
  signatureDataUrl,
} from "@/lib/api/invitation-storage";
import { renderSignedTcPdf } from "@/lib/pdf/signed-tc-pdf";
import type {
  DbClientInvitation,
  DbClientPaymentTerms,
  DbClientPaymentMethod,
  DbClientCurrency,
  DbClientTier,
} from "@/lib/types/database";

// CHANGE 2 — the invite T&C labels (single source: same docs as quote PDFs).
export const TC1_LABEL = "Nexvelon Integrated Solutions Inc. — Default Terms and Conditions";
export const TC2_LABEL = "Nexvelon Guardian Inc. — Default Terms and Conditions";

const VALID_TIERS: DbClientTier[] = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];

// The form autosave stores booleans as strings; treat "true"/true as acknowledged.
function isAck(v: unknown): boolean {
  return v === true || v === "true";
}

function admin() {
  return createAdminClient();
}

/** Generate an unguessable token (UUID v4). */
function newToken(): string {
  return globalThis.crypto.randomUUID();
}

export async function createInvitation(input: {
  email: string;
  createdBy?: string | null;
  inviteType?: "full" | "site_only";
  clientId?: string | null;
}): Promise<DbClientInvitation> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("client_invitations")
    .insert({
      token: newToken(),
      email: input.email.trim(),
      created_by: input.createdBy ?? null,
      invite_type: input.inviteType ?? "full",
      // A site-only invite carries the existing client up-front; on submit a new
      // site is attached to it (the client_form steps are skipped).
      client_id: input.clientId ?? null,
      // Site-only invites have no client form, so mark it pre-completed.
      client_form_completed: (input.inviteType ?? "full") === "site_only",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createInvitation: ${error.message}`);
  return data as DbClientInvitation;
}

/** The most recent invitation that produced a given client (for admin review). */
export async function getInvitationByClientId(
  clientId: string
): Promise<DbClientInvitation | null> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("client_invitations")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getInvitationByClientId: ${error.message}`);
  return (data as DbClientInvitation | null) ?? null;
}

/**
 * Record the admin's review decision on the invitation(s) for a client. Kept on
 * the invitation so it survives a hard-delete of a declined pending client.
 */
export async function recordInvitationDecision(input: {
  clientId: string;
  decision: "approved" | "declined";
  decidedBy?: string | null;
  declineReason?: string | null;
}): Promise<void> {
  const supabase = admin();
  const { error } = await supabase
    .from("client_invitations")
    .update({
      decision: input.decision,
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy ?? null,
      decline_reason: input.declineReason ?? null,
    })
    .eq("client_id", input.clientId);
  if (error) throw new Error(`recordInvitationDecision: ${error.message}`);
}

export async function getInvitationByToken(
  token: string
): Promise<DbClientInvitation | null> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("client_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`getInvitationByToken: ${error.message}`);
  return (data as DbClientInvitation | null) ?? null;
}

/** Guard: a submitted invitation is locked (no further edits). */
async function requireOpen(token: string): Promise<DbClientInvitation> {
  const inv = await getInvitationByToken(token);
  if (!inv) throw new Error("This invitation link is invalid.");
  if (inv.submitted_at) throw new Error("This invitation has already been submitted.");
  return inv;
}

/** Save the client info form. `completed` is derived from a filled company name. */
export async function saveClientForm(
  token: string,
  data: Record<string, unknown>
): Promise<DbClientInvitation> {
  const inv = await requireOpen(token);
  // POLISH-9 — the Payment Policies acknowledgment is now part of the gate.
  const ack = isAck(data.payment_policies_acknowledged);
  const completed = !!String(data.legalName ?? "").trim() && ack;
  // CHANGE 6 — the optional Prestige Tier opt-in is its own column.
  const reqRaw = String(data.tierRequested ?? "").trim();
  const tier_requested = (VALID_TIERS as string[]).includes(reqRaw) ? reqRaw : null;
  const patch: Record<string, unknown> = {
    client_form_data: data,
    client_form_completed: completed,
    tier_requested,
  };
  // Stamp the first-acknowledged time (preserve it once set).
  if (ack && !inv.client_form_payment_policies_acknowledged_at) {
    patch.client_form_payment_policies_acknowledged_at = new Date().toISOString();
  }
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update(patch)
    .eq("token", token)
    .select("*")
    .single();
  if (error) throw new Error(`saveClientForm: ${error.message}`);
  return row as DbClientInvitation;
}

/** Save the site info form. `completed` is derived from a filled site name/address. */
export async function saveSiteForm(
  token: string,
  data: Record<string, unknown>
): Promise<DbClientInvitation> {
  const inv = await requireOpen(token);
  const ack = isAck(data.payment_policies_acknowledged);
  const completed =
    !!String(data.siteName ?? data.siteStreet ?? "").trim() && ack;
  const patch: Record<string, unknown> = {
    site_form_data: data,
    site_form_completed: completed,
  };
  if (ack && !inv.site_form_payment_policies_acknowledged_at) {
    patch.site_form_payment_policies_acknowledged_at = new Date().toISOString();
  }
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update(patch)
    .eq("token", token)
    .select("*")
    .single();
  if (error) throw new Error(`saveSiteForm: ${error.message}`);
  return row as DbClientInvitation;
}

/**
 * Record a T&C signature: typed name + drawn-signature PNG are BOTH required
 * (CHANGE 3). The drawn signature (a data URL) is uploaded to the private
 * invitation-signatures bucket; its path + the typed name + an auto timestamp
 * are stored on the invitation.
 */
export async function signTc(
  token: string,
  which: "tc1" | "tc2",
  name: string,
  signatureDataUrlIn: string
): Promise<DbClientInvitation> {
  await requireOpen(token);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Type your full name to sign.");
  if (!signatureDataUrlIn || !signatureDataUrlIn.startsWith("data:image")) {
    throw new Error("Draw your signature before signing.");
  }
  const imagePath = await uploadSignaturePng(token, which, signatureDataUrlIn);
  const now = new Date().toISOString();
  const patch =
    which === "tc1"
      ? { tc1_signed_at: now, tc1_signed_name: trimmed, tc1_signature_image_path: imagePath }
      : { tc2_signed_at: now, tc2_signed_name: trimmed, tc2_signature_image_path: imagePath };
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update(patch)
    .eq("token", token)
    .select("*")
    .single();
  if (error) throw new Error(`signTc: ${error.message}`);
  return row as DbClientInvitation;
}

/**
 * Ready to submit? client_form_completed is pre-set true for site-only invites,
 * so this is uniform across types: client (or n/a) + site + both signatures +
 * the Guardian onboarding T&C must be published (so tc2 was signable).
 */
export function isReadyToSubmit(
  inv: DbClientInvitation,
  guardianPublished: boolean
): boolean {
  return (
    inv.client_form_completed &&
    inv.site_form_completed &&
    !!inv.tc1_signed_at &&
    !!inv.tc2_signed_at &&
    guardianPublished
  );
}

/**
 * POLISH-6 — tc2 now reads the real "Guardian — Default Terms" block (with an
 * in-code fallback), so it always has content; the old "not yet published" gate
 * is retired. Kept (returning true) for InvitationView.guardian_published compat.
 */
export async function guardianTermsPublished(): Promise<boolean> {
  return true;
}

function s(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

// Coerce a saved string into an enum value, or null when blank/invalid. The
// invite Selects only ever store valid values, so this is a safety net.
function e<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const t = String(v ?? "").trim();
  return (allowed as readonly string[]).includes(t) ? (t as T) : null;
}
const PAYMENT_TERMS_VALUES: readonly DbClientPaymentTerms[] = [
  "due_on_receipt",
  "net_7",
  "net_15",
  "net_30",
];
const PAYMENT_METHOD_VALUES: readonly DbClientPaymentMethod[] = [
  "eft",
  "e_transfer",
  "wire",
  "credit_card",
  "cash",
];
const CURRENCY_VALUES: readonly DbClientCurrency[] = [
  "CAD",
  "USD",
  "AED",
  "INR",
  "EUR",
];

// Readable contacts summary for the client/site `notes` field (the full data is
// preserved in the jsonb for admin review). Reads the 4 fixed-row keys c0..c3.
function contactsNotes(d: Record<string, unknown>): string {
  const labels = [
    "Primary (work)",
    "Primary (personal)",
    "AP (work/ext)",
    "AP (direct)",
  ];
  const lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const name = [s(d[`c${i}First`]), s(d[`c${i}Last`])].filter(Boolean).join(" ");
    const parts = [
      name,
      s(d[`c${i}Role`]),
      s(d[`c${i}Email`]),
      s(d[`c${i}Phone`]),
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`${labels[i]}: ${parts.join(" · ")}`);
  }
  return lines.join("\n");
}

// Map the saved client jsonb to a DbClient insert payload (pending review).
function clientInsertFrom(
  cf: Record<string, unknown>,
  email: string,
  now: string
) {
  const notes = contactsNotes(cf);
  return {
    name: s(cf.legalName) ?? s(cf.tradeName) ?? email,
    legal_name: s(cf.legalName),
    billing_street: s(cf.billingStreet),
    billing_unit: s(cf.billingUnit),
    billing_city: s(cf.billingCity),
    billing_province: s(cf.billingProvince),
    billing_postal: s(cf.billingPostal),
    billing_country: s(cf.billingCountry),
    mailing_street: s(cf.mailingStreet),
    mailing_unit: s(cf.mailingUnit),
    mailing_city: s(cf.mailingCity),
    mailing_province: s(cf.mailingProvince),
    mailing_postal: s(cf.mailingPostal),
    mailing_country: s(cf.mailingCountry),
    client_hst_gst_number: s(cf.hstNumber),
    tax_exempt: s(cf.taxExempt) === "Yes",
    tax_exempt_certificate_number: s(cf.taxExemptCert),
    payment_terms: e(cf.paymentTerms, PAYMENT_TERMS_VALUES),
    preferred_payment_method: e(cf.paymentMethod, PAYMENT_METHOD_VALUES),
    preferred_currency: e(cf.currency, CURRENCY_VALUES),
    portal_contact_email: s(cf.c0Email) ?? email,
    notes: notes || null,
    default_opco: "integrated_solutions" as const,
    pending_review: true,
    invited_at: now,
  };
}

// Map the saved site jsonb to a DbSite insert payload under a client.
function siteInsertFrom(sf: Record<string, unknown>, clientId: string) {
  const notes = contactsNotes(sf);
  return {
    client_id: clientId,
    name: s(sf.siteName) ?? "Primary site",
    address_line1: s(sf.siteStreet),
    address_line2: s(sf.siteUnit),
    city: s(sf.siteCity),
    province: s(sf.siteProvince),
    postal_code: s(sf.sitePostal),
    country: s(sf.siteCountry) ?? "Canada",
    billing_street: s(sf.billingStreet),
    billing_unit: s(sf.billingUnit),
    billing_city: s(sf.billingCity),
    billing_province: s(sf.billingProvince),
    billing_postal: s(sf.billingPostal),
    billing_country: s(sf.billingCountry),
    mailing_street: s(sf.mailingStreet),
    mailing_unit: s(sf.mailingUnit),
    mailing_city: s(sf.mailingCity),
    mailing_province: s(sf.mailingProvince),
    mailing_postal: s(sf.mailingPostal),
    mailing_country: s(sf.mailingCountry),
    site_hst_gst_number: s(sf.hstNumber),
    tax_exempt: s(sf.taxExempt) === "Yes",
    tax_exempt_certificate_number: s(sf.taxExemptCert),
    payment_terms: e(sf.paymentTerms, PAYMENT_TERMS_VALUES) ?? undefined,
    preferred_payment_method:
      e(sf.paymentMethod, PAYMENT_METHOD_VALUES) ?? undefined,
    preferred_currency: e(sf.currency, CURRENCY_VALUES) ?? undefined,
    // CHANGE 7 — GC / Site Supervisor.
    gc_name: s(sf.gcName),
    gc_phone: s(sf.gcPhone),
    gc_email: s(sf.gcEmail),
    notes: notes || null,
  };
}

// CHANGE 5 — the exact text/tiers/disclaimer the client saw, captured at submit
// for legal defensibility. Read by the Submission Detail page + signed PDFs.
export interface SubmissionSnapshot {
  tc1_text: string;
  tc2_text: string;
  tier_descriptions: Record<TierLevel, string>;
  disclaimer_note: string;
  // POLISH-7 — the Nexvelon-discretion disclaimer shown alongside disclaimer_note.
  discretion_disclaimer: string;
  tier_requested: string | null;
  // POLISH-9 — the exact Payment Policies text the client saw + acknowledged on
  // each form (rates depend on the form's billing country at submit time).
  client_form_payment_policies_text: string;
  site_form_payment_policies_text: string;
  submitted_at: string;
}

async function buildSnapshot(
  inv: DbClientInvitation,
  submittedAt: string
): Promise<SubmissionSnapshot> {
  const [tc1_text, tc2_text, tier_descriptions, discretion_disclaimer] =
    await Promise.all([
      getInviteTermsText("tc1"),
      getInviteTermsText("tc2"),
      getTierTexts(),
      getTierDiscretionDisclaimer(),
    ]);
  const cf = (inv.client_form_data ?? {}) as Record<string, unknown>;
  const sf = (inv.site_form_data ?? {}) as Record<string, unknown>;
  return {
    tc1_text,
    tc2_text,
    tier_descriptions,
    disclaimer_note: TIER_DISCLAIMER,
    discretion_disclaimer,
    tier_requested: inv.tier_requested ?? null,
    client_form_payment_policies_text: paymentPolicyText(
      typeof cf.billingCountry === "string" ? cf.billingCountry : null
    ),
    site_form_payment_policies_text: paymentPolicyText(
      typeof sf.billingCountry === "string" ? sf.billingCountry : null
    ),
    submitted_at: submittedAt,
  };
}

/**
 * Submit: create a pending-review client + its site from the captured form
 * data, lock the invitation, and return the new client/site ids and the
 * invitation (for the bundled notification email). Inserts go through the
 * service-role client (the submitter is unauthenticated).
 */
export async function submitInvitation(token: string): Promise<{
  invitation: DbClientInvitation;
  clientId: string;
  siteId: string;
  pdfs: { tc1: Buffer; tc2: Buffer };
}> {
  const inv = await requireOpen(token);
  if (!isReadyToSubmit(inv, await guardianTermsPublished())) {
    throw new Error("Complete all steps before submitting.");
  }
  const supabase = admin();
  const cf = (inv.client_form_data ?? {}) as Record<string, unknown>;
  const sf = (inv.site_form_data ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  // Type B (site-only): no new client — attach a site to the existing one.
  let clientId: string;
  if (inv.invite_type === "site_only") {
    if (!inv.client_id) throw new Error("Site invite has no client attached.");
    clientId = inv.client_id;
  } else {
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .insert(clientInsertFrom(cf, inv.email, now))
      .select("id")
      .single();
    if (cErr) throw new Error(`submitInvitation/client: ${cErr.message}`);
    clientId = (client as { id: string }).id;
  }

  const { data: site, error: siErr } = await supabase
    .from("sites")
    .insert(siteInsertFrom(sf, clientId))
    .select("id")
    .single();
  if (siErr) throw new Error(`submitInvitation/site: ${siErr.message}`);
  const siteId = (site as { id: string }).id;

  // CHANGE 5 — snapshot the exact text/tiers/disclaimer shown.
  const snapshot = await buildSnapshot(inv, now);

  // CHANGE 4 — generate the two signed-T&C PDFs from the SNAPSHOT text + the
  // drawn signatures, upload them privately, and record their paths.
  const [sig1, sig2] = await Promise.all([
    inv.tc1_signature_image_path ? signatureDataUrl(inv.tc1_signature_image_path) : null,
    inv.tc2_signature_image_path ? signatureDataUrl(inv.tc2_signature_image_path) : null,
  ]);
  const [pdf1, pdf2] = await Promise.all([
    renderSignedTcPdf({
      title: TC1_LABEL,
      termsText: snapshot.tc1_text,
      signerName: inv.tc1_signed_name ?? "—",
      signatureDataUrl: sig1,
      signedAt: inv.tc1_signed_at ? businessDateTime(inv.tc1_signed_at) : "—",
      token,
    }),
    renderSignedTcPdf({
      title: TC2_LABEL,
      termsText: snapshot.tc2_text,
      signerName: inv.tc2_signed_name ?? "—",
      signatureDataUrl: sig2,
      signedAt: inv.tc2_signed_at ? businessDateTime(inv.tc2_signed_at) : "—",
      token,
    }),
  ]);
  const [pdf1Path, pdf2Path] = await Promise.all([
    uploadSignedPdf(token, "tc1", pdf1),
    uploadSignedPdf(token, "tc2", pdf2),
  ]);

  const { data: updated, error: uErr } = await supabase
    .from("client_invitations")
    .update({
      submitted_at: now,
      client_id: clientId,
      submission_snapshot: snapshot,
      tc1_signed_pdf_path: pdf1Path,
      tc2_signed_pdf_path: pdf2Path,
    })
    .eq("token", token)
    .select("*")
    .single();
  if (uErr) throw new Error(`submitInvitation/lock: ${uErr.message}`);

  return {
    invitation: updated as DbClientInvitation,
    clientId,
    siteId,
    pdfs: { tc1: pdf1, tc2: pdf2 },
  };
}

/**
 * The two T&C texts the invite pages render, from the SINGLE existing source —
 * the same blocks the quote PDFs use:
 *   tc1 = Integrated Solutions terms (default_quote_terms, fallback DEFAULT_TERMS).
 *   tc2 = Guardian terms (default_quote_terms_guardian, fallback DEFAULT_TERMS_GUARDIAN).
 */
export async function getInviteTermsText(which: "tc1" | "tc2"): Promise<string> {
  try {
    if (which === "tc1") {
      return (await getSetting(DEFAULT_TERMS_KEY)) ?? DEFAULT_TERMS;
    }
    return (await getSetting(DEFAULT_TERMS_GUARDIAN_KEY)) ?? DEFAULT_TERMS_GUARDIAN;
  } catch {
    return which === "tc1" ? DEFAULT_TERMS : DEFAULT_TERMS_GUARDIAN;
  }
}
