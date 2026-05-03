"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isActiveStatus } from "@/lib/auth/profile";
import { createOtpForUser } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/email";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

export type LoginActionResult =
  | { ok: true; redirectTo: "/auth/verify-otp" }
  | { ok: false; error: string };

/**
 * Sign-in step 1.
 *
 * Verifies email + password against Supabase Auth. On success, generates a
 * 6-digit email OTP, stores its bcrypt hash, and emails the plaintext to
 * the user. The Supabase session IS issued (we keep it; middleware gates
 * every protected route on `has_pending_otp()`), but the user can't reach
 * any protected surface until they complete /auth/verify-otp.
 *
 * Returns:
 *   { ok: true,  redirectTo: '/auth/verify-otp' }
 *   { ok: false, error: '...' }
 *
 * Logs to auth_audit_log on every branch.
 */
export async function signInAction(
  email: string,
  password: string
): Promise<LoginActionResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const { ip, userAgent } = await getRequestInfo();

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error || !data.user) {
    await writeAuditLog("login_failed", {
      email: trimmedEmail,
      ip,
      user_agent: userAgent,
      metadata: {
        step: "password",
        reason: error?.message ?? "unknown",
      },
    });
    return {
      ok: false,
      error: "Invalid email or password. Please try again.",
    };
  }

  // Session is now set on the cookie. Pull the profile to gate by status.
  const profile = await getCurrentProfile();

  if (!profile) {
    // Trigger should have inserted this row. If it's missing, something is
    // very wrong — sign out the user and refuse the login.
    await supabase.auth.signOut();
    await writeAuditLog("login_failed", {
      user_id: data.user.id,
      email: trimmedEmail,
      ip,
      user_agent: userAgent,
      metadata: { step: "profile_lookup", reason: "missing_profile_row" },
    });
    return {
      ok: false,
      error:
        "Account is not fully set up. Contact your administrator.",
    };
  }

  if (!isActiveStatus(profile.status)) {
    await supabase.auth.signOut();
    await writeAuditLog("login_failed", {
      user_id: profile.id,
      email: profile.email,
      ip,
      user_agent: userAgent,
      metadata: { step: "status_check", status: profile.status },
    });
    const friendly =
      profile.status === "Suspended"
        ? "Your account is suspended. Contact your administrator."
        : profile.status === "Terminated"
        ? "Your account is no longer active."
        : profile.status === "Invited"
        ? "Your account setup is incomplete. Use the invitation email link."
        : "Your account is not active. Contact your administrator.";
    return { ok: false, error: friendly };
  }

  // ---- Generate + send OTP ------------------------------------------------
  let otp: { id: string; code: string };
  try {
    const created = await createOtpForUser(profile.id);
    otp = { id: created.id, code: created.code };
  } catch (e) {
    console.error("[signIn] createOtpForUser failed:", e);
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "We couldn't send a verification code. Please try again.",
    };
  }

  try {
    await sendOtpEmail({
      to: profile.email,
      code: otp.code,
      firstName: profile.first_name,
    });
  } catch (e) {
    console.error("[signIn] sendOtpEmail failed:", e);
    // Don't expose Resend internals; the OTP row will simply expire if not
    // used. We sign the user out so they can retry from a clean state.
    await supabase.auth.signOut();
    await writeAuditLog("login_failed", {
      user_id: profile.id,
      email: profile.email,
      ip,
      user_agent: userAgent,
      metadata: {
        step: "send_otp_email",
        otp_id: otp.id,
        reason: e instanceof Error ? e.message : "unknown",
      },
    });
    return {
      ok: false,
      error:
        "We couldn't deliver your verification code. Please try again in a minute.",
    };
  }

  await writeAuditLog("mfa_challenge_sent", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
    metadata: { otp_id: otp.id, channel: "email" },
  });

  return { ok: true, redirectTo: "/auth/verify-otp" };
}

/**
 * Server-action sign-out — used by surfaces that don't have a client
 * Supabase instance handy (e.g. the verify-otp page's "Use a different
 * account" link).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
