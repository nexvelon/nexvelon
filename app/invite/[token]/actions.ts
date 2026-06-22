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
import {
  sendClientSubmissionEmail,
  sendClientConfirmationEmail,
} from "@/lib/auth/email";
import {
  getTierTexts,
  getTierDiscretionDisclaimer,
  TIER_DISCLAIMER,
} from "@/lib/api/company-settings";
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
  /** Retained for compat — always true now (tc2 reads the real Guardian block). */
  guardian_published: boolean;
  /** The optional tier the client opted in for (CHANGE 6). */
  tier_requested: string | null;
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
    tier_requested: inv.tier_requested ?? null,
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

// CHANGE 6 — the Prestige Tier descriptions for the client form's opt-in cards
// (same single source as the invite/outcome emails).
export async function getTierDescriptionsAction(): Promise<
  ActionResult<Record<"diamond" | "platinum" | "gold" | "silver" | "bronze", string>>
> {
  try {
    return { ok: true, data: await getTierTexts() };
  } catch (e) {
    return fail(e);
  }
}

// POLISH-7 — the two fine-print disclaimers shown beneath the tier opt-in.
export async function getTierDisclaimersAction(): Promise<
  ActionResult<{ requirements: string; discretion: string }>
> {
  try {
    return {
      ok: true,
      data: {
        requirements: TIER_DISCLAIMER,
        discretion: await getTierDiscretionDisclaimer(),
      },
    };
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
  name: string,
  signatureDataUrl: string
): Promise<ActionResult<InvitationView>> {
  // POLISH-22 (item 11) — server-side instrumentation so the next signing
  // failure is diagnosable from the server logs (the only at-sign step that can
  // realistically fail is the signature-image upload; PDFs + emails happen at
  // submit, not here).
  console.error("[TC SIGN ACTION]", {
    token,
    which,
    signedName: name,
    signatureLength: signatureDataUrl?.length ?? 0,
  });
  try {
    const updated = await signTc(token, which, name, signatureDataUrl);
    const result = { ok: true as const, data: toView(updated, await guardianTermsPublished()) };
    console.error("[TC SIGN RESULT]", {
      ok: true,
      dataKeys: Object.keys(result.data ?? {}),
    });
    return result;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[TC SIGN RESULT]", { ok: false, errorMessage });
    return fail(e);
  }
}

export async function submitInvitationAction(
  token: string
): Promise<ActionResult<{ submitted: true }>> {
  try {
    const { invitation, clientId, pdfs } = await submitInvitation(token);
    // Best-effort emails — a mail failure must not unwind the created client/site.
    try {
      // To inquiries@ — the existing bundled internal summary.
      await sendClientSubmissionEmail({
        email: invitation.email,
        clientForm: invitation.client_form_data ?? {},
        siteForm: invitation.site_form_data ?? {},
        tc1: { name: invitation.tc1_signed_name, at: invitation.tc1_signed_at },
        tc2: { name: invitation.tc2_signed_name, at: invitation.tc2_signed_at },
      });
    } catch (e) {
      console.error("[invite] inquiries email failed:", e);
    }
    try {
      // To the CLIENT — confirmation + both signed-T&C PDFs attached (CHANGE 4).
      await sendClientConfirmationEmail({
        to: invitation.email,
        clientForm: invitation.client_form_data ?? {},
        siteForm: invitation.site_form_data ?? {},
        tc1At: invitation.tc1_signed_at,
        tc2At: invitation.tc2_signed_at,
        pdfs,
      });
    } catch (e) {
      console.error("[invite] client confirmation email failed:", e);
    }
    void clientId;
    return { ok: true, data: { submitted: true } };
  } catch (e) {
    return fail(e);
  }
}
