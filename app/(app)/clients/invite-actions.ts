"use server";

// POLISH-3 — admin actions for the client-invitation system: send an invite,
// list pending-review clients, and approve / reject them. Admin-gated.

import { revalidatePath } from "next/cache";
import {
  createInvitation,
  getInvitationByClientId,
  recordInvitationDecision,
} from "@/lib/api/client-invitations";
import {
  sendClientInviteEmail,
  sendApplicationApprovedEmail,
  sendApplicationDeclinedEmail,
  sendTierChangedEmail,
} from "@/lib/auth/email";
import {
  getClients,
  getClientById,
  updateClient,
  deleteClient,
} from "@/lib/api/clients";
import {
  getTierTexts,
  tierKey,
  getTierDiscretionDisclaimer,
  TIER_DISCLAIMER,
} from "@/lib/api/company-settings";
import {
  invitationSignedUrl,
  copySignedPdfToClientAttachments,
  INVITATION_SIG_BUCKET,
  INVITATION_PDF_BUCKET,
} from "@/lib/api/invitation-storage";
import { getCurrentProfile } from "@/lib/auth/profile";
import type {
  DbClientWithCounts,
  DbClient,
  DbSite,
  DbClientTier,
  DbClientInvitation,
} from "@/lib/types/database";

// Map a PascalCase tier (DbClientTier) to its Settings description text.
async function tierDescription(tier: DbClientTier): Promise<string> {
  const texts = await getTierTexts();
  const key = tierKey(tier);
  return key ? texts[key] : "";
}

// POLISH-7 — the two fine-print disclaimers shown under the email's tier list.
async function tierDisclaimers(): Promise<{ requirements: string; discretion: string }> {
  return {
    requirements: TIER_DISCLAIMER,
    discretion: await getTierDiscretionDisclaimer(),
  };
}

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

async function requireAdmin(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true, id: me.id };
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexvelonglobal.com";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendClientInviteAction(
  email: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed))
      return { ok: false, error: "Enter a valid email address." };
    const inv = await createInvitation({
      email: trimmed,
      createdBy: gate.id,
      inviteType: "full",
    });
    await sendClientInviteEmail({
      to: trimmed,
      token: inv.token,
      baseUrl: baseUrl(),
      inviteType: "full",
      tierTexts: await getTierTexts(),
      tierDisclaimers: await tierDisclaimers(),
    });
    revalidatePath("/clients");
    return { ok: true, data: { token: inv.token } };
  } catch (e) {
    return fail(e);
  }
}

// POLISH-4 — Type B: invite an existing client to add a SITE. No new client is
// created on submit; a site is attached to clientId. Email defaults to the
// admin-provided address (often a contact at the same client).
export async function sendSiteInviteAction(
  clientId: string,
  email: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed))
      return { ok: false, error: "Enter a valid email address." };
    if (!clientId) return { ok: false, error: "Missing client." };
    const inv = await createInvitation({
      email: trimmed,
      createdBy: gate.id,
      inviteType: "site_only",
      clientId,
    });
    await sendClientInviteEmail({
      to: trimmed,
      token: inv.token,
      baseUrl: baseUrl(),
      inviteType: "site_only",
      tierTexts: await getTierTexts(),
      tierDisclaimers: await tierDisclaimers(),
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, data: { token: inv.token } };
  } catch (e) {
    return fail(e);
  }
}

export async function listPendingClientsAction(): Promise<
  ActionResult<DbClientWithCounts[]>
> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    return { ok: true, data: await getClients({ pending_review: true }) };
  } catch (e) {
    return fail(e);
  }
}

// The full submission for the review detail page: the pending client, its
// sites, and the originating invitation (with the submitted form jsonb + the
// signed-T&C names/timestamps).
export interface SubmissionDetail {
  client: DbClient;
  sites: DbSite[];
  invitation: DbClientInvitation | null;
  // POLISH-6 — short-lived signed URLs for the admin to view the drawn
  // signatures + download the signed-T&C PDFs (private buckets). Null when the
  // path is absent or the URL couldn't be signed.
  tc1SignatureUrl: string | null;
  tc2SignatureUrl: string | null;
  tc1PdfUrl: string | null;
  tc2PdfUrl: string | null;
}

