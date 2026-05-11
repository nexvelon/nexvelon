"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertValidPassword } from "@/lib/auth/password-policy";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

// ============================================================================
// updatePasswordAction — server action for the reset-password form.
//
// Pre-condition: the user has a valid Supabase session because
// /auth/confirm just verified their recovery token. /auth/reset-password
// (the page server component) bounces unauthenticated callers to
// /auth/forgot-password?expired=1 before we ever get here.
//
// Steps:
//   1. Validate the new password against project policy (12+, mixed case,
//      digit, symbol). Confirm match.
//   2. supabase.auth.updateUser({ password }).
//   3. Audit log `password_changed` with `metadata.source: 'reset'`.
//   4. supabase.auth.signOut({ scope: 'local' }) — clears the session
//      cookies via the cookie-aware client's setAll callback. `local`
//      scope skips the network call to Supabase Auth's /logout endpoint
//      (which was failing CORS in Session A's browser-side path; here
//      it's server-to-server so it would technically work, but local
//      scope is faster and we don't need to revoke other sessions —
//      the password change already invalidates them on next refresh).
//   5. redirect('/login?reset=ok'). Server-side redirect — NEXT_REDIRECT
//      throws and the framework attaches the signOut cookie deletions
//      onto the outgoing response, so the browser lands at /login with
//      no auth cookies.
// ============================================================================

export type ResetPasswordFailure = { ok: false; error: string };

export async function updatePasswordAction(
  password: string,
  confirm: string
): Promise<ResetPasswordFailure | undefined> {
  const t0 = Date.now();
  const log = (event: string, extra?: Record<string, unknown>) => {
    console.info(
      `[resetPassword] ${event}`,
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
      error:
        e instanceof Error ? e.message : "Password is not strong enough.",
    };
  }

  const { ip, userAgent } = await getRequestInfo();
  const supabase = await createClient();

  // Verify session is still alive — if the user took >1 hour between
  // landing here and submitting, the recovery session may have lapsed.
  const { data: getUserData, error: getUserErr } =
    await supabase.auth.getUser();
  log("getUser_result", {
    hasUser: !!getUserData?.user,
    userId: getUserData?.user?.id ?? null,
    error: getUserErr?.message ?? null,
  });
  if (!getUserData?.user) {
    return {
      ok: false,
      error:
        "Your reset session expired. Please request a fresh reset link.",
    };
  }
  const user = getUserData.user;

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  log("update_user_result", { error: updateErr?.message ?? null });
  if (updateErr) {
    await writeAuditLog("login_failed", {
      user_id: user.id,
      email: user.email ?? null,
      ip,
      user_agent: userAgent,
      metadata: { step: "reset_password", reason: updateErr.message },
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

  await writeAuditLog("password_changed", {
    user_id: user.id,
    email: user.email ?? null,
    ip,
    user_agent: userAgent,
    metadata: { source: "reset" },
  });

  // Sign out (local scope — clears cookies via cookieStore.set, no
  // network round-trip to Supabase Auth's /logout endpoint). The
  // browser will land at /login?reset=ok with no session cookies and
  // the user signs in fresh with the new password.
  try {
    await supabase.auth.signOut({ scope: "local" });
    log("sign_out_local_ok");
  } catch (e) {
    log("sign_out_local_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    // Non-fatal — the redirect below clears the session-tree anyway.
  }

  log("redirecting", { dest: "/login?reset=ok" });
  redirect("/login?reset=ok");
}
