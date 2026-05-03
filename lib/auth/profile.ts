import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DbProfile,
  DbProfileAdminUpdate,
  DbProfileStatus,
} from "@/lib/types/database";

/**
 * Reads the profiles row for the currently-authenticated user.
 * Returns null if there's no session or the profile row hasn't been created
 * yet (race between auth.users insert and the on_auth_user_created trigger).
 */
export async function getCurrentProfile(): Promise<DbProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Surface unexpected RLS / connection failures; missing-row is null above.
    throw new Error(`getCurrentProfile: ${error.message}`);
  }
  return (data as DbProfile | null) ?? null;
}

/**
 * Reads any profile by user id, using the service-role client so admin server
 * actions can fetch other users' profiles regardless of RLS.
 *
 * Caller is responsible for verifying that the requestor is allowed to see
 * this row (e.g. by gating with `is_admin()` on their own session first).
 */
export async function getProfileByIdAdmin(
  userId: string
): Promise<DbProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfileByIdAdmin: ${error.message}`);
  return (data as DbProfile | null) ?? null;
}

/**
 * Service-role profile mutation. Bypasses both RLS and the
 * `guard_profile_updates` BEFORE UPDATE trigger (the trigger early-returns
 * when auth.uid() is null, which is the case under service-role).
 *
 * Use only from privileged server actions that have already authorised the
 * caller. The action layer is the security boundary here.
 */
export async function updateProfileAdmin(
  userId: string,
  payload: DbProfileAdminUpdate
): Promise<DbProfile> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw new Error(`updateProfileAdmin: ${error.message}`);
  return data as DbProfile;
}

/**
 * Convenience: stamp last_login_{at,ip} after a successful sign-in
 * (post-OTP). Does not touch role / status / mfa_enrolled.
 */
export async function stampLogin(
  userId: string,
  ip: string | null
): Promise<void> {
  await updateProfileAdmin(userId, {
    last_login_at: new Date().toISOString(),
    last_login_ip: ip,
  });
}

/**
 * Helper: a profile is "Active" only when the literal status === 'Active'.
 * Anything else (Invited / Suspended / Terminated) blocks sign-in.
 */
export function isActiveStatus(s: DbProfileStatus): boolean {
  return s === "Active";
}
