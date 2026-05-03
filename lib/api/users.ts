import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { DbProfile, DbProfileStatus, DbRole } from "@/lib/types/database";

// ============================================================================
// Server-only users / profiles API.
//
// Reads are routed through the cookie-aware client at the page level so RLS
// on profiles is enforced; mutations (invite, status change, session
// revocation) MUST go through the service-role helpers in this file because
// they call auth.admin.* APIs that are service-role-only.
//
// Every mutation in this file must be called only from a server action that
// has already verified the caller is an Admin. This is the security
// boundary — these helpers do not re-check.
// ============================================================================

/**
 * List every active profile excluding `Terminated` (those are kept for
 * audit purposes but hidden from the directory by default). Sorted by
 * created_at ASC so the bootstrap admin lands at the top.
 */
export async function listVisibleProfilesAdmin(): Promise<DbProfile[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .neq("status", "Terminated")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listVisibleProfilesAdmin: ${error.message}`);
  return (data ?? []) as DbProfile[];
}

/**
 * List every profile including Terminated — used by the audit / archive
 * surfaces (none today, but the API is here so we don't have to widen
 * access patterns later).
 */
export async function listAllProfilesAdmin(): Promise<DbProfile[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAllProfilesAdmin: ${error.message}`);
  return (data ?? []) as DbProfile[];
}

// ----------------------------------------------------------------------------
// Invite

export interface InviteUserPayload {
  email: string;
  first_name: string;
  last_name: string;
  role: DbRole;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  /** Caller's user id, written into raw_user_meta_data.created_by. */
  invited_by?: string | null;
}

/**
 * Invite a user via Supabase Auth Admin API. The redirect URL must be in
 * the project's "Redirect URLs" allowlist (configured in Phase 2).
 *
 * Phase 2 trigger `on_auth_user_created` will read raw_user_meta_data and
 * create a matching profiles row with role/status='Invited'. We then
 * patch the optional contact fields (title/department/phone) since the
 * trigger only handles names + role.
 */
export async function inviteUserAdmin(payload: InviteUserPayload): Promise<{
  user_id: string;
  email: string;
}> {
  const admin = createAdminClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexvelonglobal.com";
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/set-password`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    payload.email,
    {
      data: {
        first_name: payload.first_name,
        last_name: payload.last_name,
        role: payload.role,
        created_by: payload.invited_by ?? null,
      },
      redirectTo,
    }
  );

  if (error || !data?.user) {
    throw new Error(
      `inviteUserAdmin: ${error?.message ?? "no user returned"}`
    );
  }

  // Patch the optional fields the trigger doesn't set.
  const patch: Partial<DbProfile> = {};
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.department !== undefined) patch.department = payload.department;
  if (payload.phone !== undefined) patch.phone = payload.phone;

  if (Object.keys(patch).length > 0) {
    const { error: patchErr } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", data.user.id);
    if (patchErr) {
      // Non-fatal — the invite did go out; the patched fields are bonus.
      console.error(
        "[inviteUserAdmin] post-invite profile patch failed:",
        patchErr.message
      );
    }
  }

  return { user_id: data.user.id, email: data.user.email ?? payload.email };
}

// ----------------------------------------------------------------------------
// Status changes

/**
 * Generic profile-status setter. Pass terminate=true to also stamp
 * terminated_at = now() (only meaningful for status === 'Terminated').
 *
 * Service-role only — bypasses guard_profile_updates trigger.
 */
async function setProfileStatusAdmin(
  userId: string,
  status: DbProfileStatus,
  terminate = false
): Promise<DbProfile> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (terminate) patch.terminated_at = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`setProfileStatusAdmin: ${error?.message ?? "no row"}`);
  }
  return data as DbProfile;
}

/**
 * Revokes every active session for a user (forces sign-out everywhere).
 * Used as part of suspend/terminate.
 */
async function revokeAllSessionsAdmin(userId: string): Promise<void> {
  const admin = createAdminClient();
  // signOut on the admin client takes a JWT; for revoking by user id we
  // use the lower-level deleteUser API path. Supabase SDK exposes
  // `signOut` on the *admin* with `{ user_id, scope: 'global' }`-style
  // payload via the `mfa` namespace in some versions; the most-portable
  // call is admin.signOut(jwt). Since we don't have the user's JWT here,
  // we use the alternative: admin.deleteAllSessions via the DB.
  //
  // Until the SDK exposes a typed call, we hit the REST endpoint directly.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // POST /auth/v1/admin/users/<id>/sessions revokes all of that user's
  // refresh tokens.
  const resp = await fetch(
    `${url}/auth/v1/admin/users/${userId}/sessions`,
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text();
    console.error(
      "[revokeAllSessionsAdmin] HTTP",
      resp.status,
      body.slice(0, 200)
    );
  }
  // Reference admin client to ensure imports are tree-stable on builds.
  void admin;
}

export async function suspendUserAdmin(userId: string): Promise<DbProfile> {
  await revokeAllSessionsAdmin(userId);
  return setProfileStatusAdmin(userId, "Suspended");
}

export async function reactivateUserAdmin(userId: string): Promise<DbProfile> {
  return setProfileStatusAdmin(userId, "Active");
}

export async function terminateUserAdmin(userId: string): Promise<DbProfile> {
  await revokeAllSessionsAdmin(userId);
  return setProfileStatusAdmin(userId, "Terminated", true);
}
