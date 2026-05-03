"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isActiveStatus, stampLogin } from "@/lib/auth/profile";
import {
  canResendOtp,
  createOtpForUser,
  verifyOtpForUser,
} from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/email";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

export type VerifyOtpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; attemptsRemaining?: number };

/**
 * Sign-in step 2 — verify the 6-digit code emailed during step 1.
 *
 * On success: marks the OTP row used, stamps profiles.last_login_at /
 * last_login_ip, writes 'mfa_challenge_verified' + 'login_success' audit
 * rows, and redirects to /dashboard (or to ?next= if it's a safe path).
 *
 * On failure: writes 'mfa_challenge_failed', returns a friendly error and
 * the remaining-attempts count when applicable.
 */
export async function verifyOtpAction(
  rawCode: string,
  next?: string | null
): Promise<VerifyOtpResult> {
  // Strip spaces / dashes the user might have typed; the email shows the
  // code as a flat 6-digit block.
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from the email." };
  }

  const { ip, userAgent } = await getRequestInfo();
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  if (!isActiveStatus(profile.status)) {
    // Defensive — middleware would normally have caught this, but if a
    // status flip happened mid-OTP-window we abort here.
    const supabase = await createClient();
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Your account is not active. Contact your administrator.",
    };
  }

  const result = await verifyOtpForUser(profile.id, code);

  if (!result.ok) {
    await writeAuditLog("mfa_challenge_failed", {
      user_id: profile.id,
      email: profile.email,
      ip,
      user_agent: userAgent,
      metadata: { reason: result.reason },
    });

    if (result.reason === "no_pending_otp") {
      return {
        ok: false,
        error: "No active code. Tap 'Send a new code' to receive a fresh one.",
      };
    }
    if (result.reason === "expired") {
      return {
        ok: false,
        error: "That code has expired. Tap 'Send a new code'.",
      };
    }
    if (result.reason === "too_many_attempts") {
      return {
        ok: false,
        error:
          "Too many incorrect attempts. Tap 'Send a new code' to start over.",
      };
    }
    return {
      ok: false,
      error: "Incorrect code. Please try again.",
      attemptsRemaining: result.attemptsRemaining,
    };
  }

  // ---- Success path -------------------------------------------------------
  await writeAuditLog("mfa_challenge_verified", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
  });

  try {
    await stampLogin(profile.id, ip);
  } catch (e) {
    // Non-fatal — log and continue.
    console.error("[verifyOtp] stampLogin failed:", e);
  }

  await writeAuditLog("login_success", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
  });

  const dest = isSafeNext(next) ? (next as string) : "/dashboard";
  return { ok: true, redirectTo: dest };
}

export type ResendOtpResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function resendOtpAction(): Promise<ResendOtpResult> {
  const { ip, userAgent } = await getRequestInfo();
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  if (!isActiveStatus(profile.status)) {
    return {
      ok: false,
      error: "Your account is not active. Contact your administrator.",
    };
  }

  const rate = await canResendOtp(profile.id);
  if (!rate.ok) {
    return {
      ok: false,
      error: `Please wait ${rate.retryAfterSeconds}s before requesting a new code.`,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  let code: { id: string; code: string };
  try {
    const created = await createOtpForUser(profile.id);
    code = { id: created.id, code: created.code };
  } catch (e) {
    console.error("[resendOtp] createOtpForUser failed:", e);
    return {
      ok: false,
      error: "We couldn't generate a new code. Please try again.",
    };
  }

  try {
    await sendOtpEmail({
      to: profile.email,
      code: code.code,
      firstName: profile.first_name,
    });
  } catch (e) {
    console.error("[resendOtp] sendOtpEmail failed:", e);
    return {
      ok: false,
      error: "We couldn't deliver the email. Please try again in a minute.",
    };
  }

  await writeAuditLog("mfa_challenge_sent", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
    metadata: { otp_id: code.id, channel: "email", source: "resend" },
  });

  return { ok: true };
}

// ----------------------------------------------------------------------------

function isSafeNext(next: string | null | undefined): boolean {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  // Block protocol-relative URLs and anything pointing back into auth.
  if (next.startsWith("//")) return false;
  if (next.startsWith("/login")) return false;
  if (next.startsWith("/auth/")) return false;
  return true;
}
