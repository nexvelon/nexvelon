"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, updateProfileAdmin } from "@/lib/auth/profile";
import { assertValidPassword } from "@/lib/auth/password-policy";
import { createOtpForUser } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/email";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

/**
 * Failure-only return type. The success path uses `redirect()` from
 * next/navigation, throws NEXT_REDIRECT, and never returns a value.
 */
export type SetPasswordFailure = { ok: false; error: string };

/**
 * Completes the invite flow AND immediately funnels the brand-new user
 * through the email-OTP gate. End state: every authenticated session goes
 * through OTP, no exceptions. Previously the invite path bypassed OTP on
 * its very first sign-in, leaving a half-authenticated session that didn't
 * recover cleanly on sign-out or refresh.
 *
 * Steps:
 *   1. Validate the new password against project policy (12+, mixed case,
 *      digit, symbol).
 *   2. supabase.auth.updateUser({ password }) — works because the
 *      /auth/confirm exchange has already established a session for us.
 *   3. Flip profiles.status='Active' + mfa_enrolled=true (service-role
 *      bypass past the guard_profile_updates trigger).
 *   4. Write 'password_changed' to auth_audit_log.
 *   5. Generate a fresh 6-digit OTP via createOtpForUser, bcrypt-hash and
 *      insert into auth_otp.
 *   6. Email the plaintext code via sendOtpEmail (same template as every
 *      sign-in).
 *   7. Write 'mfa_challenge_sent' to auth_audit_log.
 *   8. redirect('/auth/verify-otp') — server-side, atomic with all the
 *      cookie writes from updateUser.
 *
 * On the next request /auth/verify-otp's middleware sees has_pending_otp()
 * = true and lets the user enter the code. After success they land on
 * /dashboard like any other returning user.
 */
export async function setPasswordAction(
  password: string,
  confirm: string
): Promise<SetPasswordFailure | undefined> {
  const t0 = Date.now();
  const log = (event: string, extra?: Record<string, unknown>) => {
    console.info(
      `[setPassword] ${event}`,
      JSON.stringify({ ...(extra ?? {}), elapsedMs: Date.now() - t0 })
    );
  };

  log("entry");

  if (!password || !confirm) {
    return { ok: false, error: "Both password fields are required." };
  }
  if (password !== confirm) {
    return { ok: false, error: "The two passwords don't match." };
  }
  try {
    assertValidPassword(password);
    log("policy_check_result", { valid: true });
  } catch (e) {
    log("policy_check_result", {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Password is not strong enough.",
    };
  }

  const { ip, userAgent } = await getRequestInfo();
  const supabase = await createClient();

  // Direct getUser() read so we can log exactly what happened — wrapping
  // through getCurrentProfile() loses the distinction between
  // "no session at all" and "session ok but profile row missing".
  const { data: getUserData, error: getUserErr } = await supabase.auth.getUser();
  log("getUser_result", {
    hasUser: !!getUserData?.user,
    userId: getUserData?.user?.id ?? null,
    error: getUserErr?.message ?? null,
  });

  if (!getUserData?.user) {
    return {
      ok: false,
      error:
        "Your sign-in session was lost. Please click the invite link from your email again.",
    };
  }

  const profile = await getCurrentProfile();
  log("profile_lookup_result", {
    hasProfile: !!profile,
    status: profile?.status ?? null,
    role: profile?.role ?? null,
  });

  if (!profile) {
    return {
      ok: false,
      error:
        "We can't find your profile. Please contact your administrator.",
    };
  }

  // ---- 1. Update Supabase Auth password ---------------------------------
  const { error: updateErr } = await supabase.auth.updateUser({ password });
  log("update_user_result", {
    error: updateErr?.message ?? null,
  });
  if (updateErr) {
    await writeAuditLog("login_failed", {
      user_id: profile.id,
      email: profile.email,
      ip,
      user_agent: userAgent,
      metadata: { step: "set_password", reason: updateErr.message },
    });
    return {
      ok: false,
      error:
        "We couldn't save the password. " +
        (updateErr.message.toLowerCase().includes("password")
          ? updateErr.message
          : "Please try again."),
    };
  }

  // ---- 2. Flip status → Active + mfa_enrolled=true ----------------------
  if (profile.status !== "Active" || !profile.mfa_enrolled) {
    try {
      await updateProfileAdmin(profile.id, {
        status: "Active",
        mfa_enrolled: true,
      });
      log("profile_admin_patch_result", { error: null });
    } catch (e) {
      // Non-fatal; password is set. An Admin can retry the flip later.
      log("profile_admin_patch_result", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    log("profile_admin_patch_result", { skipped: true });
  }

  await writeAuditLog("password_changed", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
    metadata: { source: "invite_completion" },
  });

  // ---- 3. Issue + email OTP — same security gate as every other login --
  let otp: { id: string; code: string };
  try {
    const created = await createOtpForUser(profile.id);
    otp = { id: created.id, code: created.code };
    log("otp_created", { otpId: otp.id });
  } catch (e) {
    log("otp_create_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error:
        "Password saved, but we couldn't issue a verification code. Please sign in.",
    };
  }

  try {
    await sendOtpEmail({
      to: profile.email,
      code: otp.code,
      firstName: profile.first_name,
    });
    log("otp_email_sent");
  } catch (e) {
    log("otp_email_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error:
        "Password saved, but we couldn't deliver the verification code. Please sign in.",
    };
  }

  await writeAuditLog("mfa_challenge_sent", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
    metadata: { otp_id: otp.id, channel: "email", source: "set-password" },
  });

  // ---- 4. Server-side redirect into the OTP gate ------------------------
  // NEXT_REDIRECT throws here; the framework intercepts and sends a
  // redirect response with all cookie writes attached. Middleware on the
  // next request will see has_pending_otp()===true and route the user
  // through /auth/verify-otp normally.
  log("redirecting", { dest: "/auth/verify-otp" });
  redirect("/auth/verify-otp");
}
