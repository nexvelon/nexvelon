"use server";

import { redirect } from "next/navigation";
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

/**
 * Failure-only return type. The success path uses `redirect()` from
 * next/navigation, which throws an internal NEXT_REDIRECT error and never
 * returns — Next's framework intercepts and sends the redirect response
 * with all the action's cookie writes attached. That eliminates the race
 * we were seeing where a client-side router.replace would race the
 * Supabase session-cookie write and end up bouncing through middleware.
 */
export type VerifyOtpFailure = {
  ok: false;
  error: string;
  attemptsRemaining?: number;
};

export async function verifyOtpAction(
  rawCode: string,
  next?: string | null
): Promise<VerifyOtpFailure | undefined> {
  const t0 = Date.now();
  const log = (event: string, extra?: Record<string, unknown>) => {
    // Single-line tagged log — one entry per step so a server log stream
    // is easy to follow when this hangs again.
    console.error(
      `[verifyOtp] ${event}`,
      JSON.stringify({ ...(extra ?? {}), elapsedMs: Date.now() - t0 })
    );
  };

  log("entry");

  const code = (rawCode ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    log("invalid_input", { codeLength: code.length });
    return { ok: false, error: "Enter the 6-digit code from the email." };
  }

  const { ip, userAgent } = await getRequestInfo();
  log("got_request_info");

  const profile = await getCurrentProfile();
  log("profile_lookup", {
    found: !!profile,
    userId: profile?.id ?? null,
    status: profile?.status ?? null,
  });

  if (!profile) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  if (!isActiveStatus(profile.status)) {
    log("profile_not_active", { status: profile.status });
    const supabase = await createClient();
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Your account is not active. Contact your administrator.",
    };
  }

  // verifyOtpForUser: looks up most recent unconsumed auth_otp row,
  // bcrypt-compares the code, marks used_at on success or increments
  // attempts on failure. Uses service-role client (auth_otp has no
  // RLS policies — service role is the only writer).
  const result = await verifyOtpForUser(profile.id, code);
  log("otp_verify_result", { ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) });

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

  // ---- Success path ------------------------------------------------------
  await writeAuditLog("mfa_challenge_verified", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
  });
  log("audit_verified_written");

  try {
    await stampLogin(profile.id, ip);
    log("stamp_login_ok");
  } catch (e) {
    // Non-fatal — log and continue.
    log("stamp_login_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  await writeAuditLog("login_success", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
  });
  log("audit_login_success_written");

  const dest = isSafeNext(next) ? (next as string) : "/dashboard";
  log("redirecting", { dest });

  // Server-side redirect. NEXT_REDIRECT throws are caught by the framework
  // and sent to the client as a redirect response. Any cookies written
  // during this request travel with that response, so the next page load
  // sees the freshest auth state.
  redirect(dest);
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
  if (next.startsWith("//")) return false;
  if (next.startsWith("/login")) return false;
  if (next.startsWith("/auth/")) return false;
  return true;
}
