"use server";

// QUOTE-PORTAL-1/2 — the UNAUTHENTICATED accept/decline actions for the public
// portal. No permission gate (the client has no account) — authorization IS the
// unguessable token, validated inside recordPortalDecision, which also guards
// against a second response and writes the append-only record. IP + user agent
// are captured server-side. On acceptance (QP-2), the countersigned PDF is
// emailed to the signer (Nexvelon is BCC'd via the central dispatcher) and the
// sender + every Admin get an in-app notification.

import { headers } from "next/headers";
import { recordPortalDecision, type PortalDecisionResult } from "@/lib/api/quote-portal";
import { downloadQuoteDocument } from "@/lib/api/quote-documents";
import { sendSignedQuoteEmail } from "@/lib/auth/email";
import { createNotifications, listAdminUserIds } from "@/lib/api/notifications";

export type PortalActionResult = { ok: true } | { ok: false; error: string };

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  return { ip, userAgent: h.get("user-agent") };
}

/** Fire the post-acceptance side effects: email the signed copy + notify the
 *  sender and every Admin. Best-effort — never fails the client's acceptance. */
async function afterAccept(res: Extract<PortalDecisionResult, { ok: true }>): Promise<void> {
  // Email the countersigned PDF to the signer (Nexvelon copy via dispatcher BCC).
  if (res.signedPdfPath && res.signerEmail) {
    try {
      const pdf = await downloadQuoteDocument(res.signedPdfPath);
      await sendSignedQuoteEmail({
        to: res.signerEmail,
        quoteNumber: res.quoteNumber,
        signerName: res.signerName,
        pdfBuffer: pdf,
        pdfFilename: `Quote_${res.quoteNumber}_SIGNED.pdf`,
        quoteId: res.quoteId,
      });
    } catch (e) {
      console.error("[quote-portal] signed-copy email failed (non-fatal):", e);
    }
  }
  // Notify the sender + every Admin (item 7).
  try {
    const adminIds = await listAdminUserIds();
    const recipientIds = Array.from(new Set([res.sentBy, ...adminIds].filter((v): v is string => !!v)));
    await createNotifications(
      recipientIds.map((userId) => ({
        userId,
        type: "quote_signed",
        title: `Quote ${res.quoteNumber} was signed`,
        body: res.signerName ? `Signed by ${res.signerName}.` : "A client signed the quote.",
        link: `/quotes/${res.quoteId}`,
      }))
    );
  } catch (e) {
    console.error("[quote-portal] signature notification failed (non-fatal):", e);
  }
}

export async function acceptQuoteAction(input: {
  token: string;
  signerName: string;
  signerTitle?: string;
  signerEmail?: string;
  signatureImage?: string | null;
}): Promise<PortalActionResult> {
  const { ip, userAgent } = await requestMeta();
  const res = await recordPortalDecision({
    token: input.token,
    decision: "accepted",
    signerName: input.signerName,
    signerTitle: input.signerTitle,
    signerEmail: input.signerEmail,
    signatureImage: input.signatureImage ?? null,
    ip,
    userAgent,
  });
  if (res.ok) await afterAccept(res);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function declineQuoteAction(input: {
  token: string;
  reason?: string;
  signerName?: string;
}): Promise<PortalActionResult> {
  const { ip, userAgent } = await requestMeta();
  const res = await recordPortalDecision({
    token: input.token,
    decision: "declined",
    signerName: input.signerName,
    declineReason: input.reason,
    ip,
    userAgent,
  });
  if (res.ok) {
    // Notify sender + Admins of a decline too (they need to act on Revision).
    try {
      const adminIds = await listAdminUserIds();
      const recipientIds = Array.from(new Set([res.sentBy, ...adminIds].filter((v): v is string => !!v)));
      await createNotifications(
        recipientIds.map((userId) => ({
          userId,
          type: "quote_declined",
          title: `Quote ${res.quoteNumber} was declined`,
          body: "The client declined the quote; it has moved to Revision.",
          link: `/quotes/${res.quoteId}`,
        }))
      );
    } catch (e) {
      console.error("[quote-portal] decline notification failed (non-fatal):", e);
    }
  }
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
