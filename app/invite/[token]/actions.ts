"use server";

// POLISH-3 — PUBLIC (unauthenticated) server actions for the /invite/<token>
// onboarding flow. No auth gate: security is the unguessable token + the
// submitted_at lock, enforced inside the service-role API. Never expose the
// service-role client to the browser — these run server-side only.

import {
  getInvitationByToken,
  saveClientForm,
  saveSiteForm,
  signTc,
  submitInvitation,
  isReadyToSubmit,
  guardianTermsPublished,
  getInviteTermsText,
} from "@/lib/api/client-invitations";
import { sendClientSubmissionEmail } from "@/lib/auth/email";
import type { DbClientInvitation } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

// A trimmed, client-safe view of the invitation (progress + saved form data).
export interface InvitationView {
  token: string;
  email: string;
  invite_type: "full" | "site_only";
  client_form_completed: boolean;
  site_form_completed: boolean;
  tc1_signed_at: string | null;
  tc1_signed_name: string | null;
  tc2_signed_at: string | null;
  tc2_signed_name: string | null;
  submitted_at: string | null;
  client_form_data: Record<string, unknown> | null;
  site_form_data: Record<string, unknown> | null;
  /** Whether the Guardian onboarding T&C (tc2) has been published in Settings. */
  guardian_published: boolean;
  ready: boolean;
}

function toView(inv: DbClientInvitation, guardianPublished: boolean): InvitationView {
  return {
    token: inv.token,
    email: inv.email,
    invite_type: inv.invite_type,
    client_form_completed: inv.client_form_completed,
    site_form_completed: inv.site_form_completed,
    tc1_signed_at: inv.tc1_signed_at,
    tc1_signed_name: inv.tc1_signed_name,
    tc2_signed_at: inv.tc2_signed_at,
    tc2_signed_name: inv.tc2_signed_name,
    submitted_at: inv.submitted_at,
    client_form_data: inv.client_form_data,
    site_form_data: inv.site_form_data,
    guardian_published: guardianPublished,
    ready: isReadyToSubmit(inv, guardianPublished),
  };
}

export async function getInvitationAction(
  token: string
): Promise<ActionResult<InvitationView>> {
  try {
    const inv = await getInvitationByToken(token);
    if (!inv) return { ok: false, error: "This invitation link is invalid." };
    const guardian = await guardianTermsPublished();
    return { ok: true, data: toView(inv, guardian) };
  } catch (e) {
    return fail(e);
  }
}

export async function getInviteTermsAction(
  which: "tc1" | "tc2"
): Promise<ActionResult<string>> {
  try {
    return { ok: true, data: await getInviteTermsText(which) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveClientFormAction(
  token: string,
  data: Record<string, unknown>
): Promise<ActionResult<InvitationView>> {
  try {
    const updated = await saveClientForm(token, data);
    return { ok: true, data: toView(updated, await guardianTermsPublished()) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSiteFormAction(
  token: string,
  data: Record<string, unknown>
): Promise<ActionResult<InvitationView>> {
  try {
    const updated = await saveSiteForm(token, data);
    return { ok: true, data: toView(updated, await guardianTermsPublished()) };
  } catch (e) {
    return fail(e);
  }
}

export async function signTcAction(
  token: string,
  which: "tc1" | "tc2",
  name: string
): Promise<ActionResult<InvitationView>> {
  try {
    const updated = await signTc(token, which, name);
    return { ok: true, data: toView(updated, await guardianTermsPublished()) };
  } catch (e) {
    return fail(e);
  }
}

export async function submitInvitationAction(
  token: string
): Promise<ActionResult<{ submitted: true }>> {
  try {
    const { invitation, clientId } = await submitInvitation(token);
    // Best-effort bundled notification — a mail failure must not unwind the
    // already-created client/site.
    try {
      await sendClientSubmissionEmail({
        email: invitation.email,
        clientForm: invitation.client_form_data ?? {},
        siteForm: invitation.site_form_data ?? {},
        tc1: { name: invitation.tc1_signed_name, at: invitation.tc1_signed_at },
        tc2: { name: invitation.tc2_signed_name, at: invitation.tc2_signed_at },
      });
    } catch (e) {
      console.error("[invite] submission email failed:", e);
    }
    void clientId;
    return { ok: true, data: { submitted: true } };
  } catch (e) {
    return fail(e);
  }
}
