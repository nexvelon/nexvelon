import "server-only";

// SNAP-1 — the balance-read functions (AR/AP/deposits/WIP) accept an OPTIONAL
// Supabase client so the daily snapshot capture can run them with the SERVICE-ROLE
// (admin) client — the capture has no user session, and an anon read would be
// denied by RLS and silently return zeros. Passing no client keeps the existing
// session-based behaviour for every normal caller. This changes only WHICH client
// runs the query, never how a balance is calculated.

import type { SupabaseClient } from "@supabase/supabase-js";

/** A Supabase client — the session server client (default) or the service-role
 *  admin client (capture). Both satisfy the `.from(...)` query surface used here. */
export type BalanceClient = SupabaseClient;
