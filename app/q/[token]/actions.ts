"use server";

// QUOTE-PORTAL-1 — the UNAUTHENTICATED accept/decline actions for the public
// portal. No permission gate (the client has no account) — authorization IS the
// unguessable token, validated inside recordPortalDecision, which also guards
// against a second response and writes the append-only record. IP + user agent are
// captured server-side from the request headers for the acceptance record.

import { headers } from "next/headers";
import { recordPortalDecision } from "@/lib/api/quote-portal";

export type PortalActionResult = { ok: true } | { ok: false; error: string };

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function acceptQuoteAction(input: {
  token: string;
  signerName: string;
  signerTitle?: string;
  signerEmail?: string;
  signatureImage?: string | null;
}): Promise<PortalActionResult> {
  const { ip, userAgent } = await requestMeta();
  return recordPortalDecision({
    token: input.token,
    decision: "accepted",
    signerName: input.signerName,
    signerTitle: input.signerTitle,
    signerEmail: input.signerEmail,
    signatureImage: input.signatureImage ?? null,
    ip,
    userAgent,
  });
}

export async function declineQuoteAction(input: {
  token: string;
  reason?: string;
  signerName?: string;
}): Promise<PortalActionResult> {
  const { ip, userAgent } = await requestMeta();
  return recordPortalDecision({
    token: input.token,
    decision: "declined",
    signerName: input.signerName,
    declineReason: input.reason,
    ip,
    userAgent,
  });
}
