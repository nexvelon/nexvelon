"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { resetPasswordEmail } from "@/lib/email/templates/reset-password";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

// ============================================================================
// requestPasswordResetAction — anonymous-callable.
//
// Flow:
//   1. Validate email shape (cheap; not authoritative).
//   2. `auth.admin.generateLink({ type: 'recovery', email })` — service-role
//      mint of a hashed_token. Does NOT send an email. Errors here (most
//      commonly "user not found") are SWALLOWED — we always return ok:true
//      so an unauthenticated probe can't enumerate accounts.
//   3. Construct the reset URL pointing at /auth/confirm (the canonical
//      token-hash redemption handler — /auth/callback was deleted in
//      Session A `024a74a`):
//        ${APP_URL}/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password
//   4. POST to Resend with the royal-black-and-gold HTML from
//      lib/email/templates/reset-password.ts. Failures are swallowed
//      (Resend outage shouldn't reveal account existence either).
//   5. Audit log a `password_reset_requested` row (always, even on
//      generateLink miss — so we can correlate phishing probes).
//
// Always returns { ok: true }. Failure conditions only surface in server
// logs (via console.error) for ops debugging.
// ============================================================================

interface RequestPasswordResetInput {
  email: string;
}

export async function requestPasswordResetAction(
  input: RequestPasswordResetInput
): Promise<{ ok: true }> {
  const t0 = Date.now();
  const email = (input.email ?? "").trim().toLowerCase();
  const log = (event: string, extra?: Record<string, unknown>) => {
    console.info(
      `[requestPasswordReset] ${event}`,
      JSON.stringify({ ...(extra ?? {}), elapsedMs: Date.now() - t0 })
    );
  };

  log("entry", { hasEmail: !!email });

  // Cheap shape check. Authoritative validation is server-side (and
  // Supabase's generateLink will throw on garbage input anyway).
  if (!email || !email.includes("@")) {
    log("invalid_email_shape");
    return { ok: true };
  }

  const { ip, userAgent } = await getRequestInfo();

  // Always write an audit log row — even when the email doesn't match an
  // account. Lets us detect enumeration probes after the fact.
  await writeAuditLog("password_reset_requested", {
    email,
    ip,
    user_agent: userAgent,
    metadata: { source: "forgot_password_form" },
  });

  let resetUrl: string | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error || !data?.properties?.hashed_token) {
      log("generate_link_failed", {
        error: error?.message ?? "no_hashed_token",
      });
      // Swallow — the user shouldn't learn whether the account exists.
      return { ok: true };
    }
    const tokenHash = data.properties.hashed_token;
    resetUrl = buildResetUrl(tokenHash);
    log("generate_link_ok", { tokenPreview: tokenHash.slice(0, 8) + "…" });
  } catch (e) {
    log("generate_link_threw", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: true };
  }

  if (!resetUrl) return { ok: true };

  try {
    await sendResetEmail(email, resetUrl);
    log("resend_send_complete");
  } catch (e) {
    log("resend_send_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    // Swallow — Resend outage shouldn't leak account existence either.
  }

  return { ok: true };
}

// ----------------------------------------------------------------------------

function buildResetUrl(tokenHash: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexvelonglobal.com";
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: "recovery",
    next: "/auth/reset-password",
  });
  return `${appUrl.replace(/\/$/, "")}/auth/confirm?${params.toString()}`;
}

async function sendResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  const from =
    process.env.RESEND_FROM_EMAIL ?? "Nexvelon <noreply@nexvelonglobal.com>";

  const { subject, html, text } = resetPasswordEmail({
    resetUrl,
    recipientEmail: email,
  });

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": `nexvelon-reset-${Date.now()}`,
    },
  });

  if (result.error) {
    throw new Error(`Resend: ${result.error.message}`);
  }
}