export async function getSubmissionDetailAction(
  clientId: string
): Promise<ActionResult<SubmissionDetail>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const detail = await getClientById(clientId);
    if (!detail) return { ok: false, error: "Client not found." };
    const invitation = await getInvitationByClientId(clientId);
    const sig = async (p: string | null | undefined) =>
      p ? await invitationSignedUrl(INVITATION_SIG_BUCKET, p) : null;
    const pdf = async (p: string | null | undefined) =>
      p ? await invitationSignedUrl(INVITATION_PDF_BUCKET, p) : null;
    const [tc1SignatureUrl, tc2SignatureUrl, tc1PdfUrl, tc2PdfUrl] =
      await Promise.all([
        sig(invitation?.tc1_signature_image_path),
        sig(invitation?.tc2_signature_image_path),
        pdf(invitation?.tc1_signed_pdf_path),
        pdf(invitation?.tc2_signed_pdf_path),
      ]);
    return {
      ok: true,
      data: {
        client: detail.client,
        sites: detail.sites,
        invitation,
        tc1SignatureUrl,
        tc2SignatureUrl,
        tc1PdfUrl,
        tc2PdfUrl,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// Approve a pending client: clear pending_review, set the (optional) tier +
// tier_set_at, record the invitation decision, and email the applicant.
export async function approvePendingClientAction(
  id: string,
  tier: DbClientTier | null
): Promise<ActionResult<{ approved: true }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await updateClient(id, {
      pending_review: false,
      tier: tier ?? null,
      tier_set_at: tier ? new Date().toISOString() : null,
    });
    await recordInvitationDecision({
      clientId: id,
      decision: "approved",
      decidedBy: gate.id,
    });
    const inv = await getInvitationByClientId(id);
    const detail = await getClientById(id);

    // CHANGE 4 — auto-copy the signed-T&C PDFs into the client's attachments
    // (folder "Signed Onboarding"). Best-effort.
    if (inv) {
      const copies: Promise<unknown>[] = [];
      if (inv.tc1_signed_pdf_path)
        copies.push(
          copySignedPdfToClientAttachments({
            pdfPath: inv.tc1_signed_pdf_path,
            clientId: id,
            filename: "Integrated-Solutions-TC-signed.pdf",
            uploadedBy: gate.id,
          })
        );
      if (inv.tc2_signed_pdf_path)
        copies.push(
          copySignedPdfToClientAttachments({
            pdfPath: inv.tc2_signed_pdf_path,
            clientId: id,
            filename: "Guardian-TC-signed.pdf",
            uploadedBy: gate.id,
          })
        );
      try {
        await Promise.all(copies);
      } catch (e) {
        console.error("[invite] signed-PDF attachment copy failed:", e);
      }
    }

    // Notify the applicant — recipient is the invitation email (the address we
    // invited), falling back to the client's portal contact email. CHANGE 6:
    // acknowledge if approved at a different tier than requested.
    const to = inv?.email ?? detail?.client.portal_contact_email ?? null;
    if (to) {
      try {
        await sendApplicationApprovedEmail({
          to,
          tierName: tier ?? null,
          tierText: tier ? await tierDescription(tier) : null,
          requestedTierName: inv?.tier_requested ?? null,
        });
      } catch (e) {
        console.error("[invite] approval email failed:", e);
      }
    }
    revalidatePath("/clients");
    return { ok: true, data: { approved: true } };
  } catch (e) {
    return fail(e);
  }
}

// Decline a pending client: record the decision + reason on the invitation
// (survives the hard-delete), email the applicant, then hard-delete the client
// (sites cascade).
export async function declinePendingClientAction(
  id: string,
  reason: string | null
): Promise<ActionResult<{ declined: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmedReason = reason?.trim() || null;
    const inv = await getInvitationByClientId(id);
    const detail = await getClientById(id);
    const to = inv?.email ?? detail?.client.portal_contact_email ?? null;

    // Persist the decline reason on the client too (activity-log audit) before
    // deletion, then stamp the decision on the durable invitation row.
    if (trimmedReason) {
      try {
        await updateClient(id, { decline_reason: trimmedReason });
      } catch {
        /* non-fatal — the invitation keeps the reason */
      }
    }
    await recordInvitationDecision({
      clientId: id,
      decision: "declined",
      decidedBy: gate.id,
      declineReason: trimmedReason,
    });
    if (to) {
      try {
        await sendApplicationDeclinedEmail({ to, reason: trimmedReason });
      } catch (e) {
        console.error("[invite] decline email failed:", e);
      }
    }
    const deleted = await deleteClient(id);
    revalidatePath("/clients");
    return { ok: true, data: { declined: deleted } };
  } catch (e) {
    return fail(e);
  }
}

// POLISH-5 (CHANGE 6) — change an existing client's tier from the detail page.
// Optionally email the client when the tier actually changes.
export async function setClientTierAction(
  id: string,
  tier: DbClientTier | null,
  notify: boolean
): Promise<ActionResult<{ changed: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const detail = await getClientById(id);
    if (!detail) return { ok: false, error: "Client not found." };
    const oldTier = detail.client.tier;
    const changed = (oldTier ?? null) !== (tier ?? null);
    await updateClient(id, {
      tier: tier ?? null,
      tier_set_at: tier ? new Date().toISOString() : null,
    });
    if (notify && changed && tier) {
      const to = detail.client.portal_contact_email;
      if (to) {
        try {
          await sendTierChangedEmail({
            to,
            oldTierLabel: oldTier ?? "No Tier",
            newTierName: tier,
            tierText: await tierDescription(tier),
          });
        } catch (e) {
          console.error("[tier] change email failed:", e);
        }
      }
    }
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true, data: { changed } };
  } catch (e) {
    return fail(e);
  }
}
