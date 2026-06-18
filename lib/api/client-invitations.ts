import "server-only";

// POLISH-3 — public client-onboarding invitations (public.client_invitations,
// migration 0056). Everything here runs through the SERVICE-ROLE admin client:
// the public /invite/<token> pages are UNAUTHENTICATED, so the cookie client
// would be the anon role and couldn't insert a client/site. Security comes from
// the unguessable token (every call is scoped by `.eq("token", token)`) plus
// the submitted_at lock — never from the caller's session. Reads/writes also
// work regardless of whether migration 0056's RLS has been applied yet.

import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/api/company-settings";
import {
  DEFAULT_TERMS,
  DEFAULT_TERMS_GUARDIAN,
} from "@/lib/quote-helpers";
import {
  DEFAULT_TERMS_KEY,
  DEFAULT_TERMS_GUARDIAN_KEY,
} from "@/lib/api/company-settings";
import type { DbClientInvitation } from "@/lib/types/database";

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
}): Promise<DbClientInvitation> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("client_invitations")
    .insert({ token: newToken(), email: input.email.trim(), created_by: input.createdBy ?? null })
    .select("*")
    .single();
  if (error) throw new Error(`createInvitation: ${error.message}`);
  return data as DbClientInvitation;
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
  await requireOpen(token);
  const completed = !!String(data.legalName ?? data.companyName ?? "").trim();
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update({ client_form_data: data, client_form_completed: completed })
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
  await requireOpen(token);
  const completed = !!String(data.siteName ?? data.addressLine1 ?? "").trim();
  const supabase = admin();
  const { data: row, error } = await supabase
    .from("client_invitations")
    .update({ site_form_data: data, site_form_completed: completed })
    .eq("token", token)
    .select("*")
    .single();
  if (error) throw new Error(`saveSiteForm: ${error.message}`);
  return row as DbClientInvitation;
}

/** Record a T&C signature (typed name + auto timestamp) for tc1 or tc2. */
export async function signTc(
  token: string,
  which: "tc1" | "tc2",
  name: string
): Promise<DbClientInvitation> {
  await requireOpen(token);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Type your full name to sign.");
  const now = new Date().toISOString();
  const patch =
    which === "tc1"
      ? { tc1_signed_at: now, tc1_signed_name: trimmed }
      : { tc2_signed_at: now, tc2_signed_name: trimmed };
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

/** All four pieces complete? */
export function isReadyToSubmit(inv: DbClientInvitation): boolean {
  return (
    inv.client_form_completed &&
    inv.site_form_completed &&
    !!inv.tc1_signed_at &&
    !!inv.tc2_signed_at
  );
}

function s(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
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
}> {
  const inv = await requireOpen(token);
  if (!isReadyToSubmit(inv)) {
    throw new Error("Complete all four steps before submitting.");
  }
  const supabase = admin();
  const cf = (inv.client_form_data ?? {}) as Record<string, unknown>;
  const sf = (inv.site_form_data ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const contactLine = [
    s(cf.contactName) ? `Contact: ${s(cf.contactName)}` : null,
    s(cf.contactEmail),
    s(cf.contactPhone),
  ]
    .filter(Boolean)
    .join(" · ");
  const clientNotes = [contactLine, s(cf.notes)].filter(Boolean).join("\n");

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .insert({
      name: s(cf.legalName) ?? s(cf.companyName) ?? inv.email,
      legal_name: s(cf.legalName),
      industry: s(cf.industry),
      billing_street: s(cf.billingStreet),
      billing_city: s(cf.billingCity),
      billing_province: s(cf.billingProvince),
      billing_postal: s(cf.billingPostal),
      billing_country: s(cf.billingCountry) ?? "Canada",
      client_hst_gst_number: s(cf.hstNumber),
      portal_contact_email: s(cf.contactEmail) ?? inv.email,
      notes: clientNotes || null,
      default_opco: "integrated_solutions",
      pending_review: true,
      invited_at: now,
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`submitInvitation/client: ${cErr.message}`);
  const clientId = (client as { id: string }).id;

  const siteNotes = [
    s(sf.accessNotes) ? `Access: ${s(sf.accessNotes)}` : null,
    s(sf.siteContactName) ? `Site contact: ${s(sf.siteContactName)}` : null,
    s(sf.siteContactPhone),
  ]
    .filter(Boolean)
    .join("\n");

  const { data: site, error: siErr } = await supabase
    .from("sites")
    .insert({
      client_id: clientId,
      name: s(sf.siteName) ?? "Primary site",
      address_line1: s(sf.addressLine1),
      address_line2: s(sf.addressLine2),
      city: s(sf.city),
      province: s(sf.province),
      postal_code: s(sf.postal),
      country: s(sf.country) ?? "Canada",
      notes: siteNotes || null,
    })
    .select("id")
    .single();
  if (siErr) throw new Error(`submitInvitation/site: ${siErr.message}`);
  const siteId = (site as { id: string }).id;

  const { data: updated, error: uErr } = await supabase
    .from("client_invitations")
    .update({ submitted_at: now, client_id: clientId })
    .eq("token", token)
    .select("*")
    .single();
  if (uErr) throw new Error(`submitInvitation/lock: ${uErr.message}`);

  return { invitation: updated as DbClientInvitation, clientId, siteId };
}

/**
 * The two T&C texts the invite pages render — the SINGLE existing source (the
 * Settings override if set, else the in-code default), never a duplicate. tc1 =
 * Integrated Solutions terms; tc2 = the Payment-Terms / Guardian terms block.
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
