"use server";

import { createClient as createPlainSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { assertValidPassword, checkPassword } from "@/lib/auth/password-policy";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";

// ============================================================================
// changeOwnPasswordAction — in-app password change for signed-in users.
//
// Reachable from /settings/security/change-password (linked from the
// avatar menu). The user keeps their session — we deliberately do NOT
// sign them out on success. If they want to invalidate sessions on
// OTHER devices/browsers, the `signOutOtherDevices` flag triggers
// supabase.auth.signOut({ scope: 'others' }) which keeps THIS tab's
// session alive.
//
// Steps:
//   1. Get the user via cookie-aware SSR client. No session → error.
//   2. Verify the current password using a SEPARATE throwaway Supabase
//      client constructed from '@supabase/supabase-js' directly (NOT
//      @supabase/ssr) so it doesn't touch the user's cookies. With
//      `persistSession: false`, the signInWithPassword call validates
//      the credential without mutating any storage.
//   3. Run the new password through the project's existing password
//      policy (lib/auth/password-policy — same module the
//      set-password / reset-password flows use).
//   4. Reject if new === current (Supabase Auth doesn't enforce this
//      itself, and a no-op "change" is a UX trap).
//   5. supabase.auth.updateUser({ password }) on the THROWAWAY client
//      (not the cookie-aware one). Supabase's "Secure password change"
//      project setting gates updateUser on a recently-authenticated
//      session — the user's cookie-bound session is older than the
//      gate's threshold (typically 5 min) on a typical change-password
//      flow, so calling updateUser there fails with "Current password
//      required when setting new password". The throwaway client just
//      authenticated in step 4, so its in-memory session is fresh and
//      satisfies the gate. The password change propagates server-side
//      (Supabase Auth doesn't care which session made the change).
//   6. If signOutOtherDevices === true, sign out the *other* sessions
//      via scope: 'others'. Current tab stays alive.
//   7. Audit `password_changed` with source: 'self' and a flag
//      indicating whether other-devices was signed out.
// ============================================================================

interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
  signOutOtherDevices: boolean;
}

export type ChangeOwnPasswordResult =
  | { ok: true; otherDevicesSignedOut: boolean }
  | { ok: false; error: string };

export async function changeOwnPasswordAction(
  input: ChangeOwnPasswordInput
): Promise<ChangeOwnPasswordResult> {
  const t0 = Date.now();
  const log = (event: string, extra?: Record<string, unknown>) => {
    console.info(
      `[changeOwnPassword] ${event}`,
      JSON.stringify({ ...(extra ?? {}), elapsedMs: Date.now() - t0 })
    );
  };

  log("entry");

  const currentPassword = input.currentPassword ?? "";
  const newPassword = input.newPassword ?? "";
  const signOutOtherDevices = input.signOutOtherDevices === true;

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Both password fields are required." };
  }

  // 1. Get authenticated user from the cookie-aware SSR client.
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  log("getUser_result", {
    hasUser: !!userData?.user,
    error: userErr?.message ?? null,
  });
  if (userErr || !userData?.user) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }
  const user = userData.user;
  if (!user.email) {
    // Unreachable in normal flow — every Nexvelon profile has an email.
    return {
      ok: false,
      error: "Your account is missing an email — contact your administrator.",
    };
  }

  // 3. Validate the new password against project policy BEFORE making any
  //    network call to verify the current password. Cheap shape check
  //    surfaces obvious issues without wasting Supabase rate budget.
  const policy = checkPassword(newPassword);
  if (!policy.ok) {
    log("policy_check_failed", { score: policy.score, label: policy.label });
    try {
      assertValidPassword(newPassword);
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Password doesn't meet our security policy.",
      };
    }
  }

  // 4. Reject no-op change.
  if (currentPassword === newPassword) {
    return {
      ok: false,
      error: "New password must differ from your current password.",
    };
  }

  // 2. Verify the current password using a throwaway client so we don't
  //    disturb the user's session cookies. createClient from
  //    '@supabase/supabase-js' (NOT @supabase/ssr) ignores cookies entirely.
  //    `persistSession: false` skips localStorage writes. If
  //    signInWithPassword succeeds, the current password was correct.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error(
      "[changeOwnPassword] missing supabase env vars at runtime"
    );
    return {
      ok: false,
      error: "We can't reach the auth service right now. Try again shortly.",
    };
  }
  const verifyClient = createPlainSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  log("verify_current_result", { ok: !verifyErr, error: verifyErr?.message ?? null });
  if (verifyErr) {
    return { ok: false, error: "Current password is incorrect." };
  }

  // 5. Update password on the THROWAWAY client (which just authenticated
  //    in step 4 above — its in-memory session is fresh enough to clear
  //    Supabase's "Secure password change" recent-auth gate). Using the
  //    cookie-aware `supabase` here would fail with "Current password
  //    required when setting new password" whenever the user's session
  //    is older than the gate's threshold (typically 5 min). The
  //    password update propagates server-side regardless of which
  //    session made the call.
  const { error: updateErr } = await verifyClient.auth.updateUser({
    password: newPassword,
  });
  log("update_user_result", { error: updateErr?.message ?? null });
  if (updateErr) {
    return {
      ok: false,
      error:
        "We couldn't save the password. " +
        (updateErr.message.toLowerCase().includes("password")
          ? updateErr.message
          : "Please try again."),
    };
  }

  // 6. Optionally invalidate sessions on other devices.
  let otherDevicesSignedOut = false;
  if (signOutOtherDevices) {
    try {
      const { error: signOutErr } = await supabase.auth.signOut({
        scope: "others",
      });
      log("sign_out_others_result", { error: signOutErr?.message ?? null });
      otherDevicesSignedOut = !signOutErr;
    } catch (e) {
      log("sign_out_others_threw", {
        error: e instanceof Error ? e.message : String(e),
      });
      // Non-fatal — password was changed. Audit captures the intent.
    }
  }

  // 7. Audit row.
  const { ip, userAgent } = await getRequestInfo();
  await writeAuditLog("password_changed", {
    user_id: user.id,
    email: user.email,
    ip,
    user_agent: userAgent,
    metadata: {
      source: "self",
      other_devices_signed_out: otherDevicesSignedOut,
      other_devices_requested: signOutOtherDevices,
    },
  });

  log("complete", { otherDevicesSignedOut });
  return { ok: true, otherDevicesSignedOut };
}
