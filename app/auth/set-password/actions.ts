"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { updateProfileAdmin } from "@/lib/auth/profile";
import { assertValidPassword } from "@/lib/auth/password-policy";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

export type SetPasswordResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Completes the invite flow:
 *   1. Validates the password against the project policy.
 *   2. Calls supabase.auth.updateUser({ password }) — works because the
 *      invite link's `exchangeCodeForSession` already established a session.
 *   3. Flips profiles.status from 'Invited' to 'Active' and stamps
 *      mfa_enrolled = true (email-OTP "enrollment" is just confirming
 *      they've used the email-on-file successfully — which they did to
 *      reach this page).
 *   4. Writes a 'password_changed' audit row.
 *
 * The user's session remains valid; the next protected route they visit
 * will work without going through the OTP flow this time (no auth_otp
 * row exists yet — they'll get one on the NEXT sign-in).
 */
export async function setPasswordAction(
  password: string,
  confirm: string
): Promise<SetPasswordResult> {
  if (!password || !confirm) {
    return { ok: false, error: "Both password fields are required." };
  }
  if (password !== confirm) {
    return { ok: false, error: "The two passwords don't match." };
  }
  try {
    assertValidPassword(password);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Password is not strong enough.",
    };
  }

  const { ip, userAgent } = await getRequestInfo();

  const supabase = await createClient();

  // Caller must already have a session (set by the /auth/callback exchange).
  const profile = await getCurrentProfile();
  if (!profile) {
    return {
      ok: false,
      error:
        "Your session expired. Please reopen the link from your invite email.",
    };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
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

  // Flip status → Active. The guard_profile_updates trigger blocks
  // role/status changes for non-admins, so we go through the service-role
  // helper which bypasses it (auth.uid() check returns null).
  if (profile.status !== "Active" || !profile.mfa_enrolled) {
    try {
      await updateProfileAdmin(profile.id, {
        status: "Active",
        mfa_enrolled: true,
      });
    } catch (e) {
      // Don't block the user — log it. Their password is set; status flip
      // can be retried by an Admin.
      console.error("[setPassword] status flip failed:", e);
    }
  }

  await writeAuditLog("password_changed", {
    user_id: profile.id,
    email: profile.email,
    ip,
    user_agent: userAgent,
    metadata: { source: "invite_completion" },
  });

  return { ok: true, redirectTo: "/dashboard" };
}
