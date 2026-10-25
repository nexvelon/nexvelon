import "server-only";

// REP-5 — an explicit, scoped "unattended" database context for scheduled jobs.
//
// Every existing report reads through the cookie-bound session client
// (createClient in ./server). A scheduled run has no session, so those reads would
// go out as `anon` and RLS would silently return nothing — a report of zeros (a
// lie, §2.8). SNAP-1 solved the same problem by threading an optional client
// through four balance functions; the reports depend on dozens of nested reads, so
// instead this module offers ONE controlled seam:
//
//   runUnattended(adminClient, () => buildReport(...))
//
// While — and only while — that callback runs, createClient() returns the given
// client. The scope is an AsyncLocalStorage context: it follows the callback's
// own async chain and NOTHING else, so a concurrent user request can never pick
// it up. It is entered only by the secured cron path, never by a user request.
//
// It changes only WHICH client runs each query, never what a report computes.
// Permissions are NOT delegated to the database here: the scheduled-report runner
// decides, before generating, who may receive what (lib/reports/access.ts) and
// hands the builder explicit field gates.

import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

const scope = new AsyncLocalStorage<{ client: SupabaseClient }>();

export function runUnattended<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  return scope.run({ client }, fn);
}

/** The scoped client, or null outside an unattended run. */
export function unattendedClient(): SupabaseClient | null {
  return scope.getStore()?.client ?? null;
}

export function isUnattended(): boolean {
  return scope.getStore() !== undefined;
}
