import "server-only";

// Chunk 3c — per-user grants API (public.user_grants, migration 0029). An
// allow-only overlay: enabling inserts a (user, grant) row, disabling deletes
// it. Reads open to authenticated callers; writes gated by requireAdmin at the
// action layer.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

/** The grant keys held by one user. */
export async function listGrantsForUser(userId: string): Promise<string[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("user_grants")
    .select("grant_key")
    .eq("user_id", userId);
  if (error) throw new Error(`listGrantsForUser: ${error.message}`);
  return (data ?? []).map((r) => r.grant_key as string);
}

/** All (user_id, grant_key) rows — for the Users admin page. */
export async function listAllUserGrants(): Promise<
  { user_id: string; grant_key: string }[]
> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("user_grants")
    .select("user_id, grant_key");
  if (error) throw new Error(`listAllUserGrants: ${error.message}`);
  return (data ?? []) as { user_id: string; grant_key: string }[];
}

/** Enable (insert, idempotent) or disable (delete) a grant for a user. */
export async function setGrant(
  userId: string,
  grantKey: string,
  enabled: boolean
): Promise<void> {
  const supabase = await db();
  if (enabled) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("user_grants")
      .upsert(
        { user_id: userId, grant_key: grantKey, created_by: user?.id ?? null },
        { onConflict: "user_id,grant_key", ignoreDuplicates: true }
      );
    if (error) throw new Error(`setGrant/enable: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("user_grants")
      .delete()
      .eq("user_id", userId)
      .eq("grant_key", grantKey);
    if (error) throw new Error(`setGrant/disable: ${error.message}`);
  }
}
