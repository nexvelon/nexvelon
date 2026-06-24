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
  clientFormMissing,
  siteFormMissing,
} from "@/lib/invite-form-validation";
import {
  uploadSignaturePng,
  uploadSignedPdf,
  uploadFormPdf,
  signatureDataUrl,
  deleteInvitationStorage,
} from "@/lib/api/invitation-storage";
import { renderSignedTcPdf } from "@/lib/pdf/signed-tc-pdf";
import { renderClientFormPdf } from "@/lib/pdf/client-form-pdf";
import { renderSiteFormPdf } from "@/lib/pdf/site-form-pdf";
import type {
  DbClientInvitation,
  DbClientPaymentTerms,
  DbClientPaymentMethod,
  DbClientCurrency,
  DbClientTier,
  DbContactInsert,
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

/**
 * POLISH-38 — hard-delete a pending application: its storage objects (signatures,
 * signed-T&C PDFs, form PDFs), the invitation row(s), the site rows, and the
 * pending client row. Admin-gated at the action layer. Service-role throughout.
 */
export async function deletePendingApplication(clientId: string): Promise<void> {
  const supabase = admin();
  // Storage cleanup keyed by each originating invitation token.
  const { data: invRows } = await supabase
    .from("client_invitations")
    .select("token")
    .eq("client_id", clientId);
  for (const r of (invRows ?? []) as { token: string | null }[]) {
    if (r.token) await deleteInvitationStorage(r.token);
  }
  // Delete in FK-safe order: invitation → sites → client.
  const { error: invErr } = await supabase
    .from("client_invitations")
    .delete()
    .eq("client_id", clientId);
  if (invErr) throw new Error(`deletePendingApplication/invitation: ${invErr.message}`);
  const { error: siteErr } = await supabase
    .from("sites")
    .delete()
    .eq("client_id", clientId);
  if (siteErr) throw new Error(`deletePendingApplication/sites: ${siteErr.message}`);
  const { error: cErr } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId);
  if (cErr) throw new Error(`deletePendingApplication/client: ${cErr.message}`);
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

/** Save the client info form. POLISH-10 (CHANGE 8) — `completed` now requires
 *  ALL mandatory fields (shared validation, so the hub Submit gate matches the
 *  form's live missing-fields alert exactly). */
export async function saveClientForm(
  token: string,
  data: Record<string, unknown>
): Promise<DbClientInvitation> {
  const inv = await requireOpen(token);
  const ack = isAck(data.payment_policies_acknowledged);
  const completed = clientFormMissing(data).length === 0;
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

/** Save the site info form. POLISH-10 (CHANGE 8) — `completed` now requires ALL
 *  mandatory fields (shared validation). */
export async function saveSiteForm(
  token: string,
  data: Record<string, unknown>
): Promise<DbClientInvitation> {
  const inv = await requireOpen(token);
  const ack = isAck(data.payment_policies_acknowledged);
  const completed = siteFormMissing(data).length === 0;
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
  // POLISH-23 — the at-sign path no longer touches Supabase Storage. The raw
  // base64 signature is stored INLINE on the row; the upload to the signatures
  // bucket (and image-path set) is deferred to submitInvitation. This isolates
  // signing to a single DB row update — no storage, no PDF gen, no email.
  const now = new Date().toISOString();
  const patch =
    which === "tc1"
      ? {
          tc1_signed_at: now,
          tc1_signed_name: trimmed,
          tc1_signature_data_url: signatureDataUrlIn,
        }
      : {
          tc2_signed_at: now,
          tc2_signed_name: trimmed,
          tc2_signature_data_url: signatureDataUrlIn,
        };
  // POLISH-23 (CHANGE 3) — log right before the row update so the next failure
  // (if any) is pinned to the update itself, not storage.
  console.error("[TC SIGN ROW UPDATE]", {
    token,
    which,
    settingFields: Object.keys(patch),
    signatureLength: signatureDataUrlIn.length,
  });
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update(patch)
    .eq("token", token)
    .select("*")
    .single();
  if (error) {
    console.error("[TC SIGN ROW UPDATE FAILED]", {
      token,
      which,
      error: error.message,
      code: error.code,
      hint: error.hint,
    });
    throw new Error(`signTc: ${error.message}`);
  }
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

// POLISH-49 — build real contacts-table rows from the invite form jsonb instead
// of dumping contact info into the client/site `notes` field. Phones use the
// canonical ContactPhone shape ({ label, number }); "role" is encoded with the
// boolean flags + contact_type_custom (no role enum), mirroring createContact.
// Skips a contact whose first/last/email are all empty. Form keys per prefix:
// {p}First {p}Last {p}Email {p}PersonalPhone {p}Phone(=work) {p}OfficePhone.
function inviteContactInserts(
  form: Record<string, unknown>,
  base: { client_id: string | null; site_id: string | null },
  specs: ReadonlyArray<{ prefix: string; flags: Partial<DbContactInsert> }>
): DbContactInsert[] {
  const rows: DbContactInsert[] = [];
  for (const { prefix, flags } of specs) {
    const first = s(form[`${prefix}First`]);
    const last = s(form[`${prefix}Last`]);
    const email = s(form[`${prefix}Email`]);
    if (!first && !last && !email) continue; // don't create blank rows
    const phones = [
      { label: "Personal", number: s(form[`${prefix}PersonalPhone`]) },
      { label: "Work", number: s(form[`${prefix}Phone`]) },
      { label: "Office", number: s(form[`${prefix}OfficePhone`]) },
    ].filter((p): p is { label: string; number: string } => !!p.number);
    rows.push({
      client_id: base.client_id,
      site_id: base.site_id,
      first_name: first ?? "",
      last_name: last ?? "",
      email,
      phones,
      ...flags,
    });
  }
  return rows;
}

// "Same as …" toggles default ON; only an explicit "false" turns inheritance off.
function notSame(v: unknown): boolean {
  return String(v ?? "").trim() === "false";
}

// Map the saved client jsonb to a DbClient insert payload (pending review).
function clientInsertFrom(
  cf: Record<string, unknown>,
  email: string,
  now: string
) {
  // POLISH-49 — contacts are now written to the contacts table (not folded into
  // notes). The client notes field is left empty here.
  const notes = null;
  // POLISH-53 — Company Address is the top-level address. Billing inherits it
  // ("Same as Company Address", default ON) and Mailing inherits Billing
  // ("Same as Billing", default ON). Inheriting stores NULL (per POLISH-15), so
  // the resolved value is computed at display time. Only an explicit "false"
  // toggle turns inheritance off.
  const billingSameAsCompany = !notSame(cf.billing_same_as_company);
  const mailingSameAsBilling = !notSame(cf.mailing_same_as_billing);
  const billing = (suffix: string) =>
    billingSameAsCompany ? null : s(cf[`billing${suffix}`]);
  const mail = (suffix: string) =>
    mailingSameAsBilling ? null : s(cf[`mailing${suffix}`]);
  return {
    name: s(cf.legalName) ?? s(cf.tradeName) ?? email,
    legal_name: s(cf.legalName),
    company_address_line1: s(cf.companyStreet),
    company_address_line2: s(cf.companyUnit),
    company_address_city: s(cf.companyCity),
    company_address_province: s(cf.companyProvince),
    company_address_postal: s(cf.companyPostal),
    company_address_country: s(cf.companyCountry),
    billing_street: billing("Street"),
    billing_unit: billing("Unit"),
    billing_city: billing("City"),
    billing_province: billing("Province"),
    billing_postal: billing("Postal"),
    billing_country: billing("Country"),
    mailing_street: mail("Street"),
    mailing_unit: mail("Unit"),
    mailing_city: mail("City"),
    mailing_province: mail("Province"),
    mailing_postal: mail("Postal"),
    mailing_country: mail("Country"),
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
  // CHANGE 1 — billing + mailing each inherit the SITE address unless their
  // "Same as Site" toggle was unchecked.
  const billingSame = !notSame(sf.billing_same_as_site);
  const mailingSame = !notSame(sf.mailing_same_as_site);
  const bill = (suffix: string) =>
    billingSame ? s(sf[`site${suffix}`]) : s(sf[`billing${suffix}`]);
  const mail = (suffix: string) =>
    mailingSame ? s(sf[`site${suffix}`]) : s(sf[`mailing${suffix}`]);
  // POLISH-49 — site contacts (incl. the GC / Site Supervisor and all their
  // phones) are now written to the contacts table, not folded into notes. The
  // sites.gc_* columns still get the GC name/email/work-phone (siteInsertFrom
  // below); notes is left empty.
  const notes = null;
  return {
    client_id: clientId,
    name: s(sf.siteName) ?? "Primary site",
    address_line1: s(sf.siteStreet),
    address_line2: s(sf.siteUnit),
    city: s(sf.siteCity),
    province: s(sf.siteProvince),
    postal_code: s(sf.sitePostal),
    country: s(sf.siteCountry) ?? "Canada",
    billing_street: bill("Street"),
    billing_unit: bill("Unit"),
    billing_city: bill("City"),
    billing_province: bill("Province"),
    billing_postal: bill("Postal"),
    billing_country: bill("Country"),
    mailing_street: mail("Street"),
    mailing_unit: mail("Unit"),
    mailing_city: mail("City"),
    mailing_province: mail("Province"),
    mailing_postal: mail("Postal"),
    mailing_country: mail("Country"),
    site_hst_gst_number: s(sf.hstNumber),
    tax_exempt: s(sf.taxExempt) === "Yes",
    tax_exempt_certificate_number: s(sf.taxExemptCert),
    payment_terms: e(sf.paymentTerms, PAYMENT_TERMS_VALUES) ?? undefined,
    preferred_payment_method:
      e(sf.paymentMethod, PAYMENT_METHOD_VALUES) ?? undefined,
    preferred_currency: e(sf.currency, CURRENCY_VALUES) ?? undefined,
    // CHANGE 7 — GC / Site Supervisor. POLISH-10 (0063) — first + last name.
    gc_first_name: s(sf.gcFirst),
    gc_last_name: s(sf.gcLast),
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
  // POLISH-38 — all four are best-effort; any may be null if its render/upload
  // failed (the submission is still recorded). Used as email attachments.
  pdfs: {
    tc1: Buffer | null;
    tc2: Buffer | null;
    clientForm: Buffer | null;
    siteForm: Buffer | null;
  };
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

  // POLISH-38 (CHANGE 1) — establish the invitation→client link + submitted_at
  // lock + snapshot IMMEDIATELY (the form jsonb is already saved). This MUST
  // commit before any storage/PDF work so a later artifact failure can never
  // orphan the submission — that orphaning is exactly what left the Submission
  // Detail page blank (a pending client with no linked invitation).
  const { data: locked, error: lockErr } = await supabase
    .from("client_invitations")
    .update({ submitted_at: now, client_id: clientId, submission_snapshot: snapshot })
    .eq("token", token)
    .select("*")
    .single();
  if (lockErr) throw new Error(`submitInvitation/lock: ${lockErr.message}`);
  let invitation = locked as DbClientInvitation;

  // POLISH-49 — write the submitted contacts to the contacts TABLE (was: folded
  // into client/site notes). Best-effort, AFTER the lock so a failure can never
  // orphan the submission. Client contacts (from the client form) link to the
  // client only; site contacts (from the site form, incl. GC) link to the site
  // only — so the client's Contacts tab shows just its Primary + AP. Service-
  // role insert (the submitter is unauthenticated → contacts RLS would block).
  try {
    const contactRows: DbContactInsert[] = [];
    if (inv.invite_type !== "site_only") {
      contactRows.push(
        ...inviteContactInserts(cf, { client_id: clientId, site_id: null }, [
          { prefix: "c0", flags: { is_primary: true } },
          { prefix: "c1", flags: { is_accounts_payable: true } },
        ])
      );
    }
    contactRows.push(
      ...inviteContactInserts(sf, { client_id: null, site_id: siteId }, [
        { prefix: "c0", flags: { is_primary: true } },
        { prefix: "c1", flags: { is_accounts_payable: true } },
        { prefix: "gc", flags: { contact_type_custom: "GC / Site Supervisor" } },
      ])
    );
    if (contactRows.length > 0) {
      const { error: contactErr } = await supabase.from("contacts").insert(contactRows);
      if (contactErr) throw new Error(contactErr.message);
    }
    console.error("[INVITE CREATE CONTACTS]", {
      clientId,
      siteId,
      contactsCreated: contactRows.length,
      roles: contactRows.map((c) =>
        c.is_primary ? "Primary" : c.is_accounts_payable ? "AP" : c.contact_type_custom ?? "Contact"
      ),
    });
  } catch (e) {
    console.error("[INVITE CREATE CONTACTS] failed (best-effort):", e);
  }

  // POLISH-38 — the signed-T&C PDFs AND the application-form PDFs are now
  // BEST-EFFORT: a storage/render failure must not fail the submit (already
  // recorded above). On success a follow-up update records their paths.
  const pdfs: {
    tc1: Buffer | null;
    tc2: Buffer | null;
    clientForm: Buffer | null;
    siteForm: Buffer | null;
  } = { tc1: null, tc2: null, clientForm: null, siteForm: null };
  try {
    const tc1ImgPath =
      inv.tc1_signature_image_path ??
      (inv.tc1_signature_data_url
        ? await uploadSignaturePng(token, "tc1", inv.tc1_signature_data_url)
        : null);
    const tc2ImgPath =
      inv.tc2_signature_image_path ??
      (inv.tc2_signature_data_url
        ? await uploadSignaturePng(token, "tc2", inv.tc2_signature_data_url)
        : null);
    const [sig1, sig2] = await Promise.all([
      inv.tc1_signature_data_url ?? (tc1ImgPath ? signatureDataUrl(tc1ImgPath) : null),
      inv.tc2_signature_data_url ?? (tc2ImgPath ? signatureDataUrl(tc2ImgPath) : null),
    ]);
    const submittedAtFmt = businessDateTime(now);
    const clientAckAt = inv.client_form_payment_policies_acknowledged_at
      ? businessDateTime(inv.client_form_payment_policies_acknowledged_at)
      : null;
    const siteAckAt = inv.site_form_payment_policies_acknowledged_at
      ? businessDateTime(inv.site_form_payment_policies_acknowledged_at)
      : null;
    const [pdf1, pdf2, clientPdf, sitePdf] = await Promise.all([
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
      // CHANGE 2 — branded application-form PDFs from the captured form data.
      renderClientFormPdf({
        cf,
        email: inv.email,
        submittedAt: submittedAtFmt,
        tierRequested: inv.tier_requested ?? null,
        policyAckAt: clientAckAt,
      }),
      renderSiteFormPdf({
        sf,
        email: inv.email,
        submittedAt: submittedAtFmt,
        policyAckAt: siteAckAt,
      }),
    ]);
    const [pdf1Path, pdf2Path, clientPdfPath, sitePdfPath] = await Promise.all([
      uploadSignedPdf(token, "tc1", pdf1),
      uploadSignedPdf(token, "tc2", pdf2),
      uploadFormPdf(token, "client", clientPdf),
      uploadFormPdf(token, "site", sitePdf),
    ]);
    const { data: withPaths } = await supabase
      .from("client_invitations")
      .update({
        tc1_signed_pdf_path: pdf1Path,
        tc2_signed_pdf_path: pdf2Path,
        client_form_pdf_path: clientPdfPath,
        site_form_pdf_path: sitePdfPath,
        tc1_signature_image_path: tc1ImgPath,
        tc2_signature_image_path: tc2ImgPath,
        tc1_signature_data_url: null,
        tc2_signature_data_url: null,
      })
      .eq("token", token)
      .select("*")
      .single();
    if (withPaths) invitation = withPaths as DbClientInvitation;
    pdfs.tc1 = pdf1;
    pdfs.tc2 = pdf2;
    pdfs.clientForm = clientPdf;
    pdfs.siteForm = sitePdf;
  } catch (e) {
    console.error("[submitInvitation] PDF/storage (best-effort) failed:", e);
  }

  return { invitation, clientId, siteId, pdfs };
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
